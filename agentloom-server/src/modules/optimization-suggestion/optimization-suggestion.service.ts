import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AnalysisMetadata } from '../../database/schema/optimization-suggestions.schema';

import { DomainException } from '../../common/exceptions/domain.exception';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  optimizationSuggestions,
  workflowDefinitions,
  type AutonomyUpgradeValue,
  type ModelDowngradeValue,
  type OptimizationSuggestion,
  type ReactFlowNode,
  type TimeoutAdjustmentValue,
  type ToolPruningValue,
  type WorkflowDefinition,
} from '../../database/schema';
import type { AutonomyMode } from '../agent/dto/autonomy.dto';
import {
  explainAutonomyViolation,
  normalizeAutonomyMode,
} from '../agent/autonomy-mode-compat';
import { syncAutonomyModeMirrors } from '../agent/autonomy-mode-mirrors';
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';
import { WorkflowVersionConflictException } from '../workflow-definition/workflow-version.exceptions';

type FindByTenantQuery = {
  limit?: number;
  offset?: number;
  status?: OptimizationSuggestion['status'];
  suggestionType?: OptimizationSuggestion['suggestionType'];
  workflowDefinitionId?: string;
  nodeId?: string;
};

type AdoptionStats = {
  total: number;
  applied: number;
  dismissed: number;
  pending: number;
  blocked: number;
  adoptionRate: number;
  targetRate: 0.5;
  byType: Array<{
    suggestionType: string;
    total: number;
    applied: number;
    dismissed: number;
    pending: number;
    blocked: number;
    adoptionRate: number;
  }>;
};

@Injectable()
export class OptimizationSuggestionService {
  private readonly logger = new Logger(OptimizationSuggestionService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
  ) {}

  async findByWorkflowAndNode(
    workflowDefinitionId: string,
    nodeId: string,
    status?: OptimizationSuggestion['status'],
  ): Promise<OptimizationSuggestion[]> {
    const filters = [
      eq(optimizationSuggestions.workflowDefinitionId, workflowDefinitionId),
      eq(optimizationSuggestions.nodeId, nodeId),
    ];

    if (status) {
      filters.push(eq(optimizationSuggestions.status, status));
    }

    return this.tenantDb
      .select()
      .from(optimizationSuggestions)
      .where(and(...filters))
      .orderBy(desc(optimizationSuggestions.createdAt));
  }

  async findByTenant(query: FindByTenantQuery): Promise<{
    data: OptimizationSuggestion[];
    meta: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const whereClause = this.buildSuggestionWhereClause(query);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(optimizationSuggestions)
        .where(whereClause)
        .orderBy(desc(optimizationSuggestions.createdAt))
        .limit(limit)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(optimizationSuggestions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  async findById(id: string): Promise<OptimizationSuggestion> {
    const [suggestion] = await this.tenantDb
      .select()
      .from(optimizationSuggestions)
      .where(eq(optimizationSuggestions.id, id));

    if (!suggestion) {
      throw this.createSuggestionNotFoundException(id);
    }

    return suggestion;
  }

  async applySuggestion(
    id: string,
    userId: string,
  ): Promise<OptimizationSuggestion> {
    const suggestion = await this.findById(id);
    this.assertSuggestionNotBlocked(suggestion);
    this.assertPendingSuggestion(suggestion);

    const [workflowDefinition] = await this.tenantDb
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, suggestion.workflowDefinitionId));

    if (!workflowDefinition) {
      throw new DomainException({
        type: 'OPTIMIZATION_SUGGESTION_WORKFLOW_NOT_FOUND',
        title: 'Workflow Not Found',
        status: 404,
        detail: `Workflow definition ${suggestion.workflowDefinitionId} not found`,
      });
    }

    await this.assertAutonomySuggestionAllowed(suggestion);

    const nodes = this.applySuggestionToWorkflowNode(workflowDefinition, suggestion);
    const now = new Date();

    this.logger.log(
      `Applying optimization suggestion ${id} for workflow ${suggestion.workflowDefinitionId}`,
    );

    return this.tenantDb.transaction(async (tx) => {
      const [updatedWorkflow] = await tx
        .update(workflowDefinitions)
        .set({
          nodes,
          version: workflowDefinition.version + 1,
          updatedAt: now,
          updatedBy: userId,
        })
        .where(
          and(
            eq(workflowDefinitions.id, suggestion.workflowDefinitionId),
            eq(workflowDefinitions.version, workflowDefinition.version),
          ),
        )
        .returning({ id: workflowDefinitions.id });

      if (!updatedWorkflow) {
        const [latestWorkflow] = await tx
          .select({ version: workflowDefinitions.version })
          .from(workflowDefinitions)
          .where(eq(workflowDefinitions.id, suggestion.workflowDefinitionId));

        throw new WorkflowVersionConflictException(
          suggestion.workflowDefinitionId,
          latestWorkflow?.version ?? workflowDefinition.version,
        );
      }

      const [updatedSuggestion] = await tx
        .update(optimizationSuggestions)
        .set({
          status: 'applied',
          appliedAt: now,
          appliedByUserId: userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(optimizationSuggestions.id, id),
            eq(optimizationSuggestions.status, 'pending'),
          ),
        )
        .returning();

      if (!updatedSuggestion) {
        const [latestSuggestion] = await tx
          .select({ status: optimizationSuggestions.status })
          .from(optimizationSuggestions)
          .where(eq(optimizationSuggestions.id, id));

        if (!latestSuggestion) {
          throw this.createSuggestionNotFoundException(id);
        }

        throw new DomainException({
          type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
          title: 'Suggestion Status Conflict',
          status: 409,
          detail: `Optimization suggestion ${id} is already ${latestSuggestion.status}`,
        });
      }

      return updatedSuggestion;
    });
  }

