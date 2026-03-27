import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MlpTrainerService } from '../mlp-trainer.service';
import {
  ROUTING_LEARNING_JOB_NAME,
  ROUTING_LEARNING_QUEUE,
  type RoutingLearningJob,
} from '../routing-learning.types';
import { RoutingLearningWorker } from '../routing-learning.worker';

vi.mock('../../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tx: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

const {
  createMockEmbeddingService,
  createMockQdrantClient,
  createMockMlpTrainer,
} = vi.hoisted(() => ({
  createMockEmbeddingService: () => ({
    generateEmbedding: vi.fn(),
  }),
  createMockQdrantClient: () => ({
    upsert: vi.fn(),
  }),
  createMockMlpTrainer: () => ({
    recordSample: vi.fn(),
  }),
}));

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createWorker(
  db: MockDb,
  embeddingService: ReturnType<typeof createMockEmbeddingService>,
  qdrantClient: ReturnType<typeof createMockQdrantClient>,
  mlpTrainer: ReturnType<typeof createMockMlpTrainer>,
) {
  return new RoutingLearningWorker(
    db as unknown as ConstructorParameters<typeof RoutingLearningWorker>[0],
    embeddingService,
    qdrantClient,
    mlpTrainer as unknown as MlpTrainerService,
  );
}

function createJob(
  overrides: Partial<RoutingLearningJob> = {},
): Job<RoutingLearningJob> {
  return {
    id: 'job-1',
    name: ROUTING_LEARNING_JOB_NAME,
    queueName: ROUTING_LEARNING_QUEUE,
    attemptsMade: 0,
    data: {
      tenantId: 'tenant-1',
      executionStepId: 'step-1',
      routingDecisionId: 'decision-1',
      selectedModelId: 'model-a',
      queryText: '实现在线学习 worker',
      taskCategory: 'reasoning',
      actualPerformance: {
        success: true,
        latencyMs: 400,
        tokenCount: 1_000,
        qualityScore: 0.8,
      },
      ...overrides,
    },
  } as unknown as Job<RoutingLearningJob>;
}

function createMockDb(options: {
  selectResults: unknown[][];
  updateResults: unknown[][];
}): MockDb {
  let selectIndex = 0;
  let updateIndex = 0;

  const select = vi.fn(() => {
    const result =
      options.selectResults[
        Math.min(selectIndex, options.selectResults.length - 1)
      ] ?? [];
    selectIndex += 1;

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    };
  });

  const update = vi.fn(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => {
          const result =
            options.updateResults[
              Math.min(updateIndex, options.updateResults.length - 1)
            ] ?? [];
          updateIndex += 1;
          return result;
        }),
      }),
    }),
  }));

  return {
    select,
    update,
  };
}

