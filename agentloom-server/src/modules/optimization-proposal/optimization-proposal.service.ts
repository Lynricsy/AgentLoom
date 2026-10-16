import { isDeepStrictEqual } from 'node:util';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TeamNodeConfigSchema } from '@agentloom/contracts';
import type { Queue } from 'bullmq';
import { and, asc, count, desc, eq, inArray, notExists, sql } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
  transactionStorage,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  optimizationEvaluationRuns,
  optimizationEvaluations,
  optimizationProposals,
  workflowDefinitions,
  workflowExecutions,
  workflowVersions,
  type OptimizationEvaluation,
  type OptimizationEvaluationRun,
  type OptimizationProposal,
  type ReactFlowNode,
  type WorkflowVersionSnapshot,
} from '../../database/schema';
import { AuditLogService } from '../evidence/audit-log.service';
import { isRecord } from '../execution/node-value.util';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { getConfigPathValue, setConfigPathValue } from './config-path.util';
import type {
  ListProposalsQuery,
  ProposalDetail,
  ProposalListResponse,
  ProposalSummary,
} from './dto/optimization-proposal.dto';
import {
  resolveAnalyzableNodeType,
  OptimizationAnalysisService,
} from './optimization-analysis.service';
import {
  buildOptimizationEvaluateJobId,
  OPTIMIZATION_EVAL_DEFAULT_CASES,
  OPTIMIZATION_EVAL_MIN_TIMEOUT_MS,
  OPTIMIZATION_EVALUATE_JOB_NAME,
  OPTIMIZATION_QUEUE,
} from './optimization-proposal.constants';
import {
  OptimizationEvaluationNoCasesException,
  OptimizationProposalInvalidPatchException,
  OptimizationProposalNotFoundException,
  OptimizationProposalNotImprovedException,
  OptimizationProposalStaleException,
  OptimizationProposalStatusConflictException,
} from './optimization-proposal.exceptions';
import {
  OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES,
  type EvaluationCase,
  type OptimizationEvaluateJobData,
  type OptimizationProposalStatus,
  type ProposalPublishReport,
} from './optimization-proposal.types';

interface WorkflowRow {
  id: string;
  name: string;
  status: string;
  publishedVersionId: string | null;
  nodes: ReactFlowNode[] | null;
  version: number;
}

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

/**
 * 优化提案状态机与审批动作：评测启动、发布、回滚、忽略。
 *
 * 状态：proposed → evaluating →（评测完成）evaluated /（评测失败）proposed；
 * evaluated → evaluating（重新评测）/ published / dismissed；proposed → dismissed；
 * published → rolled_back；proposed|evaluating|evaluated → superseded（基线不再是发布版本）。
 */
@Injectable()
export class OptimizationProposalService {
  private readonly logger = new Logger(OptimizationProposalService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly workflowVersionService: WorkflowVersionService,
    private readonly auditLogService: AuditLogService,
    private readonly analysisService: OptimizationAnalysisService,
    @InjectQueue(OPTIMIZATION_QUEUE) private readonly queue: Queue,
  ) {}

  // ─── 查询 ─────────────────────────────────────────────────────

