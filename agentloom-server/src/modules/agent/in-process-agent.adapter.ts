import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { RagService } from '../knowledge/services/rag.service';
import { McpService } from '../mcp/mcp.service';
import { CodeExecutionService } from './code-execution.service';
import { AgentToolPermissionSyncService } from './agent-tool-permission-sync.service';
import { PiAgentCoreAdapter } from './pi-agent-core.adapter';
import type {
  IAgentRuntime,
  SessionToolProvider,
} from './ports/agent-runtime.port';
import type {
  AgentSession,
  CreateSessionParams,
} from './types/agent-session.types';
import type { AgentEvent } from './types/agent-event.types';
import type { ReplayableAgentEvent } from './types/conversation-history.types';
import type { ContentBlock } from './types/content-block.types';

interface SessionMetadata {
  readonly tenantId: string;
  readonly stepId: string;
}

/** 进行中的 prompt：cancel 落在调用 core prompt 之前的等待间隙时，由它把本轮判为取消。 */
interface InFlightPrompt {
  cancelled: boolean;
}

@Injectable()
export class InProcessAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(InProcessAgentAdapter.name);
  private readonly sessionIndex = new Map<string, SessionMetadata>();
  private readonly sessionSnapshots = new Map<string, AgentSession>();
  private readonly sessionToolProviders = new Map<
    string,
    SessionToolProvider[]
  >();
  private readonly runtimeSessionIds = new Map<string, string>();
  private readonly inFlightPrompts = new Map<string, InFlightPrompt>();
  private readonly coreAdapter: PiAgentCoreAdapter;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly agentSessionFactory: AgentSessionFactory,
    private readonly sessionPersistence: SessionPersistenceService,
    private readonly codeExecutionService: CodeExecutionService,
    @Optional() private readonly mcpService?: McpService,
    @Optional() private readonly ragService?: RagService,
    @Optional()
    private readonly toolPermissionSyncService?: AgentToolPermissionSyncService,
  ) {
    void this.agentSessionFactory;
    this.coreAdapter = new PiAgentCoreAdapter(
      this.db,
      this.piAiAdapter,
      this.mcpService,
      this.ragService,
      this.codeExecutionService,
      this.toolPermissionSyncService,
    );
  }

  registerSessionMetadata(
    sessionId: string,
    tenantId: string,
    stepId: string,
  ): void {
    this.sessionIndex.set(sessionId, { tenantId, stepId });
  }

  registerSessionToolProvider(
    sessionId: string,
    provider: SessionToolProvider,
  ): void {
    const providers = this.sessionToolProviders.get(sessionId) ?? [];
    providers.push(provider);
    this.sessionToolProviders.set(sessionId, providers);

    const runtimeSessionId = this.runtimeSessionIds.get(sessionId);
    if (runtimeSessionId) {
      this.coreAdapter.registerSessionToolProvider?.(
        runtimeSessionId,
        provider,
      );
    }
  }

  unregisterSessionToolProvider(sessionId: string): void {
    this.sessionToolProviders.delete(sessionId);

    const runtimeSessionId = this.runtimeSessionIds.get(sessionId);
    if (runtimeSessionId) {
      this.coreAdapter.unregisterSessionToolProvider?.(runtimeSessionId);
    }
  }

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const session = await this.coreAdapter.createSession(params);
    this.runtimeSessionIds.set(session.id, session.id);
    this.sessionSnapshots.set(session.id, session);

    const providers = this.sessionToolProviders.get(session.id) ?? [];
    for (const provider of providers) {
      this.coreAdapter.registerSessionToolProvider?.(session.id, provider);
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
    } else if (params.mode === 'conversation') {
      await this.sessionPersistence.saveConversationSession(session);
    }

    this.logger.debug(
      `Session created: ${session.id} for agent: ${params.agentId}`,
    );
    return session;
  }

  // facade 与 core 使用同一 live gate，避免 controller 依赖 Pi 的具体实现。
  hasPendingToolPermission(sessionId: string, toolCallId: string): boolean {
    const runtimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;
    return this.coreAdapter.hasPendingToolPermission(
      runtimeSessionId,
      toolCallId,
    );
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const runtimeSession = await this.tryLoadRuntimeSession(sessionId);
    if (runtimeSession) {
      const snapshot = this.syncRuntimeSessionSnapshot(
        sessionId,
        runtimeSession,
        this.sessionSnapshots.get(sessionId),
      );
      this.sessionSnapshots.set(sessionId, snapshot);
      return snapshot;
    }

    const cached = this.sessionSnapshots.get(sessionId);
    if (cached) {
      return cached;
    }

    const durableConversationSession =
      await this.sessionPersistence.loadConversationSession(sessionId);
    if (durableConversationSession) {
      this.sessionSnapshots.set(sessionId, durableConversationSession);
      return durableConversationSession;
    }

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

    this.sessionSnapshots.set(sessionId, session);
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const inFlight: InFlightPrompt = { cancelled: false };
    this.inFlightPrompts.set(sessionId, inFlight);
    try {
      yield* this.promptInFlight(sessionId, content, inFlight);
    } finally {
      if (this.inFlightPrompts.get(sessionId) === inFlight) {
        this.inFlightPrompts.delete(sessionId);
      }
    }
  }

  private async *promptInFlight(
    sessionId: string,
    content: ContentBlock[],
    inFlight: InFlightPrompt,
  ): AsyncGenerator<AgentEvent> {
    const snapshot = await this.loadSession(sessionId);

    // 对话 session 的取消只结束当前回合，之后的 prompt 照常执行；
    // 工作流 session 被取消即该步骤结束，不再接受 prompt。
    if (
      inFlight.cancelled ||
      (snapshot.mode !== 'conversation' && snapshot.status === 'completed')
    ) {
      yield { type: 'done', stopReason: 'cancelled' } as const;
      await this.persistSnapshot(sessionId, snapshot);
      return;
    }

    if (snapshot.mode === 'conversation' && content.length > 0) {
      await this.sessionPersistence.appendConversationReplayEntry(snapshot, {
        kind: 'user_message',
        content,
      });
    }

    const { runtimeSessionId, restored } = await this.ensureRuntimeSession(
      sessionId,
      snapshot,
    );
    if (inFlight.cancelled) {
      yield { type: 'done', stopReason: 'cancelled' } as const;
      await this.persistSnapshot(sessionId, snapshot);
      return;
    }
    const promptBlocks = restored
      ? [...snapshot.context.history, ...content]
      : content;

    try {
      for await (const event of this.coreAdapter.prompt(
        runtimeSessionId,
        promptBlocks,
      )) {
        if (
          snapshot.mode === 'conversation' &&
          this.isReplayableAgentEvent(event)
        ) {
          await this.sessionPersistence.appendConversationReplayEntry(
            snapshot,
            {
              kind: 'agent_event',
              event,
            },
          );
        }

        yield event;
      }

      const runtimeSession =
        await this.coreAdapter.loadSession(runtimeSessionId);
      const synced = this.syncRuntimeSessionSnapshot(
        sessionId,
        runtimeSession,
        snapshot,
      );
      await this.persistSnapshot(sessionId, synced);
    } catch (error) {
      const runtimeSession = await this.tryLoadRuntimeSession(sessionId);
      const failedSnapshot = runtimeSession
        ? this.syncRuntimeSessionSnapshot(sessionId, runtimeSession, snapshot)
        : {
            ...snapshot,
            status: 'error' as const,
            updatedAt: new Date(),
          };

      await this.persistSnapshot(sessionId, failedSnapshot);
      throw error;
    }
  }

  /**
   * 取消只终止进行中的回合：对话 session 仍可继续 prompt（与 sandbox 适配器、ACP session/cancel 语义一致）；
   * 工作流 session 标记为 completed，该步骤不再接受 prompt。
   */
  async cancel(sessionId: string): Promise<void> {
    const runtimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;
    const inFlight = this.inFlightPrompts.get(sessionId);
    if (inFlight) {
      inFlight.cancelled = true;
    }

    try {
      await this.coreAdapter.cancel(runtimeSessionId);
      this.coreAdapter.unregisterSessionToolProvider?.(runtimeSessionId);
    } catch {}

    const meta = this.sessionIndex.get(sessionId);
    if (meta) {
      const session = await this.sessionPersistence.loadFromCheckpoint(
        meta.tenantId,
        meta.stepId,
      );
      if (session) {
        session.status =
          session.mode === 'conversation' ? 'active' : 'completed';
        session.updatedAt = new Date();
        await this.persistSnapshot(sessionId, session);
      }
    }

    const snapshot = this.sessionSnapshots.get(sessionId);
    if (snapshot) {
      snapshot.status =
        snapshot.mode === 'conversation' ? 'active' : 'completed';
      snapshot.updatedAt = new Date();
      await this.persistSnapshot(sessionId, snapshot);
    }

    this.sessionToolProviders.delete(sessionId);
  }

  async resolveToolPermission(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const runtimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;
    await this.coreAdapter.resolveToolPermission?.(
      runtimeSessionId,
      toolCallId,
      action,
    );
  }

  private async ensureRuntimeSession(
    sessionId: string,
    snapshot: AgentSession,
  ): Promise<{
    runtimeSessionId: string;
    restored: boolean;
  }> {
    const existingRuntimeSessionId =
      this.runtimeSessionIds.get(sessionId) ?? sessionId;
    const existing = await this.tryLoadRuntimeSession(sessionId);
    if (existing) {
      return {
        runtimeSessionId: existingRuntimeSessionId,
        restored: false,
      };
    }

    const restored = await this.coreAdapter.createSession(
      this.buildCreateSessionParams(snapshot),
    );
    this.runtimeSessionIds.set(sessionId, restored.id);

    const providers = this.sessionToolProviders.get(sessionId) ?? [];
    for (const provider of providers) {
      this.coreAdapter.registerSessionToolProvider?.(restored.id, provider);
    }

    return {
      runtimeSessionId: restored.id,
      restored: true,
    };
  }

  private async tryLoadRuntimeSession(
    sessionId: string,
  ): Promise<AgentSession | null> {
    const runtimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;

    try {
      return await this.coreAdapter.loadSession(runtimeSessionId);
    } catch {
      return null;
    }
  }

  private buildCreateSessionParams(session: AgentSession): CreateSessionParams {
    return {
      agentId: session.agentId,
      mode: session.mode,
      ...(session.context.cwd === undefined
        ? {}
        : { cwd: session.context.cwd }),
      ...(session.context.mcpServers === undefined
        ? {}
        : { mcpServers: session.context.mcpServers }),
      ...(session.context.serverSandbox === undefined
        ? {}
        : { serverSandbox: session.context.serverSandbox }),
      ...(session.tenantId === undefined ? {} : { tenantId: session.tenantId }),
      ...(session.llmModelConfigId === undefined
        ? {}
        : { llmModelConfigId: session.llmModelConfigId }),
      ...(session.systemPrompt === undefined
        ? {}
        : { systemPrompt: session.systemPrompt }),
      ...(session.autonomyMode === undefined
        ? {}
        : { autonomyMode: session.autonomyMode }),
      ...(session.runtimeConfig === undefined
        ? {}
        : { runtimeConfig: session.runtimeConfig }),
      ...(session.mode === 'workflow' &&
      session.context.workflowState !== undefined
        ? { context: { ...session.context.workflowState } }
        : {}),
    };
  }

  private syncRuntimeSessionSnapshot(
    sessionId: string,
    runtimeSession: AgentSession,
    existingSnapshot?: AgentSession,
  ): AgentSession {
    const snapshot = existingSnapshot ?? runtimeSession;
    const merged: AgentSession = {
      ...snapshot,
      llmModelConfigId: runtimeSession.llmModelConfigId,
      status: runtimeSession.status,
      updatedAt: runtimeSession.updatedAt,
      runtimeConfig: runtimeSession.runtimeConfig,
      context: {
        ...snapshot.context,
        ...runtimeSession.context,
        history: [...runtimeSession.context.history],
      },
    };

    this.sessionSnapshots.set(sessionId, merged);
    return merged;
  }

  private async persistSnapshot(
    sessionId: string,
    snapshot: AgentSession,
  ): Promise<void> {
    this.sessionSnapshots.set(sessionId, snapshot);

    if (snapshot.mode === 'conversation') {
      await this.sessionPersistence.saveConversationSession(snapshot);
    }

    const meta = this.sessionIndex.get(sessionId);
    if (meta) {
      await this.sessionPersistence.saveToCheckpoint(
        meta.tenantId,
        meta.stepId,
        snapshot,
      );
    }
  }

  private isReplayableAgentEvent(
    event: AgentEvent,
  ): event is ReplayableAgentEvent {
    return (
      event.type === 'plan' ||
      event.type === 'message_chunk' ||
      event.type === 'tool_call' ||
      event.type === 'decision'
    );
  }
}
