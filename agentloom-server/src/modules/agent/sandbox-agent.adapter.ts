import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { SandboxSession } from '../../database/schema';
import { DockerService } from '../sandbox/docker.service';
import { SandboxNotFoundException } from '../sandbox/sandbox.exceptions';
import { SandboxService } from '../sandbox/sandbox.service';

import type { IAgentRuntime } from './ports/agent-runtime.port';
import type {
  AgentEvent,
  AgentSession,
  ContentBlock,
  CreateSessionParams,
} from './types';

const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 300_000;
const SESSION_INIT_REQUEST_TIMEOUT_MS = 5_000;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;
const RETRYABLE_SESSION_INIT_STATUSES = new Set([
  404, 408, 425, 429, 500, 502, 503, 504,
]);
const RETRYABLE_SESSION_INIT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

type SandboxBinding = {
  executionId?: string;
  agentConversationId?: string;
};

@Injectable()
export class SandboxAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(SandboxAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly dockerService: DockerService,
  ) {}

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const session: AgentSession = {
      id: randomUUID(),
      agentId: params.agentId,
      mode: params.mode,
      context: {
        history: [],
        cwd: CONTAINER_WORKSPACE,
        mcpServers: params.mcpServers,
        workflowState: params.context,
      },
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.abortControllers.set(session.id, new AbortController());

    const workflowState = params.context ?? {};
    const sandboxBinding = this.readSandboxBinding(workflowState);
    const tenantId = params.tenantId ?? null;

    if (tenantId && this.hasSandboxBinding(sandboxBinding)) {
      try {
        const sandboxSession = await this.waitForSandboxReady(
          sandboxBinding,
          tenantId,
        );
        const sessionUrl = await this.dockerService.getSessionUrl(
          sandboxSession.containerId,
        );

        await this.initializeContainerSession(sessionUrl, {
          sessionId: session.id,
          cwd: CONTAINER_WORKSPACE,
          systemPrompt: params.systemPrompt,
          mcpServers: params.mcpServers,
          createCodingTools: true,
        });
      } catch (error) {
        session.status = 'error';
        session.updatedAt = new Date();
        throw error;
      }
    }

    this.logger.debug(`创建 Sandbox 会话: ${session.id}`);
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SandboxNotFoundException(
        `Sandbox session not found: ${sessionId}`,
      );
    }
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncIterable<AgentEvent> {
    const session = await this.loadSession(sessionId);
    const abortController = this.abortControllers.get(sessionId);

    session.context.history.push(...content);
    session.updatedAt = new Date();

    const workflowState = session.context.workflowState ?? {};
    const sandboxBinding = this.readSandboxBinding(workflowState);
    const tenantId =
      typeof workflowState['tenantId'] === 'string'
        ? workflowState['tenantId']
        : (session.tenantId ?? null);

    if (!tenantId || !this.hasSandboxBinding(sandboxBinding)) {
      throw new Error(
        'Sandbox workflow context missing sandbox binding or tenantId',
      );
    }

    try {
      const sandboxSession = await this.waitForSandboxReady(
        sandboxBinding,
        tenantId,
      );
      if (!sandboxSession.containerId) {
        throw new Error(
          `Sandbox session ${sandboxSession.id} has no containerId`,
        );
      }
      const containerUrl = await this.dockerService.getPromptUrl(
        sandboxSession.containerId,
      );
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combinedSignal = abortController
        ? AbortSignal.any([abortController.signal, timeoutSignal])
        : timeoutSignal;

      const response = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content,
          cwd: CONTAINER_WORKSPACE,
        }),
        signal: combinedSignal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Sandbox agent request failed with status ${response.status}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const event = this.parseServerSentEvent(frame);
          if (event) {
            yield event;
          }
        }

        if (done) {
          const finalEvent = this.parseServerSentEvent(buffer);
          if (finalEvent) {
            yield finalEvent;
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { type: 'done', stopReason: 'cancelled' };
        return;
      }

      this.logger.error(
        `Sandbox prompt 失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.updatedAt = new Date();
    }

    this.logger.debug(`取消 Sandbox 会话: ${sessionId}`);
  }

  async resolveToolPermission(
    _sessionId: string,
    _toolCallId: string,
    _action: 'approve' | 'deny',
  ): Promise<void> {
    throw new Error('SandboxAgentAdapter 尚未实现工具权限恢复');
  }

  private async waitForSandboxReady(
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<SandboxSession & { containerId: string }> {
    const startedAt = Date.now();
    const bindingLabel = this.describeSandboxBinding(sandboxBinding);

    while (Date.now() - startedAt < SANDBOX_READY_TIMEOUT_MS) {
      const sandboxSession = sandboxBinding.executionId
        ? await this.sandboxService.getSandboxSession(
            sandboxBinding.executionId,
            tenantId,
          )
        : sandboxBinding.agentConversationId
          ? await this.sandboxService.findByConversationId(
              sandboxBinding.agentConversationId,
              tenantId,
            )
          : null;

      if (!sandboxSession) {
        throw new Error(`Sandbox session not found for ${bindingLabel}`);
      }

      if (
        sandboxSession.status === 'failed' ||
        sandboxSession.status === 'stopped'
      ) {
        throw new Error(
          `Sandbox session ${sandboxSession.id} is ${sandboxSession.status}`,
        );
      }

      if (
        sandboxSession.status === 'ready' &&
        sandboxSession.containerId &&
        (await this.dockerService.healthCheck(sandboxSession.containerId))
      ) {
        return {
          ...sandboxSession,
          containerId: sandboxSession.containerId,
        };
      }

      await this.delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw new Error(`Sandbox session is not ready for ${bindingLabel}`);
  }

  private readSandboxBinding(
    workflowState: Record<string, unknown>,
  ): SandboxBinding {
    const executionId =
      typeof workflowState['executionId'] === 'string'
        ? workflowState['executionId']
        : null;
    const agentConversationId =
      typeof workflowState['agentConversationId'] === 'string'
        ? workflowState['agentConversationId']
        : null;
    const serverSandbox = workflowState['serverSandbox'];
    const nestedExecutionId =
      this.isRecord(serverSandbox) &&
      typeof serverSandbox.executionId === 'string'
        ? serverSandbox.executionId
        : null;
    const nestedConversationId =
      this.isRecord(serverSandbox) &&
      typeof serverSandbox.agentConversationId === 'string'
        ? serverSandbox.agentConversationId
        : null;

    return {
      ...((executionId ?? nestedExecutionId)
        ? { executionId: executionId ?? nestedExecutionId ?? undefined }
        : {}),
      ...((agentConversationId ?? nestedConversationId)
        ? {
            agentConversationId:
              agentConversationId ?? nestedConversationId ?? undefined,
          }
        : {}),
    };
  }

  private hasSandboxBinding(binding: SandboxBinding): boolean {
    return Boolean(binding.executionId || binding.agentConversationId);
  }

  private describeSandboxBinding(binding: SandboxBinding): string {
    if (binding.executionId && binding.agentConversationId) {
      return `execution ${binding.executionId} / conversation ${binding.agentConversationId}`;
    }

    if (binding.executionId) {
      return `execution ${binding.executionId}`;
    }

    if (binding.agentConversationId) {
      return `conversation ${binding.agentConversationId}`;
    }

    return 'sandbox binding';
  }

  private async initializeContainerSession(
    sessionUrl: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const startedAt = Date.now();
    let lastError: Error | null = null;
    let attempt = 0;

    while (Date.now() - startedAt < SANDBOX_READY_TIMEOUT_MS) {
      attempt += 1;

      try {
        const response = await fetch(sessionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(SESSION_INIT_REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          return;
        }

        const responseError = new Error(
          `Container session init failed with status ${response.status}`,
        );
        if (!this.isRetryableSessionInitStatus(response.status)) {
          throw responseError;
        }

        lastError = responseError;
      } catch (error) {
        if (!this.isRetryableSessionInitError(error)) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
      }

      this.logger.warn(
        `Sandbox 容器会话初始化未就绪，${SANDBOX_READY_POLL_INTERVAL_MS}ms 后重试（第 ${attempt} 次）: ${lastError.message}`,
      );
      await this.delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw (
      lastError ??
      new Error(
        `Container session init did not become ready within ${SANDBOX_READY_TIMEOUT_MS}ms`,
      )
    );
  }

  private isRetryableSessionInitStatus(status: number): boolean {
    return RETRYABLE_SESSION_INIT_STATUSES.has(status);
  }

  private isRetryableSessionInitError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }

    if (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return true;
    }

    const { cause } = error;
    if (!cause || typeof cause !== 'object' || !('code' in cause)) {
      return false;
    }

    return (
      typeof cause.code === 'string' &&
      RETRYABLE_SESSION_INIT_ERROR_CODES.has(cause.code)
    );
  }

  private parseServerSentEvent(frame: string): AgentEvent | null {
    const payload = frame
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!payload || payload === '[DONE]') {
      return null;
    }

    return JSON.parse(payload) as AgentEvent;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
