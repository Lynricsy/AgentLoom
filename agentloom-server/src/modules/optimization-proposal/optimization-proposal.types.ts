/**
 * 优化提案领域的取值全集与 jsonb 结构。
 *
 * 常量数组是 pgEnum 与 DTO 枚举的唯一来源；jsonb 结构由 schema `$type<>` 与服务共用。
 */

export const OPTIMIZATION_PROPOSAL_TYPES = [
  'team_budget_tokens',
  'team_budget_messages',
  'team_deadline',
  'routing_fallback_model',
] as const;
export type OptimizationProposalType =
  (typeof OPTIMIZATION_PROPOSAL_TYPES)[number];

export const OPTIMIZATION_PROPOSAL_STATUSES = [
  'proposed',
  'evaluating',
  'evaluated',
  'published',
  'rolled_back',
  'dismissed',
  'superseded',
] as const;
export type OptimizationProposalStatus =
  (typeof OPTIMIZATION_PROPOSAL_STATUSES)[number];

/** 同一 (工作流, 节点, 类型) 同时只允许一条处于这些状态的提案 */
export const OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES = [
  'proposed',
  'evaluating',
  'evaluated',
] as const satisfies readonly OptimizationProposalStatus[];

export const OPTIMIZATION_PROPOSAL_NODE_TYPES = [
  'team',
  'smart-routing',
] as const;
export type OptimizationProposalNodeType =
  (typeof OPTIMIZATION_PROPOSAL_NODE_TYPES)[number];

export const OPTIMIZATION_EVALUATION_STATUSES = [
  'running',
  'completed',
  'failed',
] as const;
export type OptimizationEvaluationStatus =
  (typeof OPTIMIZATION_EVALUATION_STATUSES)[number];

export const OPTIMIZATION_EVALUATION_RUN_STATUSES = [
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type OptimizationEvaluationRunStatus =
  (typeof OPTIMIZATION_EVALUATION_RUN_STATUSES)[number];

export const OPTIMIZATION_EVALUATION_ARMS = ['baseline', 'candidate'] as const;
export type OptimizationEvaluationArm =
  (typeof OPTIMIZATION_EVALUATION_ARMS)[number];

export const OPTIMIZATION_EVALUATION_VERDICTS = [
  'improved',
  'neutral',
  'regressed',
] as const;
export type OptimizationEvaluationVerdict =
  (typeof OPTIMIZATION_EVALUATION_VERDICTS)[number];

/** 评测失败原因（目前只有超时） */
export type OptimizationEvaluationFailureReason = 'timeout';

/** 评测启动任务数据 */
export interface OptimizationEvaluateJobData {
  tenantId: string;
  evaluationId: string;
}

export interface ProposalEvidence {
  analyzerVersion: 1;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  sampleCount: number;
  matchedCount: number;
  matchedRate: number;
  /** 匹配证据行 id（team_runs / routing_decisions），最多 10 个 */
  sampleIds: string[];
  /** 路由回退模型提案：建议模型的显示名 */
  modelName?: string;
}

export interface ProposalPublishReport {
  draftSynced: boolean;
  note: string | null;
}

export interface EvaluationCase {
  index: number;
  sourceExecutionId: string;
  inputParams: Record<string, unknown>;
}

export interface EvaluationRunTeamMetrics {
  status: string;
  failureReason: string | null;
  usedTokens: number;
  messageCount: number;
}

export interface EvaluationRunMetrics {
  passed: boolean;
  /** 执行终态；启动失败为 `launch_failed`，超时取消为 `timeout` */
  executionStatus: string;
  durationMs: number | null;
  costUsd: number | null;
  totalTokens: number | null;
  team: EvaluationRunTeamMetrics | null;
  error: string | null;
}

export interface EvaluationArmSummary {
  cases: number;
  passed: number;
  passRate: number;
  meanCostUsd: number | null;
  meanDurationMs: number | null;
  teamFailureReasons: Record<string, number>;
}

export interface EvaluationSummary {
  baseline: EvaluationArmSummary;
  candidate: EvaluationArmSummary;
  passRateDelta: number;
  costDeltaRatio: number | null;
  verdict: OptimizationEvaluationVerdict;
}
