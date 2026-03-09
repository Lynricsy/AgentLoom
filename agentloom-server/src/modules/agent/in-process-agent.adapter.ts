import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IAgentRuntime } from './ports/agent-runtime.port';
import type {
  AgentSession,
  CreateSessionParams,
  SessionContext,
} from './types/agent-session.types';
import type { AgentEvent } from './types/agent-event.types';
import type { ContentBlock } from './types/content-block.types';

@Injectable()
export class InProcessAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(InProcessAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const sessionId = randomUUID();
    const now = new Date();

    const context: SessionContext = {
      history: [],
      cwd: params.cwd,
      mcpServers: params.mcpServers,
      workflowState:
        params.mode === 'workflow' ? params.context : undefined,
    };

    const session: AgentSession = {
      id: sessionId,
      agentId: params.agentId,
      mode: params.mode,
      context,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    this.logger.debug(
      `Session created: ${sessionId} for agent: ${params.agentId}`,
    );
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const session = await this.loadSession(sessionId);

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    try {
      session.context.history.push(...content);
      session.updatedAt = new Date();

      if (session.status === 'completed' || abortController.signal.aborted) {
        yield { type: 'done', stopReason: 'cancelled' } as const;
        return;
      }

      yield {
        type: 'message_chunk',
        content: '[InProcessAgentAdapter] Stub response — agent runtime not yet integrated',
      } as const;

      if (abortController.signal.aborted) {
        yield { type: 'done', stopReason: 'cancelled' } as const;
        return;
      }

      yield { type: 'done', stopReason: 'end_turn' } as const;
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

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.updatedAt = new Date();
    }
  }
}
