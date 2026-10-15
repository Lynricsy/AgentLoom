/**
 * 对话执行对外发布的进程内领域事件（EventEmitter2）。
 * 只在事务提交后发出，订阅方（如团队运行时）据此更新自身状态。
 */
import type { AgentUsage, StopReason } from '../agent/types/agent-event.types';

/** 一轮对话的 assistant 消息已落库 */
export const AGENT_CONVERSATION_TURN_PERSISTED_EVENT =
  'agent-conversation.turn-persisted';

export interface ConversationTurnPersistedEvent {
  conversationId: string;
  tenantId: string;
  /** 本轮写入的 assistant 消息；取消轮次没有 assistant 消息时为 null */
  assistantMessageId: string | null;
  /** 本轮处理的 pending 用户消息 id */
  processedMessageIds: string[];
  usage?: AgentUsage;
  /** 按模型配置定价换算的成本（USD）；未定价或无用量时为 null */
  costUsd: number | null;
  stopReason: StopReason;
}

/** 对话执行循环结束（空闲、失败或取消） */
export const AGENT_CONVERSATION_LOOP_ENDED_EVENT =
  'agent-conversation.loop-ended';

export interface ConversationLoopEndedEvent {
  conversationId: string;
  tenantId: string;
  status: 'idle' | 'failed' | 'cancelled';
  errorMessage?: string;
}
