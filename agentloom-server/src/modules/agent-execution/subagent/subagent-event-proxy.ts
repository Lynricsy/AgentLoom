import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { SubAgentEventEnvelope } from './subagent-execution.types';

/** 子代理事件代理 — 将子代理事件路由到父对话的 Socket.IO room */
export interface SubAgentEventProxy {
  emitEvent(event: AgentEvent): void;
}

export interface CreateSubAgentEventProxyParams {
  conversationId: string;
  tenantId: string;
  envelope: SubAgentEventEnvelope;
  eventBridge: {
    emitSubAgentConversationEvent: (
      conversationId: string,
      tenantId: string,
      event: AgentEvent,
      envelope: SubAgentEventEnvelope,
    ) => void;
  };
}

export function createSubAgentEventProxy(
  params: CreateSubAgentEventProxyParams,
): SubAgentEventProxy {
  return {
    emitEvent(event: AgentEvent) {
      params.eventBridge.emitSubAgentConversationEvent(
        params.conversationId,
        params.tenantId,
        event,
        params.envelope,
      );
    },
  };
}