describe('RoutingLearningWorker', () => {
  let embeddingService: ReturnType<typeof createMockEmbeddingService>;
  let qdrantClient: ReturnType<typeof createMockQdrantClient>;
  let mlpTrainer: ReturnType<typeof createMockMlpTrainer>;

  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = createMockEmbeddingService();
    qdrantClient = createMockQdrantClient();
    mlpTrainer = createMockMlpTrainer();
    embeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mlpTrainer.recordSample.mockResolvedValue({ batchProcessed: false });
  });

  it('成功处理 job 时应执行 Qdrant upsert、Elo 更新与 MLP 训练', async () => {
    const db = createMockDb({
      selectResults: [
        [
          {
            modelsEvaluated: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
            selectedModelId: 'model-a',
          },
        ],
        [
          {
            id: 'router-a',
            modelId: 'model-a',
            eloRating: '1500',
            totalMatches: 3,
            occVersion: 2,
          },
          {
            id: 'router-b',
            modelId: 'model-b',
            eloRating: '1450',
            totalMatches: 7,
            occVersion: 1,
          },
        ],
      ],
      updateResults: [[{ id: 'router-a' }]],
    });
    const worker = createWorker(db, embeddingService, qdrantClient, mlpTrainer);

    await worker.process(createJob());

    const upsertPayload = qdrantClient.upsert.mock.calls[0]?.[1];
    const performanceScore =
      upsertPayload?.points?.[0]?.payload?.performance_score;

    expect(qdrantClient.upsert).toHaveBeenCalledWith('routing_memory', {
      wait: false,
      points: [
        expect.objectContaining({
          id: 'decision-1',
          vector: [0.1, 0.2],
          payload: expect.objectContaining({
            tenant_id: 'tenant-1',
            model_id: 'model-a',
            task_category: 'reasoning',
            performance_score: expect.any(Number),
            token_count: 1_000,
            latency_ms: 400,
          }),
        }),
      ],
    });
    expect(performanceScore).toBeCloseTo(0.8083333333333333, 10);
    expect(db.update).toHaveBeenCalledTimes(1);
    const mlpSample = mlpTrainer.recordSample.mock.calls[0]?.[0];
    expect(mlpTrainer.recordSample).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      taskCategory: 'reasoning',
      selectedModelId: 'model-a',
      candidateModelIds: ['model-a', 'model-b'],
      queryEmbedding: [0.1, 0.2],
      performanceScore: expect.any(Number),
    });
    expect(mlpSample?.performanceScore).toBeCloseTo(0.8083333333333333, 10);
  });

  it('Elo OCC 冲突时应重试并最终成功', async () => {
    const db = createMockDb({
      selectResults: [
        [
          {
            modelsEvaluated: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
            selectedModelId: 'model-a',
          },
        ],
        [
          {
            id: 'router-a',
            modelId: 'model-a',
            eloRating: '1500',
            totalMatches: 3,
            occVersion: 2,
          },
          {
            id: 'router-b',
            modelId: 'model-b',
            eloRating: '1450',
            totalMatches: 7,
            occVersion: 1,
          },
        ],
        [
          {
            id: 'router-a',
            modelId: 'model-a',
            eloRating: '1500',
            totalMatches: 3,
            occVersion: 3,
          },
          {
            id: 'router-b',
            modelId: 'model-b',
            eloRating: '1450',
            totalMatches: 7,
            occVersion: 1,
          },
        ],
      ],
      updateResults: [[], [{ id: 'router-a' }]],
    });
    const worker = createWorker(db, embeddingService, qdrantClient, mlpTrainer);

    await worker.process(createJob());

    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('embedding 失败时应跳过 Qdrant 但继续 Elo 更新', async () => {
    embeddingService.generateEmbedding.mockResolvedValueOnce(null);
    const db = createMockDb({
      selectResults: [
        [
          {
            modelsEvaluated: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
            selectedModelId: 'model-a',
          },
        ],
        [
          {
            id: 'router-a',
            modelId: 'model-a',
            eloRating: '1500',
            totalMatches: 3,
            occVersion: 2,
          },
          {
            id: 'router-b',
            modelId: 'model-b',
            eloRating: '1450',
            totalMatches: 7,
            occVersion: 1,
          },
        ],
      ],
      updateResults: [[{ id: 'router-a' }]],
    });
    const worker = createWorker(db, embeddingService, qdrantClient, mlpTrainer);

    await worker.process(createJob());

    expect(qdrantClient.upsert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(mlpTrainer.recordSample).not.toHaveBeenCalled();
  });

  it('Qdrant upsert 失败时应记录错误但不中断后续流程', async () => {
    qdrantClient.upsert.mockRejectedValueOnce(new Error('qdrant down'));
    const db = createMockDb({
      selectResults: [
        [
          {
            modelsEvaluated: [{ modelId: 'model-a' }, { modelId: 'model-b' }],
            selectedModelId: 'model-a',
          },
        ],
        [
          {
            id: 'router-a',
            modelId: 'model-a',
            eloRating: '1500',
            totalMatches: 3,
            occVersion: 2,
          },
          {
            id: 'router-b',
            modelId: 'model-b',
            eloRating: '1450',
            totalMatches: 7,
            occVersion: 1,
          },
        ],
      ],
      updateResults: [[{ id: 'router-a' }]],
    });
    const worker = createWorker(db, embeddingService, qdrantClient, mlpTrainer);

    await expect(worker.process(createJob())).resolves.toBeUndefined();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(mlpTrainer.recordSample).toHaveBeenCalledTimes(1);
  });
});
