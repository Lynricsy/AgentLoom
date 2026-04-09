import { Inject, Injectable } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';

import {
  runInTenantTransaction,
  transactionStorage,
} from '../../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import type { SessionToolProvider } from '../../agent/ports/agent-runtime.port';
import { AgentDefinitionService } from '../../agent-definition/agent-definition.service';
import type { AgentSubAgentRef } from '../../agent-definition/agent-runtime-config.interface';
import { MAX_SUB_AGENT_DEPTH } from '../../execution/node-handlers/sub-agent.handler';
import { EventBridgeService } from '../../execution/services/event-bridge.service';
import { resolveSubAgent } from './resolve-subagent';
import {
  createSubAgentEventProxy,
  type SubAgentEventProxy,
} from './subagent-event-proxy';
import {
  CallSubAgentInputSchema,
  createAliasEnum,
  generateSubAgentHandle,
  GetSubAgentStatusInputSchema,
  type SubAgentHandle,
  type SubAgentParentContext,
  type SubAgentResult,
  type SubAgentRunRecord,
  SubAgentRunStatus,
  SpawnSubAgentInputSchema,
  WaitForSubAgentsInputSchema,
} from './subagent-execution.types';

const MAX_RUNNING_SUBAGENTS = 10;

export interface ExecuteSubAgentParams {
  handle: SubAgentHandle;
  invocationMode: 'call' | 'spawn';
  alias: string;
  subAgentRef: AgentSubAgentRef;
  task: string;
  context?: string;
  parentContext: SubAgentParentContext;
  parentToolCallId: string;
  depth: number;
  agentDefinition: Awaited<
    ReturnType<AgentDefinitionService['findDetailById']>
  >;
  versionSnapshot: Awaited<
    ReturnType<typeof resolveSubAgent>
  >['versionSnapshot'];
  abortSignal: AbortSignal;
  eventProxy?: SubAgentEventProxy;
}

export type ExecuteSubAgent = (
  params: ExecuteSubAgentParams,
) => Promise<SubAgentResult>;

interface SubAgentStatusSnapshot {
  handle: SubAgentHandle;
  alias: string;
  status: SubAgentRunStatus;
  agentDefinitionId: string;
  depth: number;
  startedAt: number;
  completedAt?: number;
  result?: SubAgentResult;
  error?: string;
}

interface SessionToolProviderOptions {
  createEventProxy?: (params: {
    record: SubAgentRunRecord;
    parentContext: SubAgentParentContext;
  }) => SubAgentEventProxy | undefined;
}

@Injectable()
export class SubAgentToolsProvider {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  createSessionToolProvider(
    subAgentRefs: AgentSubAgentRef[],
    parentContext: SubAgentParentContext,
    executeSubAgent: ExecuteSubAgent,
    providerOptions?: SessionToolProviderOptions,
  ): SessionToolProvider {
    if (subAgentRefs.length === 0) {
      return () => ({});
    }

    const normalizedRefs = subAgentRefs.map((ref) => ({
      ...ref,
      alias: normalizeSubAgentAlias(ref),
    }));
    const aliases = normalizedRefs.map((ref) => ref.alias);
    const refsByAlias = new Map(normalizedRefs.map((ref) => [ref.alias, ref]));
    const runRecords = new Map<SubAgentHandle, SubAgentRunRecord>();
    const callSubAgentInputSchema = CallSubAgentInputSchema.extend({
      alias: createAliasEnum(aliases),
    });
    const spawnSubAgentInputSchema = SpawnSubAgentInputSchema.extend({
      alias: createAliasEnum(aliases),
    });

    return (): ToolSet => ({
      call_subagent: tool({
        description: buildCallDescription(normalizedRefs),
        inputSchema: callSubAgentInputSchema,
        execute: async (input, options) => {
          const ref = refsByAlias.get(input.alias);
          if (!ref) {
            return `子代理别名不存在: ${input.alias}`;
          }

          try {
            const record = this.createRunRecord({
              ref,
              parentContext,
              runRecords,
              parentToolCallId: options.toolCallId,
            });

            void this.runSubAgent({
              ref,
              record,
              task: input.task,
              context: input.context,
              parentContext,
              executeSubAgent,
              invocationMode: 'call',
              providerOptions,
            });

            const result = await record.completionPromise;
            return JSON.stringify(result);
          } catch (error) {
            return toErrorMessage(error);
          }
        },
      }),
      spawn_subagent: tool({
        description: buildSpawnDescription(normalizedRefs),
        inputSchema: spawnSubAgentInputSchema,
        execute: async (input, options) => {
          const ref = refsByAlias.get(input.alias);
          if (!ref) {
            return `子代理别名不存在: ${input.alias}`;
          }

          try {
            const record = this.createRunRecord({
              ref,
              parentContext,
              runRecords,
              parentToolCallId: options.toolCallId,
            });

            this.startDetachedSubAgent({
              ref,
              record,
              task: input.task,
              context: input.context,
              parentContext,
              executeSubAgent,
              invocationMode: 'spawn',
              providerOptions,
            });

            return {
              handle: record.handle,
              alias: record.alias,
              status: record.status,
            };
          } catch (error) {
            return toErrorMessage(error);
          }
        },
      }),
      wait_for_subagents: tool({
        description: '等待一个或多个子代理结束，并返回当前状态与结果快照。',
        inputSchema: WaitForSubAgentsInputSchema,
        execute: async (input) =>
          Promise.all(
            input.handles.map(async (handle) => {
              const record = runRecords.get(handle as SubAgentHandle);
              if (!record) {
                return {
                  handle,
                  status: SubAgentRunStatus.FAILED,
                  error: `子代理句柄不存在: ${handle}`,
                };
              }

              await this.waitForCompletion(
                record,
                input.timeoutMs ?? getTimeoutMs(refsByAlias, record.alias),
              );
              return this.toStatusSnapshot(record);
            }),
          ),
      }),
      get_subagent_status: tool({
        description: '查询某个子代理句柄的当前执行状态，不会阻塞等待。',
        inputSchema: GetSubAgentStatusInputSchema,
        execute: async (input) => {
          const record = runRecords.get(input.handle as SubAgentHandle);
          if (!record) {
            return {
              handle: input.handle,
              status: SubAgentRunStatus.FAILED,
              error: `子代理句柄不存在: ${input.handle}`,
            };
          }

          return this.toStatusSnapshot(record);
        },
      }),
    });
  }

