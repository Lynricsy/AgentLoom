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
  it.each([
    {
      name: 'embedding 为空',
      sample: {
        tenantId: 'tenant-1',
        taskCategory: 'reasoning',
        selectedModelId: 'model-a',
        candidateModelIds: ['model-a'],
        queryEmbedding: [],
        performanceScore: 1,
      },
    },
    {
      name: '候选为空',
      sample: {
        tenantId: 'tenant-1',
        taskCategory: 'reasoning',
        selectedModelId: 'model-a',
        candidateModelIds: [],
        queryEmbedding: [1],
        performanceScore: 1,
      },
    },
    {
      name: '选中模型不在候选中',
      sample: {
        tenantId: 'tenant-1',
        taskCategory: 'reasoning',
        selectedModelId: 'model-b',
        candidateModelIds: ['model-a'],
        queryEmbedding: [1],
        performanceScore: 1,
      },
    },
  ])('$name 时应拒绝无效训练样本', async ({ sample }) => {
    const { db, setMock } = createMockDb([[]]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });

    await expect(service.recordSample(sample)).resolves.toEqual({
      batchProcessed: false,
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('应先归一化未知任务类别再合并 general 批次，并将过高表现分限制为 1', async () => {
    const { db, setMock } = createMockDb([
      [{ id: 'router-a', modelId: 'model-a' }],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'general',
          mlpWeights: null,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 2,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });
    const common = {
      tenantId: 'tenant-1',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a'],
      queryEmbedding: [1, -1],
      performanceScore: 5,
    };

    const pending = await service.recordSample({
      ...common,
      taskCategory: 'not-supported',
    });
    const trained = await service.recordSample({
      ...common,
      taskCategory: 'general',
    });

    expect(pending).toEqual({ batchProcessed: false });
    expect(trained).toMatchObject({
      batchProcessed: true,
      sampleCount: 2,
      learningRate: 0.1,
    });
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(
      (setMock.mock.calls[0]?.[0]?.mlpWeights as RoutingBenchmarkMlpWeights)
        .metadata.version,
    ).toBe('online-2');
  });

  it('候选顺序不同的样本应进入独立批次', async () => {
    const { db } = createMockDb([[]]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 2,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });
    const common = {
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      queryEmbedding: [1],
      performanceScore: -2,
    };

    const first = await service.recordSample({
      ...common,
      candidateModelIds: ['model-a', 'model-b'],
    });
    const second = await service.recordSample({
      ...common,
      candidateModelIds: ['model-b', 'model-a'],
    });

    expect(first).toEqual({ batchProcessed: false });
    expect(second).toEqual({ batchProcessed: false });
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'router_models 映射不完整',
      selectResults: [[{ id: 'router-a', modelId: 'model-a' }]],
    },
    {
      name: '不存在 benchmark 行',
      selectResults: [
        [
          { id: 'router-a', modelId: 'model-a' },
          { id: 'router-b', modelId: 'model-b' },
        ],
        [],
      ],
    },
    {
      name: 'benchmark 行既不属于选中模型也没有可用权重',
      selectResults: [
        [
          { id: 'router-a', modelId: 'model-a' },
          { id: 'router-b', modelId: 'model-b' },
        ],
        [
          {
            id: 'benchmark-x',
            modelId: 'router-x',
            taskCategory: 'reasoning',
            mlpWeights: null,
            createdAt: new Date('2026-03-22T00:00:00.000Z'),
          },
        ],
      ],
    },
  ])('$name 时应跳过批次且不写入权重', async ({ selectResults }) => {
    const { db, setMock } = createMockDb(selectResults);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });

    const result = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(result).toEqual({ batchProcessed: false });
    expect(setMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: '缺少第二层',
      weights: {
        ...createWeights(),
        layers: [createWeights().layers[0]],
      },
    },
    {
      name: '隐藏层输入维度不匹配',
      weights: {
        ...createWeights(),
        layers: [
          {
            weights: [[0.1], [0.2]],
            biases: [0, 0],
          },
          createWeights().layers[1],
        ],
      },
    },
    {
      name: '输出层数量不匹配',
      weights: {
        ...createWeights(),
        layers: [
          createWeights().layers[0],
          {
            weights: [[0.1, 0.2]],
            biases: [0],
          },
        ],
      },
    },
    {
      name: '输出层隐藏维度不匹配',
      weights: {
        ...createWeights(),
        layers: [
          createWeights().layers[0],
          {
            weights: [[0.1], [0.2]],
            biases: [0, 0],
          },
        ],
      },
    },
  ])('$name 时应重新初始化网络并完成训练', async ({ weights }) => {
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
      mlpHiddenSize: 3,
      mlpBaseLearningRate: 0.1,
    });

    const result = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: -1,
    });

    expect(result).toMatchObject({
      batchProcessed: true,
      sampleCount: 1,
      learningRate: 0.1,
    });
    const persisted = setMock.mock.calls[0]?.[0]
      ?.mlpWeights as RoutingBenchmarkMlpWeights;
    expect(persisted.layers[0]?.weights).toHaveLength(3);
    expect(persisted.layers[0]?.weights[0]).toHaveLength(2);
    expect(persisted.layers[1]?.weights).toHaveLength(2);
    expect(persisted.metadata.version).toBe('online-1');
  });

  it('应选择最新的可用权重，但持久化到选中模型对应 benchmark', async () => {
    const oldWeights = createWeights();
    const newerWeights = {
      ...createWeights(),
      metadata: {
        trainedAt: '2026-03-23T00:00:00.000Z',
        sampleCount: 20,
        version: 'online-20',
      },
    };
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
          mlpWeights: oldWeights,
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
        },
        {
          id: 'benchmark-b',
          modelId: 'router-b',
          taskCategory: 'reasoning',
          mlpWeights: newerWeights,
          createdAt: new Date('2026-03-23T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });

    const result = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    });

    expect(result).toMatchObject({ batchProcessed: true, sampleCount: 21 });
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(
      (setMock.mock.calls[0]?.[0]?.mlpWeights as RoutingBenchmarkMlpWeights)
        .metadata.version,
    ).toBe('online-21');
  });

  it('权重存储失败后应清空失败批次，下一样本可重试并成功', async () => {
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
    setMock
      .mockReturnValueOnce({
        where: vi.fn().mockRejectedValue(new Error('write conflict')),
      })
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue(undefined),
      });
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.1,
    });
    const sample = {
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [1, 0],
      performanceScore: 1,
    };

    const failed = await service.recordSample(sample);
    const retried = await service.recordSample(sample);

    expect(failed).toEqual({ batchProcessed: false });
    expect(retried).toMatchObject({ batchProcessed: true, sampleCount: 5 });
    expect(setMock).toHaveBeenCalledTimes(2);
  });

  it('非 Error 的训练失败也应返回未处理状态', async () => {
    const { db, setMock } = createMockDb([
      [{ id: 'router-a', modelId: 'model-a' }],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'general',
          mlpWeights: null,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    setMock.mockReturnValueOnce({
      where: vi.fn().mockRejectedValue('storage offline'),
    });
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 1,
      mlpHiddenSize: 1,
      mlpBaseLearningRate: 0.1,
    });

    const result = await service.recordSample({
      tenantId: 'tenant-1',
      taskCategory: 'general',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a'],
      queryEmbedding: [0],
      performanceScore: 0,
    });

    expect(result).toEqual({ batchProcessed: false });
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it('四样本批次应整体更新一次并准确推进训练状态', async () => {
    const { db, setMock } = createMockDb([
      [{ id: 'router-a', modelId: 'model-a' }],
      [
        {
          id: 'benchmark-a',
          modelId: 'router-a',
          taskCategory: 'reasoning',
          mlpWeights: null,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const service = createService(db, {
      mlpEnabled: true,
      eloKFactor: 32,
      occMaxRetries: 3,
      miniBatchSize: 4,
      mlpHiddenSize: 2,
      mlpBaseLearningRate: 0.2,
    });
    const sample = {
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a'],
      queryEmbedding: [1],
      performanceScore: 0.5,
    };

    const results = [];
    for (let index = 0; index < 4; index += 1) {
      results.push(await service.recordSample(sample));
    }

    expect(results.slice(0, 3)).toEqual([
      { batchProcessed: false },
      { batchProcessed: false },
      { batchProcessed: false },
    ]);
    expect(results[3]).toMatchObject({
      batchProcessed: true,
      sampleCount: 4,
      learningRate: 0.2,
    });
    expect(setMock).toHaveBeenCalledTimes(1);
  });
});
