/**
 * Sandbox Agent 运行时 facade：保留既有 IAgentRuntime 与控制器 API，
 * 会话 transport、模型配置、工具注册、事件解码和 PTY 分别委托给独立边界。
 */
import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { ToolPermissionResolutionNotAllowedException } from '../../common/exceptions/tool-call.exceptions';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { RagService } from '../knowledge/services/rag.service';
import { McpService } from '../mcp/mcp.service';
import { SandboxNotFoundException } from '../sandbox/sandbox.exceptions';
import { PiConfigGeneratorService } from '../sandbox/pi-config-generator.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import { SandboxService } from '../sandbox/sandbox.service';
import { SelfEvolutionService } from '../self-evolution/self-evolution.service';
import type { SelfEvolutionRemoteToolOutcome } from '../self-evolution/self-evolution.types';
import { CodeExecutionService } from './code-execution.service';
import type {
  IAgentRuntime,
  SessionToolProvider,
} from './ports/agent-runtime.port';
import {
  decodeSandboxServerSentEvent,
  type SandboxEventDecodeResult,
} from './sandbox-event-decoder';
import { SandboxModelConfigService } from './sandbox-model-config.service';
import { SandboxPtyService } from './sandbox-pty.service';
import {
  SandboxSessionRuntimeService,
  type SandboxBinding,
} from './sandbox-session-runtime.service';
import { SandboxToolRegistryService } from './sandbox-tool-registry.service';
import type {
  AgentEvent,
  AgentSession,
  ContentBlock,
  CreateSessionParams,
  ServerSandboxBinding,
  ToolPermissionRequest,
} from './types';

const CONTAINER_WORKSPACE = '/workspace/';
const TOOL_PERMISSION_TIMEOUT_MS = 30_000;

export type { SandboxBinding };

