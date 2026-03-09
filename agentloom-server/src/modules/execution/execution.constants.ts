export const EXECUTION_QUEUE = 'workflow-execution';
export const AGENT_TASK_QUEUE = 'agent-task';

/**
 * AgentTaskWorker 消费的任务数据结构。
 */
export interface AgentTaskJobData {
  executionId: string;
  stepId: string;
  tenantId: string;
  /** 干预恢复时传入已有会话 ID */
  resumeSessionId?: string;
  /** 干预恢复时传入用户反馈内容 */
  feedbackContent?: string;
}

/** 触发 waiting_intervention 的 stopReason 集合 */
export const INTERVENTION_STOP_REASONS = new Set(['tool_use']);
