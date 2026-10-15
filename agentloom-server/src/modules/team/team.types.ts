import type { TeamMessageKind } from '@agentloom/contracts';

/** 成员会话内工具使用的身份上下文（按成员对话解析） */
export interface TeamMemberContext {
  tenantId: string;
  teamRunId: string;
  executionId: string;
  stepId: string;
  memberId: string;
  conversationId: string;
  role: string;
  isLead: boolean;
  canMessage: string[];
  instructions: string;
  outputSchema: Record<string, unknown> | null;
}

/** lead 经 team_submit_result 提交的结果 */
export interface TeamResult {
  summary: string;
  artifact?: unknown;
  knownLimitations?: string[];
}

export interface TeamMessageRecipient {
  memberId: string;
  /** 预生成的 team_messages.id（决策记录以它为 subject）；缺省由数据库生成 */
  messageId?: string;
  decisionRecordId?: string;
  suppressed?: boolean;
}

export interface TeamSendInput {
  tenantId: string;
  teamRunId: string;
  /** null 表示系统消息 */
  senderMemberId: string | null;
  recipients: TeamMessageRecipient[];
  kind: TeamMessageKind;
  content: string;
  refs?: string[];
  replyToMessageId?: string;
}

export type TeamSendResult =
  | { ok: true; messageIds: string[] }
  | { ok: false; reason: 'budget_exhausted' | 'run_not_running' };