  async dismissSuggestion(
    id: string,
    userId: string,
  ): Promise<OptimizationSuggestion> {
    const suggestion = await this.findById(id);
    this.assertPendingSuggestion(suggestion);

    const now = new Date();
    const [updatedSuggestion] = await this.tenantDb
      .update(optimizationSuggestions)
      .set({
        status: 'dismissed',
        dismissedAt: now,
        dismissedByUserId: userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(optimizationSuggestions.id, id),
          eq(optimizationSuggestions.status, 'pending'),
        ),
      )
      .returning();

    if (!updatedSuggestion) {
      const [latestSuggestion] = await this.tenantDb
        .select({ status: optimizationSuggestions.status })
        .from(optimizationSuggestions)
        .where(eq(optimizationSuggestions.id, id));

      if (!latestSuggestion) {
        throw this.createSuggestionNotFoundException(id);
      }

      throw new DomainException({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        title: 'Suggestion Status Conflict',
        status: 409,
        detail: `Optimization suggestion ${id} is already ${latestSuggestion.status}`,
      });
    }

    return updatedSuggestion;
  }

  async getAdoptionStats(
    workflowDefinitionId?: string,
  ): Promise<AdoptionStats> {
    const whereClause = workflowDefinitionId
      ? eq(optimizationSuggestions.workflowDefinitionId, workflowDefinitionId)
      : undefined;
    const rows = await this.tenantDb
      .select({
        suggestionType: optimizationSuggestions.suggestionType,
        status: optimizationSuggestions.status,
      })
      .from(optimizationSuggestions)
      .where(whereClause);

    const summary = {
      total: rows.length,
      applied: 0,
      dismissed: 0,
      pending: 0,
      blocked: 0,
    };
    const byType = new Map<
      string,
      {
        total: number;
        applied: number;
        dismissed: number;
        pending: number;
        blocked: number;
      }
    >();

    for (const row of rows) {
      summary[row.status] += 1;
      const current = byType.get(row.suggestionType) ?? {
        total: 0,
        applied: 0,
        dismissed: 0,
        pending: 0,
        blocked: 0,
      };
      current.total += 1;
      current[row.status] += 1;
      byType.set(row.suggestionType, current);
    }

    return {
      total: summary.total,
      applied: summary.applied,
      dismissed: summary.dismissed,
      pending: summary.pending,
      blocked: summary.blocked,
      adoptionRate: this.calculateAdoptionRate(
        summary.applied,
        summary.dismissed,
      ),
      targetRate: 0.5,
      byType: [...byType.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([suggestionType, counts]) => ({
          suggestionType,
          total: counts.total,
          applied: counts.applied,
          dismissed: counts.dismissed,
          pending: counts.pending,
          blocked: counts.blocked,
          adoptionRate: this.calculateAdoptionRate(
            counts.applied,
            counts.dismissed,
          ),
        })),
    };
  }