  private createRunRecord(params: {
    ref: AgentSubAgentRef;
    parentContext: SubAgentParentContext;
    runRecords: Map<SubAgentHandle, SubAgentRunRecord>;
    parentToolCallId?: string;
  }): SubAgentRunRecord {
    const runningCount = Array.from(params.runRecords.values()).filter(
      (record) => isRunningStatus(record.status),
    ).length;
    if (runningCount >= MAX_RUNNING_SUBAGENTS) {
      throw new Error(
        `Sub-agent concurrent limit exceeded: at most ${MAX_RUNNING_SUBAGENTS} sub-agents can run at the same time`,
      );
    }

    const handle = generateSubAgentHandle();
    let resolve!: (result: SubAgentResult) => void;
    let reject!: (error: Error) => void;
    const completionPromise = new Promise<SubAgentResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const record: SubAgentRunRecord = {
      handle,
      alias: params.ref.alias,
      agentDefinitionId: params.ref.agentDefinitionId,
      status: SubAgentRunStatus.RUNNING,
      parentToolCallId: params.parentToolCallId ?? handle,
      depth: params.parentContext.depth + 1,
      abortController: new AbortController(),
      resolve,
      reject,
      completionPromise,
      startedAt: Date.now(),
    };

    params.runRecords.set(handle, record);
    return record;
  }

  private async runSubAgent(params: {
    ref: AgentSubAgentRef;
    record: SubAgentRunRecord;
    task: string;
    context?: string;
    parentContext: SubAgentParentContext;
    executeSubAgent: ExecuteSubAgent;
    invocationMode: 'call' | 'spawn';
    providerOptions?: SessionToolProviderOptions;
  }): Promise<void> {
    let eventProxy: SubAgentEventProxy | undefined;

    try {
      const resolved = await resolveSubAgent({
        agentDefinitionId: params.ref.agentDefinitionId,
        ...(params.ref.agentVersionId
          ? { agentVersionId: params.ref.agentVersionId }
          : {}),
        tenantId: params.parentContext.tenantId,
        currentDepth: params.parentContext.depth + 1,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(params.parentContext.visitedAgentIds),
        agentDefinitionService: this.agentDefinitionService,
      });

      const timeoutSignal =
        params.ref.maxTimeoutMs && params.ref.maxTimeoutMs > 0
          ? AbortSignal.timeout(params.ref.maxTimeoutMs)
          : undefined;
      const { signal, cleanup } = createLinkedAbortSignal([
        params.record.abortController.signal,
        params.parentContext.parentAbortSignal,
        timeoutSignal,
      ]);

      try {
        eventProxy = params.providerOptions?.createEventProxy?.({
          record: params.record,
          parentContext: params.parentContext,
        });

        if (!eventProxy && params.parentContext.conversationId) {
          eventProxy = createSubAgentEventProxy({
            conversationId: params.parentContext.conversationId,
            tenantId: params.parentContext.tenantId,
            envelope: {
              handle: params.record.handle,
              alias: params.record.alias,
              depth: params.record.depth,
              parentToolCallId: params.record.parentToolCallId,
            },
            eventBridge: this.eventBridge,
          });
        }

        const result = await params.executeSubAgent({
          handle: params.record.handle,
          invocationMode: params.invocationMode,
          alias: params.record.alias,
          subAgentRef: params.ref,
          task: params.task,
          context: params.context,
          parentContext: params.parentContext,
          parentToolCallId: params.record.parentToolCallId,
          depth: params.record.depth,
          agentDefinition: resolved.agentDefinition,
          versionSnapshot: resolved.versionSnapshot,
          abortSignal: signal,
          eventProxy,
        });

        params.record.status = SubAgentRunStatus.COMPLETED;
        params.record.result = result;
        params.record.completedAt = Date.now();
        eventProxy?.complete(SubAgentRunStatus.COMPLETED);
        params.record.resolve(result);
      } catch (error) {
        const status = this.resolveFailureStatus(
          params.record.abortController.signal,
          signal,
          error,
        );
        const message = toErrorMessage(error);

        params.record.status = status;
        params.record.error = message;
        params.record.completedAt = Date.now();
        eventProxy?.complete(status, message);
        params.record.reject(new Error(message));
      } finally {
        cleanup();
      }
    } catch (error) {
      const message = toErrorMessage(error);
      params.record.status = SubAgentRunStatus.FAILED;
      params.record.error = message;
      params.record.completedAt = Date.now();
      params.record.reject(new Error(message));
    }
  }

