import { Inject, Injectable, Logger } from '@nestjs/common';
import { TeamNodeConfigSchema, type TeamBudget } from '@agentloom/contracts';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  notExists,
  sql,
} from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  executionSteps,
  llmModelConfigs,
  optimizationEvaluationRuns,
  optimizationProposals,
  routingDecisions,
  teamRuns,
  workflowDefinitions,
  workflowExecutions,
  workflowVersions,
  type OptimizationProposal,
  type ReactFlowNode,
} from '../../database/schema';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { isRecord } from '../execution/node-value.util';
import {
  normalizeSmartRoutingStrategyName,
  resolveSmartRoutingStrategyConfig,
  resolveSmartRoutingStrategyValue,
} from '../execution/smart-routing-input.util';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import { ROUTING_ANALYZERS, TEAM_ANALYZERS } from './analyzers';
import type {
  EvidenceWindow,
  ProposalCandidate,
  RoutingNodeEvidence,
  TeamNodeEvidence,
} from './analyzers/optimization-analyzer.types';
import { OPTIMIZATION_EVIDENCE_WINDOW_DAYS } from './optimization-proposal.constants';
import { OptimizationWorkflowNodeNotSupportedException } from './optimization-proposal.exceptions';
import {
  OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES,
  type OptimizationProposalNodeType,
} from './optimization-proposal.types';

interface PublishedWorkflowRef {
  id: string;
  publishedVersionId: string;
}

const DAY_MS = 24 * 60 * 60_000;

/** 规范化后 `node.type` 是分类（team / smart-routing 都属 agent），具体类型在 `data.nodeType` */
export function resolveAnalyzableNodeType(
  node: ReactFlowNode,
): OptimizationProposalNodeType | null {
  const data = isRecord(node.data) ? node.data : {};
  const nodeType =
    typeof data.nodeType === 'string' && data.nodeType.length > 0
      ? data.nodeType
      : node.type;
  return nodeType === 'team' || nodeType === 'smart-routing' ? nodeType : null;
}

/** strategyConfig 在节点 data 中的位置；运行期按 `{...data.config, ...data}` 合并读取 */
function resolveStrategyConfigPath(
  data: Record<string, unknown>,
): string | null {
  if (isRecord(data.strategyConfig)) {
    return 'strategyConfig';
  }
  if (data.strategyConfig !== undefined || data.strategy_config !== undefined) {
    return null;
  }
  if (isRecord(data.config) && isRecord(data.config.strategyConfig)) {
    return 'config.strategyConfig';
  }
  return 'strategyConfig';
}

function sameBudget(a: TeamBudget, b: TeamBudget): boolean {
  return (
    a.maxTotalTokens === b.maxTotalTokens &&
    a.maxMessages === b.maxMessages &&
    a.deadlineMinutes === b.deadlineMinutes
  );
}

/**
 * 证据 → 提案：读取已发布版本中的 team / smart-routing 节点，按窗口内运行证据跑纯函数分析器，
 * 对每个 (工作流, 节点, 类型) 至多保留一条活跃提案。
 *
 * 评测执行（出现在 optimization_evaluation_runs 中的执行）不计入证据，避免评测自我强化。
 */
