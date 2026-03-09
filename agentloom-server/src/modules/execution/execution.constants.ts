export const EXECUTION_QUEUE = 'workflow-execution';
export const AGENT_TASK_QUEUE = 'agent-task';

/**
 * AgentTaskWorker 消费的任务数据结构。
 */
export interface AgentTaskJobData {
  executionId: string;
  stepId: string;
  tenantId: string;
}
