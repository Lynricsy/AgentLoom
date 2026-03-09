export const EXECUTION_QUEUE = 'workflow-execution';
export const AGENT_TASK_QUEUE = 'agent-task';

export type InterventionAction = 'approve' | 'modify' | 'reject';

export interface InterventionResolution {
  action: InterventionAction;
  feedback?: string;
  modifiedContent?: string;
}

/**
 * AgentTaskWorker 消费的任务数据结构。
 */
export interface AgentTaskJobData {
  executionId: string;
  stepId: string;
  tenantId: string;
  input?: Record<string, unknown>;
  nodeData?: Record<string, unknown>;
  workflowContext?: Record<string, unknown>;
  /** 干预恢复时传入已有会话 ID */
  resumeSessionId?: string;
  intervention?: InterventionResolution;
  /** 标记该 agent 任务应使用沙箱适配器 */
  hasSandbox?: boolean;
}
