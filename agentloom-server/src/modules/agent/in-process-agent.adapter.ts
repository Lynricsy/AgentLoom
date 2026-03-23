import { Dependencies, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { PiAgentCoreAdapter } from './pi-agent-core.adapter';
import type {
  IAgentRuntime,
  SessionToolProvider,
} from './ports/agent-runtime.port';
import type {
  AgentSession,
  CreateSessionParams,
} from './types/agent-session.types';
import type {
  AgentEvent,
} from './types/agent-event.types';
import type { ReplayableAgentEvent } from './types/conversation-history.types';
import type { ContentBlock } from './types/content-block.types';

interface SessionMetadata {
  readonly tenantId: string;
  readonly stepId: string;
}

@Injectable()
@Dependencies(
  DRIZZLE,
  PiAiAdapter,
  AgentSessionFactory,
  SessionPersistenceService,
)
export class InProcessAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(InProcessAgentAdapter.name);
  private readonly sessionIndex = new Map<string, SessionMetadata>();
  private readonly sessionSnapshots = new Map<string, AgentSession>();
  private readonly sessionToolProviders = new Map<string, SessionToolProvider>();
  private readonly runtimeSessionIds = new Map<string, string>();
  private readonly coreAdapter: PiAgentCoreAdapter;

  constructor(
    private readonly db: DrizzleDB,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly agentSessionFactory: AgentSessionFactory,
    private readonly sessionPersistence: SessionPersistenceService,
  ) {
    void this.agentSessionFactory;
    this.coreAdapter = new PiAgentCoreAdapter(this.db, this.piAiAdapter);
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
    this.sessionToolProviders.set(sessionId, provider);

    const runtimeSessionId = this.runtimeSessionIds.get(sessionId);
    if (runtimeSessionId) {
      this.coreAdapter.registerSessionToolProvider?.(runtimeSessionId, provider);
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

    const provider = this.sessionToolProviders.get(session.id);
    if (provider) {
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
    const snapshot = await this.loadSession(sessionId);

    if (snapshot.status === 'completed') {
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
    const promptBlocks = restored
      ? [...snapshot.context.history, ...content]
      : content;

    try {
      for await (const event of this.coreAdapter.prompt(runtimeSessionId, promptBlocks)) {
        if (snapshot.mode === 'conversation' && this.isReplayableAgentEvent(event)) {
          await this.sessionPersistence.appendConversationReplayEntry(snapshot, {
            kind: 'agent_event',
            event,
          });
        }

        yield event;
      }

      const runtimeSession = await this.coreAdapter.loadSession(runtimeSessionId);
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

  async cancel(sessionId: string): Promise<void> {
    const runtimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;

    try {
      await this.coreAdapter.cancel(runtimeSessionId);
      this.coreAdapter.unregisterSessionToolProvider?.(runtimeSessionId);
    } catch {
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
        await this.persistSnapshot(sessionId, session);
      }
    }

    const snapshot = this.sessionSnapshots.get(sessionId);
    if (snapshot) {
      snapshot.status = 'completed';
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
    const existingRuntimeSessionId = this.runtimeSessionIds.get(sessionId) ?? sessionId;
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

    const provider = this.sessionToolProviders.get(sessionId);
    if (provider) {
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
      ...(session.context.cwd === undefined ? {} : { cwd: session.context.cwd }),
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
      ...(session.mode === 'workflow' && session.context.workflowState !== undefined
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
