import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { DrizzleDB } from '../../../database/database.module';
import {
  ROUTING_BENCHMARK_TASK_CATEGORIES,
  routingBenchmarks,
  type RoutingBenchmarkTaskCategory,
  type RoutingBenchmarkMlpWeights,
} from '../../../database/schema/routing-benchmarks.schema';
import { routerModels } from '../../../database/schema/router-models.schema';
import { matmul, relu } from '../strategies/ml/ml-math.utils';
import {
  DEFAULT_ROUTING_LEARNING_CONFIG,
  ROUTING_LEARNING_CONFIG_TOKEN,
  type RoutingLearningConfig,
  type RoutingMlpTrainingResult,
  type RoutingMlpTrainingSample,
} from './routing-learning.types';

type RoutingLearningDb = Pick<DrizzleDB, 'select' | 'update'>;

interface RouterModelLookupRow {
  id: string;
  modelId: string;
}

interface BenchmarkWeightsRow {
  id: string;
  modelId: string;
  taskCategory: string;
  mlpWeights: RoutingBenchmarkMlpWeights | null;
  createdAt: Date;
}

interface GradientAccumulator {
  layer1Weights: number[][];
  layer1Biases: number[];
  layer2Weights: number[][];
  layer2Biases: number[];
}

interface ForwardPassResult {
  hiddenPreActivation: number[];
  hiddenActivation: number[];
  output: number[];
}

function buildZeroVector(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function buildZeroMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => buildZeroVector(columns));
}

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeTaskCategory(
  taskCategory: string,
): RoutingBenchmarkTaskCategory {
  return ROUTING_BENCHMARK_TASK_CATEGORIES.includes(
    taskCategory as (typeof ROUTING_BENCHMARK_TASK_CATEGORIES)[number],
  )
    ? (taskCategory as RoutingBenchmarkTaskCategory)
    : 'general';
}

function readInputDimension(weights: RoutingBenchmarkMlpWeights): number {
  return weights.layers[0]?.weights[0]?.length ?? 0;
}

function readHiddenDimension(weights: RoutingBenchmarkMlpWeights): number {
  return weights.layers[0]?.biases.length ?? 0;
}

function readOutputDimension(weights: RoutingBenchmarkMlpWeights): number {
  return weights.layers[1]?.biases.length ?? 0;
}

function isUsableWeights(
  weights: RoutingBenchmarkMlpWeights | null,
  inputDimension: number,
  outputDimension: number,
): weights is RoutingBenchmarkMlpWeights {
  if (!weights || weights.layers.length < 2) {
    return false;
  }

  const [layer1, layer2] = weights.layers;
  const hiddenDimension = layer1.biases.length;
  const layer1Matches =
    layer1.weights.length === hiddenDimension &&
    layer1.weights.every((row) => row.length === inputDimension);
  const layer2Matches =
    layer2.weights.length === outputDimension &&
    layer2.weights.every((row) => row.length === hiddenDimension);

  return layer1Matches && layer2Matches;
}

function seededRandom(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43_758.5453;
  return raw - Math.floor(raw);
}

function initializeLayerWeights(
  rowCount: number,
  columnCount: number,
  seedOffset: number,
): number[][] {
  const limit = Math.sqrt(6 / Math.max(1, rowCount + columnCount));

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const random = seededRandom(seedOffset + rowIndex * columnCount + columnIndex);
      return (random * 2 - 1) * limit;
    }),
  );
}

function initializeWeights(
  inputDimension: number,
  hiddenDimension: number,
  outputDimension: number,
): RoutingBenchmarkMlpWeights {
  return {
    layers: [
      {
        weights: initializeLayerWeights(hiddenDimension, inputDimension, 11),
        biases: buildZeroVector(hiddenDimension),
      },
      {
        weights: initializeLayerWeights(outputDimension, hiddenDimension, 101),
        biases: buildZeroVector(outputDimension),
      },
    ],
    metadata: {
      trainedAt: new Date(0).toISOString(),
      sampleCount: 0,
      version: 'online-0',
    },
  };
}

