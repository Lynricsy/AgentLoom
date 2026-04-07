import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import {
  ConversationSessionDataIntegrityError,
  SessionPersistenceService,
} from '../../execution/services/session-persistence.service';
import { AcpJsonRpcError, buildJsonRpcNotification } from '../acp-jsonrpc';
import { mapConversationReplayEntryToAcpSessionUpdate } from '../acp-session-update.mapper';
import { AcpSessionMcpRegistryService } from '../services/acp-session-mcp-registry.service';
import { AcpTerminalProxyService } from '../services/acp-terminal-proxy.service';
import type {
  AcpConnectionState,
  AcpSessionLoadParams,
  AcpSessionLoadResult,
  AcpTrackedSession,
} from '../acp-types';
import { resolveAcpAgentRuntime } from '../resolve-acp-agent-runtime';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class SessionLoadHandler {
  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly sessionPersistence: SessionPersistenceService,
    private readonly terminalProxyService: AcpTerminalProxyService,
    private readonly mcpSessionService: AcpSessionMcpRegistryService,
  ) {}

  async handle(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpSessionLoadResult> {
    const normalizedParams = this.readParams(params);
    const session = await this.loadConversationSession(
      normalizedParams.sessionId,
    );
    const tenantId = state.authContext?.tenantId;

    if (
      typeof tenantId !== 'string' ||
      tenantId.length === 0 ||
      session.mode !== 'conversation' ||
      session.tenantId !== tenantId
    ) {
      throw this.buildSessionNotFoundError(normalizedParams.sessionId);
    }

    try {
      const replayEntries =
        await this.sessionPersistence.loadConversationReplay(
          normalizedParams.sessionId,
        );

      for (const entry of replayEntries) {
        if (!state.emitNotification) {
          continue;
        }

        await state.emitNotification(
          buildJsonRpcNotification('session/update', {
            sessionId: session.id,
            update: mapConversationReplayEntryToAcpSessionUpdate(entry),
          }),
        );
      }
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw this.buildReplayFailureError(normalizedParams.sessionId, error);
    }

    const trackedSession: AcpTrackedSession = {
      sessionId: session.id,
      runtimeSessionId: session.id,
      agentId: session.agentId,
      tenantId,
      ...(session.context.cwd === undefined
        ? {}
        : { cwd: session.context.cwd }),
      ...(session.context.serverSandbox === undefined
        ? {}
        : { serverSandbox: session.context.serverSandbox }),
    };

    if (session.context.mcpServers !== undefined) {
      try {
        await this.mcpSessionService.restoreSessionTools(
          trackedSession,
          session.context.mcpServers,
        );
      } catch (error) {
        await this.safeCleanupSessionTools(trackedSession);
        throw new AcpJsonRpcError(
          -32603,
          'Failed to restore ACP MCP forwarding',
          {
            sessionId: session.id,
            reason: this.getErrorMessage(error),
          },
        );
      }
    }

    const terminalContinuity = session.context.terminalContinuity;
    if (terminalContinuity && terminalContinuity.terminals.length > 0) {
      let terminalIds: string[];

      try {
        terminalIds = await this.terminalProxyService.restoreTerminalContinuity(
          trackedSession,
          terminalContinuity,
        );
      } catch (error) {
        await this.safeCleanupSessionTools(trackedSession);
        throw error;
      }

      if (terminalIds.length > 0) {
        trackedSession.terminalIds = terminalIds;
      }
    }

    const sessions = state.sessions ?? new Map<string, AcpTrackedSession>();
    state.sessions = sessions;
    sessions.set(session.id, trackedSession);

    return {
      sessionId: session.id,
    };
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = resolveAcpAgentRuntime(this.moduleRef);
    }

    return this.agentRuntime;
  }

  private readParams(params: unknown): AcpSessionLoadParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const sessionId = params.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return { sessionId };
  }

  private async loadConversationSession(sessionId: string) {
    try {
      return await this.getAgentRuntime().loadSession(sessionId);
    } catch (error) {
      if (error instanceof Error && /session not found/i.test(error.message)) {
        throw this.buildSessionNotFoundError(sessionId);
      }

      if (error instanceof ConversationSessionDataIntegrityError) {
        throw this.buildReplayFailureError(sessionId, error);
      }

      throw error;
    }
  }

  private buildReplayFailureError(
    sessionId: string,
    error: unknown,
  ): AcpJsonRpcError {
    return new AcpJsonRpcError(-32603, 'Failed to replay session history', {
      sessionId,
      reason:
        error instanceof ConversationSessionDataIntegrityError
          ? error.message
          : 'Replay interrupted',
    });
  }

  private buildSessionNotFoundError(sessionId: string): AcpJsonRpcError {
    return new AcpJsonRpcError(-32602, 'Invalid params', {
      sessionId,
      reason: 'Session not found',
    });
  }

  private async safeCleanupSessionTools(
    trackedSession: AcpTrackedSession,
  ): Promise<void> {
    try {
      await this.mcpSessionService.cleanupSessionTools(trackedSession);
    } catch {
      return;
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
