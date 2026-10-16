import { OPTIMIZATION_COST_IMPROVEMENT_MIN } from './optimization-proposal.constants';
import type {
  EvaluationArmSummary,
  EvaluationRunMetrics,
  EvaluationSummary,
  OptimizationEvaluationVerdict,
} from './optimization-proposal.types';

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0
    ? null
    : present.reduce((sum, value) => sum + value, 0) / present.length;
}

/** 按臂汇总评测结果；启动失败与超时取消的 run 计为未通过 */
export function summarizeEvaluationArm(
  metrics: EvaluationRunMetrics[],
): EvaluationArmSummary {
  const passed = metrics.filter((item) => item.passed).length;
  const teamFailureReasons: Record<string, number> = {};
  for (const item of metrics) {
    const reason = item.team?.failureReason;
    if (reason) {
      teamFailureReasons[reason] = (teamFailureReasons[reason] ?? 0) + 1;
    }
  }
  return {
    cases: metrics.length,
    passed,
    passRate: metrics.length === 0 ? 0 : passed / metrics.length,
    meanCostUsd: mean(metrics.map((item) => item.costUsd)),
    meanDurationMs: mean(metrics.map((item) => item.durationMs)),
    teamFailureReasons,
  };
}

/**
 * 结论：通过率优先；通过率持平时平均成本变化达到 ±5% 才判优/劣，否则无差异。
 * 基线平均成本为 0 或缺失时无法计算成本比，只按通过率判定。
 */
export function computeEvaluationVerdict(
  baseline: EvaluationArmSummary,
  candidate: EvaluationArmSummary,
): EvaluationSummary {
  const passRateDelta = candidate.passRate - baseline.passRate;
  const costDeltaRatio =
    baseline.meanCostUsd !== null &&
    baseline.meanCostUsd > 0 &&
    candidate.meanCostUsd !== null
      ? (candidate.meanCostUsd - baseline.meanCostUsd) / baseline.meanCostUsd
      : null;

  let verdict: OptimizationEvaluationVerdict = 'neutral';
  if (passRateDelta > 0) {
    verdict = 'improved';
  } else if (passRateDelta < 0) {
    verdict = 'regressed';
  } else if (costDeltaRatio !== null) {
    if (costDeltaRatio <= -OPTIMIZATION_COST_IMPROVEMENT_MIN) {
      verdict = 'improved';
    } else if (costDeltaRatio >= OPTIMIZATION_COST_IMPROVEMENT_MIN) {
      verdict = 'regressed';
    }
  }

  return { baseline, candidate, passRateDelta, costDeltaRatio, verdict };
}
