import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDB } from '../../../../database/database.module';
import { routerModels } from '../../../../database/schema/router-models.schema';
import {
  routingBenchmarks,
  type RoutingBenchmarkMlpWeights,
} from '../../../../database/schema/routing-benchmarks.schema';
import type { EmbeddingIntegrationService } from '../../embedding/embedding.service';
import { BaseRouterStrategy } from '../../core/base-router-strategy';
import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import type { RoutingDecision } from '../../core/routing-decision';
import { matmul, relu, softmax } from './ml-math.utils';

const mlpRouterConfigSchema = z.object({
  temperature: z.number().min(0.1).max(2.0).default(1.0),
});

type MlpRouterConfig = z.infer<typeof mlpRouterConfigSchema>;
type RoutingDb = Pick<DrizzleDB, 'select'>;
type EmbeddingServiceLike = Pick<
  EmbeddingIntegrationService,
  'generateEmbedding'
>;

interface RouterModelLookupRow {
  routerModelId: string;
  modelConfigId: string;
}

interface BenchmarkWeightsRow {
  modelId: string;
  mlpWeights: RoutingBenchmarkMlpWeights | null;
  createdAt: Date;
}

function readVectorDimension(weights: RoutingBenchmarkMlpWeights): number {
  return weights.layers[0]?.weights[0]?.length ?? 0;
}

function isTwoLayerWeights(
  weights: RoutingBenchmarkMlpWeights | null,
): weights is RoutingBenchmarkMlpWeights {
  if (!weights) {
    return false;
  }

  return Array.isArray(weights.layers) && weights.layers.length >= 2;
}

function buildZeroVector(length: number): number[] {
  return Array.from({ length }, () => 0);
}

export class MlpRouter extends BaseRouterStrategy {
  readonly name = 'mlp';
  readonly category = 'ml' as const;
  readonly requiresEmbedding = true;
  readonly configSchema = mlpRouterConfigSchema;

  private readonly baseConfig: MlpRouterConfig;

  constructor(
    private readonly db: RoutingDb,
    private readonly embeddingService: EmbeddingServiceLike,
    config: Partial<MlpRouterConfig> = {},
  ) {
    super();
    this.baseConfig = this.configSchema.parse(config);
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const config = this.resolveConfig(context);
    const routerModelRows = await this.loadRouterModels(
      candidates,
      context.tenantId,
    );
    const benchmarkRows = await this.loadBenchmarkWeights(routerModelRows);
    const resolvedWeights = this.pickUsableWeights(
      benchmarkRows,
      candidates.length,
      context.queryEmbedding?.length,
    );

    if (!resolvedWeights) {
      return this.routeByQualityFallback(candidates, '缺少可用的 MLP 权重');
    }

    const inputDimension = readVectorDimension(resolvedWeights);
    const embedding = await this.resolveEmbedding(context);
    const inputVector =
      embedding && embedding.length === inputDimension
        ? embedding
        : buildZeroVector(inputDimension);

    const hidden = relu(
      this.forwardDenseLayer(
        resolvedWeights.layers[0].weights,
        resolvedWeights.layers[0].biases,
        inputVector,
      ),
    );
    const logits = this.forwardDenseLayer(
      resolvedWeights.layers[1].weights,
      resolvedWeights.layers[1].biases,
      hidden,
    );
    const probabilities = softmax(logits, config.temperature);

    const bestIndex = probabilities.reduce(
      (best, probability, index) =>
        probability > probabilities[best] ? index : best,
      0,
    );
    const selectedCandidate = candidates[bestIndex];

    return {
      selectedModelId: selectedCandidate.id,
      scores: candidates.map((candidate, index) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score: (probabilities[index] ?? 0) * 100,
        reasoning: '基于两层 MLP 前向传播概率输出',
      })),
      reasoning: `MLP 路由：使用两层前向传播选择 ${selectedCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }

  private resolveConfig(context: RoutingContext): MlpRouterConfig {
    return this.configSchema.parse({
      ...this.baseConfig,
      ...(context.strategyConfig ?? {}),
    });
  }

  private async resolveEmbedding(
    context: RoutingContext,
  ): Promise<number[] | null> {
    if (context.queryEmbedding && context.queryEmbedding.length > 0) {
      return context.queryEmbedding;
    }

    if (!context.queryText) {
      return null;
    }

    return this.embeddingService.generateEmbedding(
      context.queryText,
      context.tenantId,
    );
  }

  private forwardDenseLayer(
    weights: number[][],
    biases: number[],
    inputVector: number[],
  ): number[] {
    if (weights.length !== biases.length) {
      throw new Error('MLP weights and biases shape mismatch');
    }

    const multiplied = matmul(
      weights,
      inputVector.map((value) => [value]),
    );

    return multiplied.map((row, index) => (row[0] ?? 0) + biases[index]);
  }

  private pickUsableWeights(
    rows: BenchmarkWeightsRow[],
    candidateCount: number,
    embeddingDimension?: number,
  ): RoutingBenchmarkMlpWeights | null {
    const orderedRows = [...rows].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    for (const row of orderedRows) {
      if (!isTwoLayerWeights(row.mlpWeights)) {
        continue;
      }

      const [firstLayer, secondLayer] = row.mlpWeights.layers;
      const inputDimension = firstLayer.weights[0]?.length ?? 0;
      const hiddenDimension = firstLayer.biases.length;
      const outputDimension = secondLayer.biases.length;
      const firstLayerMatches =
        firstLayer.weights.length === hiddenDimension &&
        firstLayer.weights.every(
          (layerWeights) => layerWeights.length === inputDimension,
        );
      const secondLayerMatches =
        secondLayer.weights.length === outputDimension &&
        secondLayer.weights.every(
          (layerWeights) => layerWeights.length === hiddenDimension,
        );
      const inputMatches =
        embeddingDimension === undefined ||
        embeddingDimension === inputDimension;

      if (
        firstLayerMatches &&
        secondLayerMatches &&
        outputDimension === candidateCount &&
        inputMatches
      ) {
        return row.mlpWeights;
      }
    }

    return null;
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

  private async loadBenchmarkWeights(
    routerModelRows: RouterModelLookupRow[],
  ): Promise<BenchmarkWeightsRow[]> {
    const routerModelIds = routerModelRows.map((row) => row.routerModelId);
    if (routerModelIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        modelId: routingBenchmarks.modelId,
        mlpWeights: routingBenchmarks.mlpWeights,
        createdAt: routingBenchmarks.createdAt,
      })
      .from(routingBenchmarks)
      .where(inArray(routingBenchmarks.modelId, routerModelIds));
  }

  private routeByQualityFallback(
    candidates: RoutingCandidate[],
    reason: string,
  ): RoutingDecision {
    const bestCandidate = candidates.reduce((best, candidate) =>
      candidate.routingMeta.qualityRank > best.routingMeta.qualityRank
        ? candidate
        : best,
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
        reasoning: `MLP 回退：${reason}`,
      })),
      reasoning: `MLP 回退：${reason}，按质量排名选择 ${bestCandidate.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