function cloneWeights(weights: RoutingBenchmarkMlpWeights): RoutingBenchmarkMlpWeights {
  return {
    layers: weights.layers.map((layer) => ({
      weights: layer.weights.map((row) => [...row]),
      biases: [...layer.biases],
    })),
    metadata: {
      trainedAt: weights.metadata.trainedAt,
      sampleCount: weights.metadata.sampleCount,
      version: weights.metadata.version,
    },
  };
}

function createGradientAccumulator(
  inputDimension: number,
  hiddenDimension: number,
  outputDimension: number,
): GradientAccumulator {
  return {
    layer1Weights: buildZeroMatrix(hiddenDimension, inputDimension),
    layer1Biases: buildZeroVector(hiddenDimension),
    layer2Weights: buildZeroMatrix(outputDimension, hiddenDimension),
    layer2Biases: buildZeroVector(outputDimension),
  };
}

function buildBatchKey(sample: RoutingMlpTrainingSample): string {
  return [sample.tenantId, sample.taskCategory, ...sample.candidateModelIds].join(':');
}

@Injectable()
export class MlpTrainerService {
  private readonly logger = new Logger(MlpTrainerService.name);
  private readonly pendingSamples = new Map<string, RoutingMlpTrainingSample[]>();
  private readonly config: RoutingLearningConfig;

  constructor(
    private readonly db: RoutingLearningDb,
    config?: RoutingLearningConfig,
  ) {
    this.config = config ?? DEFAULT_ROUTING_LEARNING_CONFIG;
  }

