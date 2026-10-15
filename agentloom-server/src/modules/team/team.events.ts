/**
 * 团队运行时与相邻模块之间的进程内事件（EventEmitter2）。
 *
 * 模块图为 AgentExecutionModule → TeamModule → ExecutionModule。反方向的调用经事件完成，
 * 避免循环导入（server 禁止 forwardRef）：
 * - TeamModule → AgentExecutionModule：派发/取消成员对话，由 `TeamConversationBridgeListener` 处理；
 * - ExecutionModule → TeamModule：`team` 节点启动团队运行，由 `TeamRunService` 处理。
 * 发送方一律 `emitAsync` 并等待监听器完成。
 */
import type { TeamNodeConfig } from '@agentloom/contracts';

/** 派发成员对话执行（新消息已写入 agent_messages） */
export const TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT =
  'team.member-conversation.dispatch';

/** 结束成员对话并中止其执行循环 */
export const TEAM_MEMBER_CONVERSATION_CANCEL_EVENT =
  'team.member-conversation.cancel';

export interface TeamMemberConversationEvent {
  conversationId: string;
  tenantId: string;
}

/** `team` 节点请求启动团队运行；监听器异常向发送方传播（`suppressErrors: false`） */
export const TEAM_RUN_START_REQUESTED_EVENT = 'team.run.start-requested';

export interface TeamRunStartRequestedEvent {
  tenantId: string;
  executionId: string;
  stepId: string;
  nodeId: string;
  config: TeamNodeConfig;
  taskText: string;
  context: unknown;
}

export interface TeamRunStartedResult {
  teamRunId: string;
}
