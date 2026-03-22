import type { QdrantClient } from '@qdrant/js-client-rest';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDB } from '../../../../database/database.module';
import { routerModels } from '../../../../database/schema/router-models.schema';
import { routingBenchmarks } from '../../../../database/schema/routing-benchmarks.schema';
import type { EmbeddingIntegrationService } from '../../embedding/embedding.service';
import { BaseRouterStrategy } from '../../core/base-router-strategy';
import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import type { RoutingDecision } from '../../core/routing-decision';

const ROUTING_MEMORY_COLLECTION = 'routing_memory';

const memoryBankRouterConfigSchema = z.object({
  alpha: z.number().default(0.5),
  beta: z.number().default(0.3),
  gamma: z.number().default(0.2),
  topK: z.number().int().default(10),
});

type MemoryBankRouterConfig = z.infer<typeof memoryBankRouterConfigSchema>;
type RoutingDb = Pick<DrizzleDB, 'select'>;
type RoutingMemoryClient = Pick<QdrantClient, 'search'>;
type EmbeddingServiceLike = Pick<EmbeddingIntegrationService, 'generateEmbedding'>;

interface RouterModelLookupRow {
  routerModelId: string;
  modelConfigId: string;
}

interface BenchmarkLookupRow {
  modelId: string;
  performanceScore: string | number;
  latencyMs: number;
  tokenCount: number;
}

interface QdrantSearchPoint {
  id: string | number;
  score: number;
  payload?: Record<string, unknown> | null;
}