  private startDetachedSubAgent(params: {
    ref: AgentSubAgentRef;
    record: SubAgentRunRecord;
    task: string;
    context?: string;
    parentContext: SubAgentParentContext;
    executeSubAgent: ExecuteSubAgent;
    invocationMode: 'call' | 'spawn';
    providerOptions?: SessionToolProviderOptions;
  }): void {
    void transactionStorage.exit(() =>
      runInTenantTransaction(
        this.db,
        params.parentContext.tenantId,
        async () => {
          await this.runSubAgent(params);
        },
      ),
    );
  }

  private async waitForCompletion(
    record: SubAgentRunRecord,
    timeoutMs?: number,
  ): Promise<void> {
    if (!isRunningStatus(record.status)) {
      await record.completionPromise.catch(() => undefined);
      return;
    }

    if (!timeoutMs || timeoutMs <= 0) {
      await record.completionPromise.catch(() => undefined);
      return;
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const abortOnTimeout = () => {
      if (isRunningStatus(record.status)) {
        record.abortController.abort(timeoutSignal.reason);
      }
    };

    timeoutSignal.addEventListener('abort', abortOnTimeout, { once: true });
    try {
      await record.completionPromise.catch(() => undefined);
    } finally {
      timeoutSignal.removeEventListener('abort', abortOnTimeout);
    }
  }

  private toStatusSnapshot(record: SubAgentRunRecord): SubAgentStatusSnapshot {
    return {
      handle: record.handle,
      alias: record.alias,
      status: record.status,
      agentDefinitionId: record.agentDefinitionId,
      depth: record.depth,
      startedAt: record.startedAt,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.result ? { result: record.result } : {}),
      ...(record.error ? { error: record.error } : {}),
    };
  }

  private resolveFailureStatus(
    ownSignal: AbortSignal,
    runtimeSignal: AbortSignal,
    error: unknown,
  ): SubAgentRunStatus {
    if (!ownSignal.aborted && !runtimeSignal.aborted) {
      return SubAgentRunStatus.FAILED;
    }

    return isTimeoutReason(ownSignal.reason) ||
      isTimeoutReason(runtimeSignal.reason) ||
      isTimeoutReason(error)
      ? SubAgentRunStatus.TIMEOUT
      : SubAgentRunStatus.CANCELLED;
  }
}

function buildCallDescription(refs: AgentSubAgentRef[]): string {
  return `调用一个子代理并等待最终结果。可用子代理：${formatSubAgentList(refs)}`;
}

function buildSpawnDescription(refs: AgentSubAgentRef[]): string {
  return `启动一个后台子代理并立即返回句柄。可用子代理：${formatSubAgentList(refs)}`;
}

function formatSubAgentList(refs: AgentSubAgentRef[]): string {
  return refs
    .map((ref) =>
      ref.description?.trim()
        ? `${ref.alias}（${ref.description.trim()}）`
        : ref.alias,
    )
    .join('、');
}

function getTimeoutMs(
  refsByAlias: Map<string, AgentSubAgentRef>,
  alias: string,
): number | undefined {
  return refsByAlias.get(alias)?.maxTimeoutMs;
}

function normalizeSubAgentAlias(ref: AgentSubAgentRef): string {
  const alias = ref.alias?.trim();
  if (alias) {
    return alias;
  }

  return ref.agentDefinitionId;
}

function isRunningStatus(status: SubAgentRunStatus): boolean {
  return (
    status === SubAgentRunStatus.PENDING || status === SubAgentRunStatus.RUNNING
  );
}

function createLinkedAbortSignal(signals: Array<AbortSignal | undefined>): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();

  const abortWithSignal = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  for (const signal of signals) {
    if (!signal) {
      continue;
    }

    if (signal.aborted) {
      abortWithSignal(signal);
      break;
    }

    const listener = () => abortWithSignal(signal);
    listeners.set(signal, listener);
    signal.addEventListener('abort', listener, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener('abort', listener);
      }
    },
  };
}

function isTimeoutReason(value: unknown): boolean {
  if (!value) {
    return false;
  }

  if (typeof value === 'object' && 'name' in value) {
    return (value as { name?: string }).name === 'TimeoutError';
  }

  if (value instanceof Error) {
    return value.name === 'TimeoutError';
  }

  return false;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
