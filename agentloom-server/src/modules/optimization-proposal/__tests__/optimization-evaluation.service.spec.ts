import { describe, expect, it, vi } from 'vitest';

import type { OptimizationEvaluationRun } from '../../../database/schema';
import type { ExecutionService } from '../../execution/execution.service';
import { OptimizationEvaluationService } from '../optimization-evaluation.service';
import type { EvaluationRunMetrics } from '../optimization-proposal.types';
import { createQueryDb } from './drizzle-chain-stub';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const EVALUATION_ID = '019577a0-0000-7000-8000-0000000000dd';
const PROPOSAL_ID = '019577a0-0000-7000-8000-0000000000a1';

function makeRun(overrides: Partial<OptimizationEvaluationRun>): OptimizationEvaluationRun {
  return {
    id: 'run-1',
    tenantId: TENANT_ID,
    evaluationId: EVALUATION_ID,
    arm: 'baseline',
    caseIndex: 0,
    executionId: 'exec-1',
    status: 'running',
    metrics: null,
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

const runningEvaluation = {
  id: EVALUATION_ID,
  proposalId: PROPOSAL_ID,
  status: 'running',
  cases: [{ index: 0, sourceExecutionId: 'src-1', inputParams: { q: 1 } }],
};

function createService(results: unknown[], runWorkflow = vi.fn()) {
  const stub = createQueryDb(results);
  const service = new OptimizationEvaluationService(stub.db, {
    runWorkflow,
    cancelExecution: vi.fn(),
  } as unknown as ExecutionService);
  return { service, stub, runWorkflow };
}

describe('OptimizationEvaluationService.settleRun', () => {
  it('团队步骤用量取 team_runs、其余步骤取 step result，合并为执行成本', async () => {
    const startedAt = new Date('2026-02-01T00:00:00Z');
    const { service, stub } = createService([
      [{ status: 'failed', startedAt, completedAt: null, failedAt: new Date(startedAt.getTime() + 4000), cancelledAt: null }],
      [{ team_runs: 1, team_cost: 0.3, team_tokens: 150, step_cost_rows: 1, step_cost: 0.05, step_token_rows: 1, step_tokens: 20 }],
      [{ status: 'failed', failureReason: 'budget_exhausted', usedInputTokens: 100, usedOutputTokens: 50, messageCount: 1 }],
      [{ id: 'run-1' }],
    ]);

    const settled = await service.settleRun(stub.db, makeRun({}));

    expect(settled).toBe(true);
    expect(stub.argsOf('update', 'set')).toEqual([
      {
        status: 'failed',
        completedAt: expect.any(Date),
        metrics: {
          passed: false,
          executionStatus: 'failed',
          durationMs: 4000,
          costUsd: expect.closeTo(0.35, 10),
          totalTokens: 170,
          team: { status: 'failed', failureReason: 'budget_exhausted', usedTokens: 150, messageCount: 1 },
          error: null,
        },
      },
    ]);
  });

  it('执行尚未终态（终态事件早于提交）时不结算，留给清扫', async () => {
    const { service, stub } = createService([[{ status: 'running' }]]);
    expect(await service.settleRun(stub.db, makeRun({}))).toBe(false);
    expect(stub.argsOf('update', 'set')).toEqual([]);
  });

  it('没有团队运行也没有成本字段时成本与 token 为 null', async () => {
    const { service, stub } = createService([
      [{ status: 'completed', startedAt: null, completedAt: new Date(), failedAt: null, cancelledAt: null }],
      [{ team_runs: 0, team_cost: null, team_tokens: null, step_cost_rows: 0, step_cost: null, step_token_rows: 0, step_tokens: null }],
      [],
      [{ id: 'run-1' }],
    ]);
    await service.settleRun(stub.db, makeRun({}));
    const [set] = stub.argsOf('update', 'set') as Array<{ status: string; metrics: EvaluationRunMetrics }>;
    expect(set.status).toBe('completed');
    expect(set.metrics).toMatchObject({ passed: true, costUsd: null, totalTokens: null, durationMs: null, team: null });
  });
});

describe('OptimizationEvaluationService.run', () => {
  it('某臂启动失败时写 launch_failed 行并继续启动其余臂；仍有 running 时不结算评测', async () => {
    const runWorkflow = vi
      .fn()
      .mockRejectedValueOnce(new Error('配额不足'))
      .mockResolvedValueOnce({ id: 'exec-candidate' });
    const { service, stub } = createService(
      [
        [{ ...runningEvaluation, baseVersionId: 'v-base', candidateVersionId: 'v-cand', startedByUserId: 'u-1', workflowDefinitionId: 'wf-1' }],
        [], // 已有 run 行
        [], // 基线 launch_failed 行
        [], // 候选 running 行
        [runningEvaluation], // tryFinalize 锁评测
        [
          makeRun({ status: 'failed', executionId: null, metrics: { passed: false } as EvaluationRunMetrics }),
          makeRun({ id: 'run-2', arm: 'candidate', executionId: 'exec-candidate' }),
        ],
      ],
      runWorkflow,
    );

    await service.run({ tenantId: TENANT_ID, evaluationId: EVALUATION_ID });

    expect(runWorkflow).toHaveBeenCalledTimes(2);
    expect(runWorkflow.mock.calls.map((call) => call[1])).toEqual([
      { inputParams: { q: 1 }, launchSource: 'evaluation', triggerType: 'system', workflowVersionId: 'v-base' },
      { inputParams: { q: 1 }, launchSource: 'evaluation', triggerType: 'system', workflowVersionId: 'v-cand' },
    ]);
    expect(stub.argsOf('insert', 'values')).toEqual([
      expect.objectContaining({
        arm: 'baseline',
        executionId: null,
        status: 'failed',
        metrics: expect.objectContaining({ executionStatus: 'launch_failed', error: '配额不足' }),
      }),
      expect.objectContaining({ arm: 'candidate', executionId: 'exec-candidate', status: 'running' }),
    ]);
    expect(stub.argsOf('update', 'set')).toEqual([]);
  });
});

describe('OptimizationEvaluationService.tryFinalize', () => {
  it('全部 run 结算后写入结论：评测 completed、提案 evaluated', async () => {
    const metrics = (passed: boolean): EvaluationRunMetrics => ({
      passed,
      executionStatus: passed ? 'completed' : 'failed',
      durationMs: 1000,
      costUsd: 0.1,
      totalTokens: 10,
      team: null,
      error: null,
    });
    const { service, stub } = createService([
      [runningEvaluation],
      [
        makeRun({ status: 'failed', metrics: metrics(false) }),
        makeRun({ id: 'run-2', arm: 'candidate', status: 'completed', metrics: metrics(true) }),
      ],
      [],
      [],
    ]);

    await service.tryFinalize(TENANT_ID, EVALUATION_ID);

    const [evaluationSet, proposalSet] = stub.argsOf('update', 'set') as Array<Record<string, any>>;
    expect(evaluationSet).toMatchObject({
      status: 'completed',
      summary: {
        verdict: 'improved',
        passRateDelta: 1,
        baseline: { passRate: 0 },
        candidate: { passRate: 1 },
      },
    });
    expect(proposalSet).toMatchObject({ status: 'evaluated', verdict: 'improved' });
  });
});
