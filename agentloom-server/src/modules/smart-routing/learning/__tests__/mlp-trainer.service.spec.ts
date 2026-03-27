import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoutingBenchmarkMlpWeights } from '../../../../database/schema/routing-benchmarks.schema';
import { MlpTrainerService } from '../mlp-trainer.service';

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createService(
  db: MockDb,
  config: ConstructorParameters<typeof MlpTrainerService>[1],
) {
  return new MlpTrainerService(
    db as unknown as ConstructorParameters<typeof MlpTrainerService>[0],
    config,
  );
}

function createWeights(): RoutingBenchmarkMlpWeights {
  return {
    layers: [
      {
        weights: [
          [0.1, -0.2],
          [0.05, 0.1],
        ],
        biases: [0, 0],
      },
      {
        weights: [
          [0.2, -0.1],
          [-0.1, 0.15],
        ],
        biases: [0, 0],
      },
    ],
    metadata: {
      trainedAt: '2026-03-22T00:00:00.000Z',
      sampleCount: 4,
      version: 'online-4',
    },
  };
}

function createMockDb(selectResults: unknown[][]): {
  db: MockDb;
  setMock: ReturnType<typeof vi.fn>;
} {
  let selectIndex = 0;
  const setMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  return {
    db: {
      select: vi.fn(() => {
        const result =
          selectResults[Math.min(selectIndex, selectResults.length - 1)] ?? [];
        selectIndex += 1;

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(result),
          }),
        };
      }),
      update: vi.fn(() => ({
        set: setMock,
      })),
    },
    setMock,
  };
}

describe('MlpTrainerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应先积累 mini-batch，达到阈值后再执行训练', async () => {
    const weights = createWeights();
    const { db, setMock } = createMockDb([
      [
        { id: 'router-a', modelId: 'model-a' },
        { id: 'router-b', modelId: 'model-b' },
      ],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'reasoning',
          mlpWeights: weights,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 2,
      mlpHiddenSize: 4,
      mlpBaseLearningRate: 0.05,
    });

    const first = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(first).toEqual({ batchProcessed: false });
    expect(setMock).not.toHaveBeenCalled();

    const second = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(second.batchProcessed).toBe(true);
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it('应执行真实梯度更新并持久化新的 mlpWeights', async () => {
    const weights = createWeights();
    const { db, setMock } = createMockDb([
      [
        { id: 'router-a', modelId: 'model-a' },
        { id: 'router-b', modelId: 'model-b' },
      ],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'reasoning',
          mlpWeights: weights,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 4,
      mlpBaseLearningRate: 0.05,
    });

    const result = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(result.batchProcessed).toBe(true);
    const persisted = setMock.mock.calls[0]?.[0]
      ?.mlpWeights as RoutingBenchmarkMlpWeights;
    expect(persisted.metadata.sampleCount).toBe(5);
    expect(persisted.layers[1]?.weights[0]?.[0]).toBeGreaterThan(
      weights.layers[1]?.weights[0]?.[0] ?? 0,
    );
    expect(persisted.layers[1]?.biases[0]).toBeGreaterThan(0);
  });

  it('学习率应随样本量增长而衰减', async () => {
    const weights = createWeights();
    const { db } = createMockDb([
      [
        { id: 'router-a', modelId: 'model-a' },
        { id: 'router-b', modelId: 'model-b' },
      ],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'reasoning',
          mlpWeights: weights,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
      [
        { id: 'router-a', modelId: 'model-a' },
        { id: 'router-b', modelId: 'model-b' },
      ],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'reasoning',
          mlpWeights: {
            ...weights,
            metadata: {
              trainedAt: '2026-03-22T00:00:00.000Z',
              sampleCount: 100,
              version: 'online-100',
            },
          },
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 4,
      mlpBaseLearningRate: 0.1,
    });

    const early = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });
    const late = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(early.learningRate).toBeDefined();
    expect(late.learningRate).toBeDefined();
    expect((late.learningRate ?? 0) < (early.learningRate ?? 0)).toBe(true);
  });
});
