import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type {
  AgentEvent,
  StopReason,
  ToolCallAgentEvent,
} from '../../agent/types/agent-event.types';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../../agent/ports/agent-runtime.port';
import {
  ContentBlockArraySchema,
  type ContentBlock,
} from '../../agent/types/content-block.types';
import { buildJsonRpcNotification, type JsonRpcId } from '../acp-jsonrpc';
import { mapAgentEventToAcpSessionUpdate } from '../acp-session-update.mapper';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpConnectionState,
  AcpPermissionOption,
  AcpPermissionOutcome,
  AcpSessionRequestPermissionParams,
  AcpSessionRequestPermissionResult,
  AcpSessionPromptParams,
  AcpSessionPromptResult,
  AcpSessionUpdate,
  AcpTrackedSession,
} from '../acp-types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ACP_PERMISSION_OPTIONS: AcpPermissionOption[] = [
  {
    optionId: 'allow-once',
    name: '允许一次',
    kind: 'allow_once',
  },
  {
    optionId: 'allow-always',
    name: '始终允许',
    kind: 'allow_always',
  },
  {
    optionId: 'reject-once',
    name: '拒绝一次',
    kind: 'reject_once',
  },
  {
    optionId: 'reject-always',
    name: '始终拒绝',
    kind: 'reject_always',
  },
];

@Injectable()
export class SessionPromptHandler {
  private agentRuntime?: IAgentRuntime;

  constructor(private readonly moduleRef: ModuleRef) {}

  async handle(
    params: unknown,
    state: AcpConnectionState,
    requestId: JsonRpcId,
  ): Promise<AcpSessionPromptResult> {
    const normalizedParams = this.readParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    if (!trackedSession) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        sessionId: normalizedParams.sessionId,
        reason: 'Session not found',
      });
    }

    if (trackedSession.activePromptRequestId !== undefined) {
      throw new AcpJsonRpcError(-32003, 'Prompt already in progress', {
        sessionId: normalizedParams.sessionId,
        activePromptRequestId: trackedSession.activePromptRequestId,
      });
    }

    trackedSession.activePromptRequestId = requestId;

    try {
      let terminalStopReason: StopReason | null = null;

      for await (const event of this.getAgentRuntime().prompt(
        trackedSession.runtimeSessionId,
        normalizedParams.content,
      )) {
        if (event.type === 'done') {
          terminalStopReason = event.stopReason;
          continue;
        }

        const update = mapAgentEventToAcpSessionUpdate(event);
        await this.emitUpdate(state, trackedSession.sessionId, update);

        if (
          event.type === 'tool_call' &&
          event.call.status === 'awaiting_permission'
        ) {
          await this.handleAwaitingPermission(state, trackedSession, event);
        }
      }

      if (terminalStopReason === null) {
        throw new AcpJsonRpcError(
          -32603,
          'Prompt finished without terminal event',
        );
      }

      return {
        stopReason: terminalStopReason,
      };
    } finally {
      delete trackedSession.activePromptRequestId;
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

  private readParams(params: unknown): AcpSessionPromptParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const sessionId = params.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const parsedContent = ContentBlockArraySchema.safeParse(params.content);
    if (!parsedContent.success) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        issues: parsedContent.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    return {
      sessionId,
      content: parsedContent.data,
    };
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

  private async handleAwaitingPermission(
    state: AcpConnectionState,
    trackedSession: AcpTrackedSession,
    event: ToolCallAgentEvent,
  ): Promise<void> {
    if (!this.getAgentRuntime().resolveToolPermission) {
      throw new AcpJsonRpcError(
        -32603,
        'Agent runtime does not support tool permission resolution',
      );
    }

    const permissionRequest = this.requestPermission(
      state,
      trackedSession,
      event,
    );
    trackedSession.pendingPermissionRequestId = permissionRequest.requestId;
    trackedSession.pendingPermissionToolCallId = event.call.id;

    try {
      const response = await permissionRequest.response;
      await this.applyPermissionOutcome(
        trackedSession,
        event.call.id,
        response.outcome,
      );
    } finally {
      delete trackedSession.pendingPermissionRequestId;
      delete trackedSession.pendingPermissionToolCallId;
    }
  }

  private requestPermission(
    state: AcpConnectionState,
    trackedSession: AcpTrackedSession,
    event: ToolCallAgentEvent,
  ): {
    requestId: JsonRpcId;
    response: Promise<AcpSessionRequestPermissionResult>;
  } {
    if (!state.requestClient) {
      throw new AcpJsonRpcError(
        -32603,
        'ACP transport does not support session/request_permission',
      );
    }

    const params: AcpSessionRequestPermissionParams = {
      sessionId: trackedSession.sessionId,
      toolCall: {
        toolCallId: event.call.id,
        title: event.call.tool,
        kind: 'tool_call',
        status: 'awaiting_permission',
        ...(event.call.permissionRequest?.description === undefined
          ? {}
          : {
              content: [
                {
                  type: 'text',
                  text: event.call.permissionRequest.description,
                } satisfies ContentBlock,
              ],
            }),
      },
      options: ACP_PERMISSION_OPTIONS,
    };

    const pendingRequest = state.requestClient<
      AcpSessionRequestPermissionParams,
      AcpSessionRequestPermissionResult
    >('session/request_permission', params);

    return {
      requestId: pendingRequest.requestId,
      response: pendingRequest.response.then((response) =>
        this.validatePermissionResponse(response),
      ),
    };
  }

  private validatePermissionResponse(
    response: unknown,
  ): AcpSessionRequestPermissionResult {
    if (!isPlainObject(response) || !isPlainObject(response.outcome)) {
      throw new AcpJsonRpcError(
        -32603,
        'Invalid permission response from ACP client',
      );
    }

    const outcome = response.outcome;
    if (outcome.outcome === 'cancelled') {
      return {
        outcome: {
          outcome: 'cancelled',
        },
      };
    }

    if (
      outcome.outcome === 'selected' &&
      typeof outcome.optionId === 'string' &&
      outcome.optionId.length > 0
    ) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: outcome.optionId,
        },
      };
    }

    throw new AcpJsonRpcError(
      -32603,
      'Invalid permission response from ACP client',
    );
  }

  private async applyPermissionOutcome(
    trackedSession: AcpTrackedSession,
    toolCallId: string,
    outcome: AcpPermissionOutcome,
  ): Promise<void> {
    if (outcome.outcome === 'cancelled') {
      await this.getAgentRuntime().cancel(trackedSession.runtimeSessionId);
      return;
    }

    const action = this.mapPermissionOptionToAction(outcome.optionId);
    await this.getAgentRuntime().resolveToolPermission?.(
      trackedSession.runtimeSessionId,
      toolCallId,
      action,
    );
  }

  private mapPermissionOptionToAction(optionId: string): 'approve' | 'deny' {
    switch (optionId) {
      case 'allow-once':
      case 'allow-always':
        return 'approve';
      case 'reject-once':
      case 'reject-always':
        return 'deny';
      default:
        throw new AcpJsonRpcError(-32603, 'Unsupported permission option');
    }
  }

  private async emitUpdate(
    state: AcpConnectionState,
    sessionId: string,
    update: AcpSessionUpdate,
  ): Promise<void> {
    if (!state.emitNotification) {
      return;
    }

    await state.emitNotification(
      buildJsonRpcNotification('session/update', {
        sessionId,
        update,
      }),
    );
  }
}
