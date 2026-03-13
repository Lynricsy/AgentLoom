import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { streamText, type LanguageModel } from 'ai';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import type { IAgentRuntime } from './ports/agent-runtime.port';
import type {
  AgentSession,
  CreateSessionParams,
  SessionContext,
} from './types/agent-session.types';
import type { AgentEvent, StopReason } from './types/agent-event.types';
import type { ContentBlock } from './types/content-block.types';
import type { ToolCallEvent } from './types/tool-call-event.types';

/** 轻量级 session 索引，仅保存用于从检查点加载 session 所需的元数据 */
interface SessionMetadata {
  readonly tenantId: string;
  readonly stepId: string;
}

@Injectable()
export class InProcessAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(InProcessAgentAdapter.name);
  private readonly sessionIndex = new Map<string, SessionMetadata>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly agentSessionFactory: AgentSessionFactory,
    private readonly sessionPersistence: SessionPersistenceService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 为恢复场景注册 session 元数据（进程重启后内存索引丢失时使用）。
   * Worker 在调用 loadSession 前应先调用此方法注册恢复所需的元数据。
   */
  registerSessionMetadata(
    sessionId: string,
    tenantId: string,
    stepId: string,
  ): void {
    this.sessionIndex.set(sessionId, { tenantId, stepId });
  }

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    let session: AgentSession;

    if (params.mode === 'workflow' && params.context) {
      const ctx = params.context;
      session = this.agentSessionFactory.createWorkflowSession({
        agentId: params.agentId,
        executionId: ctx.executionId as string,
        stepId: ctx.stepId as string,
        nodeId: ctx.nodeId as string,
        tenantId: params.tenantId!,
        llmModelConfigId: params.llmModelConfigId,
        systemPrompt: params.systemPrompt,
        autonomyMode: params.autonomyMode,
        mcpServers: params.mcpServers,
      });
    } else {
      const sessionId = randomUUID();
      const now = new Date();

      const context: SessionContext = {
        history: [],
        cwd: params.cwd,
        mcpServers: params.mcpServers,
        workflowState: params.mode === 'workflow' ? params.context : undefined,
      };

      session = {
        id: sessionId,
        agentId: params.agentId,
        mode: params.mode,
        context,
        status: 'active',
        tenantId: params.tenantId,
        llmModelConfigId: params.llmModelConfigId,
        systemPrompt: params.systemPrompt,
        autonomyMode: params.autonomyMode,
        createdAt: now,
        updatedAt: now,
      };
    }

    if (params.mode === 'workflow' && params.tenantId && params.context) {
      const stepId = params.context.stepId as string;
      this.sessionIndex.set(session.id, {
        tenantId: params.tenantId,
        stepId,
      });
      await this.sessionPersistence.saveToCheckpoint(
        params.tenantId,
        stepId,
        session,
      );
    }

    this.logger.debug(
      `Session created: ${session.id} for agent: ${params.agentId}`,
    );
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const meta = this.sessionIndex.get(sessionId);
    if (!meta) {
      throw new Error(`Session not found: ${sessionId} (no metadata in index)`);
    }

    const session = await this.sessionPersistence.loadFromCheckpoint(
      meta.tenantId,
      meta.stepId,
    );
    if (!session) {
      throw new Error(
        `Session not found in checkpoint: ${sessionId} (step: ${meta.stepId})`,
      );
    }

    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const session = await this.loadSession(sessionId);
    const meta = this.sessionIndex.get(sessionId);

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    try {
      session.context.history.push(...content);
      session.updatedAt = new Date();

      if (session.status === 'completed' || abortController.signal.aborted) {
        yield { type: 'done', stopReason: 'cancelled' } as const;
        return;
      }

      const modelConfig = await this.resolveModelConfig(session);
      const model = await this.piAiAdapter.getModel(modelConfig);
      const promptText = this.serializeContentBlocks(session.context.history);
      const result = streamText({
        model: model as LanguageModel,
        system: session.systemPrompt,
        prompt: promptText,
        abortSignal: abortController.signal,
      });

      let emittedDone = false;
      let accumulatedText = '';

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (part.text) {
            accumulatedText += part.text;
            yield { type: 'message_chunk', content: part.text } as const;
          }
          continue;
        }

        if (part.type === 'tool-call') {
          yield {
            type: 'tool_call',
            call: {
              id: part.toolCallId,
              tool: part.toolName,
              args: this.normalizeToolArgs(part.input),
              status: 'pending',
            },
          } as const;
          continue;
        }

        if (part.type === 'tool-result') {
          yield {
            type: 'tool_call',
            call: {
              id: part.toolCallId,
              tool: part.toolName,
              args: this.normalizeToolArgs(part.input),
              status: 'completed',
              result: part.output,
            },
          } as const;
          continue;
        }

        if (part.type === 'tool-error') {
          yield {
            type: 'tool_call',
            call: {
              id: part.toolCallId,
              tool: part.toolName,
              args: this.normalizeToolArgs(part.input),
              status: 'failed',
              error: this.stringifyToolError(part.error),
            },
          } as const;
          continue;
        }

        if (part.type === 'finish-step' && part.finishReason === 'tool-calls') {
          emittedDone = true;
          yield { type: 'done', stopReason: 'tool_use' } as const;
          continue;
        }

        if (part.type === 'abort' || abortController.signal.aborted) {
          emittedDone = true;
          yield { type: 'done', stopReason: 'cancelled' } as const;
          return;
        }

        if (part.type === 'error') {
          throw part.error instanceof Error
            ? part.error
            : new Error('LLM 流式输出失败');
        }

        if (part.type === 'finish') {
          emittedDone = true;
          if (session.autonomyMode === 'LLM_SUGGEST') {
            yield {
              type: 'decision',
              suggestedContent: accumulatedText,
              autonomyMode: session.autonomyMode,
              selectedAction: 'request_intervention',
              alternatives: ['approve', 'modify', 'reject'],
              confidence: 0.5,
            } as const;
            yield {
              type: 'done',
              stopReason: 'intervention_required',
            } as const;
            return;
          }

          yield {
            type: 'done',
            stopReason: this.mapFinishReason(part.finishReason),
          } as const;
          return;
        }
      }

      if (!emittedDone) {
        yield { type: 'done', stopReason: 'end_turn' } as const;
      }
      session.status = 'active';
      session.updatedAt = new Date();

      if (meta) {
        await this.sessionPersistence.saveToCheckpoint(
          meta.tenantId,
          meta.stepId,
          session,
        );
      }
    } catch (error) {
      session.status = 'error';
      session.updatedAt = new Date();

      if (meta) {
        await this.sessionPersistence.saveToCheckpoint(
          meta.tenantId,
          meta.stepId,
          session,
        );
      }
      throw error;
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.logger.debug(`Session cancelled: ${sessionId}`);
    }

    const meta = this.sessionIndex.get(sessionId);
    if (meta) {
      const session = await this.sessionPersistence.loadFromCheckpoint(
        meta.tenantId,
        meta.stepId,
      );
      if (session) {
        session.status = 'completed';
        session.updatedAt = new Date();
        await this.sessionPersistence.saveToCheckpoint(
          meta.tenantId,
          meta.stepId,
          session,
        );
      }
    }
  }

  private async resolveModelConfig(
    session: AgentSession,
  ): Promise<schema.LlmModelConfig> {
    if (!session.tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const tenantId = session.tenantId;
    const llmModelConfigId = session.llmModelConfigId;

    return runInTenantTransaction(this.db, tenantId, async () => {
      if (llmModelConfigId) {
        const [modelConfig] = await this.tenantDb
          .select()
          .from(schema.llmModelConfigs)
          .where(
            and(
              eq(schema.llmModelConfigs.id, llmModelConfigId),
              eq(schema.llmModelConfigs.tenantId, tenantId),
            ),
          );

        if (!modelConfig) {
          throw new Error(`LLM 模型配置不存在: ${llmModelConfigId}`);
        }

        return modelConfig;
      }

      const [modelConfig] = await this.tenantDb
        .select()
        .from(schema.llmModelConfigs)
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, tenantId),
            eq(schema.llmModelConfigs.isDefault, true),
          ),
        );

      if (!modelConfig) {
        throw new Error(`租户 ${tenantId} 未配置默认 LLM 模型`);
      }

      session.llmModelConfigId = modelConfig.id;
      return modelConfig;
    });
  }

  private serializeContentBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'text':
            return block.text;
          case 'image':
            return `[image:${block.mimeType}]`;
          case 'audio':
            return `[audio:${block.mimeType}]`;
          case 'resource':
            return block.text ?? block.blob ?? `[resource:${block.uri}]`;
          case 'resource_link':
            return block.title ?? `[resource_link:${block.uri}]`;
          default:
            return '';
        }
      })
      .join('\n\n');
  }

  private normalizeToolArgs(input: unknown): ToolCallEvent['args'] {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as ToolCallEvent['args'])
      : {};
  }

  private stringifyToolError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === 'string' ? error : '工具执行失败';
  }

  private mapFinishReason(finishReason: string | undefined): StopReason {
    switch (finishReason) {
      case 'length':
        return 'max_tokens';
      case 'tool-calls':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}