interface AggregatedMemoryScore {
  performance: number;
  latency: number;
  cost: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number = 0): number {
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function clampUnitInterval(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export class MemoryBankRouter extends BaseRouterStrategy {
  readonly name = 'memory-bank';
  readonly category = 'rag' as const;
  readonly requiresEmbedding = true;
  readonly configSchema = memoryBankRouterConfigSchema;

  private readonly baseConfig: MemoryBankRouterConfig;

  constructor(
    private readonly db: RoutingDb,
    private readonly qdrantClient: RoutingMemoryClient,
    private readonly embeddingService: EmbeddingServiceLike,
    config: Partial<MemoryBankRouterConfig> = {},
  ) {
    super();
    this.baseConfig = this.configSchema.parse(config);
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const config = this.resolveConfig(context);
    const embedding = await this.resolveEmbedding(context);

    if (embedding) {
      const memoryDecision = await this.routeFromMemory(
        candidates,
        context,
        embedding,
        config,
      );
      if (memoryDecision) {
        return memoryDecision;
      }
    }

    const coldStartDecision = await this.routeFromBenchmarks(candidates, context, config);
    if (coldStartDecision) {
      return coldStartDecision;
    }

    return this.routeByQualityFallback(candidates, '缺少可用历史记忆');
  }

  private resolveConfig(context: RoutingContext): MemoryBankRouterConfig {
    return this.configSchema.parse({
      ...this.baseConfig,
      ...(context.strategyConfig ?? {}),
    });
  }

  private async resolveEmbedding(context: RoutingContext): Promise<number[] | null> {
    if (context.queryEmbedding && context.queryEmbedding.length > 0) {
      return context.queryEmbedding;
    }

    if (!context.queryText) {
      return null;
    }

    return this.embeddingService.generateEmbedding(context.queryText, context.tenantId);
  }

  private async routeFromMemory(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    embedding: number[],
    config: MemoryBankRouterConfig,
  ): Promise<RoutingDecision | null> {
    const results = (await this.qdrantClient.search(ROUTING_MEMORY_COLLECTION, {
      vector: embedding,
      limit: config.topK,
      score_threshold: undefined,
      filter: {
        must: [{ key: 'tenant_id', match: { value: context.tenantId } }],
      },
      with_payload: true,
    })) as QdrantSearchPoint[];

    const aggregatedByCandidateId = new Map<
      string,
      {
        weightSum: number;
        performanceSum: number;
        latencySum: number;
        costSum: number;
      }
    >();

    for (const point of results) {
      const payload = isRecord(point.payload) ? point.payload : {};
      const modelIdentifier = readString(payload.model_id);
      if (!modelIdentifier) {
        continue;
      }

      const candidate = this.resolveCandidate(candidates, modelIdentifier);
      if (!candidate) {
        continue;
      }

      const weight = Math.max(point.score, 0);
      const performance = clampUnitInterval(
        readNumber(payload.performance_score, readNumber(payload.success_rate, 0)),
      );
      const latency = readNumber(
        payload.latency_ms,
        readNumber(payload.avg_latency_ms, candidate.routingMeta.avgLatencyMs),
      );
      const cost = readNumber(
        payload.cost,
        readNumber(
          payload.avg_cost,
          this.estimateCost(
            readNumber(payload.token_count, context.inputTokenCount),
            candidate,
          ),
        ),
      );

      const current = aggregatedByCandidateId.get(candidate.id) ?? {
        weightSum: 0,
        performanceSum: 0,
        latencySum: 0,
        costSum: 0,
      };
      current.weightSum += weight;
      current.performanceSum += weight * performance;
      current.latencySum += weight * latency;
      current.costSum += weight * cost;
      aggregatedByCandidateId.set(candidate.id, current);
    }

    if (aggregatedByCandidateId.size === 0) {
      return null;
    }

    const scoreByCandidateId = this.computeCombinedScores(
      candidates,
      aggregatedByCandidateId,
      config,
    );

    return this.buildDecisionFromCombinedScores(
      candidates,
      scoreByCandidateId,
      'Memory Bank：基于相似历史任务的 performance/cost/latency 组合评分',
    );
  }

  private async routeFromBenchmarks(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    config: MemoryBankRouterConfig,
  ): Promise<RoutingDecision | null> {
    const routerModelRows = await this.loadRouterModels(candidates, context.tenantId);
    if (routerModelRows.length === 0) {
      return null;
    }

    const benchmarkRows = await this.loadBenchmarks(routerModelRows);
    if (benchmarkRows.length === 0) {
      return null;
    }

    const candidateByRouterModelId = new Map<string, RoutingCandidate>();
    for (const row of routerModelRows) {
      const candidate = candidates.find(
        (item) => item.modelConfigId === row.modelConfigId || item.id === row.modelConfigId,
      );
      if (candidate) {
        candidateByRouterModelId.set(row.routerModelId, candidate);
      }
    }

    const aggregatedByCandidateId = new Map<
      string,
      {
        weightSum: number;
        performanceSum: number;
        latencySum: number;
        costSum: number;
      }
    >();

    for (const row of benchmarkRows) {
      const candidate = candidateByRouterModelId.get(row.modelId);
      if (!candidate) {
        continue;
      }

      const current = aggregatedByCandidateId.get(candidate.id) ?? {
        weightSum: 0,
        performanceSum: 0,
        latencySum: 0,
        costSum: 0,
      };
      current.weightSum += 1;
      current.performanceSum += clampUnitInterval(readNumber(row.performanceScore, 0));
      current.latencySum += row.latencyMs;
      current.costSum += this.estimateCost(row.tokenCount, candidate);
      aggregatedByCandidateId.set(candidate.id, current);
    }

    if (aggregatedByCandidateId.size === 0) {
      return null;
    }

    const scoreByCandidateId = this.computeCombinedScores(
      candidates,
      aggregatedByCandidateId,
      config,
    );

    const decision = this.buildDecisionFromCombinedScores(
      candidates,
      scoreByCandidateId,
      'Memory Bank 冷启动：基于 routing_benchmarks 构建初始记忆评分',
    );

    return {
      ...decision,
      reasoning: `Memory Bank 冷启动：使用 routing_benchmarks 近似构建初始记忆，选择 ${candidates.find((candidate) => candidate.id === decision.selectedModelId)?.name ?? decision.selectedModelId}`,
    };
  }

  private computeCombinedScores(
    candidates: RoutingCandidate[],
    aggregatedByCandidateId: Map<
      string,
      {
        weightSum: number;
        performanceSum: number;
        latencySum: number;
        costSum: number;
      }
    >,
    config: MemoryBankRouterConfig,
  ): Map<string, number> {
    const averages = new Map<string, AggregatedMemoryScore>();
    for (const candidate of candidates) {
      const aggregated = aggregatedByCandidateId.get(candidate.id);
      if (!aggregated || aggregated.weightSum === 0) {
        continue;
      }

      averages.set(candidate.id, {
        performance: aggregated.performanceSum / aggregated.weightSum,
        latency: aggregated.latencySum / aggregated.weightSum,
        cost: aggregated.costSum / aggregated.weightSum,
      });
    }

    const maxLatency = Math.max(
      ...Array.from(averages.values(), (entry) => entry.latency),
      0,
    );
    const maxCost = Math.max(
      ...Array.from(averages.values(), (entry) => entry.cost),
      0,
    );
    const scoreByCandidateId = new Map<string, number>();

    for (const candidate of candidates) {
      const average = averages.get(candidate.id);
      if (!average) {
        scoreByCandidateId.set(candidate.id, 0);
        continue;
      }

      const latencyNormalized = maxLatency > 0 ? average.latency / maxLatency : 0;
      const costNormalized = maxCost > 0 ? average.cost / maxCost : 0;
      const combinedScore =
        config.alpha * clampUnitInterval(average.performance) +
        config.beta * (1 - costNormalized) +
        config.gamma * (1 - latencyNormalized);

      scoreByCandidateId.set(candidate.id, combinedScore * 100);
    }

    return scoreByCandidateId;
  }

  private buildDecisionFromCombinedScores(
    candidates: RoutingCandidate[],
    scoreByCandidateId: Map<string, number>,
    reasoning: string,
  ): RoutingDecision {
    const selectedCandidate = candidates.reduce((best, candidate) =>
      (scoreByCandidateId.get(candidate.id) ?? 0) > (scoreByCandidateId.get(best.id) ?? 0)
        ? candidate
        : best,
    );

    return {
      selectedModelId: selectedCandidate.id,
      scores: candidates.map((candidate) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score: scoreByCandidateId.get(candidate.id) ?? 0,
        reasoning,
      })),
      reasoning: `${reasoning}，选择 ${selectedCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }

  private estimateCost(tokenCount: number, candidate: RoutingCandidate): number {
    return (tokenCount / 1000) * candidate.routingMeta.costs.input;
  }

  private async loadRouterModels(
    candidates: RoutingCandidate[],
    tenantId: string,
  ): Promise<RouterModelLookupRow[]> {
    const modelConfigIds = Array.from(
      new Set(candidates.map((candidate) => candidate.modelConfigId)),
    );
    if (modelConfigIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        routerModelId: routerModels.id,
        modelConfigId: routerModels.modelId,
      })
      .from(routerModels)
      .where(
        and(
          eq(routerModels.tenantId, tenantId),
          inArray(routerModels.modelId, modelConfigIds),
        ),
      );
  }

  private async loadBenchmarks(
    routerModelRows: RouterModelLookupRow[],
  ): Promise<BenchmarkLookupRow[]> {
    const routerModelIds = routerModelRows.map((row) => row.routerModelId);
    if (routerModelIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        modelId: routingBenchmarks.modelId,
        performanceScore: routingBenchmarks.performanceScore,
        latencyMs: routingBenchmarks.latencyMs,
        tokenCount: routingBenchmarks.tokenCount,
      })
      .from(routingBenchmarks)
      .where(inArray(routingBenchmarks.modelId, routerModelIds));
  }

  private resolveCandidate(
    candidates: RoutingCandidate[],
    modelIdentifier: string,
  ): RoutingCandidate | null {
    return (
      candidates.find(
        (candidate) =>
          candidate.modelConfigId === modelIdentifier || candidate.id === modelIdentifier,
      ) ?? null
    );
  }

  private routeByQualityFallback(
    candidates: RoutingCandidate[],
    reason: string,
  ): RoutingDecision {
    const bestCandidate = candidates.reduce((best, candidate) =>
      candidate.routingMeta.qualityRank > best.routingMeta.qualityRank ? candidate : best,
    );
    const maxQuality = Math.max(
      ...candidates.map((candidate) => candidate.routingMeta.qualityRank),
    );

    return {
      selectedModelId: bestCandidate.id,
      scores: candidates.map((candidate) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score:
          maxQuality > 0
            ? (candidate.routingMeta.qualityRank / maxQuality) * 100
            : 0,
        reasoning: `Memory Bank 回退：${reason}`,
      })),
      reasoning: `Memory Bank 回退：${reason}，按质量排名选择 ${bestCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