  async list(
    tenantId: string,
    query: ListProposalsQuery,
  ): Promise<ProposalListResponse> {
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const conditions = [eq(optimizationProposals.tenantId, tenantId)];
      if (query.workflowDefinitionId) {
        conditions.push(
          eq(
            optimizationProposals.workflowDefinitionId,
            query.workflowDefinitionId,
          ),
        );
      }
      if (query.status) {
        conditions.push(eq(optimizationProposals.status, query.status));
      }
      const where = and(...conditions);

      const [rows, [{ total }]] = await Promise.all([
        tx
          .select({
            proposal: optimizationProposals,
            workflowName: workflowDefinitions.name,
          })
          .from(optimizationProposals)
          .innerJoin(
            workflowDefinitions,
            eq(workflowDefinitions.id, optimizationProposals.workflowDefinitionId),
          )
          .where(where)
          .orderBy(desc(optimizationProposals.createdAt))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        tx
          .select({ total: count() })
          .from(optimizationProposals)
          .where(where),
      ]);

      return {
        data: rows.map((row) => this.toSummary(row.proposal, row.workflowName)),
        meta: {
          total,
          page: query.page,
          limit: query.limit,
          pageSize: query.limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      };
    });
  }

  async getDetail(tenantId: string, proposalId: string): Promise<ProposalDetail> {
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({
          proposal: optimizationProposals,
          workflowName: workflowDefinitions.name,
        })
        .from(optimizationProposals)
        .innerJoin(
          workflowDefinitions,
          eq(workflowDefinitions.id, optimizationProposals.workflowDefinitionId),
        )
        .where(
          and(
            eq(optimizationProposals.id, proposalId),
            eq(optimizationProposals.tenantId, tenantId),
          ),
        );
      if (!row) {
        throw new OptimizationProposalNotFoundException(proposalId);
      }

      let latestEvaluation: ProposalDetail['latestEvaluation'] = null;
      if (row.proposal.currentEvaluationId) {
        const [evaluation] = await tx
          .select()
          .from(optimizationEvaluations)
          .where(eq(optimizationEvaluations.id, row.proposal.currentEvaluationId));
        if (evaluation) {
          const runs = await tx
            .select()
            .from(optimizationEvaluationRuns)
            .where(eq(optimizationEvaluationRuns.evaluationId, evaluation.id))
            .orderBy(
              asc(optimizationEvaluationRuns.arm),
              asc(optimizationEvaluationRuns.caseIndex),
            );
          latestEvaluation = this.toEvaluation(evaluation, runs);
        }
      }

      return {
        ...this.toSummary(row.proposal, row.workflowName),
        latestEvaluation,
        publishReport: row.proposal.publishReport ?? null,
      };
    });
  }

  async analyzeWorkflow(
    tenantId: string,
    workflowId: string,
  ): Promise<ProposalSummary[]> {
    const created = await this.analysisService.analyzeWorkflow(
      tenantId,
      workflowId,
    );
    if (created.length === 0) {
      return [];
    }
    const workflow = await runInTenantTransaction(this.db, tenantId, (tx) =>
      this.loadWorkflow(tx, workflowId),
    );
    return created.map((proposal) => this.toSummary(proposal, workflow.name));
  }

  // ─── 评测 ─────────────────────────────────────────────────────

  async startEvaluation(
    tenantId: string,
    proposalId: string,
    userId: string,
    dto: { caseCount?: number },
  ): Promise<ProposalDetail> {
    await this.supersedeIfBaseNotPublished(tenantId, proposalId);

    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      this.assertStatus(proposal, ['proposed', 'evaluated']);

      const workflow = await this.loadWorkflow(tx, proposal.workflowDefinitionId);
      if (workflow.publishedVersionId !== proposal.baseVersionId) {
        throw new OptimizationProposalStaleException(
          proposalId,
          'base_version_not_published',
        );
      }

      const baseSnapshot = await this.loadVersionSnapshot(
        tx,
        proposal.baseVersionId,
      );
      const candidateSnapshot = this.buildCandidateSnapshot(
        proposal,
        baseSnapshot,
      );

      let candidateVersionId = proposal.candidateVersionId;
      if (!candidateVersionId) {
        const version = await this.workflowVersionService.createVersionFromSnapshot(
          proposal.workflowDefinitionId,
          {
            snapshot: candidateSnapshot,
            label: `优化提案 ${proposal.proposalType} ${proposal.id.slice(0, 8)}`,
            userId,
          },
        );
        candidateVersionId = version.id;
      }

      const cases = await this.selectEvaluationCases(
        tx,
        proposal.workflowDefinitionId,
        dto.caseCount ?? OPTIMIZATION_EVAL_DEFAULT_CASES,
      );

      const deadlineAt = new Date(
        Date.now() + this.resolveEvaluationTimeoutMs(candidateSnapshot),
      );
      const [evaluation] = await tx
        .insert(optimizationEvaluations)
        .values({
          tenantId,
          proposalId,
          status: 'running',
          baseVersionId: proposal.baseVersionId,
          candidateVersionId,
          cases,
          deadlineAt,
          startedByUserId: userId,
        })
        .returning({ id: optimizationEvaluations.id });

      await tx
        .update(optimizationProposals)
        .set({
          status: 'evaluating',
          candidateVersionId,
          currentEvaluationId: evaluation.id,
          verdict: null,
          evaluatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(optimizationProposals.id, proposalId));

      const enqueue = async () => {
        await this.queue.add(
          OPTIMIZATION_EVALUATE_JOB_NAME,
          { tenantId, evaluationId: evaluation.id } satisfies OptimizationEvaluateJobData,
          { jobId: buildOptimizationEvaluateJobId(evaluation.id) },
        );
      };
      if (hasActiveTenantTransaction()) {
        registerAfterCommitHook(enqueue);
      } else {
        await enqueue();
      }
    });

    return this.getDetail(tenantId, proposalId);
  }

  // ─── 发布 / 回滚 / 忽略 ───────────────────────────────────────

  async publish(
    tenantId: string,
    proposalId: string,
    userId: string,
    dto: { label?: string; releaseNotes?: string },
  ): Promise<ProposalDetail> {
    await this.supersedeIfBaseNotPublished(tenantId, proposalId);

    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      this.assertStatus(proposal, ['evaluated']);

      const evaluation = proposal.currentEvaluationId
        ? (
            await tx
              .select()
              .from(optimizationEvaluations)
              .where(eq(optimizationEvaluations.id, proposal.currentEvaluationId))
          )[0]
        : undefined;
      if (
        !evaluation ||
        evaluation.status !== 'completed' ||
        evaluation.summary?.verdict !== 'improved' ||
        !proposal.candidateVersionId
      ) {
        throw new OptimizationProposalNotImprovedException(
          proposalId,
          evaluation?.summary?.verdict ?? proposal.verdict,
        );
      }

      const workflow = await this.loadWorkflow(tx, proposal.workflowDefinitionId);
      if (workflow.publishedVersionId !== proposal.baseVersionId) {
        throw new OptimizationProposalStaleException(
          proposalId,
          'base_version_not_published',
        );
      }

      await this.workflowVersionService.publish(
        proposal.workflowDefinitionId,
        {
          versionId: proposal.candidateVersionId,
          label: dto.label ?? `优化提案 ${proposal.proposalType}`,
          releaseNotes: dto.releaseNotes ?? proposal.rationale,
        },
        userId,
      );

      const publishReport = await this.syncDraft(tx, proposal, userId, {
        expected: undefined,
        value: proposal.proposedValue,
        missingNote: '草稿中不存在该节点，未同步',
      });

      const now = new Date();
      await tx
        .update(optimizationProposals)
        .set({
          status: 'published',
          publishedVersionId: proposal.candidateVersionId,
          publishedAt: now,
          publishedByUserId: userId,
          publishReport,
          updatedAt: now,
        })
        .where(eq(optimizationProposals.id, proposalId));

      await this.auditLogService.record({
        tenantId,
        actorId: userId,
        actorType: 'user',
        eventType: 'optimization.proposal.published',
        resourceType: 'workflow_definition',
        resourceId: proposal.workflowDefinitionId,
        summary: `发布优化提案：${proposal.rationale}`,
        before: { publishedVersionId: proposal.baseVersionId },
        after: { publishedVersionId: proposal.candidateVersionId },
        metadata: this.auditMetadata(proposal),
      });
    });

    return this.getDetail(tenantId, proposalId);
  }

  async rollback(
    tenantId: string,
    proposalId: string,
    userId: string,
  ): Promise<ProposalDetail> {
    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      this.assertStatus(proposal, ['published']);

      const workflow = await this.loadWorkflow(tx, proposal.workflowDefinitionId);
      if (
        !proposal.candidateVersionId ||
        workflow.publishedVersionId !== proposal.candidateVersionId
      ) {
        throw new OptimizationProposalStaleException(
          proposalId,
          'candidate_version_not_published',
        );
      }

      await this.workflowVersionService.publish(
        proposal.workflowDefinitionId,
        { versionId: proposal.baseVersionId },
        userId,
      );

      // 草稿仍是提案值才回写基线值；路由基线未配置回退模型时删除该键
      const publishReport = await this.syncDraft(tx, proposal, userId, {
        expected: proposal.proposedValue,
        value: proposal.currentValue ?? undefined,
        missingNote: '草稿中不存在该节点，未回写',
        modifiedNote: '草稿已被手工修改，未回写',
      });

      const now = new Date();
      await tx
        .update(optimizationProposals)
        .set({
          status: 'rolled_back',
          rolledBackAt: now,
          rolledBackByUserId: userId,
          publishReport,
          updatedAt: now,
        })
        .where(eq(optimizationProposals.id, proposalId));

      await this.auditLogService.record({
        tenantId,
        actorId: userId,
        actorType: 'user',
        eventType: 'optimization.proposal.rolled-back',
        resourceType: 'workflow_definition',
        resourceId: proposal.workflowDefinitionId,
        summary: `回滚优化提案：${proposal.rationale}`,
        before: { publishedVersionId: proposal.candidateVersionId },
        after: { publishedVersionId: proposal.baseVersionId },
        metadata: this.auditMetadata(proposal),
      });
    });

    return this.getDetail(tenantId, proposalId);
  }

  async dismiss(
    tenantId: string,
    proposalId: string,
    userId: string,
  ): Promise<ProposalDetail> {
    await runInTenantTransaction(this.db, tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      this.assertStatus(proposal, ['proposed', 'evaluated']);
      const now = new Date();
      await tx
        .update(optimizationProposals)
        .set({
          status: 'dismissed',
          dismissedAt: now,
          dismissedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(optimizationProposals.id, proposalId));
    });
    return this.getDetail(tenantId, proposalId);
  }

  // ─── 内部 ─────────────────────────────────────────────────────

  /**
   * 基线版本已不是发布版本 → 置 superseded 并抛 409。
   *
   * superseded 必须在独立事务提交：请求事务会因随后抛出的异常回滚。
   * 这里只做无锁读取，独立事务的更新不会与请求事务互等。
   */
  private async supersedeIfBaseNotPublished(
    tenantId: string,
    proposalId: string,
  ): Promise<void> {
    const [row] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select({
          status: optimizationProposals.status,
          baseVersionId: optimizationProposals.baseVersionId,
          publishedVersionId: workflowDefinitions.publishedVersionId,
        })
        .from(optimizationProposals)
        .innerJoin(
          workflowDefinitions,
          eq(workflowDefinitions.id, optimizationProposals.workflowDefinitionId),
        )
        .where(
          and(
            eq(optimizationProposals.id, proposalId),
            eq(optimizationProposals.tenantId, tenantId),
          ),
        ),
    );
    if (!row) {
      throw new OptimizationProposalNotFoundException(proposalId);
    }
    if (
      !OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES.includes(
        row.status as (typeof OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES)[number],
      ) ||
      row.publishedVersionId === row.baseVersionId
    ) {
      return;
    }

    await transactionStorage.exit(() =>
      runInTenantTransaction(this.db, tenantId, async (tx) => {
        const now = new Date();
        await tx
          .update(optimizationProposals)
          .set({ status: 'superseded', supersededAt: now, updatedAt: now })
          .where(
            and(
              eq(optimizationProposals.id, proposalId),
              inArray(optimizationProposals.status, [
                ...OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES,
              ]),
            ),
          );
      }),
    );
    throw new OptimizationProposalStaleException(
      proposalId,
      'base_version_not_published',
    );
  }

  private async lockProposal(
    tx: DrizzleDB,
    tenantId: string,
    proposalId: string,
  ): Promise<OptimizationProposal> {
    const [proposal] = await tx
      .select()
      .from(optimizationProposals)
      .where(
        and(
          eq(optimizationProposals.id, proposalId),
          eq(optimizationProposals.tenantId, tenantId),
        ),
      )
      .for('update');
    if (!proposal) {
      throw new OptimizationProposalNotFoundException(proposalId);
    }
    return proposal;
  }

  private assertStatus(
    proposal: OptimizationProposal,
    allowed: OptimizationProposalStatus[],
  ): void {
    if (!allowed.includes(proposal.status)) {
      throw new OptimizationProposalStatusConflictException(
        proposal.id,
        proposal.status,
        allowed,
      );
    }
  }

  private async loadWorkflow(
    tx: DrizzleDB,
    workflowId: string,
  ): Promise<WorkflowRow> {
    const [workflow] = await tx
      .select({
        id: workflowDefinitions.id,
        name: workflowDefinitions.name,
        status: workflowDefinitions.status,
        publishedVersionId: workflowDefinitions.publishedVersionId,
        nodes: workflowDefinitions.nodes,
        version: workflowDefinitions.version,
      })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, workflowId));
    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }
    return workflow;
  }

  private async loadVersionSnapshot(
    tx: DrizzleDB,
    versionId: string,
  ): Promise<WorkflowVersionSnapshot> {
    const [version] = await tx
      .select({ snapshot: workflowVersions.snapshot })
      .from(workflowVersions)
      .where(eq(workflowVersions.id, versionId));
    if (!version) {
      throw new OptimizationProposalStaleException(
        versionId,
        'base_version_not_published',
      );
    }
    return version.snapshot;
  }

  /** 候选快照 = 基线快照深拷贝 + 单节点补丁；team 节点补丁后配置须仍通过契约校验 */
  buildCandidateSnapshot(
    proposal: OptimizationProposal,
    baseSnapshot: WorkflowVersionSnapshot,
  ): WorkflowVersionSnapshot {
    const snapshot = structuredClone(baseSnapshot);
    const node = snapshot.nodes.find((item) => item.id === proposal.nodeId);
    if (!node) {
      throw new OptimizationProposalStaleException(proposal.id, 'node_missing');
    }

    let patched: Record<string, unknown>;
    try {
      patched = setConfigPathValue(
        isRecord(node.data) ? node.data : {},
        proposal.configPath,
        proposal.proposedValue,
      );
    } catch (error) {
      throw new OptimizationProposalInvalidPatchException(
        proposal.id,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (proposal.nodeType === 'team') {
      const parsed = TeamNodeConfigSchema.safeParse(patched.config);
      if (!parsed.success) {
        throw new OptimizationProposalInvalidPatchException(
          proposal.id,
          parsed.error.issues.map((issue) => issue.message).join('；'),
        );
      }
    }
    node.data = patched as typeof node.data;
    snapshot.metadata = { ...snapshot.metadata, releaseNotes: proposal.rationale };
    return snapshot;
  }

  /** 回放该工作流最近 N 次已结束的真实执行输入（排除评测执行本身） */
  private async selectEvaluationCases(
    tx: DrizzleDB,
    workflowId: string,
    caseCount: number,
  ): Promise<EvaluationCase[]> {
    const rows = await tx
      .select({
        id: workflowExecutions.id,
        inputParams: workflowExecutions.inputParams,
      })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.workflowDefinitionId, workflowId),
          inArray(workflowExecutions.status, ['completed', 'failed']),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(optimizationEvaluationRuns)
              .where(
                eq(optimizationEvaluationRuns.executionId, workflowExecutions.id),
              ),
          ),
        ),
      )
      .orderBy(desc(workflowExecutions.createdAt))
      .limit(caseCount);
    if (rows.length === 0) {
      throw new OptimizationEvaluationNoCasesException(workflowId);
    }
    return rows.map((row, index) => {
      const inputParams = isRecord(row.inputParams) ? { ...row.inputParams } : {};
      delete inputParams._meta;
      return { index, sourceExecutionId: row.id, inputParams };
    });
  }

  private resolveEvaluationTimeoutMs(snapshot: WorkflowVersionSnapshot): number {
    let maxDeadlineMinutes = 0;
    for (const node of snapshot.nodes) {
      if (resolveAnalyzableNodeType(node) !== 'team') continue;
      const data = isRecord(node.data) ? node.data : {};
      const parsed = TeamNodeConfigSchema.safeParse(data.config);
      if (parsed.success) {
        maxDeadlineMinutes = Math.max(
          maxDeadlineMinutes,
          parsed.data.budget.deadlineMinutes,
        );
      }
    }
    return Math.max(
      OPTIMIZATION_EVAL_MIN_TIMEOUT_MS,
      2 * maxDeadlineMinutes * 60_000,
    );
  }

  /**
   * 把补丁同步到草稿（经 OCC 更新）。`expected` 给定时只有草稿当前值与之相等才写入；
   * `value === undefined` 表示删除该键。
   */
  private async syncDraft(
    tx: DrizzleDB,
    proposal: OptimizationProposal,
    userId: string,
    options: {
      expected: unknown;
      value: unknown;
      missingNote: string;
      modifiedNote?: string;
    },
  ): Promise<ProposalPublishReport> {
    const workflow = await this.loadWorkflow(tx, proposal.workflowDefinitionId);
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const index = nodes.findIndex((node) => node.id === proposal.nodeId);
    if (index === -1) {
      return { draftSynced: false, note: options.missingNote };
    }
    const data = isRecord(nodes[index].data) ? nodes[index].data : {};
    if (
      options.expected !== undefined &&
      !isDeepStrictEqual(
        getConfigPathValue(data, proposal.configPath),
        options.expected,
      )
    ) {
      return { draftSynced: false, note: options.modifiedNote ?? null };
    }

    let patched: Record<string, unknown>;
    try {
      patched = setConfigPathValue(data, proposal.configPath, options.value);
    } catch (error) {
      this.logger.warn(
        `提案 ${proposal.id} 草稿同步失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return { draftSynced: false, note: '草稿节点结构与补丁不符，未同步' };
    }
    const nextNodes = nodes.map((node, nodeIndex) =>
      nodeIndex === index ? { ...node, data: patched } : node,
    );
    await this.workflowVersionService.updateDefinition(
      proposal.workflowDefinitionId,
      userId,
      {
        version: workflow.version,
        nodes: nextNodes as unknown as Record<string, unknown>[],
      },
    );
    return { draftSynced: true, note: null };
  }

  private auditMetadata(proposal: OptimizationProposal): Record<string, unknown> {
    return {
      proposalId: proposal.id,
      proposalType: proposal.proposalType,
      nodeId: proposal.nodeId,
      configPath: proposal.configPath,
      currentValue: proposal.currentValue ?? null,
      proposedValue: proposal.proposedValue,
    };
  }

  private toSummary(
    proposal: OptimizationProposal,
    workflowName: string,
  ): ProposalSummary {
    return {
      id: proposal.id,
      workflowDefinitionId: proposal.workflowDefinitionId,
      workflowName,
      nodeId: proposal.nodeId,
      nodeType: proposal.nodeType,
      proposalType: proposal.proposalType,
      status: proposal.status,
      configPath: proposal.configPath,
      currentValue: proposal.currentValue ?? null,
      proposedValue: proposal.proposedValue,
      rationale: proposal.rationale,
      evidence: proposal.evidence,
      baseVersionId: proposal.baseVersionId,
      candidateVersionId: proposal.candidateVersionId,
      publishedVersionId: proposal.publishedVersionId,
      verdict: proposal.verdict,
      currentEvaluationId: proposal.currentEvaluationId,
      evaluatedAt: toIso(proposal.evaluatedAt),
      publishedAt: toIso(proposal.publishedAt),
      rolledBackAt: toIso(proposal.rolledBackAt),
      dismissedAt: toIso(proposal.dismissedAt),
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    };
  }

  private toEvaluation(
    evaluation: OptimizationEvaluation,
    runs: OptimizationEvaluationRun[],
  ): NonNullable<ProposalDetail['latestEvaluation']> {
    return {
      id: evaluation.id,
      proposalId: evaluation.proposalId,
      status: evaluation.status,
      baseVersionId: evaluation.baseVersionId,
      candidateVersionId: evaluation.candidateVersionId,
      caseCount: evaluation.cases.length,
      cases: evaluation.cases.map((item) => ({
        index: item.index,
        sourceExecutionId: item.sourceExecutionId,
      })),
      summary: evaluation.summary ?? null,
      failureReason: evaluation.failureReason ?? null,
      deadlineAt: evaluation.deadlineAt.toISOString(),
      startedAt: evaluation.startedAt.toISOString(),
      completedAt: toIso(evaluation.completedAt),
      runs: runs.map((run) => ({
        id: run.id,
        arm: run.arm,
        caseIndex: run.caseIndex,
        executionId: run.executionId,
        status: run.status,
        metrics: run.metrics ?? null,
        completedAt: toIso(run.completedAt),
      })),
    };
  }
}
