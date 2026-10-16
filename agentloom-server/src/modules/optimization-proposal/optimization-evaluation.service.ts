import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ExecutionStatusChangedPayload } from '@agentloom/contracts';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import {
  runInTenantTransaction,
  transactionStorage,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  optimizationEvaluationRuns,
  optimizationEvaluations,
  optimizationProposals,
  teamRuns,
  workflowExecutions,
  type OptimizationEvaluationRun,
} from '../../database/schema';
import {
  ExecutionNotCancellableException,
  ExecutionNotFoundException,
} from '../execution/execution.exceptions';
import { ExecutionService } from '../execution/execution.service';
import {
  computeEvaluationVerdict,
  summarizeEvaluationArm,
} from './optimization-evaluation.verdict';
import {
  OPTIMIZATION_EVALUATION_ARMS,
  type EvaluationRunMetrics,
  type OptimizationEvaluateJobData,
  type OptimizationEvaluationRunStatus,
} from './optimization-proposal.types';

/** 执行进入这些状态即可结算对应评测 run */
const EXECUTION_TERMINAL_STATUSES: Record<string, true> = {
  completed: true,
  failed: true,
  cancelled: true,
};

/** 评测启动后超过该时长仍缺 run 行（启动任务丢失），由清扫重做启动 */
const EVALUATION_LAUNCH_RECOVERY_AFTER_MS = 60_000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 评测执行：基线与候选版本各回放同一组用例 → 执行终态结算 run 指标 → 全部结算后汇总结论。
 *
 * - 启动幂等：已存在 (evaluation, arm, case) 的 run 行跳过；启动失败写 failed 行（launch_failed）。
 * - 结算：执行终态事件触发；事件可能早于发出方事务提交或丢失，清扫按执行实际状态补偿。
 * - 超时：超过 deadline 仍有 running run → 取消其执行、评测失败、提案回到 proposed。
 */
@Injectable()
export class OptimizationEvaluationService {
  private readonly logger = new Logger(OptimizationEvaluationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly executionService: ExecutionService,
  ) {}

