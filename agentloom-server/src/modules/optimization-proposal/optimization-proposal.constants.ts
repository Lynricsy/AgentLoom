/** 优化提案队列：周期分析、评测启动、评测清扫共用 */
export const OPTIMIZATION_QUEUE = 'optimization-proposal';

/** 每周全租户分析（UTC 周一 02:00） */
export const OPTIMIZATION_ANALYZE_JOB_NAME = 'optimization-analyze';
export const OPTIMIZATION_ANALYZE_SCHEDULER_ID = 'optimization-analyze-weekly';
export const OPTIMIZATION_ANALYZE_CRON = '0 2 * * 1';

/** 评测启动任务；jobId 见 buildOptimizationEvaluateJobId */
export const OPTIMIZATION_EVALUATE_JOB_NAME = 'optimization-evaluate';

/** 评测清扫：超时取消 + 执行终态事件丢失时的补偿结算 */
export const OPTIMIZATION_SWEEP_JOB_NAME = 'optimization-sweep';
export const OPTIMIZATION_SWEEP_SCHEDULER_ID = 'optimization-sweep';
export const OPTIMIZATION_SWEEP_INTERVAL_MS = 60_000;

export const OPTIMIZATION_QUEUE_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
} as const;

/** 证据窗口 */
export const OPTIMIZATION_EVIDENCE_WINDOW_DAYS = 28;
/** 团队分析器的最小运行样本数 */
export const OPTIMIZATION_TEAM_MIN_RUNS = 3;
/** 团队运行中目标失败原因占比达到该值才生成提案 */
export const OPTIMIZATION_TEAM_FAILURE_RATE_MIN = 0.5;
/** 预算提案的放大系数 */
export const OPTIMIZATION_BUDGET_GROWTH_FACTOR = 1.5;
/** 路由分析器的最小决策样本数 */
export const OPTIMIZATION_ROUTING_MIN_DECISIONS = 10;
/** 路由回退率达到该值才生成提案 */
export const OPTIMIZATION_ROUTING_FALLBACK_RATE_MIN = 0.2;

/** 评测默认/最大回放用例数 */
export const OPTIMIZATION_EVAL_DEFAULT_CASES = 3;
export const OPTIMIZATION_EVAL_MAX_CASES = 10;
/** 评测超时下限；实际超时取它与 2 × 候选版本团队节点最大截止时间的较大者 */
export const OPTIMIZATION_EVAL_MIN_TIMEOUT_MS = 30 * 60_000;
/** 通过率持平时，平均成本至少变化该比例才判定优于/劣于基线 */
export const OPTIMIZATION_COST_IMPROVEMENT_MIN = 0.05;

export const OPTIMIZATION_ANALYZER_VERSION = 1;

export function buildOptimizationEvaluateJobId(evaluationId: string): string {
  return `optimization-evaluate-${evaluationId}`;
}