type PendingPermissionAction = 'approve' | 'deny' | 'cancelled';
type PendingPermissionGate = {
  resolve: (action: PendingPermissionAction) => void;
  timer: ReturnType<typeof setTimeout>;
};
type RemoteToolExecutionCallback = {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  input?: unknown;
  phase?: 'preflight' | 'execute';
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
  private readonly sessionRuntime: SandboxSessionRuntimeService;
  private readonly modelConfig: SandboxModelConfigService;
  private readonly toolRegistry: SandboxToolRegistryService;
  private readonly pty: SandboxPtyService;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly sandboxService: SandboxService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
    @Optional() private readonly mcpService?: McpService,
    @Optional() private readonly ragService?: RagService,
    @Optional() private readonly codeExecutionService?: CodeExecutionService,
    @Optional()
    private readonly decryptionBoundaryService?: DecryptionBoundaryService,
    @Optional()
    private readonly piConfigGenerator?: PiConfigGeneratorService,
    @Optional() private readonly selfEvolutionService?: SelfEvolutionService,
    @Optional() sessionRuntime?: SandboxSessionRuntimeService,
    @Optional() modelConfig?: SandboxModelConfigService,
    @Optional() toolRegistry?: SandboxToolRegistryService,
    @Optional() pty?: SandboxPtyService,
  ) {
    this.sessionRuntime =
      sessionRuntime ??
      new SandboxSessionRuntimeService(sandboxService, runtimeDriver);
    this.modelConfig =
      modelConfig ??
      new SandboxModelConfigService(
        db,
        runtimeDriver,
        decryptionBoundaryService,
        piConfigGenerator,
      );
    this.toolRegistry =
      toolRegistry ??
      new SandboxToolRegistryService(
        db,
        mcpService,
        ragService,
        codeExecutionService,
      );
    this.pty = pty ?? new SandboxPtyService(this.sessionRuntime, runtimeDriver);
  }

  registerSessionToolProvider(
    sessionId: string,
    provider: SessionToolProvider,
  ): void {
    this.toolRegistry.registerSessionToolProvider(sessionId, provider);
  }

  unregisterSessionToolProvider(sessionId: string): void {
    this.toolRegistry.unregisterSessionToolProvider(sessionId);
  }

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const sessionId = params.sessionId ?? randomUUID();
    const session: AgentSession = {
      id: sessionId,
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
      runtimeConfig: params.runtimeConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.abortControllers.set(session.id, new AbortController());
    this.toolRegistry.initializeSession(session.id);

    const runtimeConfigProvider = this.toolRegistry.createRuntimeConfigToolProvider(
      session,
      params.runtimeConfig,
    );
    if (runtimeConfigProvider) {
      this.registerSessionToolProvider(session.id, runtimeConfigProvider);
    }

    const sandboxBinding = this.sessionRuntime.readSandboxBinding(
      params.context ?? {},
    );
    const tenantId = params.tenantId ?? null;
    if (sandboxBinding.agentConversationId) {
      this.conversationSessionIds.set(
        sandboxBinding.agentConversationId,
        session.id,
      );
    }

    if (tenantId && this.sessionRuntime.hasSandboxBinding(sandboxBinding)) {
      try {
        const sandbox = await this.sessionRuntime.waitForSandboxReady(
          sandboxBinding,
          tenantId,
        );
        const payload = await this.modelConfig.buildContainerSessionPayload({
          session,
          runtimeConfig: params.runtimeConfig,
          mcpServers: params.mcpServers,
        });
        await this.modelConfig.initializeContainerSession(
          sandbox.runtimeHandle,
          {
            sessionId: session.id,
            cwd: CONTAINER_WORKSPACE,
            createCodingTools: true,
            ...payload,
            ...(await this.toolRegistry.buildRemoteToolExecutionPayload(
              session.id,
            )),
          },
        );
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
    session.context.history.push(...content);
    session.updatedAt = new Date();
    const workflowState = session.context.workflowState ?? {};
    const sandboxBinding = this.sessionRuntime.readSandboxBinding(workflowState);
    const tenantId =
      typeof workflowState.tenantId === 'string'
        ? workflowState.tenantId
        : (session.tenantId ?? null);

    if (!tenantId || !this.sessionRuntime.hasSandboxBinding(sandboxBinding)) {
      throw new Error(
        'Sandbox workflow context missing sandbox binding or tenantId',
      );
    }

    try {
      const response = await this.sessionRuntime.requestPrompt(
        sandboxBinding,
        tenantId,
        sessionId,
        content,
        this.abortControllers.get(sessionId)?.signal,
      );
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
          const terminal = await this.emitDecodedFrame(
            sessionId,
            frame,
            reader,
          );
          for (const event of terminal.events) yield event;
          if (terminal.done) return;
        }
        if (done) {
          const terminal = await this.emitDecodedFrame(
            sessionId,
            buffer,
            reader,
          );
          for (const event of terminal.events) yield event;
          return;
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

  private async emitDecodedFrame(
    sessionId: string,
    frame: string,
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<{ events: AgentEvent[]; done: boolean }> {
    const decoded = decodeSandboxServerSentEvent(frame, {
      fallbackToolCallId: randomUUID(),
      fallbackTransitionTimestamp: new Date().toISOString(),
    });
    this.applyDecodeEffects(sessionId, decoded);
    if (decoded.error) throw decoded.error;
    const done = decoded.events.some((event) => event.type === 'done');
    if (done) await this.cancelReaderSafely(reader);
    return { events: decoded.events, done };
  }

  private applyDecodeEffects(
    sessionId: string,
    decoded: SandboxEventDecodeResult,
  ): void {
    if (decoded.denyPendingPermissions) {
      this.clearPendingPermissions(sessionId, 'deny');
    }
  }

  private async cancelReaderSafely(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    try {
      await reader.cancel();
    } catch {
      // terminal event 已是上层唯一真相，忽略 transport 关闭阶段异常。
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.abortControllers.get(sessionId)?.abort();
    const session = this.sessions.get(sessionId);
    if (session) {
      const workflowState = session.context.workflowState ?? {};
      const binding = this.sessionRuntime.readSandboxBinding(workflowState);
      const tenantId =
        typeof workflowState.tenantId === 'string'
          ? workflowState.tenantId
          : (session.tenantId ?? null);
      if (tenantId && this.sessionRuntime.hasSandboxBinding(binding)) {
        await this.sessionRuntime.abortContainerPrompt(
          sessionId,
          binding,
          tenantId,
        );
      }
      session.status = 'completed';
      session.updatedAt = new Date();
      if (binding.agentConversationId) {
        this.conversationSessionIds.delete(binding.agentConversationId);
      }
    }
    this.clearPendingPermissions(sessionId, 'cancelled');
    this.toolRegistry.disposeSession(sessionId);
    this.abortControllers.delete(sessionId);
    this.logger.debug(`取消 Sandbox 会话: ${sessionId}`);
  }

  async executeSessionToolCallback(
    sessionId: string,
    callback: RemoteToolExecutionCallback,
    callbackToken?: string,
  ): Promise<{ result: unknown } | SelfEvolutionRemoteToolOutcome> {
    if (callback.sessionId !== sessionId) {
      throw new Error(
        `Remote tool callback sessionId mismatch: expected ${sessionId}, got ${callback.sessionId}`,
      );
    }
    this.toolRegistry.assertValidSessionToolCallbackToken(
      sessionId,
      callbackToken,
    );
    const session = await this.loadSession(sessionId);
    const tenantId = session.tenantId;
    if (!tenantId) {
      throw new Error(`Sandbox session ${sessionId} is missing tenantId`);
    }

    const selfEvolutionService = this.selfEvolutionService;
    if (selfEvolutionService?.supportsTool(callback.toolName)) {
      return runInTenantTransaction(this.db, tenantId, async () => {
        const input = this.normalizeSessionToolInput(callback.input);
        return callback.phase === 'execute'
          ? selfEvolutionService.handleSessionToolExecute(
              session,
              callback.toolName as never,
              callback.toolCallId,
              input,
            )
          : selfEvolutionService.handleSessionToolPreflight(
              session,
              callback.toolName as never,
              callback.toolCallId,
              input,
            );
      });
    }

    const runtimeTool = await this.toolRegistry.resolveSessionTool(
      sessionId,
      callback.toolName,
    );
    if (!runtimeTool.execute) {
      throw new Error(
        `Sandbox session tool "${callback.toolName}" is not executable`,
      );
    }

    // 外部 MCP/HTTP/RAG/代码工具不得占用数据库事务；各工具自身的 DB 读取在其服务内短事务完成。
    const result = await runtimeTool.execute(callback.input, {
      toolCallId: callback.toolCallId,
      messages: [],
      abortSignal: undefined,
      // v7 起 experimental_context 转正为必填 context。
      context: undefined,
    });
    return { result };
  }

  async resolveToolPermission(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const resolvers = this.pendingPermissionResolvers.get(sessionId);
    const gate = resolvers?.get(toolCallId);
    if (!gate) {
      // live gate 是实际可决议性的唯一依据；用领域 409 代替裸 Error，
      // 让 HTTP 边界能区分“已不存在等待项”和服务端故障。
      throw new ToolPermissionResolutionNotAllowedException(
        toolCallId,
        'not_pending',
      );
    }
    clearTimeout(gate.timer);
    resolvers?.delete(toolCallId);
    if (resolvers?.size === 0) this.pendingPermissionResolvers.delete(sessionId);
    gate.resolve(action);
  }

  async awaitToolPermission(
    conversationId: string,
    callback: SandboxToolPermissionCallback,
  ): Promise<{ allowed: boolean }> {
    const sessionId =
      callback.sessionId ?? this.resolveSessionIdForConversation(conversationId);
    return {
      allowed:
        (await this.waitForPermission(sessionId, callback.toolCallId)) ===
        'approve',
    };
  }

  hasPendingConversationToolPermission(
    conversationId: string,
    toolCallId: string,
  ): boolean {
    try {
      const sessionId = this.resolveSessionIdForConversation(conversationId);
      return (
        this.pendingPermissionResolvers.get(sessionId)?.has(toolCallId) === true
      );
    } catch {
      // 会话映射不存在就不可能存在本进程 live gate；查询 API 不应把“无会话”升级成 500。
      return false;
    }
  }

  async resolveConversationToolPermission(
    conversationId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    await this.resolveToolPermission(
      this.resolveSessionIdForConversation(conversationId),
      toolCallId,
      action,
    );
  }

  private async waitForPermission(
    sessionId: string,
    toolCallId: string,
  ): Promise<PendingPermissionAction> {
    const session = await this.loadSession(sessionId);
    const signal = this.abortControllers.get(sessionId)?.signal;
    const resolvers =
      this.pendingPermissionResolvers.get(sessionId) ??
      new Map<string, PendingPermissionGate>();
    if (resolvers.has(toolCallId)) {
      throw new Error(
        `Session ${sessionId} already has pending tool permission for ${toolCallId}`,
      );
    }
    this.pendingPermissionResolvers.set(sessionId, resolvers);

    return new Promise<PendingPermissionAction>((resolve) => {
      const finish = (action: PendingPermissionAction) => {
        clearTimeout(timer);
        resolvers.delete(toolCallId);
        if (resolvers.size === 0) {
          this.pendingPermissionResolvers.delete(sessionId);
        }
        signal?.removeEventListener('abort', onAbort);
        resolve(action);
      };
      const onAbort = () => finish('cancelled');
      const timer = setTimeout(() => finish('deny'), TOOL_PERMISSION_TIMEOUT_MS);
      resolvers.set(toolCallId, { resolve: finish, timer });
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
    const resolvers = this.pendingPermissionResolvers.get(sessionId);
    if (!resolvers) return;
    this.pendingPermissionResolvers.delete(sessionId);
    for (const gate of resolvers.values()) {
      clearTimeout(gate.timer);
      gate.resolve(action);
    }
  }

  private resolveSessionIdForConversation(conversationId: string): string {
    const mapped = this.conversationSessionIds.get(conversationId);
    if (mapped && this.sessions.has(mapped)) return mapped;
    for (const [sessionId, session] of this.sessions) {
      const binding = this.sessionRuntime.readSandboxBinding(
        session.context.workflowState ?? {},
      );
      if (binding.agentConversationId === conversationId) {
        this.conversationSessionIds.set(conversationId, sessionId);
        return sessionId;
      }
    }
    throw new Error(
      `Sandbox conversation session not found for ${conversationId}`,
    );
  }

  async listPtySessions(
    binding: ServerSandboxBinding,
    tenantId: string,
  ): Promise<unknown> {
    return this.pty.listPtySessions(binding, tenantId);
  }

  async ptyBufferDump(
    binding: ServerSandboxBinding,
    tenantId: string,
    ptySessionId: string,
    options?: { offset?: number; limit?: number; pattern?: string },
  ): Promise<unknown> {
    return this.pty.ptyBufferDump(binding, tenantId, ptySessionId, options);
  }

  async ptyWrite(
    binding: ServerSandboxBinding,
    tenantId: string,
    ptySessionId: string,
    data: string,
  ): Promise<unknown> {
    return this.pty.ptyWrite(binding, tenantId, ptySessionId, data);
  }

  private normalizeSessionToolInput(input: unknown): Record<string, unknown> {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  }
}
