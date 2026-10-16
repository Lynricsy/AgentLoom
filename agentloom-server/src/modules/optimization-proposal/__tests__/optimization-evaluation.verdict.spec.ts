import { describe, expect, it } from 'vitest';

import {
  computeEvaluationVerdict,
  summarizeEvaluationArm,
} from '../optimization-evaluation.verdict';
import type {
  EvaluationArmSummary,
  EvaluationRunMetrics,
} from '../optimization-proposal.types';

function arm(passRate: number, meanCostUsd: number | null): EvaluationArmSummary {
  return {
    cases: 4,
    passed: passRate * 4,
    passRate,
    meanCostUsd,
    meanDurationMs: null,
    teamFailureReasons: {},
  };
}

function metrics(overrides: Partial<EvaluationRunMetrics>): EvaluationRunMetrics {
  return {
    passed: true,
    executionStatus: 'completed',
    durationMs: null,
    costUsd: null,
    totalTokens: null,
    team: null,
    error: null,
    ...overrides,
  };
}

describe('computeEvaluationVerdict', () => {
  it.each([
    ['通过率上升', arm(0.5, 1), arm(0.75, 2), 'improved'],
    ['通过率下降（即使更便宜）', arm(0.75, 1), arm(0.5, 0.1), 'regressed'],
    ['持平且成本 -10%', arm(1, 1), arm(1, 0.9), 'improved'],
    ['持平且成本 +10%', arm(1, 1), arm(1, 1.1), 'regressed'],
    ['持平且成本 -2%', arm(1, 1), arm(1, 0.98), 'neutral'],
    ['持平且基线成本为 0', arm(1, 0), arm(1, 5), 'neutral'],
    ['持平且成本缺失', arm(1, null), arm(1, 0.5), 'neutral'],
  ] as const)('%s → %s', (_label, baseline, candidate, expected) => {
    expect(computeEvaluationVerdict(baseline, candidate).verdict).toBe(expected);
  });

  it('输出通过率差与成本变化比', () => {
    const summary = computeEvaluationVerdict(arm(0, 2), arm(1, 1));
    expect(summary.passRateDelta).toBe(1);
    expect(summary.costDeltaRatio).toBe(-0.5);
  });
});

describe('summarizeEvaluationArm', () => {
  it('均值只计非空值，统计团队失败原因，启动失败计为未通过', () => {
    const summary = summarizeEvaluationArm([
      metrics({ costUsd: 0.2, durationMs: 1000 }),
      metrics({
        passed: false,
        executionStatus: 'failed',
        costUsd: 0.4,
        durationMs: 3000,
        team: { status: 'failed', failureReason: 'budget_exhausted', usedTokens: 10, messageCount: 1 },
      }),
      metrics({ passed: false, executionStatus: 'launch_failed', error: 'quota' }),
    ]);
    expect(summary).toEqual({
      cases: 3,
      passed: 1,
      passRate: 1 / 3,
      meanCostUsd: expect.closeTo(0.3, 10),
      meanDurationMs: 2000,
      teamFailureReasons: { budget_exhausted: 1 },
    });
  });

  it('全部指标缺失时均值为 null', () => {
    expect(summarizeEvaluationArm([metrics({})])).toMatchObject({
      meanCostUsd: null,
      meanDurationMs: null,
    });
  });
});
