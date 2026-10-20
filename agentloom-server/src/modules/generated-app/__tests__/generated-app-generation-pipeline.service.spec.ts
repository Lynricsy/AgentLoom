import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { hasActiveTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppGateResult,
  GeneratedAppGenerationRun,
} from '../../../database/schema';
import { GeneratedAppGenerationRunInProgressException } from '../generated-app.exceptions';
import type { GeneratedAppGenerationJobData } from '../generated-app-generation.constants';
import { GeneratedAppGenerationPipelineService } from '../generated-app-generation-pipeline.service';
import type { GeneratedAppGenerationRepairService } from '../generated-app-generation-repair.service';
import type { GeneratedAppRepository } from '../generated-app.repository';
import type { GeneratedAppGate3WorkspaceRunner } from '../generated-app.gate3-workspace';
import type { GeneratedAppGate4IntegrationRunner } from '../generated-app.gate4-integration';
import type { GeneratedAppGate6IndependentVerifierRunner } from '../generated-app.gate6-independent-verifier';
import type { GeneratedAppGate7PublishCandidateRunner } from '../generated-app.gate7-publish-candidate';
import type {
  GeneratedAppAgentWrapperBuilder,
  GeneratedAppGate0Evaluator,
  GeneratedAppGate5Runner,
} from '../generated-app.v2-tokens';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
} from '../types/generation-v2.ports';
import {
  APP_ID,
  GENERATION_RUN_ID,
  TENANT_ID,
  USER_ID,
  createAppSpecV2Fixture,
  createGeneratedAppGenerationRun,
  createGeneratedApp,
  createResolvedBindingFixture,
} from './generated-app-test-support';

type Run = GeneratedAppGenerationRun;

const ACTIVE = ['queued', 'running'];

/** 内存版运行表：update 的条件与流水线 where 子句一致（认领只认 queued、终态保护只认活动运行） */
function createRunStore(initial: Run | null) {
  const runs: Run[] = initial ? [initial] : [];
  const applyUpdate = (payload: Partial<Run>): Run[] => {
    const run = runs[0];
    if (!run) return [];
    if (payload.status === 'running' && run.status !== 'queued') return [];
    if (
      payload.status === 'failed' &&
      payload.summary?.startsWith('生成运行异常中止') &&
      !ACTIVE.includes(run.status)
    ) {
      return [];
    }
    Object.assign(run, payload);
    return [{ ...run }];
  };
  const db = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            runs
              .filter((run) => ACTIVE.includes(run.status))
              .slice(0, 1)
              .map((run) => ({ id: run.id })),
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (values: Partial<Run>) => ({
        returning: async () => {
          const run = createGeneratedAppGenerationRun({
            ...values,
            id: GENERATION_RUN_ID,
          } as Partial<Run>);
          runs.push(run);
          return [run];
        },
      }),
    })),
    update: vi.fn(() => {
      let payload: Partial<Run> = {};
      const chain = {
        set: (next: Partial<Run>) => {
          payload = next;
          return chain;
        },
        where: () => chain,
        returning: async () => applyUpdate(payload),
        then: (resolve: (value: unknown) => void) => {
          applyUpdate(payload);
          resolve(undefined);
        },
      };
      return chain;
    }),
    transaction: <T>(operation: (tx: unknown) => Promise<T>) => operation(db),
  };
  return { runs, db };
}

function passed<T>(summary: string, plan: T): GeneratedAppGateEvaluationV2<T> {
  return {
    status: 'passed',
    summary,
    evidence: [],
    failure: null,
    repairInstructions: null,
    plan,
  };
}

