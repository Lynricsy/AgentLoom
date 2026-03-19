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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CANCELLED_PERMISSION_RESULT: AcpSessionRequestPermissionResult = {
  outcome: {
    outcome: 'cancelled',
  },
};

@Injectable()
export class SessionCancelHandler {
  private agentRuntime?: IAgentRuntime;

  constructor(private readonly moduleRef: ModuleRef) {}

  async handle(params: unknown, state: AcpConnectionState): Promise<void> {
    const normalizedParams = this.readParams(params);
    const trackedSession = this.getTrackedSession(state, normalizedParams.sessionId);

    if (!trackedSession) {
      return;
    }

    if (trackedSession.pendingPermissionRequestId !== undefined) {
      state.cancelClientRequest?.(
        trackedSession.pendingPermissionRequestId,
        CANCELLED_PERMISSION_RESULT,
      );
      delete trackedSession.pendingPermissionRequestId;
      delete trackedSession.pendingPermissionToolCallId;
    }

    await this.getAgentRuntime().cancel(trackedSession.runtimeSessionId);
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
}
