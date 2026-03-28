import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, getTableColumns, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { executionSteps } from '../../database/schema/execution-steps.schema';
import { routingDecisions } from '../../database/schema/routing-decisions.schema';
import { LlmService } from '../llm/llm.service';
import { getModelRoutingMeta } from '../llm/llm-provider-catalog';
import { RouterRegistry } from './core/router-registry';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import {
  tokenOptimized,
  costOptimized,
  qualityFirst,
  latencyFirst,
  historicalBest,
  fallbackChain,
} from './strategies';
import type { StrategyFn, ModelCandidate } from './strategies';
import { EmbeddingIntegrationService } from './embedding/embedding.service';
import type {
  RoutingStrategy,
  RoutingContext,
  RoutingDecisionResult,
} from './dto/routing-context.dto';
import { ROUTING_STRATEGIES } from './dto/routing-context.dto';
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
import {
  InvalidRoutingStrategyException,
  InsufficientModelsException,
} from './smart-routing.exceptions';

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

const STRATEGY_REGISTRY: Record<RoutingStrategy, StrategyFn> = {
  TOKEN_OPTIMIZED: tokenOptimized,
  COST_OPTIMIZED: costOptimized,
  QUALITY_FIRST: qualityFirst,
  LATENCY_FIRST: latencyFirst,
  HISTORICAL_BEST: historicalBest,
  FALLBACK_CHAIN: fallbackChain,
};

interface PersistedRoutingDecision {
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
}

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
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

  private touchNewRoutingDependencies(): void {
    void this.routerRegistry;
    void this.circuitBreakerService;
    void this.embeddingService;
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
        routingStepId: routingDecisions.executionStepId,
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
   * @deprecated 已由 RouterRegistry + BaseRouterStrategy 路径取代，仅保留给旧调用方兼容使用。
   */
  async evaluate(
    modelConfigIds: string[],
    context: RoutingContext,
    strategy: RoutingStrategy,
    tenantId: string,
  ): Promise<RoutingDecisionResult> {
    this.touchNewRoutingDependencies();

    if (!ROUTING_STRATEGIES.includes(strategy)) {
      throw new InvalidRoutingStrategyException(strategy);
    }

    if (modelConfigIds.length < 2) {
      throw new InsufficientModelsException(modelConfigIds.length);
    }

    const startTime = performance.now();

    const modelConfigs = await this.llmService.findByIds(
      modelConfigIds,
      tenantId,
    );

    const configsById = new Map(
      modelConfigs.map((config) => [config.id, config]),
    );
    const orderedModelConfigs = modelConfigIds
      .map((id) => configsById.get(id))
      .filter((config): config is NonNullable<typeof config> =>
        Boolean(config),
      );

    const candidates: ModelCandidate[] = orderedModelConfigs.map((config) => ({
      id: config.id,
      name: config.modelName,
      provider: config.provider,
      routingMeta: getModelRoutingMeta(config.provider, config.modelName),
    }));

    if (candidates.length < 2) {
      throw new InsufficientModelsException(candidates.length);
    }

    const strategyFn = STRATEGY_REGISTRY[strategy];
    const evaluatedModels = strategyFn(candidates, context);
    const selected = evaluatedModels[0];

    const latencyMs = Math.round(performance.now() - startTime);

    this.logger.debug(
      `路由决策完成: strategy=${strategy}, selected=${selected.modelName}, score=${selected.score}, latency=${latencyMs}ms`,
    );

    return {
      selectedModelId: selected.modelId,
      strategy,
      reasoning: `策略 ${strategy} 选择了 ${selected.modelName} (${selected.provider})，得分 ${selected.score}/100。${selected.reasoning}`,
      evaluatedModels,
      latencyMs,
    };
  }

  async recordDecision(
    executionStepId: string,
    tenantId: string,
    routingNodeId: string,
    decision: PersistedRoutingDecision,
  ): Promise<string> {
    this.touchNewRoutingDependencies();

    const [inserted] = await this.tenantDb
      .insert(routingDecisions)
      .values({
        executionStepId,
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