  /** worker 入口：为缺失的 (臂, 用例) 启动评测执行 */
  async run({ tenantId, evaluationId }: OptimizationEvaluateJobData): Promise<void> {
    const loaded = await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [evaluation] = await tx
        .select({
          id: optimizationEvaluations.id,
          status: optimizationEvaluations.status,
          cases: optimizationEvaluations.cases,
          baseVersionId: optimizationEvaluations.baseVersionId,
          candidateVersionId: optimizationEvaluations.candidateVersionId,
          startedByUserId: optimizationEvaluations.startedByUserId,
          workflowDefinitionId: optimizationProposals.workflowDefinitionId,
        })
        .from(optimizationEvaluations)
        .innerJoin(
          optimizationProposals,
          eq(optimizationProposals.id, optimizationEvaluations.proposalId),
        )
        .where(eq(optimizationEvaluations.id, evaluationId));
      if (!evaluation || evaluation.status !== 'running') {
        return null;
      }
      const existing = await tx
        .select({
          arm: optimizationEvaluationRuns.arm,
          caseIndex: optimizationEvaluationRuns.caseIndex,
        })
        .from(optimizationEvaluationRuns)
        .where(eq(optimizationEvaluationRuns.evaluationId, evaluationId));
      return {
        evaluation,
        existing: new Set(existing.map((row) => `${row.arm}:${row.caseIndex}`)),
      };
    });
    if (!loaded) {
      return;
    }

    const { evaluation, existing } = loaded;
    for (const evaluationCase of evaluation.cases) {
      for (const arm of OPTIMIZATION_EVALUATION_ARMS) {
        if (existing.has(`${arm}:${evaluationCase.index}`)) continue;
        const workflowVersionId =
          arm === 'baseline'
            ? evaluation.baseVersionId
            : evaluation.candidateVersionId;
        try {
          await runInTenantTransaction(this.db, tenantId, async (tx) => {
            const execution = await this.executionService.runWorkflow(
              evaluation.workflowDefinitionId,
              {
                inputParams: evaluationCase.inputParams,
                launchSource: 'evaluation',
                triggerType: 'system',
                workflowVersionId,
              },
              tenantId,
              evaluation.startedByUserId,
            );
            await tx.insert(optimizationEvaluationRuns).values({
              tenantId,
              evaluationId,
              arm,
              caseIndex: evaluationCase.index,
              executionId: execution.id,
              status: 'running',
            });
          });
        } catch (error) {
          this.logger.warn(
            `评测 ${evaluationId} ${arm}#${evaluationCase.index} 启动失败：${describeError(error)}`,
          );
          await runInTenantTransaction(this.db, tenantId, (tx) =>
            tx
              .insert(optimizationEvaluationRuns)
              .values({
                tenantId,
                evaluationId,
                arm,
                caseIndex: evaluationCase.index,
                executionId: null,
                status: 'failed',
                metrics: {
                  passed: false,
                  executionStatus: 'launch_failed',
                  durationMs: null,
                  costUsd: null,
                  totalTokens: null,
                  team: null,
                  error: describeError(error).slice(0, 500),
                },
                completedAt: new Date(),
              })
              .onConflictDoNothing(),
          );
        }
      }
    }

    await this.tryFinalize(tenantId, evaluationId);
  }

  @OnEvent('execution.status.changed')
  async handleExecutionStatusChanged(
    payload: ExecutionStatusChangedPayload & { tenantId: string },
  ): Promise<void> {
    if (
      payload.executionType === 'conversation' ||
      EXECUTION_TERMINAL_STATUSES[payload.status] !== true
    ) {
      return;
    }
    await transactionStorage.exit(() =>
      this.guard(`结算评测执行 ${payload.executionId}`, () =>
        this.settleByExecution(payload.tenantId, payload.executionId),
      ),
    );
  }

  async settleByExecution(tenantId: string, executionId: string): Promise<void> {
    const evaluationId = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [run] = await tx
          .select()
          .from(optimizationEvaluationRuns)
          .where(
            and(
              eq(optimizationEvaluationRuns.executionId, executionId),
              eq(optimizationEvaluationRuns.status, 'running'),
            ),
          )
          .for('update');
        if (!run) {
          return null;
        }
        return (await this.settleRun(tx, run)) ? run.evaluationId : null;
      },
    );
    if (evaluationId) {
      await this.tryFinalize(tenantId, evaluationId);
    }
  }

  /** 按执行实际终态计算 run 指标；执行尚未终态（事件早于提交）返回 false，留给清扫 */
  async settleRun(
    tx: DrizzleDB,
    run: OptimizationEvaluationRun,
  ): Promise<boolean> {
    if (!run.executionId) {
      return false;
    }
    const [execution] = await tx
      .select({
        status: workflowExecutions.status,
        startedAt: workflowExecutions.startedAt,
        completedAt: workflowExecutions.completedAt,
        failedAt: workflowExecutions.failedAt,
        cancelledAt: workflowExecutions.cancelledAt,
      })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, run.executionId));
    if (!execution || EXECUTION_TERMINAL_STATUSES[execution.status] !== true) {
      return false;
    }

    const terminalAt =
      execution.completedAt ?? execution.failedAt ?? execution.cancelledAt;
    const durationMs =
      execution.startedAt && terminalAt
        ? terminalAt.getTime() - execution.startedAt.getTime()
        : null;

    // 团队步骤的用量以 team_runs 为准（失败的团队步骤不写 result），其余步骤取 step result
    const usage = await tx.execute<{
      team_runs: number;
      team_cost: number | null;
      team_tokens: number | null;
      step_cost_rows: number;
      step_cost: number | null;
      step_token_rows: number;
      step_tokens: number | null;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM team_runs tr WHERE tr.execution_id = ${run.executionId}) AS team_runs,
        (SELECT sum(tr.used_cost_usd)::float8 FROM team_runs tr WHERE tr.execution_id = ${run.executionId}) AS team_cost,
        (SELECT sum(tr.used_input_tokens + tr.used_output_tokens)::float8 FROM team_runs tr WHERE tr.execution_id = ${run.executionId}) AS team_tokens,
        count(*) FILTER (WHERE jsonb_typeof(es.result->'costUsd') = 'number')::int AS step_cost_rows,
        sum((es.result->>'costUsd')::numeric) FILTER (WHERE jsonb_typeof(es.result->'costUsd') = 'number')::float8 AS step_cost,
        count(*) FILTER (WHERE jsonb_typeof(es.result->'totalTokens') = 'number')::int AS step_token_rows,
        sum((es.result->>'totalTokens')::numeric) FILTER (WHERE jsonb_typeof(es.result->'totalTokens') = 'number')::float8 AS step_tokens
      FROM execution_steps es
      WHERE es.execution_id = ${run.executionId}
        AND NOT EXISTS (SELECT 1 FROM team_runs tr WHERE tr.step_id = es.id)
    `);
    const row = usage[0];
    const teamRunCount = Number(row?.team_runs ?? 0);
    const costUsd =
      teamRunCount > 0 || Number(row?.step_cost_rows ?? 0) > 0
        ? Number(row?.team_cost ?? 0) + Number(row?.step_cost ?? 0)
        : null;
    const totalTokens =
      teamRunCount > 0 || Number(row?.step_token_rows ?? 0) > 0
        ? Number(row?.team_tokens ?? 0) + Number(row?.step_tokens ?? 0)
        : null;

    const [team] = await tx
      .select({
        status: teamRuns.status,
        failureReason: teamRuns.failureReason,
        usedInputTokens: teamRuns.usedInputTokens,
        usedOutputTokens: teamRuns.usedOutputTokens,
        messageCount: teamRuns.messageCount,
      })
      .from(teamRuns)
      .where(eq(teamRuns.executionId, run.executionId))
      .orderBy(desc(teamRuns.createdAt))
      .limit(1);

    const metrics: EvaluationRunMetrics = {
      passed: execution.status === 'completed',
      executionStatus: execution.status,
      durationMs,
      costUsd,
      totalTokens,
      team: team
        ? {
            status: team.status,
            failureReason: team.failureReason ?? null,
            usedTokens: team.usedInputTokens + team.usedOutputTokens,
            messageCount: team.messageCount,
          }
        : null,
      error: null,
    };
    const status: OptimizationEvaluationRunStatus =
      execution.status === 'completed'
        ? 'completed'
        : execution.status === 'cancelled'
          ? 'cancelled'
          : 'failed';

    const updated = await tx
      .update(optimizationEvaluationRuns)
      .set({ status, metrics, completedAt: new Date() })
      .where(
        and(
          eq(optimizationEvaluationRuns.id, run.id),
          eq(optimizationEvaluationRuns.status, 'running'),
        ),
      )
      .returning({ id: optimizationEvaluationRuns.id });
    return updated.length > 0;
  }

  /** 全部 run 已启动且已结算 → 汇总结论，评测完成、提案 evaluating → evaluated */
  async tryFinalize(tenantId: string, evaluationId: string): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [evaluation] = await tx
        .select()
        .from(optimizationEvaluations)
        .where(
          and(
            eq(optimizationEvaluations.id, evaluationId),
            eq(optimizationEvaluations.status, 'running'),
          ),
        )
        .for('update');
      if (!evaluation) {
        return;
      }
      const runs = await tx
        .select()
        .from(optimizationEvaluationRuns)
        .where(eq(optimizationEvaluationRuns.evaluationId, evaluationId));
      const expected = evaluation.cases.length * OPTIMIZATION_EVALUATION_ARMS.length;
      if (
        runs.length < expected ||
        runs.some((run) => run.status === 'running' || !run.metrics)
      ) {
        return;
      }

      const metricsOf = (arm: string) =>
        runs
          .filter((run) => run.arm === arm)
          .map((run) => run.metrics as EvaluationRunMetrics);
      const summary = computeEvaluationVerdict(
        summarizeEvaluationArm(metricsOf('baseline')),
        summarizeEvaluationArm(metricsOf('candidate')),
      );
      const now = new Date();
      await tx
        .update(optimizationEvaluations)
        .set({ status: 'completed', summary, completedAt: now, updatedAt: now })
        .where(eq(optimizationEvaluations.id, evaluationId));
      await tx
        .update(optimizationProposals)
        .set({
          status: 'evaluated',
          verdict: summary.verdict,
          evaluatedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(optimizationProposals.id, evaluation.proposalId),
            eq(optimizationProposals.status, 'evaluating'),
            eq(optimizationProposals.currentEvaluationId, evaluationId),
          ),
        );
    });
  }

  /**
   * 周期清扫（跨租户原始连接选候选，逐个租户事务处理）：
   * 1. 超过 deadline 的评测 → 取消在途执行、评测失败（timeout）、提案回到 proposed；
   * 2. running run 而执行已终态 → 补偿结算（终态事件早于提交或丢失）；
   * 3. 启动已久仍缺 run 行 → 重做启动（启动任务丢失）。
   */
  async sweep(): Promise<void> {
    const now = new Date();
    const overdue = await this.db
      .select({
        id: optimizationEvaluations.id,
        tenantId: optimizationEvaluations.tenantId,
      })
      .from(optimizationEvaluations)
      .where(
        and(
          eq(optimizationEvaluations.status, 'running'),
          lt(optimizationEvaluations.deadlineAt, now),
        ),
      );
    for (const evaluation of overdue) {
      await this.guard(`评测 ${evaluation.id} 超时处理`, () =>
        this.expire(evaluation.tenantId, evaluation.id),
      );
    }

    const unsettled = await this.db
      .select({
        executionId: optimizationEvaluationRuns.executionId,
        tenantId: optimizationEvaluationRuns.tenantId,
      })
      .from(optimizationEvaluationRuns)
      .innerJoin(
        workflowExecutions,
        eq(workflowExecutions.id, optimizationEvaluationRuns.executionId),
      )
      .where(
        and(
          eq(optimizationEvaluationRuns.status, 'running'),
          inArray(workflowExecutions.status, ['completed', 'failed', 'cancelled']),
        ),
      );
    for (const run of unsettled) {
      if (!run.executionId) continue;
      const executionId = run.executionId;
      await this.guard(`补偿结算评测执行 ${executionId}`, () =>
        this.settleByExecution(run.tenantId, executionId),
      );
    }

    const launchCutoff = new Date(now.getTime() - EVALUATION_LAUNCH_RECOVERY_AFTER_MS);
    const stalled = await this.db
      .select({
        id: optimizationEvaluations.id,
        tenantId: optimizationEvaluations.tenantId,
      })
      .from(optimizationEvaluations)
      .where(
        and(
          eq(optimizationEvaluations.status, 'running'),
          lt(optimizationEvaluations.startedAt, launchCutoff),
          sql`(SELECT count(*) FROM optimization_evaluation_runs r WHERE r.evaluation_id = ${optimizationEvaluations.id}) < jsonb_array_length(${optimizationEvaluations.cases}) * ${OPTIMIZATION_EVALUATION_ARMS.length}`,
        ),
      );
    for (const evaluation of stalled) {
      await this.guard(`重做评测 ${evaluation.id} 启动`, () =>
        this.run({ tenantId: evaluation.tenantId, evaluationId: evaluation.id }),
      );
    }
  }

  private async expire(tenantId: string, evaluationId: string): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [evaluation] = await tx
        .select()
        .from(optimizationEvaluations)
        .where(
          and(
            eq(optimizationEvaluations.id, evaluationId),
            eq(optimizationEvaluations.status, 'running'),
          ),
        )
        .for('update');
      if (!evaluation) {
        return;
      }
      const running = await tx
        .select()
        .from(optimizationEvaluationRuns)
        .where(
          and(
            eq(optimizationEvaluationRuns.evaluationId, evaluationId),
            eq(optimizationEvaluationRuns.status, 'running'),
          ),
        );
      const now = new Date();
      for (const run of running) {
        if (run.executionId) {
          try {
            await this.executionService.cancelExecution(run.executionId, tenantId);
          } catch (error) {
            if (
              !(error instanceof ExecutionNotCancellableException) &&
              !(error instanceof ExecutionNotFoundException)
            ) {
              throw error;
            }
          }
        }
        await tx
          .update(optimizationEvaluationRuns)
          .set({
            status: 'cancelled',
            metrics: {
              passed: false,
              executionStatus: 'timeout',
              durationMs: null,
              costUsd: null,
              totalTokens: null,
              team: null,
              error: null,
            },
            completedAt: now,
          })
          .where(eq(optimizationEvaluationRuns.id, run.id));
      }
      await tx
        .update(optimizationEvaluations)
        .set({
          status: 'failed',
          failureReason: 'timeout',
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(optimizationEvaluations.id, evaluationId));
      await tx
        .update(optimizationProposals)
        .set({ status: 'proposed', updatedAt: now })
        .where(
          and(
            eq(optimizationProposals.id, evaluation.proposalId),
            eq(optimizationProposals.status, 'evaluating'),
            eq(optimizationProposals.currentEvaluationId, evaluationId),
          ),
        );
    });
  }

  private async guard(
    label: string,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.logger.warn(`${label}失败：${describeError(error)}`);
    }
  }
}