  async recordSample(
    sample: RoutingMlpTrainingSample,
  ): Promise<RoutingMlpTrainingResult> {
    if (
      sample.queryEmbedding.length === 0 ||
      sample.candidateModelIds.length === 0 ||
      !sample.candidateModelIds.includes(sample.selectedModelId)
    ) {
      return { batchProcessed: false };
    }

    const normalizedSample: RoutingMlpTrainingSample = {
      ...sample,
      taskCategory: normalizeTaskCategory(sample.taskCategory),
      performanceScore: clampUnitInterval(sample.performanceScore),
    };
    const batchKey = buildBatchKey(normalizedSample);
    const queue = this.pendingSamples.get(batchKey) ?? [];
    queue.push(normalizedSample);

    if (queue.length < this.config.miniBatchSize) {
      this.pendingSamples.set(batchKey, queue);
      return { batchProcessed: false };
    }

    this.pendingSamples.delete(batchKey);

    try {
      return await this.trainBatch(queue);
    } catch (error: unknown) {
      this.logger.error(
        `MLP 在线训练失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { batchProcessed: false };
    }
  }

  private async trainBatch(
    batch: RoutingMlpTrainingSample[],
  ): Promise<RoutingMlpTrainingResult> {
    const templateSample = batch[0];
    if (!templateSample) {
      return { batchProcessed: false };
    }

    const inputDimension = templateSample.queryEmbedding.length;
    const outputDimension = templateSample.candidateModelIds.length;
    const routerModelRows = await this.loadRouterModels(
      templateSample.tenantId,
      templateSample.candidateModelIds,
    );
    if (routerModelRows.length !== templateSample.candidateModelIds.length) {
      this.logger.warn('MLP 在线训练跳过：router_models 映射不完整');
      return { batchProcessed: false };
    }

    const routerModelIdByConfigId = new Map(
      routerModelRows.map((row) => [row.modelId, row.id]),
    );
    const normalizedTaskCategory: RoutingBenchmarkTaskCategory =
      normalizeTaskCategory(templateSample.taskCategory);
    const benchmarkRows = await this.loadBenchmarkRows(
      routerModelRows.map((row) => row.id),
      normalizedTaskCategory,
    );
    if (benchmarkRows.length === 0) {
      this.logger.warn('MLP 在线训练跳过：缺少可写入的 routing_benchmarks 行');
      return { batchProcessed: false };
    }

    const usableRow = [...benchmarkRows]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .find((row) =>
        isUsableWeights(row.mlpWeights, inputDimension, outputDimension),
      );
    const selectedRouterModelId = routerModelIdByConfigId.get(
      templateSample.selectedModelId,
    );
    const persistenceTarget =
      benchmarkRows.find((row) => row.modelId === selectedRouterModelId) ?? usableRow;
    if (!persistenceTarget) {
      this.logger.warn('MLP 在线训练跳过：没有可持久化的 benchmark 目标行');
      return { batchProcessed: false };
    }

    const baseWeights = usableRow?.mlpWeights
      ? cloneWeights(usableRow.mlpWeights)
      : initializeWeights(
          inputDimension,
          this.config.mlpHiddenSize,
          outputDimension,
        );
    const startingSampleCount = usableRow?.mlpWeights?.metadata.sampleCount ?? 0;
    const learningRate = this.resolveLearningRate(startingSampleCount);
    const updatedWeights = await this.applyMiniBatchGradientUpdate(
      baseWeights,
      batch,
      learningRate,
    );
    updatedWeights.metadata = {
      trainedAt: new Date().toISOString(),
      sampleCount: startingSampleCount + batch.length,
      version: `online-${startingSampleCount + batch.length}`,
    };

    await this.db
      .update(routingBenchmarks)
      .set({
        mlpWeights: updatedWeights,
      })
      .where(eq(routingBenchmarks.id, persistenceTarget.id));

    return {
      batchProcessed: true,
      learningRate,
      sampleCount: updatedWeights.metadata.sampleCount,
      weights: updatedWeights,
    };
  }

  private resolveLearningRate(existingSampleCount: number): number {
    return (
      this.config.mlpBaseLearningRate /
      Math.sqrt(1 + existingSampleCount / Math.max(1, this.config.miniBatchSize))
    );
  }

  private async applyMiniBatchGradientUpdate(
    weights: RoutingBenchmarkMlpWeights,
    batch: RoutingMlpTrainingSample[],
    learningRate: number,
  ): Promise<RoutingBenchmarkMlpWeights> {
    const [layer1, layer2] = weights.layers;
    const hiddenDimension = readHiddenDimension(weights);
    const inputDimension = readInputDimension(weights);
    const outputDimension = readOutputDimension(weights);
    const gradients = createGradientAccumulator(
      inputDimension,
      hiddenDimension,
      outputDimension,
    );

    for (const [sampleIndex, sample] of batch.entries()) {
      const forward = this.forward(weights, sample.queryEmbedding);
      const target = buildZeroVector(outputDimension);
      const selectedIndex = sample.candidateModelIds.indexOf(sample.selectedModelId);
      if (selectedIndex >= 0) {
        target[selectedIndex] = sample.performanceScore;
      }

      const outputGradient = forward.output.map(
        (value, index) => ((value - target[index]) * 2) / outputDimension,
      );

      for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
        gradients.layer2Biases[outputIndex] += outputGradient[outputIndex] ?? 0;

        for (let hiddenIndex = 0; hiddenIndex < hiddenDimension; hiddenIndex += 1) {
          gradients.layer2Weights[outputIndex]![hiddenIndex]! +=
            (outputGradient[outputIndex] ?? 0) *
            (forward.hiddenActivation[hiddenIndex] ?? 0);
        }
      }

      const hiddenGradient = buildZeroVector(hiddenDimension);
      for (let hiddenIndex = 0; hiddenIndex < hiddenDimension; hiddenIndex += 1) {
        let gradientSum = 0;
        for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
          gradientSum +=
            (layer2.weights[outputIndex]?.[hiddenIndex] ?? 0) *
            (outputGradient[outputIndex] ?? 0);
        }

        hiddenGradient[hiddenIndex] =
          (forward.hiddenPreActivation[hiddenIndex] ?? 0) > 0 ? gradientSum : 0;
      }

      for (let hiddenIndex = 0; hiddenIndex < hiddenDimension; hiddenIndex += 1) {
        gradients.layer1Biases[hiddenIndex] += hiddenGradient[hiddenIndex] ?? 0;

        for (let inputIndex = 0; inputIndex < inputDimension; inputIndex += 1) {
          gradients.layer1Weights[hiddenIndex]![inputIndex]! +=
            (hiddenGradient[hiddenIndex] ?? 0) *
            (sample.queryEmbedding[inputIndex] ?? 0);
        }
      }

      if ((sampleIndex + 1) % 4 === 0) {
        await Promise.resolve();
      }
    }

    const batchScale = learningRate / batch.length;
    for (let hiddenIndex = 0; hiddenIndex < hiddenDimension; hiddenIndex += 1) {
      layer1.biases[hiddenIndex] -= gradients.layer1Biases[hiddenIndex] * batchScale;

      for (let inputIndex = 0; inputIndex < inputDimension; inputIndex += 1) {
        layer1.weights[hiddenIndex]![inputIndex]! -=
          gradients.layer1Weights[hiddenIndex]![inputIndex]! * batchScale;
      }
    }

    for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
      layer2.biases[outputIndex] -= gradients.layer2Biases[outputIndex] * batchScale;

      for (let hiddenIndex = 0; hiddenIndex < hiddenDimension; hiddenIndex += 1) {
        layer2.weights[outputIndex]![hiddenIndex]! -=
          gradients.layer2Weights[outputIndex]![hiddenIndex]! * batchScale;
      }
    }

    return weights;
  }

  private forward(
    weights: RoutingBenchmarkMlpWeights,
    inputVector: number[],
  ): ForwardPassResult {
    const [layer1, layer2] = weights.layers;
    const hiddenPreActivation = this.forwardDenseLayer(
      layer1.weights,
      layer1.biases,
      inputVector,
    );
    const hiddenActivation = relu(hiddenPreActivation);
    const output = this.forwardDenseLayer(
      layer2.weights,
      layer2.biases,
      hiddenActivation,
    );

    return {
      hiddenPreActivation,
      hiddenActivation,
      output,
    };
  }

  private forwardDenseLayer(
    weights: number[][],
    biases: number[],
    inputVector: number[],
  ): number[] {
    const multiplied = matmul(
      weights,
      inputVector.map((value) => [value]),
    );

    return multiplied.map((row, index) => (row[0] ?? 0) + (biases[index] ?? 0));
  }

  private async loadRouterModels(
    tenantId: string,
    candidateModelIds: string[],
  ): Promise<RouterModelLookupRow[]> {
    return this.db
      .select({
        id: routerModels.id,
        modelId: routerModels.modelId,
      })
      .from(routerModels)
      .where(
        and(
          eq(routerModels.tenantId, tenantId),
          inArray(routerModels.modelId, candidateModelIds),
        ),
      );
  }

  private async loadBenchmarkRows(
    routerModelIds: string[],
    taskCategory: RoutingBenchmarkTaskCategory,
  ): Promise<BenchmarkWeightsRow[]> {
    return this.db
      .select({
        id: routingBenchmarks.id,
        modelId: routingBenchmarks.modelId,
        taskCategory: routingBenchmarks.taskCategory,
        mlpWeights: routingBenchmarks.mlpWeights,
        createdAt: routingBenchmarks.createdAt,
      })
      .from(routingBenchmarks)
      .where(
        and(
          inArray(routingBenchmarks.modelId, routerModelIds),
          sql`${routingBenchmarks.taskCategory} = ${taskCategory}`,
        ),
      );
  }
}
