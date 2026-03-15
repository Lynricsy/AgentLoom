import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { routingDecisions } from '../../database/schema/routing-decisions.schema';
import { LlmService } from '../llm/llm.service';
import { getModelRoutingMeta } from '../llm/llm-provider-catalog';
import {
  tokenOptimized,
  costOptimized,
  qualityFirst,
  latencyFirst,
  historicalBest,
  fallbackChain,
} from './strategies';
import type { StrategyFn, ModelCandidate } from './strategies';
import type {
  RoutingStrategy,
  RoutingContext,
  RoutingDecisionResult,
} from './dto/routing-context.dto';
import { ROUTING_STRATEGIES } from './dto/routing-context.dto';
import type { QueryRoutingDecisionsDto } from './dto/query-routing-decisions.dto';
import {
  InvalidRoutingStrategyException,
  InsufficientModelsException,
} from './smart-routing.exceptions';

const STRATEGY_REGISTRY: Record<RoutingStrategy, StrategyFn> = {
  TOKEN_OPTIMIZED: tokenOptimized,
  COST_OPTIMIZED: costOptimized,
  QUALITY_FIRST: qualityFirst,
  LATENCY_FIRST: latencyFirst,
  HISTORICAL_BEST: historicalBest,
  FALLBACK_CHAIN: fallbackChain,
};

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
  ) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  async evaluate(
    modelConfigIds: string[],
    context: RoutingContext,
    strategy: RoutingStrategy,
    tenantId: string,
  ): Promise<RoutingDecisionResult> {
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

    const candidates: ModelCandidate[] = modelConfigs.map((config) => ({
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

    const sorted = [...evaluatedModels].sort((a, b) => b.score - a.score);
    const selected = sorted[0];

    const latencyMs = Math.round(performance.now() - startTime);

    this.logger.debug(
      `路由决策完成: strategy=${strategy}, selected=${selected.modelName}, score=${selected.score}, latency=${latencyMs}ms`,
    );

    return {
      selectedModelId: selected.modelId,
      strategy,
      reasoning: `策略 ${strategy} 选择了 ${selected.modelName} (${selected.provider})，得分 ${selected.score}/100。${selected.reasoning}`,
      evaluatedModels: sorted,
      latencyMs,
    };
  }

  async recordDecision(
    executionStepId: string,
    tenantId: string,
    routingNodeId: string,
    decision: RoutingDecisionResult,
  ): Promise<void> {
    await this.tenantDb.insert(routingDecisions).values({
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
    });
  }

  async findByExecution(
    tenantId: string,
    query: QueryRoutingDecisionsDto,
  ): Promise<{
    data: (typeof routingDecisions.$inferSelect)[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const { page, pageSize, executionId, routingNodeId } = query;

    const conditions = [];
    if (executionId) {
      conditions.push(eq(routingDecisions.executionStepId, executionId));
    }
    if (routingNodeId) {
      conditions.push(eq(routingDecisions.routingNodeId, routingNodeId));
    }

    const baseQuery = this.tenantDb
      .select({ total: sql<number>`count(*)::int` })
      .from(routingDecisions);

    for (const condition of conditions) {
      baseQuery.where(condition);
    }

    const [{ total }] = await baseQuery;

    const dataQuery = this.tenantDb
      .select()
      .from(routingDecisions)
      .orderBy(desc(routingDecisions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    for (const condition of conditions) {
      dataQuery.where(condition);
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
