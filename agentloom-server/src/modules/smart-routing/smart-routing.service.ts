import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, getTableColumns, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { executionSteps } from '../../database/schema/execution-steps.schema';
import { llmModelConfigs } from '../../database/schema/llm-model-configs.schema';
import { llmProviders } from '../../database/schema/llm-providers.schema';
import { routerModels } from '../../database/schema/router-models.schema';
import { routingDecisions } from '../../database/schema/routing-decisions.schema';
import { getModelRoutingMeta } from '../llm/llm-provider-catalog';
import { RouterRegistry } from './core/router-registry';
import type { RoutingCandidate } from './core/routing-candidate';
import type {
  RoutingFallbackReason,
  RoutingFallbackSource,
} from './core/routing-decision';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { EmbeddingIntegrationService } from './embedding/embedding.service';
import type { RoutingContext } from './dto/routing-context.dto';
import type {
  ProviderHealthStatusesResponseDtoType,
  ProviderHealthStatusDto,
} from './dto/provider-health.dto';
import type { QueryRoutingDecisionsDto } from './dto/query-routing-decisions.dto';
import type {
  SmartRoutingStrategyConfigSchemaResponseDtoType,
  SmartRoutingStrategiesResponseDtoType,
  SmartRoutingStrategyDto,
} from './dto/smart-routing-strategies.dto';

const PUBLIC_ROUTER_STRATEGY_NAMES = new Set([
  'random',
  'round_robin',
  'rules',
  'llm_as_router',
  'knn',
  'mlp',
  'elo',
  'memory_bank',
  'fallback_chain',
  'wasm_plugin',
]);

/** 路由决策的主体：工作流步骤或 Agent 对话（二选一，库表有 check 约束） */
export type RoutingDecisionSubject =
  | { executionStepId: string }
  | { conversationId: string };

