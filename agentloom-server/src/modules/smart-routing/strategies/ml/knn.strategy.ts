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
import type { RoutingDecision, ModelScore } from '../../core/routing-decision';

const ROUTING_MEMORY_COLLECTION = 'routing_memory';

const knnRouterConfigSchema = z.object({
  k: z.number().int().min(1).max(50).default(5),
  minScore: z.number().min(0).max(1).default(0.5),
});

type KnnRouterConfig = z.infer<typeof knnRouterConfigSchema>;
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

export class KnnRouter extends BaseRouterStrategy {
  readonly name = 'knn';
  readonly category = 'ml' as const;
  readonly requiresEmbedding = true;
  readonly configSchema = knnRouterConfigSchema;

  private readonly baseConfig: KnnRouterConfig;

  constructor(
    private readonly db: RoutingDb,
    private readonly qdrantClient: RoutingMemoryClient,
    private readonly embeddingService: EmbeddingServiceLike,
    config: Partial<KnnRouterConfig> = {},
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
      const qdrantDecision = await this.routeFromQdrant(
        candidates,
        context,
        embedding,
        config,
      );
      if (qdrantDecision) {
        return qdrantDecision;
      }
    }

    const coldStartDecision = await this.routeFromBenchmarks(candidates, context);
    if (coldStartDecision) {
      return coldStartDecision;
    }

    return this.routeByQualityFallback(candidates, '缺少可用近邻与基准数据');
  }

  private resolveConfig(context: RoutingContext): KnnRouterConfig {
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

  private async routeFromQdrant(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    embedding: number[],
    config: KnnRouterConfig,
  ): Promise<RoutingDecision | null> {
    const results = (await this.qdrantClient.search(ROUTING_MEMORY_COLLECTION, {
      vector: embedding,
      limit: config.k,
      score_threshold: config.minScore,
      filter: {
        must: [{ key: 'tenant_id', match: { value: context.tenantId } }],
      },
      with_payload: true,
    })) as QdrantSearchPoint[];

    const scoreByCandidateId = new Map(candidates.map((candidate) => [candidate.id, 0]));
    let contributingNeighbors = 0;

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

      const similarity = Math.max(point.score, 0);
      const performanceScore = clampUnitInterval(
        readNumber(payload.performance_score, 0),
      );
      const voteWeight = similarity * performanceScore;

      scoreByCandidateId.set(
        candidate.id,
        (scoreByCandidateId.get(candidate.id) ?? 0) + voteWeight,
      );
      contributingNeighbors += 1;
    }

    if (contributingNeighbors === 0) {
      return null;
    }

    const rawVotes = candidates.map((candidate) => ({
      candidate,
      vote: scoreByCandidateId.get(candidate.id) ?? 0,
    }));
    const topVote = Math.max(...rawVotes.map((entry) => entry.vote));
    const winner = rawVotes.reduce((best, current) =>
      current.vote > best.vote ? current : best,
    );

    return {
      selectedModelId: winner.candidate.id,
      scores: this.buildNormalizedScores(
        candidates,
        scoreByCandidateId,
        topVote,
        '基于相似邻居加权投票',
      ),
      reasoning: `KNN 路由：基于 ${contributingNeighbors} 个相似邻居加权投票，选择 ${winner.candidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }

  private async routeFromBenchmarks(
    candidates: RoutingCandidate[],
    context: RoutingContext,
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

    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of benchmarkRows) {
      const candidate = candidateByRouterModelId.get(row.modelId);
      if (!candidate) {
        continue;
      }

      const current = totals.get(candidate.id) ?? { sum: 0, count: 0 };
      current.sum += clampUnitInterval(readNumber(row.performanceScore, 0));
      current.count += 1;
      totals.set(candidate.id, current);
    }

    if (totals.size === 0) {
      return null;
    }

    const averageScores = new Map<string, number>();
    for (const candidate of candidates) {
      const total = totals.get(candidate.id);
      averageScores.set(candidate.id, total ? total.sum / total.count : 0);
    }

    const winner = candidates.reduce((best, candidate) =>
      (averageScores.get(candidate.id) ?? 0) > (averageScores.get(best.id) ?? 0)
        ? candidate
        : best,
    );

    const scores: ModelScore[] = candidates.map((candidate) => ({
      modelId: candidate.id,
      modelName: candidate.name,
      provider: candidate.provider,
      score: (averageScores.get(candidate.id) ?? 0) * 100,
      reasoning: 'KNN 冷启动：使用 routing_benchmarks 平均 performance_score',
    }));

    return {
      selectedModelId: winner.id,
      scores,
      reasoning: `KNN 冷启动：根据 routing_benchmarks 平均 performance_score 选择 ${winner.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
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

  private buildNormalizedScores(
    candidates: RoutingCandidate[],
    rawVotes: Map<string, number>,
    maxVote: number,
    reasoning: string,
  ): ModelScore[] {
    return candidates.map((candidate) => ({
      modelId: candidate.id,
      modelName: candidate.name,
      provider: candidate.provider,
      score: maxVote > 0 ? ((rawVotes.get(candidate.id) ?? 0) / maxVote) * 100 : 0,
      reasoning,
    }));
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
        reasoning: `KNN 回退：${reason}`,
      })),
      reasoning: `KNN 回退：${reason}，按质量排名选择 ${bestCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