@Injectable()
export class OptimizationAnalysisService {
  private readonly logger = new Logger(OptimizationAnalysisService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 周期任务入口：跨租户读取有发布工作流的租户，逐租户分析，单租户失败只记日志 */
  async analyzeAllTenants(): Promise<void> {
    const tenants = await this.db
      .selectDistinct({ tenantId: workflowDefinitions.tenantId })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.status, 'published'),
          isNotNull(workflowDefinitions.publishedVersionId),
        ),
      );
    for (const { tenantId } of tenants) {
      try {
        const created = await this.analyzeTenant(tenantId);
        if (created.length > 0) {
          this.logger.log(`租户 ${tenantId} 新建优化提案 ${created.length} 条`);
        }
      } catch (error) {
        this.logger.warn(
          `租户 ${tenantId} 优化分析失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async analyzeTenant(tenantId: string): Promise<OptimizationProposal[]> {
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const workflows = await tx
        .select({
          id: workflowDefinitions.id,
          publishedVersionId: workflowDefinitions.publishedVersionId,
        })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.tenantId, tenantId),
            eq(workflowDefinitions.status, 'published'),
            isNotNull(workflowDefinitions.publishedVersionId),
          ),
        );
      const created: OptimizationProposal[] = [];
      for (const workflow of workflows) {
        if (!workflow.publishedVersionId) continue;
        created.push(
          ...(await this.analyzeWorkflowInTx(tx, tenantId, {
            id: workflow.id,
            publishedVersionId: workflow.publishedVersionId,
          })),
        );
      }
      return created;
    });
  }

  /** 手动分析单个工作流；返回本次新建的提案 */
  async analyzeWorkflow(
    tenantId: string,
    workflowId: string,
  ): Promise<OptimizationProposal[]> {
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [workflow] = await tx
        .select({
          id: workflowDefinitions.id,
          status: workflowDefinitions.status,
          publishedVersionId: workflowDefinitions.publishedVersionId,
        })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.id, workflowId),
            eq(workflowDefinitions.tenantId, tenantId),
          ),
        );
      if (!workflow) {
        throw new WorkflowNotFoundException(workflowId);
      }
      if (workflow.status !== 'published' || !workflow.publishedVersionId) {
        throw new WorkflowNotPublishedException(
          workflowId,
          '分析优化提案：分析只读取已发布版本的运行记录，请先发布并运行工作流',
        );
      }
      const ref = {
        id: workflow.id,
        publishedVersionId: workflow.publishedVersionId,
      };
      const nodes = await this.loadPublishedNodes(tx, ref);
      if (!nodes.some((node) => resolveAnalyzableNodeType(node) !== null)) {
        throw new OptimizationWorkflowNodeNotSupportedException(workflowId);
      }
      return this.analyzeNodes(tx, tenantId, ref, nodes);
    });
  }

  private async analyzeWorkflowInTx(
    tx: DrizzleDB,
    tenantId: string,
    workflow: PublishedWorkflowRef,
  ): Promise<OptimizationProposal[]> {
    const nodes = await this.loadPublishedNodes(tx, workflow);
    return this.analyzeNodes(tx, tenantId, workflow, nodes);
  }

  private async loadPublishedNodes(
    tx: DrizzleDB,
    workflow: PublishedWorkflowRef,
  ): Promise<ReactFlowNode[]> {
    const [version] = await tx
      .select({ snapshot: workflowVersions.snapshot })
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.id, workflow.publishedVersionId),
          eq(workflowVersions.workflowDefinitionId, workflow.id),
        ),
      );
    return version?.snapshot.nodes ?? [];
  }

  private async analyzeNodes(
    tx: DrizzleDB,
    tenantId: string,
    workflow: PublishedWorkflowRef,
    nodes: ReactFlowNode[],
  ): Promise<OptimizationProposal[]> {
    const end = new Date();
    const window: EvidenceWindow = {
      start: new Date(
        end.getTime() - OPTIMIZATION_EVIDENCE_WINDOW_DAYS * DAY_MS,
      ),
      end,
    };
    const created: OptimizationProposal[] = [];

    for (const node of nodes) {
      const nodeType = resolveAnalyzableNodeType(node);
      if (!nodeType) continue;
      const nodeData = isRecord(node.data) ? node.data : {};

      const candidates: ProposalCandidate[] = [];
      if (nodeType === 'team') {
        const evidence = await this.loadTeamEvidence(
          tx,
          workflow,
          node.id,
          nodeData,
          window,
        );
        if (evidence) {
          for (const analyze of TEAM_ANALYZERS) {
            const candidate = analyze(evidence);
            if (candidate) candidates.push(candidate);
          }
        }
      } else {
        const evidence = await this.loadRoutingEvidence(
          tx,
          workflow,
          node.id,
          nodeData,
          window,
        );
        for (const analyze of ROUTING_ANALYZERS) {
          const candidate = analyze(evidence);
          if (candidate) candidates.push(candidate);
        }
      }

      for (const candidate of candidates) {
        const proposal = await this.insertIfNoActive(
          tx,
          tenantId,
          workflow,
          node.id,
          nodeType,
          candidate,
        );
        if (proposal) created.push(proposal);
      }
    }
    return created;
  }

  private async loadTeamEvidence(
    tx: DrizzleDB,
    workflow: PublishedWorkflowRef,
    nodeId: string,
    nodeData: Record<string, unknown>,
    window: EvidenceWindow,
  ): Promise<TeamNodeEvidence | null> {
    const parsed = TeamNodeConfigSchema.safeParse(nodeData.config);
    if (!parsed.success) {
      return null;
    }
    const config = parsed.data;

    const rows = await tx
      .select({
        id: teamRuns.id,
        status: teamRuns.status,
        failureReason: teamRuns.failureReason,
        usedInputTokens: teamRuns.usedInputTokens,
        usedOutputTokens: teamRuns.usedOutputTokens,
        messageCount: teamRuns.messageCount,
        budgetMaxTotalTokens: teamRuns.budgetMaxTotalTokens,
        budgetMaxMessages: teamRuns.budgetMaxMessages,
        config: teamRuns.config,
      })
      .from(teamRuns)
      .innerJoin(
        workflowExecutions,
        eq(workflowExecutions.id, teamRuns.executionId),
      )
      .where(
        and(
          eq(workflowExecutions.workflowDefinitionId, workflow.id),
          eq(teamRuns.nodeId, nodeId),
          inArray(teamRuns.status, ['completed', 'failed']),
          gte(teamRuns.createdAt, window.start),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(optimizationEvaluationRuns)
              .where(
                eq(
                  optimizationEvaluationRuns.executionId,
                  teamRuns.executionId,
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(teamRuns.createdAt));

    // 只用与已发布配置同预算的运行作证据：旧预算下的失败不说明当前预算不够
    const runs = rows
      .filter(
        (row) =>
          row.config?.budget && sameBudget(row.config.budget, config.budget),
      )
      .map((row) => ({
        id: row.id,
        status: row.status,
        failureReason: row.failureReason ?? null,
        usedTotalTokens: row.usedInputTokens + row.usedOutputTokens,
        messageCount: row.messageCount,
        budgetMaxTotalTokens: row.budgetMaxTotalTokens,
        budgetMaxMessages: row.budgetMaxMessages,
        deadlineMinutes: row.config.budget.deadlineMinutes,
      }));

    return {
      workflowDefinitionId: workflow.id,
      nodeId,
      baseVersionId: workflow.publishedVersionId,
      nodeData,
      config,
      runs,
      window,
    };
  }

  private async loadRoutingEvidence(
    tx: DrizzleDB,
    workflow: PublishedWorkflowRef,
    nodeId: string,
    nodeData: Record<string, unknown>,
    window: EvidenceWindow,
  ): Promise<RoutingNodeEvidence> {
    const runtimeData = {
      ...(isRecord(nodeData.config) ? nodeData.config : {}),
      ...nodeData,
    };
    const decisions = await tx
      .select({
        id: routingDecisions.id,
        selectedModelId: routingDecisions.selectedModelId,
        fallbackReason: routingDecisions.fallbackReason,
      })
      .from(routingDecisions)
      .innerJoin(
        executionSteps,
        eq(executionSteps.id, routingDecisions.executionStepId),
      )
      .innerJoin(
        workflowExecutions,
        eq(workflowExecutions.id, executionSteps.executionId),
      )
      .where(
        and(
          eq(workflowExecutions.workflowDefinitionId, workflow.id),
          eq(routingDecisions.routingNodeId, nodeId),
          gte(routingDecisions.createdAt, window.start),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(optimizationEvaluationRuns)
              .where(
                eq(
                  optimizationEvaluationRuns.executionId,
                  workflowExecutions.id,
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(routingDecisions.createdAt));

    const modelIds = [
      ...new Set(
        decisions
          .map((decision) => decision.selectedModelId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const models =
      modelIds.length === 0
        ? []
        : await tx
            .select({ id: llmModelConfigs.id, name: llmModelConfigs.name })
            .from(llmModelConfigs)
            .where(inArray(llmModelConfigs.id, modelIds));

    return {
      workflowDefinitionId: workflow.id,
      nodeId,
      baseVersionId: workflow.publishedVersionId,
      nodeData,
      strategy: normalizeSmartRoutingStrategyName(
        resolveSmartRoutingStrategyValue(runtimeData),
      ),
      strategyConfig: resolveSmartRoutingStrategyConfig(runtimeData),
      strategyConfigPath: resolveStrategyConfigPath(nodeData),
      decisions,
      modelNames: new Map(models.map((model) => [model.id, model.name])),
      window,
    };
  }

  private async insertIfNoActive(
    tx: DrizzleDB,
    tenantId: string,
    workflow: PublishedWorkflowRef,
    nodeId: string,
    nodeType: OptimizationProposalNodeType,
    candidate: ProposalCandidate,
  ): Promise<OptimizationProposal | null> {
    const [active] = await tx
      .select({ id: optimizationProposals.id })
      .from(optimizationProposals)
      .where(
        and(
          eq(optimizationProposals.workflowDefinitionId, workflow.id),
          eq(optimizationProposals.nodeId, nodeId),
          eq(optimizationProposals.proposalType, candidate.proposalType),
          inArray(
            optimizationProposals.status,
            OPTIMIZATION_PROPOSAL_ACTIVE_STATUSES,
          ),
        ),
      )
      .limit(1);
    if (active) {
      return null;
    }

    // 并发分析撞上部分唯一索引时静默跳过
    const [inserted] = await tx
      .insert(optimizationProposals)
      .values({
        tenantId,
        workflowDefinitionId: workflow.id,
        nodeId,
        nodeType,
        proposalType: candidate.proposalType,
        status: 'proposed',
        configPath: candidate.configPath,
        currentValue: candidate.currentValue,
        proposedValue: candidate.proposedValue,
        rationale: candidate.rationale,
        evidence: candidate.evidence,
        baseVersionId: workflow.publishedVersionId,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted) {
      this.logger.log(
        `工作流 ${workflow.id} 节点 ${nodeId} 的 ${candidate.proposalType} 提案已被并发创建，跳过`,
      );
      return null;
    }
    return inserted;
  }
}