export interface PersistedRoutingDecision {
  selectedModelId: string | null;
  strategy: string;
  reasoning: string;
  evaluatedModels: Array<{
    modelId: string;
    modelName: string;
    provider: string;
    score: number;
    reasoning: string;
  }>;
  latencyMs: number;
  routerType?: string;
  fallbackReason?: RoutingFallbackReason;
  fallbackSource?: RoutingFallbackSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

@Injectable()
export class SmartRoutingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly routerRegistry: RouterRegistry,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly embeddingService: EmbeddingIntegrationService,
  ) {
    void this.routerRegistry;
    void this.circuitBreakerService;
    void this.embeddingService;
  }

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  private buildWhereClause(conditions: Array<ReturnType<typeof eq>>) {
    if (conditions.length === 0) {
      return undefined;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return and(...conditions);
  }

  private isTerminalStepStatus(status: string): boolean {
    return ['completed', 'failed', 'cancelled', 'skipped'].includes(status);
  }

  private extractRoutingMarker(
    value: unknown,
  ): { routingStepId: string; selectedModelId: string } | undefined {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const match = this.extractRoutingMarker(item);
        if (match) {
          return match;
        }
      }

      return undefined;
    }

    if (typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    if (
      typeof record.routingStepId === 'string' &&
      typeof record.selectedModelId === 'string'
    ) {
      return {
        routingStepId: record.routingStepId,
        selectedModelId: record.selectedModelId,
      };
    }

    for (const nestedValue of Object.values(record)) {
      const match = this.extractRoutingMarker(nestedValue);
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  private resolveHistoricalDecisionOutcome(
    steps: Array<{
      id: string;
      nodeType: typeof executionSteps.$inferSelect.nodeType;
      status: typeof executionSteps.$inferSelect.status;
      input: typeof executionSteps.$inferSelect.input;
      checkpointData: typeof executionSteps.$inferSelect.checkpointData;
    }>,
    routingStepId: string,
    selectedModelId: string,
  ): boolean | undefined {
    const matchedSteps = steps.filter((step) => {
      if (step.id === routingStepId || step.nodeType !== 'agent') {
        return false;
      }

      const checkpointMarker = this.extractRoutingMarker(step.checkpointData);
      if (checkpointMarker) {
        return (
          checkpointMarker.routingStepId === routingStepId &&
          checkpointMarker.selectedModelId === selectedModelId
        );
      }

      const inputMarker = this.extractRoutingMarker(step.input);
      return (
        inputMarker?.routingStepId === routingStepId &&
        inputMarker.selectedModelId === selectedModelId
      );
    });

    if (matchedSteps.length === 0) {
      return undefined;
    }

    if (matchedSteps.some((step) => !this.isTerminalStepStatus(step.status))) {
      return undefined;
    }

    return matchedSteps.every((step) => step.status === 'completed');
  }

  async getHistoricalMetrics(
    tenantId: string,
    routingNodeId: string,
  ): Promise<NonNullable<RoutingContext['historicalMetrics']>> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const routingRows = await this.tenantDb
      .select({
        // 内连接保证与 routing_decisions.execution_step_id 相等且非空（对话路由决策不参与历史指标）
        routingStepId: executionSteps.id,
        executionId: executionSteps.executionId,
        selectedModelId: routingDecisions.selectedModelId,
        routingLatencyMs: routingDecisions.routingLatencyMs,
        createdAt: routingDecisions.createdAt,
      })
      .from(routingDecisions)
      .innerJoin(
        executionSteps,
        eq(executionSteps.id, routingDecisions.executionStepId),
      )
      .where(
        and(
          eq(routingDecisions.tenantId, tenantId),
          eq(routingDecisions.routingNodeId, routingNodeId),
          gte(routingDecisions.createdAt, since),
        ),
      );

    if (routingRows.length === 0) {
      return {};
    }

    const executionIds = Array.from(
      new Set(routingRows.map((row) => row.executionId)),
    );
    const stepRows = await this.tenantDb
      .select({
        id: executionSteps.id,
        executionId: executionSteps.executionId,
        nodeType: executionSteps.nodeType,
        status: executionSteps.status,
        input: executionSteps.input,
        checkpointData: executionSteps.checkpointData,
      })
      .from(executionSteps)
      .where(inArray(executionSteps.executionId, executionIds));

    const stepsByExecutionId = new Map<
      string,
      Array<{
        id: string;
        executionId: string;
        nodeType: typeof executionSteps.$inferSelect.nodeType;
        status: typeof executionSteps.$inferSelect.status;
        input: typeof executionSteps.$inferSelect.input;
        checkpointData: typeof executionSteps.$inferSelect.checkpointData;
      }>
    >();
    for (const step of stepRows) {
      const current = stepsByExecutionId.get(step.executionId) ?? [];
      current.push(step);
      stepsByExecutionId.set(step.executionId, current);
    }

    const routingRowsByStep = new Map<string, typeof routingRows>();
    for (const row of routingRows) {
      const current = routingRowsByStep.get(row.routingStepId) ?? [];
      current.push(row);
      routingRowsByStep.set(row.routingStepId, current);
    }

    const metrics = new Map<
      string,
      {
        total: number;
        success: number;
        latencySum: number;
        lastUsedAt: Date | null;
      }
    >();

    for (const rowsForRoutingStep of routingRowsByStep.values()) {
      const orderedRows = [...rowsForRoutingStep].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );

      orderedRows.forEach((row, index) => {
        if (!row.selectedModelId) {
          return;
        }

        const laterDecisionExists = index < orderedRows.length - 1;
        const outcome = laterDecisionExists
          ? false
          : this.resolveHistoricalDecisionOutcome(
              stepsByExecutionId.get(row.executionId) ?? [],
              row.routingStepId,
              row.selectedModelId,
            );

        if (outcome === undefined) {
          return;
        }

        const current = metrics.get(row.selectedModelId) ?? {
          total: 0,
          success: 0,
          latencySum: 0,
          lastUsedAt: null,
        };

        current.total += 1;
        current.latencySum += row.routingLatencyMs;
        if (outcome) {
          current.success += 1;
        }
        if (!current.lastUsedAt || row.createdAt > current.lastUsedAt) {
          current.lastUsedAt = row.createdAt;
        }

        metrics.set(row.selectedModelId, current);
      });
    }

    return Object.fromEntries(
      Array.from(metrics.entries()).map(([modelId, metric]) => [
        modelId,
        {
          successRate: metric.total > 0 ? metric.success / metric.total : 0,
          avgLatencyMs: metric.total > 0 ? metric.latencySum / metric.total : 0,
          avgTokenUsage: 0,
          ...(metric.lastUsedAt
            ? { lastUsedAt: metric.lastUsedAt.toISOString() }
            : {}),
        },
      ]),
    );
  }

  listStrategies(): SmartRoutingStrategiesResponseDtoType {
    const data: SmartRoutingStrategyDto[] = this.routerRegistry
      .list()
      .filter((strategy) => PUBLIC_ROUTER_STRATEGY_NAMES.has(strategy.name))
      .map((strategy) => ({
        name: strategy.name,
        category: strategy.category,
        requiresEmbedding: strategy.requiresEmbedding,
        configSchema: z.toJSONSchema(strategy.configSchema),
      }));

    return { data };
  }

  async getProviderHealthStatuses(
    tenantId: string,
  ): Promise<ProviderHealthStatusesResponseDtoType> {
    const statuses = await this.circuitBreakerService.listStatuses(tenantId);
    const data: ProviderHealthStatusDto[] = statuses.map((status) => ({
      providerName: status.provider,
      modelId: status.modelId,
      status: status.status,
      failureCount: status.failureCount,
      lastFailureAt: status.lastFailureAt,
    }));

    return { data };
  }

  getStrategyConfigSchema(
    name: string,
  ): SmartRoutingStrategyConfigSchemaResponseDtoType {
    try {
      const strategy = this.routerRegistry.get(name);

      return {
        data: {
          name: strategy.name,
          configSchema: z.toJSONSchema(strategy.configSchema),
        },
      };
    } catch (error) {
      throw new NotFoundException(
        error instanceof Error ? error.message : `Strategy "${name}" not found`,
      );
    }
  }

  /**
   * 按传入顺序加载候选模型：模型配置 + router_models 中的路由元数据（缺省回落到提供商目录）。
   * 不存在于本租户的模型配置 id 被忽略；健康状态由调用方经 HealthMonitorService 过滤。
   */
  async loadCandidates(
    modelConfigIds: string[],
    tenantId: string,
  ): Promise<RoutingCandidate[]> {
    if (modelConfigIds.length === 0) {
      return [];
    }

    const modelConfigs = await this.tenantDb
      .select({
        id: llmModelConfigs.id,
        name: llmModelConfigs.name,
        providerSlug: llmProviders.slug,
        modelId: llmModelConfigs.modelId,
      })
      .from(llmModelConfigs)
      .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
      .where(
        and(
          eq(llmModelConfigs.tenantId, tenantId),
          inArray(llmModelConfigs.id, modelConfigIds),
        ),
      );

    const routingMetadataRows = await this.tenantDb
      .select({
        modelConfigId: routerModels.modelId,
        providerName: routerModels.providerName,
        routingMeta: routerModels.routingMeta,
        eloRating: routerModels.eloRating,
      })
      .from(routerModels)
      .where(
        and(
          eq(routerModels.tenantId, tenantId),
          eq(routerModels.isActive, true),
          inArray(routerModels.modelId, modelConfigIds),
        ),
      );

    const configsById = new Map(
      modelConfigs.map((config) => [config.id, config]),
    );
    const routingMetadataById = new Map(
      routingMetadataRows.map((row) => [row.modelConfigId, row]),
    );

    const candidates: RoutingCandidate[] = [];

    for (const modelConfigId of modelConfigIds) {
      const modelConfig = configsById.get(modelConfigId);
      if (!modelConfig) {
        continue;
      }

      const routingMetadata = routingMetadataById.get(modelConfigId);
      const fallbackMeta = getModelRoutingMeta(
        modelConfig.providerSlug,
        modelConfig.modelId,
      );
      const rawRoutingMeta = isRecord(routingMetadata?.routingMeta)
        ? routingMetadata.routingMeta
        : undefined;
      const rawCosts = isRecord(rawRoutingMeta?.costs)
        ? rawRoutingMeta.costs
        : undefined;

      candidates.push({
        id: modelConfig.id,
        modelConfigId: modelConfig.id,
        name: modelConfig.name,
        provider: routingMetadata?.providerName ?? modelConfig.providerSlug,
        routingMeta: {
          contextWindow: readNumber(
            rawRoutingMeta?.contextWindow,
            fallbackMeta.contextWindow,
          ),
          costs: {
            input: readNumber(
              rawCosts?.inputPer1kTokens,
              fallbackMeta.costPer1kInputTokens,
            ),
            output: readNumber(
              rawCosts?.outputPer1kTokens,
              fallbackMeta.costPer1kOutputTokens,
            ),
          },
          qualityRank: readNumber(
            rawRoutingMeta?.qualityRank,
            fallbackMeta.qualityRank,
          ),
          avgLatencyMs: readNumber(
            rawRoutingMeta?.avgLatencyMs,
            fallbackMeta.avgLatencyMs,
          ),
          maxInputTokens: readNumber(
            rawRoutingMeta?.maxInputTokens,
            readNumber(rawRoutingMeta?.contextWindow, fallbackMeta.contextWindow),
          ),
          eloRating: readNumber(routingMetadata?.eloRating, 1200),
        },
        healthStatus: 'healthy',
      });
    }

    return candidates;
  }

  async recordDecision(
    subject: RoutingDecisionSubject,
    tenantId: string,
    routingNodeId: string,
    decision: PersistedRoutingDecision,
  ): Promise<string> {
    const [inserted] = await this.tenantDb
      .insert(routingDecisions)
      .values({
        ...('executionStepId' in subject
          ? { executionStepId: subject.executionStepId }
          : { conversationId: subject.conversationId }),
        tenantId,
        routingNodeId,
        strategy: decision.strategy,
        modelsEvaluated: decision.evaluatedModels.map((m) => ({
          modelId: m.modelId,
          modelName: m.modelName,
          provider: m.provider,
          score: m.score,
          reasoning: m.reasoning,
        })),
        selectedModelId: decision.selectedModelId,
        decisionReasoning: decision.reasoning,
        routingLatencyMs: decision.latencyMs,
        routerType: decision.routerType ?? null,
        fallbackReason: decision.fallbackReason ?? null,
        fallbackSource: decision.fallbackSource ?? null,
      })
      .returning({ id: routingDecisions.id });

    return inserted.id;
  }

  async findByExecution(
    tenantId: string,
    query: QueryRoutingDecisionsDto,
  ): Promise<{
    data: (typeof routingDecisions.$inferSelect)[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const { page, pageSize, executionId, routingNodeId } = query;

    const conditions = [eq(routingDecisions.tenantId, tenantId)];
    if (routingNodeId) {
      conditions.push(eq(routingDecisions.routingNodeId, routingNodeId));
    }
    if (executionId) {
      conditions.push(eq(executionSteps.executionId, executionId));
    }

    const whereClause = this.buildWhereClause(conditions);

    const baseQuery = this.tenantDb
      .select({ total: sql<number>`count(*)::int` })
      .from(routingDecisions)
      .innerJoin(
        executionSteps,
        eq(executionSteps.id, routingDecisions.executionStepId),
      );

    if (whereClause) {
      baseQuery.where(whereClause);
    }

    const [{ total }] = await baseQuery;

    const dataQuery = this.tenantDb
      .select(getTableColumns(routingDecisions))
      .from(routingDecisions)
      .innerJoin(
        executionSteps,
        eq(executionSteps.id, routingDecisions.executionStepId),
      )
      .orderBy(desc(routingDecisions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (whereClause) {
      dataQuery.where(whereClause);
    }

    const data = await dataQuery;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