  private buildSuggestionWhereClause(query: FindByTenantQuery) {
    const filters = [] as Array<ReturnType<typeof eq>>;

    if (query.status) {
      filters.push(eq(optimizationSuggestions.status, query.status));
    }

    if (query.suggestionType) {
      filters.push(
        eq(optimizationSuggestions.suggestionType, query.suggestionType),
      );
    }

    if (query.workflowDefinitionId) {
      filters.push(
        eq(
          optimizationSuggestions.workflowDefinitionId,
          query.workflowDefinitionId,
        ),
      );
    }

    if (query.nodeId) {
      filters.push(eq(optimizationSuggestions.nodeId, query.nodeId));
    }

    if (filters.length === 0) {
      return undefined;
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return and(...filters);
  }

  private applySuggestionToWorkflowNode(
    workflowDefinition: WorkflowDefinition,
    suggestion: OptimizationSuggestion,
  ): ReactFlowNode[] {
    let matched = false;

    const nodes = workflowDefinition.nodes.map((node) => {
      if (node.id !== suggestion.nodeId) {
        return node;
      }

      matched = true;
      const nodeData = this.asRecord(node.data);
      const config = this.asRecord(nodeData.config);
      let updatedNodeData: Record<string, unknown>;

      if (suggestion.suggestionType === 'autonomy_upgrade') {
        const suggestedValue = suggestion.suggestedValue as AutonomyUpgradeValue;
        const nextAutonomyMode: AutonomyMode = normalizeAutonomyMode(
          suggestedValue.autonomyMode,
        ).canonicalMode;
        updatedNodeData = syncAutonomyModeMirrors(
          {
            ...nodeData,
            config,
          },
          nextAutonomyMode,
        );
      } else {
        updatedNodeData = {
          ...nodeData,
          config: this.applyConfigUpdate(config, suggestion),
        };
      }

      return {
        ...node,
        data: {
          ...updatedNodeData,
        },
      };
    });

    if (!matched) {
      throw new DomainException({
        type: 'OPTIMIZATION_SUGGESTION_NODE_NOT_FOUND',
        title: 'Suggestion Node Not Found',
        status: 404,
        detail: `Workflow node ${suggestion.nodeId} not found in workflow ${workflowDefinition.id}`,
      });
    }

    return nodes;
  }

  private applyConfigUpdate(
    config: Record<string, unknown>,
    suggestion: OptimizationSuggestion,
  ): Record<string, unknown> {
    switch (suggestion.suggestionType) {
      case 'model_downgrade': {
        const suggestedValue = suggestion.suggestedValue as ModelDowngradeValue;
        return {
          ...config,
          modelId: suggestedValue.modelId,
          modelName: suggestedValue.modelName,
          provider: suggestedValue.provider,
        };
      }
      case 'timeout_adjustment': {
        const suggestedValue = suggestion.suggestedValue as TimeoutAdjustmentValue;
        return {
          ...config,
          timeoutMs: suggestedValue.timeoutMs,
        };
      }
      case 'tool_pruning': {
        const suggestedValue = suggestion.suggestedValue as ToolPruningValue;
        return {
          ...config,
          tools: suggestedValue.tools,
        };
      }
      default:
        return config;
    }
  }

  private assertPendingSuggestion(suggestion: OptimizationSuggestion): void {
    if (suggestion.status === 'pending') {
      return;
    }

    throw new DomainException({
      type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
      title: 'Suggestion Status Conflict',
      status: 409,
      detail: `Optimization suggestion ${suggestion.id} is already ${suggestion.status}`,
    });
  }

  private assertSuggestionNotBlocked(suggestion: OptimizationSuggestion): void {
    if (suggestion.status !== 'blocked') {
      return;
    }

    throw this.createPolicyBlockedException(suggestion);
  }

  private async assertAutonomySuggestionAllowed(
    suggestion: OptimizationSuggestion,
  ): Promise<void> {
    if (suggestion.suggestionType !== 'autonomy_upgrade') {
      return;
    }

    const suggestedValue = this.asRecord(suggestion.suggestedValue);
    const autonomyMode = this.readString(
      suggestedValue.autonomyMode,
      suggestedValue.mode,
    );

    if (!autonomyMode) {
      return;
    }

    const autonomyCap =
      await this.organizationAutonomyPolicyService.resolveAutonomyCapForTenant(
        suggestion.tenantId,
      );
    const explanation = explainAutonomyViolation(autonomyMode, autonomyCap);

    if (!explanation.exceedsCap) {
      return;
    }

    const blockedSuggestion = await this.blockSuggestionByPolicy(
      suggestion,
      autonomyCap,
      explanation,
    );

    throw this.createPolicyBlockedException(blockedSuggestion);
  }

  private async blockSuggestionByPolicy(
    suggestion: OptimizationSuggestion,
    autonomyCap: string,
    explanation: ReturnType<typeof explainAutonomyViolation>,
  ): Promise<OptimizationSuggestion> {
    const now = new Date();
    const analysisMetadata = this.asRecord(suggestion.analysisMetadata);
    const [blockedSuggestion] = await this.tenantDb
      .update(optimizationSuggestions)
      .set({
        status: 'blocked',
        analysisMetadata: this.buildBlockedAnalysisMetadata(
          analysisMetadata,
          autonomyCap,
          explanation,
          now,
        ),
        updatedAt: now,
      })
      .where(
        and(
          eq(optimizationSuggestions.id, suggestion.id),
          eq(optimizationSuggestions.status, 'pending'),
        ),
      )
      .returning();

    if (blockedSuggestion) {
      return blockedSuggestion;
    }

    return this.findById(suggestion.id);
  }

  private createPolicyBlockedException(
    suggestion: OptimizationSuggestion,
  ): DomainException {
    const analysisMetadata = this.asRecord(suggestion.analysisMetadata);
    const policyBlock = this.asRecord(analysisMetadata.policyBlock);
    const detail =
      this.readString(policyBlock.message) ??
      `Optimization suggestion ${suggestion.id} is blocked by the current organization autonomy policy`;

    return new DomainException({
      type: 'OPTIMIZATION_SUGGESTION_POLICY_BLOCKED',
      title: 'Suggestion Blocked By Organization Policy',
      status: 422,
      detail,
      errors: [
        {
          field: 'suggestedValue.autonomyMode',
          message: detail,
        },
      ],
      extensions: {
        autonomyCap: this.readString(policyBlock.autonomyCap) ?? null,
        reasonCode: this.readString(policyBlock.reasonCode) ?? null,
        replacementMode: this.readString(policyBlock.replacementMode) ?? null,
      },
    });
  }

  private buildBlockedAnalysisMetadata(
    analysisMetadata: Record<string, unknown>,
    autonomyCap: string,
    explanation: ReturnType<typeof explainAutonomyViolation>,
    blockedAt: Date,
  ): AnalysisMetadata {
    return {
      ...analysisMetadata,
      totalRecords: this.readNumber(analysisMetadata.totalRecords) ?? 0,
      analyzerVersion:
        this.readString(analysisMetadata.analyzerVersion) ??
        'optimization-analysis-v1',
      policyBlock: {
        autonomyCap,
        rawMode: explanation.rawMode,
        canonicalMode: explanation.canonicalMode,
        replacementMode: explanation.replacementMode,
        source: explanation.source,
        reasonCode: explanation.reasonCode,
        message: explanation.message,
        blockedAt: blockedAt.toISOString(),
      },
    };
  }

  private calculateAdoptionRate(applied: number, dismissed: number): number {
    const denominator = applied + dismissed;

    if (denominator === 0) {
      return 0;
    }

    return applied / denominator;
  }

  private createSuggestionNotFoundException(id: string): DomainException {
    return new DomainException({
      type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
      title: 'Suggestion Not Found',
      status: 404,
      detail: `Optimization suggestion ${id} not found`,
    });
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private readString(...values: unknown[]): string | null {
    const resolved = values.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return resolved ?? null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }
}
