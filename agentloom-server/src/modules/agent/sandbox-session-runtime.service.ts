/**
 * Sandbox 会话运行时边界：解析 sandbox 绑定、等待 guest 就绪并代理 prompt/abort，
 * 不管理 Agent 会话内存状态，也不负责模型配置与工具注册。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SandboxSession } from '../../database/schema';
import { SandboxService } from '../sandbox/sandbox.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import type { ContentBlock, ServerSandboxBinding } from './types';

export type SandboxBinding = ServerSandboxBinding;

const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 3_600_000;
const ABORT_REQUEST_TIMEOUT_MS = 5_000;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;

@Injectable()
export class SandboxSessionRuntimeService {
  private readonly logger = new Logger(SandboxSessionRuntimeService.name);

  constructor(
    private readonly sandboxService: SandboxService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
  ) {}

  readSandboxBinding(workflowState: Record<string, unknown>): SandboxBinding {
    const executionId = readString(workflowState.executionId);
    const agentConversationId = readString(workflowState.agentConversationId);
    const serverSandbox = isRecord(workflowState.serverSandbox)
      ? workflowState.serverSandbox
      : undefined;
    const nestedExecutionId = readString(serverSandbox?.executionId);
    const nestedConversationId = readString(
      serverSandbox?.agentConversationId,
    );
    const sandboxNodeId =
      readString(workflowState.sandboxNodeId) ??
      readString(serverSandbox?.sandboxNodeId);

    return {
      ...((executionId ?? nestedExecutionId)
        ? { executionId: executionId ?? nestedExecutionId }
        : {}),
      ...((agentConversationId ?? nestedConversationId)
        ? {
            agentConversationId:
              agentConversationId ?? nestedConversationId,
          }
        : {}),
      ...(sandboxNodeId ? { sandboxNodeId } : {}),
    };
  }

  hasSandboxBinding(binding: SandboxBinding): boolean {
    return Boolean(binding.executionId || binding.agentConversationId);
  }

  async waitForSandboxReady(
    binding: SandboxBinding,
    tenantId: string,
  ): Promise<SandboxSession & { runtimeHandle: string }> {
    const startedAt = Date.now();
    const bindingLabel = this.describeSandboxBinding(binding);

    while (Date.now() - startedAt < SANDBOX_READY_TIMEOUT_MS) {
      const session = binding.executionId
        ? await this.sandboxService.getSandboxSession(
            binding.executionId,
            tenantId,
            binding.sandboxNodeId,
          )
        : binding.agentConversationId
          ? await this.sandboxService.findByConversationId(
              binding.agentConversationId,
              tenantId,
            )
          : null;

      if (!session) {
        const latest = binding.executionId
          ? await this.sandboxService.findLatestByExecutionId(
              binding.executionId,
              tenantId,
              binding.sandboxNodeId,
            )
          : binding.agentConversationId
            ? await this.sandboxService.findLatestByConversationId(
                binding.agentConversationId,
                tenantId,
              )
            : null;
        if (latest && (latest.status === 'failed' || latest.status === 'stopped')) {
          throw new Error(
            await this.describeUnavailableSandboxSession(latest, bindingLabel),
          );
        }
        throw new Error(`Sandbox session not found for ${bindingLabel}`);
      }

      if (session.status === 'failed' || session.status === 'stopped') {
        throw new Error(`Sandbox session ${session.id} is ${session.status}`);
      }

      if (
        session.status === 'ready' &&
        session.runtimeHandle &&
        (await this.runtimeDriver.healthCheck(session.runtimeHandle))
      ) {
        return { ...session, runtimeHandle: session.runtimeHandle };
      }

      await delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw new Error(`Sandbox session is not ready for ${bindingLabel}`);
  }

  async requestPrompt(
    binding: SandboxBinding,
    tenantId: string,
    sessionId: string,
    content: ContentBlock[],
    abortSignal?: AbortSignal,
  ): Promise<Response> {
    const sandbox = await this.waitForSandboxReady(binding, tenantId);
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutSignal])
      : timeoutSignal;
    return this.runtimeDriver.requestGuest(sandbox.runtimeHandle, '/v1/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, content, cwd: CONTAINER_WORKSPACE }),
      signal,
    }) as Promise<Response>;
  }

  async abortContainerPrompt(
    sessionId: string,
    binding: SandboxBinding,
    tenantId: string,
  ): Promise<void> {
    try {
      const sandbox = await this.waitForSandboxReady(binding, tenantId);
      const response = await this.runtimeDriver.requestGuest(
        sandbox.runtimeHandle,
        '/v1/abort',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          signal: AbortSignal.timeout(ABORT_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `Sandbox abort 请求失败: session=${sessionId}, status=${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Sandbox abort 请求异常: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async describeUnavailableSandboxSession(
    session: SandboxSession,
    bindingLabel: string,
  ): Promise<string> {
    if (session.status === 'failed') {
      try {
        const logs = await this.sandboxService.getSandboxLogs(session.id);
        const latest = [...logs]
          .reverse()
          .find(
            (log) =>
              log.level === 'system' &&
              log.message.startsWith('Sandbox creation failed:'),
          );
        if (latest) return latest.message;
      } catch (error) {
        this.logger.warn(
          `Failed to load sandbox logs for ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return `Sandbox session ${session.id} is ${session.status} for ${bindingLabel}`;
  }

  private describeSandboxBinding(binding: SandboxBinding): string {
    if (binding.executionId && binding.agentConversationId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''} / conversation ${binding.agentConversationId}`;
    }
    if (binding.executionId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''}`;
    }
    if (binding.agentConversationId) {
      return `conversation ${binding.agentConversationId}`;
    }
    return 'sandbox binding';
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
