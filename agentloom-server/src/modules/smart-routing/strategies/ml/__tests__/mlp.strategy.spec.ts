import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../../../database/database.module';
import type {
  RoutingBenchmarkMlpWeights,
} from '../../../../../database/schema/routing-benchmarks.schema';
import type { RoutingCandidate } from '../../../core/routing-candidate';
import type { RoutingContext } from '../../../core/routing-context';
import { MlpRouter } from '../mlp.strategy';

type MockDb = Pick<DrizzleDB, 'select'>;

function createCandidate(id: string, modelConfigId: string): RoutingCandidate {
  return {
    id,
    modelConfigId,
    name: id,
    provider: 'openai',
    healthStatus: 'healthy',
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.01, output: 0.03 },
      qualityRank: 90,
      avgLatencyMs: 320,
      maxInputTokens: 128_000,
      eloRating: 1500,
    },
  };
}

function createContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    inputTokenCount: 1_500,
    tenantId: 'tenant-1',
    queryText: '请写一个多步骤规划器',
    taskCategory: 'reasoning',
    ...overrides,
  };
}

function createMockDb(queryResults: unknown[][]): { db: MockDb } {
  let callIndex = 0;

  const selectMock = vi.fn(() => {
    const result = queryResults[Math.min(callIndex, queryResults.length - 1)] ?? [];
    callIndex += 1;

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    };
  });

  return {
    db: { select: selectMock } as unknown as MockDb,
  };
}

function createMockEmbeddingService() {
  return {
    generateEmbedding: vi.fn(),
  };
}

describe('MlpRouter', () => {
  it('应该使用两层 MLP 前向传播输出手工可验证的 softmax 概率', async () => {
    const weights: RoutingBenchmarkMlpWeights = {
      layers: [
        {
          weights: [
            [1, 0],
            [0, 1],
          ],
          biases: [0, 0],
        },
        {
          weights: [
            [1, 1],
            [0.5, 0],
          ],
          biases: [0, 0],
        },
      ],
      metadata: {
        trainedAt: '2026-03-22T00:00:00.000Z',
        sampleCount: 128,
        version: 'v1',
      },
    };
    const db = createMockDb([
      [
        { routerModelId: 'router-a', modelConfigId: 'config-a' },
        { routerModelId: 'router-b', modelConfigId: 'config-b' },
      ],
      [
        {
          modelId: 'router-a',
          mlpWeights: weights,
          createdAt: new Date('2026-03-22T00:00:00.000Z'),
        },
      ],
    ]);
    const embeddingService = createMockEmbeddingService();
    const router = new MlpRouter(db.db, embeddingService, { temperature: 1.0 });

    const decision = await router.routeSingle(
      [
        createCandidate('candidate-a', 'config-a'),
        createCandidate('candidate-b', 'config-b'),
      ],
      createContext({ queryEmbedding: [1, 2] }),
    );

    expect(decision.selectedModelId).toBe('candidate-a');

    const scoreByModelId = Object.fromEntries(
      decision.scores.map((score) => [score.modelId, score.score]),
    );
    expect(scoreByModelId['candidate-a']).toBeCloseTo(92.41418199787566, 10);
    expect(scoreByModelId['candidate-b']).toBeCloseTo(7.585818002124355, 10);
  });

  it('queryEmbedding 缺失时应该调用 EmbeddingIntegrationService', async () => {
    const weights: RoutingBenchmarkMlpWeights = {
      layers: [
        {
          weights: [
            [1, 0],
            [0, 1],
          ],
          biases: [0, 0],
        },
        {
          weights: [
            [1, 1],
            [0.5, 0],
          ],
          biases: [0, 0],
        },
      ],
      metadata: {
        trainedAt: '2026-03-22T00:00:00.000Z',
        sampleCount: 128,
        version: 'v1',
      },
    };
    const db = createMockDb([
      [
        { routerModelId: 'router-a', modelConfigId: 'config-a' },
        { routerModelId: 'router-b', modelConfigId: 'config-b' },
      ],
      [{ modelId: 'router-a', mlpWeights: weights, createdAt: new Date() }],
    ]);
    const embeddingService = createMockEmbeddingService();
    embeddingService.generateEmbedding.mockResolvedValueOnce([1, 2]);
    const router = new MlpRouter(db.db, embeddingService);

    await router.routeSingle(
      [
        createCandidate('candidate-a', 'config-a'),
        createCandidate('candidate-b', 'config-b'),
      ],
      createContext({ queryEmbedding: undefined }),
    );

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      '请写一个多步骤规划器',
      'tenant-1',
    );
  });
});
