// 生成运行（ADR-0007 §5）：请求内只写 queued 运行并入队；worker 里按 Gate 0–7 顺序执行，
// 每个 Gate 的读写各自一个短租户事务，模型调用与等待 Gate 5 时不持有事务；
// maxRuntimeSeconds 在 job 内计时，超时后中止等待并把运行标记为失败。

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { GeneratedAppGateResult } from '../../database/schema';
import type {
  GeneratedAppGenerationRunResponseDto,
  GeneratedAppGateRunResponseDto,
  StartGeneratedAppGenerationRunDtoType,
} from './dto';
import { StartGeneratedAppGenerationRunSchema } from './dto';
import {
  GeneratedAppGenerationRunInProgressException,
  GeneratedAppGenerationRunNotFoundException,
} from './generated-app.exceptions';
import {
  GENERATED_APP_GENERATION_JOB_NAME,
  GENERATED_APP_GENERATION_QUEUE,
  type GeneratedAppGenerationJobData,
} from './generated-app-generation.constants';
import { GeneratedAppGenerationRepairService } from './generated-app-generation-repair.service';
import { GeneratedAppRepository } from './generated-app.repository';
import { evaluateGate1GenerationPlan } from './generated-app.gate1-generation-plan';
import { evaluateGate2StaticContracts } from './generated-app.gate2-static-contracts';
import { GeneratedAppGate3WorkspaceRunner } from './generated-app.gate3-workspace';
import { GeneratedAppGate4IntegrationRunner } from './generated-app.gate4-integration';
import { GeneratedAppGate6IndependentVerifierRunner } from './generated-app.gate6-independent-verifier';
import { GeneratedAppGate7PublishCandidateRunner } from './generated-app.gate7-publish-candidate';
import {
  computeAppSpecSha256,
  toPinnedBinding,
} from './generated-app.gate-v2.util';
import {
  GENERATED_APP_AGENT_WRAPPER_BUILDER,
  GENERATED_APP_GATE0_EVALUATOR,
  GENERATED_APP_GATE5_RUNNER,
  type GeneratedAppAgentWrapperBuilder,
  type GeneratedAppGate0Evaluator,
  type GeneratedAppGate5Runner,
} from './generated-app.v2-tokens';
import { runGenerationToTerminal } from './generated-app-generation-terminal.util';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
} from './types/generation-v2.ports';
import type { GeneratedAppGenerationPlanV2 } from './types/generation-plan-v2.types';

