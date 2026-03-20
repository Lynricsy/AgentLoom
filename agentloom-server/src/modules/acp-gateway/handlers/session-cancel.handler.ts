import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AGENT_RUNTIME, type IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpConnectionState,
  AcpSessionCancelParams,
  AcpSessionRequestPermissionResult,
  AcpTrackedSession,
} from '../acp-types';
import { AcpSessionMcpRegistryService } from '../services/acp-session-mcp-registry.service';
import { AcpTerminalProxyService } from '../services/acp-terminal-proxy.service';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CANCELLED_PERMISSION_RESULT: AcpSessionRequestPermissionResult = {
  outcome: {
    outcome: 'cancelled',
  },
};

const CANCELLED_FILESYSTEM_RESULT = {
  cancelled: true,
} as const;

type SessionCleanupFailure = {
  step: string;
  reason: string;
};

@Injectable()
export class SessionCancelHandler {
  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly terminalProxyService: AcpTerminalProxyService,
    private readonly mcpSessionService: AcpSessionMcpRegistryService,
  ) {}

  async handle(params: unknown, state: AcpConnectionState): Promise<void> {
    const normalizedParams = this.readParams(params);
    const trackedSession = this.getTrackedSession(state, normalizedParams.sessionId);

    if (!trackedSession) {
      return;
    }

    state.sessions?.delete(trackedSession.sessionId);

    const cleanupFailures: SessionCleanupFailure[] = [];

    if (trackedSession.pendingPermissionRequestId !== undefined) {
      try {
        state.cancelClientRequest?.(
          trackedSession.pendingPermissionRequestId,
          CANCELLED_PERMISSION_RESULT,
        );
      } catch (error) {
        cleanupFailures.push({
          step: 'cancel_permission_request',
          reason: this.getErrorMessage(error),
        });
      }

      delete trackedSession.pendingPermissionRequestId;
      delete trackedSession.pendingPermissionToolCallId;
    }

    if (trackedSession.pendingFsRequestIds) {
      for (const requestId of trackedSession.pendingFsRequestIds) {
        try {
          state.cancelClientRequest?.(requestId, CANCELLED_FILESYSTEM_RESULT);
        } catch (error) {
          cleanupFailures.push({
            step: 'cancel_filesystem_request',
            reason: `${requestId}: ${this.getErrorMessage(error)}`,
          });
        }
      }

      delete trackedSession.pendingFsRequestIds;
    }

    await this.runCleanupStep(cleanupFailures, 'cleanup_mcp_session_tools', () =>
      this.mcpSessionService.cleanupSessionTools(trackedSession),
    );
    await this.runCleanupStep(cleanupFailures, 'cleanup_session_terminals', () =>
      this.terminalProxyService.cleanupSessionTerminals(trackedSession),
    );
    await this.runCleanupStep(cleanupFailures, 'cancel_runtime_session', () =>
      this.getAgentRuntime().cancel(trackedSession.runtimeSessionId),
    );

    if (cleanupFailures.length > 0) {
      throw new AcpJsonRpcError(-32603, 'Failed to fully cancel ACP session', {
        sessionId: trackedSession.sessionId,
        cleanupFailures,
      });
    }
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = this.moduleRef.get<IAgentRuntime>(AGENT_RUNTIME, {
        strict: false,
      });
    }

    return this.agentRuntime;
  }

  private readParams(params: unknown): AcpSessionCancelParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const sessionId = params.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return { sessionId };
  }

  private getTrackedSession(
    state: AcpConnectionState,
    sessionId: string,
  ): AcpTrackedSession | undefined {
    const trackedSession = state.sessions?.get(sessionId);

    if (!trackedSession) {
      return trackedSession;
    }

    if (state.authContext?.tenantId !== trackedSession.tenantId) {
      return undefined;
    }

    return trackedSession;
  }

  private async runCleanupStep(
    cleanupFailures: SessionCleanupFailure[],
    step: string,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      cleanupFailures.push({
        step,
        reason: this.getErrorMessage(error),
      });
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
