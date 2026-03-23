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
import type {
  StopReason,
  ToolCallEvent,
  ToolCallStatus,
  ToolPermissionRequest,
} from './types';
import type {
  ToolCallTransitionRecord,
  ToolCallTransitionSource,
} from './types/tool-call-event.types';

const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 300_000;
const SESSION_INIT_REQUEST_TIMEOUT_MS = 5_000;
const ABORT_REQUEST_TIMEOUT_MS = 5_000;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;
const TOOL_PERMISSION_TIMEOUT_MS = 30_000;
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

type PendingPermissionAction = 'approve' | 'deny' | 'cancelled';

type PendingPermissionGate = {
  resolve: (action: PendingPermissionAction) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ContainerEventEnvelope = {
  type?: unknown;
  data?: unknown;
};

export type SandboxToolPermissionCallback = {
  sessionId?: string;
  toolCallId: string;
  toolName: string;
  input?: unknown;
  permissionRequest?: ToolPermissionRequest;
};

@Injectable()
export class SandboxAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(SandboxAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly pendingPermissionResolvers = new Map<
    string,
    Map<string, PendingPermissionGate>
  >();
  private readonly conversationSessionIds = new Map<string, string>();

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

    if (sandboxBinding.agentConversationId) {
      this.conversationSessionIds.set(
        sandboxBinding.agentConversationId,
        session.id,
      );
    }

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
          const parsed = this.parseServerSentEvent(sessionId, frame);
          if (parsed.error) {
            throw parsed.error;
          }
          for (const event of parsed.events) {
            yield event;
          }
        }

        if (done) {
          const finalEvent = this.parseServerSentEvent(sessionId, buffer);
          if (finalEvent.error) {
            throw finalEvent.error;
          }
          for (const event of finalEvent.events) {
            yield event;
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
    } finally {
      this.clearPendingPermissions(sessionId, 'cancelled');
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      const workflowState = session.context.workflowState ?? {};
      const sandboxBinding = this.readSandboxBinding(workflowState);
      const tenantId =
        typeof workflowState['tenantId'] === 'string'
          ? workflowState['tenantId']
          : (session.tenantId ?? null);

      if (tenantId && this.hasSandboxBinding(sandboxBinding)) {
        await this.abortContainerPrompt(sessionId, sandboxBinding, tenantId);
      }

      session.status = 'completed';
      session.updatedAt = new Date();

      if (sandboxBinding.agentConversationId) {
        this.conversationSessionIds.delete(sandboxBinding.agentConversationId);
      }
    }

    this.clearPendingPermissions(sessionId, 'cancelled');

    this.logger.debug(`取消 Sandbox 会话: ${sessionId}`);
  }

  async resolveToolPermission(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const sessionResolvers = this.pendingPermissionResolvers.get(sessionId);
    const gate = sessionResolvers?.get(toolCallId);

    if (!gate) {
      throw new Error(
        `Session ${sessionId} has no pending tool permission for ${toolCallId}`,
      );
    }

    clearTimeout(gate.timer);
    sessionResolvers?.delete(toolCallId);
    if (sessionResolvers?.size === 0) {
      this.pendingPermissionResolvers.delete(sessionId);
    }

    gate.resolve(action);
  }

  async awaitToolPermission(
    conversationId: string,
    callback: SandboxToolPermissionCallback,
  ): Promise<{ allowed: boolean }> {
    const sessionId =
      callback.sessionId ?? this.resolveSessionIdForConversation(conversationId);
    const action = await this.waitForPermission(sessionId, callback.toolCallId);

    return { allowed: action === 'approve' };
  }

  async resolveConversationToolPermission(
    conversationId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const sessionId = this.resolveSessionIdForConversation(conversationId);
    await this.resolveToolPermission(sessionId, toolCallId, action);
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

  private parseServerSentEvent(
    sessionId: string,
    frame: string,
  ): { events: AgentEvent[]; error?: Error } {
    const payload = frame
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!payload || payload === '[DONE]') {
      return { events: [] };
    }

    const parsed = JSON.parse(payload) as unknown;
    if (this.isAgentEvent(parsed)) {
      return { events: [parsed] };
    }

    if (
      this.isRecord(parsed) &&
      parsed.jsonrpc === '2.0' &&
      parsed.method === 'event' &&
      this.isRecord(parsed.params)
    ) {
      return this.translateContainerEvent(
        sessionId,
        parsed.params as ContainerEventEnvelope,
      );
    }

    if (this.isRecord(parsed) && typeof parsed.type === 'string') {
      return this.translateContainerEvent(sessionId, parsed as ContainerEventEnvelope);
    }

    return { events: [] };
  }

  private translateContainerEvent(
    sessionId: string,
    envelope: ContainerEventEnvelope,
  ): { events: AgentEvent[]; error?: Error } {
    const eventType = typeof envelope.type === 'string' ? envelope.type : null;
    const data = this.isRecord(envelope.data) ? envelope.data : null;

    switch (eventType) {
      case 'text_delta': {
        const content = this.readTextDelta(envelope.data);
        if (!content) {
          return { events: [] };
        }
        return { events: [{ type: 'message_chunk', content }] };
      }

      case 'tool_call_start':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(data, 'in_progress'),
            },
          ],
        };

      case 'tool_call_update':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(data, 'awaiting_permission'),
            },
          ],
        };

      case 'tool_call_end':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(
                data,
                this.readBoolean(data?.isError) || data?.error
                  ? 'failed'
                  : 'completed',
              ),
            },
          ],
        };

      case 'done':
        return {
          events: [
            {
              type: 'done',
              stopReason: this.normalizeStopReason(data?.stopReason),
            },
          ],
        };

      case 'error': {
        const message =
          this.readString(data?.message) ?? this.readString(envelope.data) ?? 'Sandbox agent error';
        this.clearPendingPermissions(sessionId, 'deny');
        return { events: [], error: new Error(message) };
      }

      default:
        return { events: [] };
    }
  }

  private buildToolCallEvent(
    data: Record<string, unknown> | null,
    fallbackStatus: ToolCallStatus,
  ): ToolCallEvent {
    const tool = this.readString(data?.toolName) ?? this.readString(data?.tool) ?? 'unknown_tool';
    const permissionRequest = this.normalizePermissionRequest(
      data?.permissionRequest,
      tool,
      data,
    );
    const status = this.readToolCallStatus(
      data?.status,
      permissionRequest,
      fallbackStatus,
    ) ?? fallbackStatus;

    return {
      id: this.readString(data?.toolCallId) ?? this.readString(data?.id) ?? randomUUID(),
      tool,
      args: this.normalizeToolArgs(data),
      status,
      ...(this.normalizeTransitions(data?.transitions)
        ? { transitions: this.normalizeTransitions(data?.transitions) }
        : {}),
      ...(data && 'result' in data ? { result: data.result } : {}),
      ...(this.readToolError(data) ? { error: this.readToolError(data) ?? undefined } : {}),
      ...(permissionRequest ? { permissionRequest } : {}),
    };
  }

  private normalizeToolArgs(
    data: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const candidates = [data?.args, data?.input, data?.arguments];
    for (const candidate of candidates) {
      if (this.isRecord(candidate)) {
        return candidate;
      }
    }

    return {};
  }

  private normalizeTransitions(
    value: unknown,
  ): ToolCallEvent['transitions'] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const transitions: ToolCallTransitionRecord[] = value.flatMap((entry) => {
      if (!this.isRecord(entry)) {
        return [];
      }

      const to = this.readToolCallStatus(entry.to, undefined, undefined);
      const timestamp = this.readString(entry.timestamp) ?? new Date().toISOString();
      const source: ToolCallTransitionSource =
        entry.source === 'runtime' || entry.source === 'worker' || entry.source === 'user'
          ? entry.source
          : 'runtime';

      return to
        ? [
            {
              ...(this.readToolCallStatus(entry.from, undefined, undefined)
                ? { from: this.readToolCallStatus(entry.from, undefined, undefined) }
                : {}),
              to,
              timestamp,
              source,
            } satisfies ToolCallTransitionRecord,
          ]
        : [];
    });

    return transitions.length > 0 ? transitions : undefined;
  }

  private normalizePermissionRequest(
    value: unknown,
    toolName: string,
    data: Record<string, unknown> | null,
  ): ToolPermissionRequest | undefined {
    if (this.isRecord(value)) {
      const description =
        this.readString(value.description) ?? `允许工具 ${toolName} 执行`;
      const resourcePaths = this.readStringArray(value.resourcePaths);
      return {
        description,
        ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
      };
    }

    const description = this.readString(data?.description);
    const resourcePaths = this.readStringArray(data?.resourcePaths);
    if (!description && resourcePaths.length === 0) {
      return undefined;
    }

    return {
      description: description ?? `允许工具 ${toolName} 执行`,
      ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
    };
  }

  private normalizeStopReason(value: unknown): StopReason {
    switch (value) {
      case 'cancelled':
      case 'aborted':
        return 'cancelled';
      case 'max_tokens':
      case 'length':
        return 'max_tokens';
      case 'tool_use':
      case 'toolUse':
        return 'tool_use';
      case 'intervention_required':
        return 'intervention_required';
      default:
        return 'end_turn';
    }
  }

  private readToolCallStatus(
    value: unknown,
    permissionRequest?: ToolPermissionRequest,
    fallback?: ToolCallStatus,
  ): ToolCallStatus | undefined {
    switch (value) {
      case 'pending':
      case 'awaiting_permission':
      case 'denied':
      case 'in_progress':
      case 'completed':
      case 'failed':
        return value;
      default:
        if (permissionRequest) {
          return 'awaiting_permission';
        }

        return fallback;
    }
  }

  private readTextDelta(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (!this.isRecord(value)) {
      return null;
    }

    return this.readString(value.delta) ?? this.readString(value.content) ?? null;
  }

  private readToolError(data: Record<string, unknown> | null): string | undefined {
    const errorValue = data?.error;
    if (typeof errorValue === 'string' && errorValue.length > 0) {
      return errorValue;
    }

    if (this.isRecord(errorValue)) {
      return this.readString(errorValue.message) ?? JSON.stringify(errorValue);
    }

    if (this.readBoolean(data?.isError)) {
      return this.readString(data?.message) ?? 'Sandbox tool execution failed';
    }

    return undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readBoolean(value: unknown): boolean {
    return value === true;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  private async waitForPermission(
    sessionId: string,
    toolCallId: string,
  ): Promise<PendingPermissionAction> {
    const session = await this.loadSession(sessionId);
    const controller = this.abortControllers.get(sessionId);
    const signal = controller?.signal;
    const sessionResolvers =
      this.pendingPermissionResolvers.get(sessionId) ?? new Map<string, PendingPermissionGate>();

    if (sessionResolvers.has(toolCallId)) {
      throw new Error(
        `Session ${sessionId} already has pending tool permission for ${toolCallId}`,
      );
    }

    this.pendingPermissionResolvers.set(sessionId, sessionResolvers);

    return await new Promise<PendingPermissionAction>((resolve) => {
      const finish = (action: PendingPermissionAction) => {
        clearTimeout(timer);
        sessionResolvers.delete(toolCallId);
        if (sessionResolvers.size === 0) {
          this.pendingPermissionResolvers.delete(sessionId);
        }
        signal?.removeEventListener('abort', onAbort);
        resolve(action);
      };

      const onAbort = () => finish('cancelled');
      const timer = setTimeout(() => finish('deny'), TOOL_PERMISSION_TIMEOUT_MS);

      sessionResolvers.set(toolCallId, {
        resolve: finish,
        timer,
      });

      if (signal?.aborted || session.status !== 'active') {
        finish('cancelled');
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private clearPendingPermissions(
    sessionId: string,
    action: PendingPermissionAction,
  ): void {
    const sessionResolvers = this.pendingPermissionResolvers.get(sessionId);
    if (!sessionResolvers) {
      return;
    }

    this.pendingPermissionResolvers.delete(sessionId);
    for (const gate of sessionResolvers.values()) {
      clearTimeout(gate.timer);
      gate.resolve(action);
    }
  }

  private resolveSessionIdForConversation(conversationId: string): string {
    const mappedSessionId = this.conversationSessionIds.get(conversationId);
    if (mappedSessionId && this.sessions.has(mappedSessionId)) {
      return mappedSessionId;
    }

    for (const [sessionId, session] of this.sessions.entries()) {
      const binding = this.readSandboxBinding(session.context.workflowState ?? {});
      if (binding.agentConversationId === conversationId) {
        this.conversationSessionIds.set(conversationId, sessionId);
        return sessionId;
      }
    }

    throw new Error(`Sandbox conversation session not found for ${conversationId}`);
  }

  private async abortContainerPrompt(
    sessionId: string,
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<void> {
    try {
      const sandboxSession = await this.waitForSandboxReady(sandboxBinding, tenantId);
      const promptUrl = await this.dockerService.getPromptUrl(sandboxSession.containerId);
      const abortUrl = new URL(promptUrl);
      abortUrl.pathname = '/v1/abort';

      const response = await fetch(abortUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(ABORT_REQUEST_TIMEOUT_MS),
      });

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

  private isAgentEvent(value: unknown): value is AgentEvent {
    if (!this.isRecord(value) || typeof value.type !== 'string') {
      return false;
    }

    switch (value.type) {
      case 'plan':
        return typeof value.title === 'string' && typeof value.content === 'string';
      case 'message_chunk':
        return typeof value.content === 'string';
      case 'tool_call':
        return this.isRecord(value.call);
      case 'decision':
        return typeof value.suggestedContent === 'string';
      case 'done':
        return typeof value.stopReason === 'string';
      default:
        return false;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