type GateId = `gate-${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;

const ACTIVE_RUN_STATUSES = ['queued', 'running'] as const;

/** generationPlan 中由各 Gate 写入的键 */
const GATE_PLAN_KEYS = {
  'gate-2': 'staticContracts',
  'gate-3': 'buildUnitPlan',
  'gate-4': 'integrationPlan',
  'gate-5': 'browserAcceptancePlan',
  'gate-6': 'independentVerificationPlan',
  'gate-7': 'publishCandidatePlan',
} as const satisfies Partial<
  Record<GateId, keyof GeneratedAppGenerationPlanV2>
>;

export class GeneratedAppGenerationRunTimeoutError extends Error {
  constructor(maxRuntimeSeconds: number) {
    super(`生成运行超过 maxRuntimeSeconds=${maxRuntimeSeconds}`);
  }
}

@Injectable()
export class GeneratedAppGenerationPipelineService {
  private readonly logger = new Logger(
    GeneratedAppGenerationPipelineService.name,
  );

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly repository: GeneratedAppRepository,
    private readonly repairService: GeneratedAppGenerationRepairService,
    @InjectQueue(GENERATED_APP_GENERATION_QUEUE)
    private readonly queue: Queue<GeneratedAppGenerationJobData>,
    @Inject(GENERATED_APP_GATE0_EVALUATOR)
    private readonly gate0: GeneratedAppGate0Evaluator,
    @Inject(GENERATED_APP_AGENT_WRAPPER_BUILDER)
    private readonly wrapperBuilder: GeneratedAppAgentWrapperBuilder,
    private readonly gate3: GeneratedAppGate3WorkspaceRunner,
    private readonly gate4: GeneratedAppGate4IntegrationRunner,
    @Inject(GENERATED_APP_GATE5_RUNNER)
    private readonly gate5: GeneratedAppGate5Runner,
    private readonly gate6: GeneratedAppGate6IndependentVerifierRunner,
    private readonly gate7: GeneratedAppGate7PublishCandidateRunner,
  ) {}

  /**
   * 在调用方的租户事务内写入 queued 运行；提交后才入队，避免 worker 先于事务提交读不到运行。
   * 锁住应用行再查活动运行，并发 start 只有一个能成功，另一个得到 409。
   */
  async enqueueRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    const parsed = StartGeneratedAppGenerationRunSchema.parse(dto);
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      await tx.execute(
        sql`SELECT id FROM generated_apps WHERE id = ${appId} AND tenant_id = ${tenantId} FOR UPDATE`,
      );
      await this.repository.findGeneratedAppRecord(tenantId, appId);
      const [active] = await tx
        .select({ id: schema.generatedAppGenerationRuns.id })
        .from(schema.generatedAppGenerationRuns)
        .where(
          and(
            eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
            eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
            inArray(schema.generatedAppGenerationRuns.status, [
              ...ACTIVE_RUN_STATUSES,
            ]),
          ),
        )
        .limit(1);
      if (active) {
        throw new GeneratedAppGenerationRunInProgressException(
          appId,
          active.id,
        );
      }

      const runNumber = await this.repository.resolveNextGenerationRunNumber(
        tenantId,
        appId,
      );
      const [run] = await tx
        .insert(schema.generatedAppGenerationRuns)
        .values({
          tenantId,
          generatedAppId: appId,
          runNumber,
          status: 'queued',
          triggerSource: parsed.triggerSource,
          maxRepairAttempts: parsed.maxRepairAttempts,
          maxRuntimeSeconds: parsed.maxRuntimeSeconds,
          summary: '生成运行已排队，等待 worker 执行 Gate 0–7。',
          failureReason: null,
          startedAt: new Date(),
          completedAt: null,
          createdBy: userId,
        })
        .returning();

      const jobData: GeneratedAppGenerationJobData = {
        tenantId,
        userId,
        appId,
        generationRunId: run.id,
        regenerateAppSpec:
          parsed.regenerateAppSpec === true || parsed.triggerSource === 'retry',
      };
      const enqueue = async () => {
        try {
          await this.queue.add(GENERATED_APP_GENERATION_JOB_NAME, jobData, {
            jobId: run.id,
          });
        } catch (error) {
          // 入队失败时运行不能停在 queued，否则该应用后续 start 一直 409
          this.logger.error(
            `生成运行 ${run.id} 入队失败：${(error as Error).message}`,
          );
          await runInTenantTransaction(this.db, tenantId, () =>
            this.markRunFailedIfActive(
              tenantId,
              appId,
              run.id,
              '生成运行入队失败，未执行任何 Gate。',
            ),
          );
          throw error;
        }
      };
      if (hasActiveTenantTransaction()) {
        registerAfterCommitHook(enqueue);
      } else {
        await enqueue();
      }

      return this.repository.toGenerationRunResponseDto(run);
    });
  }

  /** job 异常终止（含 stalled 超限）时调用：仍处于 queued/running 的运行改为失败 */
  async markRunFailedIfActive(
    tenantId: string,
    appId: string,
    runId: string,
    failureReason: string,
  ): Promise<void> {
    const completedAt = new Date();
    await this.repository.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set({
        status: 'failed',
        summary: '生成运行异常中止；已由终态保护标记为失败。',
        failureReason,
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
          inArray(schema.generatedAppGenerationRuns.status, [
            ...ACTIVE_RUN_STATUSES,
          ]),
        ),
      );
  }

  async executeRun(job: GeneratedAppGenerationJobData): Promise<void> {
    const { tenantId, appId, generationRunId } = job;
    const tx = <T>(operation: () => Promise<T>) =>
      runInTenantTransaction(this.db, tenantId, operation);

    const claimed = await tx(async () => {
      const startedAt = new Date();
      const [run] = await this.repository.tenantDb
        .update(schema.generatedAppGenerationRuns)
        .set({
          status: 'running',
          startedAt,
          summary: '生成运行执行中：Gate 0 需求规格。',
          updatedAt: startedAt,
        })
        .where(
          and(
            eq(schema.generatedAppGenerationRuns.id, generationRunId),
            eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
            eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
            eq(schema.generatedAppGenerationRuns.status, 'queued'),
          ),
        )
        .returning();
      return run ?? null;
    });
    if (!claimed) {
      this.logger.warn(`生成运行 ${generationRunId} 不是 queued，跳过重复投递`);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new GeneratedAppGenerationRunTimeoutError(claimed.maxRuntimeSeconds),
        ),
      claimed.maxRuntimeSeconds * 1000,
    );
    try {
      await runGenerationToTerminal(
        (markTerminalPersisted) =>
          this.runGates({
            job,
            maxRepairAttempts: claimed.maxRepairAttempts,
            signal: controller.signal,
            markTerminalPersisted,
          }),
        () =>
          tx(() =>
            this.markRunFailedIfActive(
              tenantId,
              appId,
              generationRunId,
              '门禁运行器在完成全部 Gate 前抛出异常，请检查 worker 日志。',
            ),
          ),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async runGates(params: {
    job: GeneratedAppGenerationJobData;
    maxRepairAttempts: number;
    signal: AbortSignal;
    markTerminalPersisted: () => void;
  }): Promise<void> {
    const { tenantId, userId, appId, generationRunId } = params.job;
    const tx = <T>(operation: () => Promise<T>) =>
      runInTenantTransaction(this.db, tenantId, operation);
    const executed: GeneratedAppGateResult[] = [];
    const gateRuns: GeneratedAppGateRunResponseDto[] = [];

    const record = async (
      gateId: GateId,
      startedAt: Date,
      evaluation: Pick<
        GeneratedAppGateEvaluationV2,
        'status' | 'summary' | 'evidence' | 'failure' | 'repairInstructions'
      >,
      generationPlan?: GeneratedAppGenerationPlanV2 | null,
    ) =>
      tx(async () => {
        const app = await this.repository.findGeneratedAppRecord(
          tenantId,
          appId,
        );
        const result = await this.repository.createGateRunAndUpdateApp(
          tenantId,
          userId,
          app,
          {
            gateId,
            generationRunId,
            attemptNumber: 1,
            status: evaluation.status,
            summary: evaluation.summary,
            evidence: evaluation.evidence,
            failure: evaluation.failure,
            repairInstructions: evaluation.repairInstructions,
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
          },
          {
            ...(generationPlan !== undefined ? { generationPlan } : {}),
            buildGateResults: (gateResult, nowIso) => {
              executed.push(gateResult);
              return this.repository.buildRunnerGateResults(
                app,
                executed,
                nowIso,
              );
            },
          },
        );
        gateRuns.push(result.gateRun);
        await this.updateRunSummary(
          tenantId,
          appId,
          generationRunId,
          `${gateId} ${evaluation.status === 'passed' ? '通过' : '失败'}：${evaluation.summary}`,
        );
      });

    const finish = async (
      status: 'passed' | 'failed',
      summary: string,
      failureReason: string | null,
    ) => {
      await tx(async () => {
        if (status === 'failed') {
          await this.repairService.recordAutomaticRepairAttemptForFailedRun({
            tenantId,
            userId,
            appId,
            generationRunId,
            maxRepairAttempts: params.maxRepairAttempts,
            gateRuns,
          });
        }
        const completedAt = new Date();
        const [completed] = await this.repository.tenantDb
          .update(schema.generatedAppGenerationRuns)
          .set({
            status,
            summary,
            failureReason,
            completedAt,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(schema.generatedAppGenerationRuns.id, generationRunId),
              eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
              eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
            ),
          )
          .returning();
        if (!completed) {
          throw new GeneratedAppGenerationRunNotFoundException(generationRunId);
        }
      });
      params.markTerminalPersisted();
    };

    const failRun = (gateId: GateId, failure: { message: string } | null) =>
      finish(
        'failed',
        `生成运行在 ${gateId} 失败，后续 Gate 未执行；应用保持不可发布。`,
        failure?.message ?? `${gateId} 失败`,
      );

    // ── Gate 0：按需生成 AppSpec（模型调用期间不持有事务） ──
    const gate0StartedAt = new Date();
    const app = await tx(() =>
      this.repository.findGeneratedAppRecord(tenantId, appId),
    );
    const gate0 = await this.gate0.evaluate({
      tenantId,
      userId,
      app: {
        id: app.id,
        prompt: app.prompt,
        appSpec: app.appSpec,
        generationModelConfigId: app.generationModelConfigId,
        bindingTarget: app.bindingTarget,
      },
      generationRunId,
      regenerate: params.job.regenerateAppSpec,
      signal: params.signal,
    });
    const passedGate0 =
      gate0.evaluation.status === 'passed' &&
      gate0.appSpec !== null &&
      gate0.resolvedBinding !== null;
    await record('gate-0', gate0StartedAt, gate0.evaluation, null);
    if (!passedGate0 || !gate0.appSpec || !gate0.resolvedBinding) {
      return failRun('gate-0', gate0.evaluation.failure);
    }
    const appSpec = gate0.appSpec;
    const resolvedBinding = gate0.resolvedBinding;

    // ── Gate 1：覆盖矩阵 ──
    const gate1StartedAt = new Date();
    const gate1 = evaluateGate1GenerationPlan(appSpec);
    const plan: GeneratedAppGenerationPlanV2 = {
      planVersion: 2,
      generationRunId,
      appSpecSha256: computeAppSpecSha256(appSpec),
      binding: toPinnedBinding(appSpec),
      coverage: gate1.plan ?? {
        requirements: [],
        unassertedSectionIds: [],
        untouchedFieldIds: [],
      },
    };
    await record('gate-1', gate1StartedAt, gate1, plan);
    if (gate1.status === 'failed') return failRun('gate-1', gate1.failure);

    const context = (): GeneratedAppGateContextV2 => ({
      tenantId,
      userId,
      appId,
      generationRunId,
      appSpec,
      resolvedBinding,
      previousGates: executed.map((gate) => ({
        gateId: gate.gateId,
        status: gate.status === 'passed' ? 'passed' : 'failed',
        evidence: gate.evidence,
      })),
      generationPlan: plan,
      signal: params.signal,
    });

    const stages: Array<{
      gateId: keyof typeof GATE_PLAN_KEYS;
      run: () => Promise<GeneratedAppGateEvaluationV2>;
    }> = [
      {
        gateId: 'gate-2',
        run: async () =>
          evaluateGate2StaticContracts(
            appSpec,
            resolvedBinding,
            appSpec.binding.kind === 'agent'
              ? this.wrapperBuilder.buildAgentWrapperWorkflowGraph(appSpec, {
                  appId,
                })
              : null,
          ),
      },
      { gateId: 'gate-3', run: () => this.gate3.run(context()) },
      { gateId: 'gate-4', run: () => tx(() => this.gate4.run(context())) },
      { gateId: 'gate-5', run: () => this.gate5.run(context()) },
      { gateId: 'gate-6', run: () => this.gate6.run(context()) },
      { gateId: 'gate-7', run: () => tx(() => this.gate7.run(context())) },
    ];

    for (const stage of stages) {
      if (params.signal.aborted) {
        return finish(
          'failed',
          `生成运行超过 maxRuntimeSeconds，在 ${stage.gateId} 之前停止；应用保持不可发布。`,
          (params.signal.reason as Error | undefined)?.message ??
            '生成运行超时',
        );
      }
      const startedAt = new Date();
      await tx(() =>
        this.updateRunSummary(
          tenantId,
          appId,
          generationRunId,
          `生成运行执行中：${stage.gateId}。`,
        ),
      );
      const evaluation = await stage.run();
      if (evaluation.plan) {
        Object.assign(plan, {
          [GATE_PLAN_KEYS[stage.gateId]]: evaluation.plan,
        });
      }
      await record(stage.gateId, startedAt, evaluation, plan);
      if (evaluation.status === 'failed') {
        return failRun(stage.gateId, evaluation.failure);
      }
    }

    return finish(
      'passed',
      '生成运行完成 Gate 0–7：AppSpec 由模型生成，绑定已固定版本，浏览器验收与独立复核通过，应用进入发布候选；公开链接需创建者手动开启。',
      null,
    );
  }

  private async updateRunSummary(
    tenantId: string,
    appId: string,
    runId: string,
    summary: string,
  ): Promise<void> {
    await this.repository.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set({ summary: summary.slice(0, 4000), updatedAt: new Date() })
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      );
  }
}