function setup(options: { run?: Run | null } = {}) {
  const store = createRunStore(
    options.run === undefined
      ? createGeneratedAppGenerationRun({
          status: 'queued',
          maxRuntimeSeconds: 1800,
        })
      : options.run,
  );
  const app: GeneratedApp = createGeneratedApp();
  const recorded: Array<{
    gateId: string;
    status: string;
    plan: unknown;
    inTx: boolean;
  }> = [];
  const executedGates: GeneratedAppGateResult[] = [];

  const repository = {
    get tenantDb() {
      return store.db;
    },
    findGeneratedAppRecord: vi.fn(async () => app),
    resolveNextGenerationRunNumber: vi.fn(async () => 2),
    toGenerationRunResponseDto: vi.fn((run: Run) => ({
      ...run,
      appId: run.generatedAppId,
    })),
    buildRunnerGateResults: vi.fn(
      (_app: unknown, results: GeneratedAppGateResult[]) => results,
    ),
    createGateRunAndUpdateApp: vi.fn(
      async (
        _tenantId: string,
        _userId: string,
        _app: unknown,
        parsed: {
          gateId: string;
          status: string;
          summary: string;
          evidence: [];
        },
        opts: {
          generationPlan?: unknown;
          buildGateResults: (
            result: GeneratedAppGateResult,
            now: string,
          ) => unknown;
        },
      ) => {
        const gateResult = {
          gateId: parsed.gateId,
          order: Number(parsed.gateId.slice(5)),
          name: parsed.gateId,
          blocking: true,
          status: parsed.status,
          summary: parsed.summary,
          evidence: parsed.evidence,
          updatedAt: new Date().toISOString(),
        } as GeneratedAppGateResult;
        opts.buildGateResults(gateResult, gateResult.updatedAt);
        executedGates.push(gateResult);
        recorded.push({
          gateId: parsed.gateId,
          status: parsed.status,
          plan: structuredClone(opts.generationPlan),
          inTx: hasActiveTenantTransaction(),
        });
        return { gateRun: { id: `run-${parsed.gateId}`, ...parsed }, app };
      },
    ),
  };
  const repairService = {
    recordAutomaticRepairAttemptForFailedRun: vi.fn().mockResolvedValue(null),
  };
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const appSpec = createAppSpecV2Fixture();
  const calledInTx: Record<string, boolean> = {};
  const track =
    <T>(gateId: string, value: T) =>
    async (ctx?: GeneratedAppGateContextV2) => {
      calledInTx[gateId] = hasActiveTenantTransaction();
      void ctx;
      return value;
    };
  const gate0: GeneratedAppGate0Evaluator = {
    evaluate: vi.fn(async () => {
      calledInTx['gate-0'] = hasActiveTenantTransaction();
      return {
        evaluation: {
          status: 'passed' as const,
          summary: 'Gate 0 通过',
          evidence: [],
          failure: null,
          repairInstructions: null,
        },
        appSpec,
        resolvedBinding: createResolvedBindingFixture(appSpec),
        generated: true,
      };
    }),
  };
  const gate3 = {
    run: vi.fn(
      track(
        'gate-3',
        passed('g3', {
          executionLevel: 'real',
          workspace: null,
          contractCases: [],
        }),
      ),
    ),
  };
  const gate4 = {
    run: vi.fn(
      track('gate-4', passed('g4', { executionLevel: 'real', checks: [] })),
    ),
  };
  const gate5 = {
    getExecutionLevel: () => 'real' as const,
    run: vi.fn(
      track(
        'gate-5',
        passed('g5', {
          planVersion: 2,
          executionLevel: 'real',
          scenarioIds: [],
          viewports: [],
          artifactPrefix: 'p',
          jobId: 'j',
          result: null,
        }),
      ),
    ),
  };
  const gate6 = {
    run: vi.fn(
      track(
        'gate-6',
        passed('g6', {
          executionLevel: 'real',
          verifiedRequirementIds: [],
          verifiedArtifactKeys: [],
          findings: [],
        }),
      ),
    ),
  };
  const gate7 = {
    run: vi.fn(
      track('gate-7', passed('g7', { executionLevel: 'real', manifest: {} })),
    ),
  };
  const wrapperBuilder = { buildAgentWrapperWorkflowGraph: vi.fn() };

  const pipeline = new GeneratedAppGenerationPipelineService(
    store.db as unknown as DrizzleDB,
    repository as unknown as GeneratedAppRepository,
    repairService as unknown as GeneratedAppGenerationRepairService,
    queue as unknown as Queue<GeneratedAppGenerationJobData>,
    gate0,
    wrapperBuilder as unknown as GeneratedAppAgentWrapperBuilder,
    gate3 as unknown as GeneratedAppGate3WorkspaceRunner,
    gate4 as unknown as GeneratedAppGate4IntegrationRunner,
    gate5 as unknown as GeneratedAppGate5Runner,
    gate6 as unknown as GeneratedAppGate6IndependentVerifierRunner,
    gate7 as unknown as GeneratedAppGate7PublishCandidateRunner,
  );
  const job: GeneratedAppGenerationJobData = {
    tenantId: TENANT_ID,
    userId: USER_ID,
    appId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    regenerateAppSpec: false,
  };
  return {
    pipeline,
    store,
    recorded,
    repairService,
    queue,
    gate0,
    gate3,
    gate4,
    gate5,
    gate6,
    gate7,
    calledInTx,
    job,
  };
}

