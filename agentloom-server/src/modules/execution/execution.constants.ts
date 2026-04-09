import type {
  RoutingDecisionResult,
  RoutingStrategy,
} from '../smart-routing/dto/routing-context.dto';

export const EXECUTION_QUEUE = 'workflow-execution';
export const AGENT_TASK_QUEUE = 'agent-task';

export const EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 1,
} as const;

export const AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
} as const;

export const MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS = 120;
export const RECOVERABLE_RUNTIME_FAILURE_REQUEUE_DELAY_MS = 30_000;
export const INTERVENTION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const SYSTEM_TIMEOUT_INTERVENTION_USER_ID = 'system_timeout';
export const MAX_ESCALATION_ATTEMPTS = 3;

export type InterventionAction = 'approve' | 'modify' | 'reject';

export interface InterventionResolution {
  action: InterventionAction;
  feedback?: string;
  modifiedContent?: unknown;
  requestedAt?: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
  timeout?: boolean;
  nodeName?: string;
}

export type ToolPermissionAction = 'approve' | 'deny';

export interface ToolPermissionResolution {
  toolCallId: string;
  action: ToolPermissionAction;
}

export interface SmartRoutingRuntimeContext {
  routingStepId: string;
  routingNodeId: string;
  strategy: RoutingStrategy | string;
  candidateModelIds: string[];
  currentModelIndex: number;
  selectedModelId: string;
  evaluatedModels?: RoutingDecisionResult['evaluatedModels'];
  routerType?: string;
  routingDecisionId?: string;
  queryText?: string;
  taskCategory?: string;
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
  smartRouting?: SmartRoutingRuntimeContext;
  workflowContext?: Record<string, unknown>;
  /** 干预恢复时传入已有会话 ID */
  resumeSessionId?: string;
  intervention?: InterventionResolution;
  /** 工具权限审批恢复 */
  toolPermission?: ToolPermissionResolution;
  /** 标记该 agent 任务应使用沙箱适配器 */
  hasSandbox?: boolean;
  /** 升级超时已触发的次数（防止循环） */
  escalationCount?: number;
}
