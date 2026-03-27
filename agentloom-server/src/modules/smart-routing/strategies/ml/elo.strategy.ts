import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDB } from '../../../../database/database.module';
import { routerModels } from '../../../../database/schema/router-models.schema';
import { BaseRouterStrategy } from '../../core/base-router-strategy';
import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import type { RoutingDecision } from '../../core/routing-decision';

const eloRouterConfigSchema = z.object({
  kFactor: z.number().min(1).max(64).default(32),
  explorationRate: z.number().min(0).max(1).default(0.1),
});

type EloRouterConfig = z.infer<typeof eloRouterConfigSchema>;
type RoutingDb = Pick<DrizzleDB, 'select'>;

interface RouterRatingRow {
  modelConfigId: string;
  eloRating: string | number;
}

function readNumber(value: string | number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class EloRouter extends BaseRouterStrategy {
  readonly name = 'elo';
  readonly category = 'ml' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = eloRouterConfigSchema;

  private readonly baseConfig: EloRouterConfig;

  constructor(
    private readonly db: RoutingDb,
    config: Partial<EloRouterConfig> = {},
  ) {
    super();
    this.baseConfig = this.configSchema.parse(config);
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const config = this.resolveConfig(context);
    const ratingByCandidateId = await this.loadRatings(
      candidates,
      context.tenantId,
    );
    const scoredCandidates = candidates.map((candidate) => ({
      candidate,
      rating:
        ratingByCandidateId.get(candidate.id) ??
        candidate.routingMeta.eloRating,
    }));

    const topCandidate = scoredCandidates.reduce((best, current) =>
      current.rating > best.rating ? current : best,
    );
    const shouldExplore =
      config.explorationRate > 0 && Math.random() < config.explorationRate;
    const selectedCandidate = shouldExplore
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : topCandidate.candidate;

    const minRating = Math.min(
      ...scoredCandidates.map((entry) => entry.rating),
    );
    const maxRating = Math.max(
      ...scoredCandidates.map((entry) => entry.rating),
    );

    return {
      selectedModelId: selectedCandidate.id,
      scores: scoredCandidates.map(({ candidate, rating }) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score:
          maxRating === minRating
            ? 100
            : ((rating - minRating) / (maxRating - minRating)) * 100,
        reasoning: `Elo 评分路由（K=${config.kFactor}）`,
      })),
      reasoning: shouldExplore
        ? `Elo 路由：按 ${config.explorationRate} 的探索率随机选择 ${selectedCandidate.name}`
        : `Elo 路由：选择 Elo 评分最高的 ${selectedCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }

  private resolveConfig(context: RoutingContext): EloRouterConfig {
    return this.configSchema.parse({
      ...this.baseConfig,
      ...(context.strategyConfig ?? {}),
    });
  }

  private async loadRatings(
    candidates: RoutingCandidate[],
    tenantId: string,
  ): Promise<Map<string, number>> {
    const modelConfigIds = Array.from(
      new Set(candidates.map((candidate) => candidate.modelConfigId)),
    );
    if (modelConfigIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        modelConfigId: routerModels.modelId,
        eloRating: routerModels.eloRating,
      })
      .from(routerModels)
      .where(
        and(
          eq(routerModels.tenantId, tenantId),
          inArray(routerModels.modelId, modelConfigIds),
        ),
      );

    const ratingByModelConfigId = new Map(
      rows.map((row: RouterRatingRow) => [
        row.modelConfigId,
        readNumber(row.eloRating, 1500),
      ]),
    );

    return new Map(
      candidates.map((candidate) => [
        candidate.id,
        ratingByModelConfigId.get(candidate.modelConfigId) ??
          candidate.routingMeta.eloRating,
      ]),
    );
  }
}