describe('GeneratedAppGenerationPipelineService.enqueueRun', () => {
  it('写入 queued 运行，事务提交后以 runId 为 jobId 入队；retry 触发重新生成 AppSpec', async () => {
    const { pipeline, queue, store } = setup({ run: null });

    const run = await pipeline.enqueueRun(TENANT_ID, USER_ID, APP_ID, {
      triggerSource: 'retry',
      maxRepairAttempts: 0,
      maxRuntimeSeconds: 900,
    });

    expect(run).toMatchObject({
      id: GENERATION_RUN_ID,
      status: 'queued',
      runNumber: 2,
    });
    expect(
      store.db.execute.mock.calls.some(([query]) =>
        JSON.stringify(query).includes('FOR UPDATE'),
      ),
    ).toBe(true);
    expect(queue.add).toHaveBeenCalledWith(
      'run-generated-app-generation',
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        regenerateAppSpec: true,
      },
      { jobId: GENERATION_RUN_ID },
    );
  });

  it('已有 queued/running 运行时 409，不写运行也不入队', async () => {
    const { pipeline, queue, store } = setup({
      run: createGeneratedAppGenerationRun({ status: 'running' }),
    });

    await expect(
      pipeline.enqueueRun(TENANT_ID, USER_ID, APP_ID, {}),
    ).rejects.toBeInstanceOf(GeneratedAppGenerationRunInProgressException);
    expect(store.db.insert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('入队失败时把运行改为失败，避免后续 start 永远 409', async () => {
    const { pipeline, queue, store } = setup({ run: null });
    queue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      pipeline.enqueueRun(TENANT_ID, USER_ID, APP_ID, {}),
    ).rejects.toThrow('redis down');
    expect(store.runs[0]).toMatchObject({
      status: 'failed',
      failureReason: '生成运行入队失败，未执行任何 Gate。',
    });
  });
});

describe('GeneratedAppGenerationPipelineService.executeRun', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Gate 0–7 依次执行并各自落库，计划逐 Gate 累积，运行 passed', async () => {
    const { pipeline, job, recorded, store } = setup();

    await pipeline.executeRun(job);

    expect(recorded.map((item) => `${item.gateId}:${item.status}`)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((order) => `gate-${order}:passed`),
    );
    expect(recorded.every((item) => item.inTx)).toBe(true);
    expect(recorded[0].plan).toBeNull();
    expect(Object.keys(recorded[7].plan as object)).toEqual(
      expect.arrayContaining([
        'coverage',
        'staticContracts',
        'buildUnitPlan',
        'integrationPlan',
        'browserAcceptancePlan',
        'independentVerificationPlan',
        'publishCandidatePlan',
      ]),
    );
    expect(store.runs[0]).toMatchObject({
      status: 'passed',
      failureReason: null,
    });
  });

  it('模型调用（Gate 0）与等待浏览器（Gate 5）时不持有事务，Gate 4/7 的读写在事务内', async () => {
    const { pipeline, job, calledInTx } = setup();

    await pipeline.executeRun(job);

    expect(calledInTx).toMatchObject({
      'gate-0': false,
      'gate-3': false,
      'gate-4': true,
      'gate-5': false,
      'gate-6': false,
      'gate-7': true,
    });
  });

  it('Gate 0 失败时只记 gate-0，后续 Gate 不执行，运行失败并记录修复工单', async () => {
    const { pipeline, job, gate0, gate3, recorded, store, repairService } =
      setup();
    vi.mocked(gate0.evaluate).mockResolvedValueOnce({
      evaluation: {
        status: 'failed',
        summary: 'Gate 0 失败',
        evidence: [],
        failure: {
          code: 'app-spec-binding-candidates-empty',
          message: '租户没有已发布的工作流或 Agent',
        },
        repairInstructions: '先发布一个工作流',
      },
      appSpec: null,
      resolvedBinding: null,
      generated: false,
    });

    await pipeline.executeRun(job);

    expect(recorded.map((item) => item.gateId)).toEqual(['gate-0']);
    expect(gate3.run).not.toHaveBeenCalled();
    expect(store.runs[0]).toMatchObject({
      status: 'failed',
      failureReason: '租户没有已发布的工作流或 Agent',
    });
    expect(
      repairService.recordAutomaticRepairAttemptForFailedRun,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        gateRuns: [expect.objectContaining({ gateId: 'gate-0' })],
      }),
    );
  });

  it('Gate 5 失败时停在 gate-5，运行 failureReason 为 Gate 5 失败原因', async () => {
    const { pipeline, job, gate5, gate6, recorded, store } = setup();
    gate5.run.mockResolvedValueOnce({
      status: 'failed',
      summary: 'runner 不在线',
      evidence: [],
      failure: {
        code: 'gate-5-browser-runner-unavailable',
        message: '没有在线的 browser-runner',
      },
      repairInstructions: '启动 generated-app-browser-runner',
      plan: null,
    });

    await pipeline.executeRun(job);

    expect(recorded.at(-1)).toMatchObject({
      gateId: 'gate-5',
      status: 'failed',
    });
    expect(gate6.run).not.toHaveBeenCalled();
    expect(store.runs[0].failureReason).toBe('没有在线的 browser-runner');
  });

  it('运行不是 queued（重复投递）时直接跳过', async () => {
    const { pipeline, job, gate0, store } = setup({
      run: createGeneratedAppGenerationRun({ status: 'passed' }),
    });

    await pipeline.executeRun(job);

    expect(gate0.evaluate).not.toHaveBeenCalled();
    expect(store.runs[0].status).toBe('passed');
  });

  it('Gate runner 抛错时终态保护把运行标记为失败', async () => {
    const { pipeline, job, gate4, store } = setup();
    gate4.run.mockRejectedValueOnce(new Error('db connection reset'));

    await expect(pipeline.executeRun(job)).rejects.toThrow(
      'db connection reset',
    );
    expect(store.runs[0]).toMatchObject({ status: 'failed' });
    expect(store.runs[0].failureReason).toContain('抛出异常');
  });

  it('超过 maxRuntimeSeconds：取消信号传给正在执行的 Gate，之后的 Gate 不再执行', async () => {
    vi.useFakeTimers();
    const { pipeline, job, gate3, gate4, store } = setup({
      run: createGeneratedAppGenerationRun({
        status: 'queued',
        maxRuntimeSeconds: 5,
      }),
    });
    let observedSignal: AbortSignal | undefined;
    gate3.run.mockImplementationOnce((ctx?: GeneratedAppGateContextV2) => {
      const { promise, resolve } =
        Promise.withResolvers<GeneratedAppGateEvaluationV2<unknown>>();
      observedSignal = ctx?.signal;
      ctx?.signal.addEventListener('abort', () =>
        resolve(
          passed('g3', {
            executionLevel: 'real',
            workspace: null,
            contractCases: [],
          }),
        ),
      );
      return promise as never;
    });

    const running = pipeline.executeRun(job);
    await vi.advanceTimersByTimeAsync(5_000);
    await running;

    expect(observedSignal?.aborted).toBe(true);
    expect(gate4.run).not.toHaveBeenCalled();
    expect(store.runs[0]).toMatchObject({ status: 'failed' });
    expect(store.runs[0].failureReason).toContain('maxRuntimeSeconds=5');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
