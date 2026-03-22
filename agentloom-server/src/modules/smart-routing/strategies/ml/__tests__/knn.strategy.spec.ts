import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../../../database/database.module';
import type { RoutingCandidate } from '../../../core/routing-candidate';
import type { RoutingContext } from '../../../core/routing-context';
import { KnnRouter } from '../knn.strategy';

type MockDb = Pick<DrizzleDB, 'select'>;

function createCandidate(
  id: string,
  modelConfigId: string,
  qualityRank: number,
): RoutingCandidate {
  return {
    id,
    modelConfigId,
    name: id,
    provider: 'openai',
    healthStatus: 'healthy',
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.01, output: 0.03 },
      qualityRank,
      avgLatencyMs: 400,
      maxInputTokens: 128_000,
      eloRating: 1500,
    },
  };
}

function createContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    inputTokenCount: 2_000,
    tenantId: 'tenant-1',
    queryText: '实现流式推理代理',
    queryEmbedding: [0.1, 0.2, 0.3],
    taskCategory: 'reasoning',
    ...overrides,
  };
}

function createMockDb(queryResults: unknown[][]): {
  db: MockDb;
  selectMock: ReturnType<typeof vi.fn>;
  whereMocks: ReturnType<typeof vi.fn>[];
} {
  let callIndex = 0;
  const whereMocks: ReturnType<typeof vi.fn>[] = [];

  const selectMock = vi.fn(() => {
    const result = queryResults[Math.min(callIndex, queryResults.length - 1)] ?? [];
    callIndex += 1;

    const whereMock = vi.fn().mockResolvedValue(result);
    whereMocks.push(whereMock);

    const builder = {
      from: vi.fn().mockReturnValue({
        where: whereMock,
      }),
    };

    return builder;
  });

  return {
    db: { select: selectMock } as unknown as MockDb,
    selectMock,
    whereMocks,
  };
}

function createMockEmbeddingService() {
  return {
    generateEmbedding: vi.fn(),
  };
}

function createMockQdrantClient() {
  return {
    search: vi.fn(),
  };
}

describe('KnnRouter', () => {
  it('应该根据相似度 × performance_score 的加权投票选择模型', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 92),
      createCandidate('candidate-b', 'config-b', 88),
      createCandidate('candidate-c', 'config-c', 80),
    ];
    const db = createMockDb([[], []]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValueOnce([
      {
        id: 'neighbor-1',
        score: 0.95,
        payload: { model_id: 'config-a', performance_score: 0.9 },
      },
      {
        id: 'neighbor-2',
        score: 0.9,
        payload: { model_id: 'config-b', performance_score: 0.8 },
      },
      {
        id: 'neighbor-3',
        score: 0.85,
        payload: { model_id: 'config-a', performance_score: 0.7 },
      },
    ]);

    const router = new KnnRouter(db.db, qdrantClient, embeddingService, {
      k: 3,
      minScore: 0.5,
    });

    const decision = await router.routeSingle(candidates, createContext());

    expect(qdrantClient.search).toHaveBeenCalledWith('routing_memory', {
      vector: [0.1, 0.2, 0.3],
      limit: 3,
      score_threshold: 0.5,
      filter: {
        must: [{ key: 'tenant_id', match: { value: 'tenant-1' } }],
      },
      with_payload: true,
    });
    expect(decision.selectedModelId).toBe('candidate-a');

    const scoreByModelId = Object.fromEntries(
      decision.scores.map((score) => [score.modelId, score.score]),
    );
    expect(scoreByModelId['candidate-a']).toBeCloseTo(100, 12);
    expect(scoreByModelId['candidate-b']).toBeCloseTo(49.6551724137931, 12);
    expect(scoreByModelId['candidate-c']).toBeCloseTo(0, 12);
  });

  it('Qdrant 无历史时应该回退到 routing_benchmarks 冷启动结果', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 92),
      createCandidate('candidate-b', 'config-b', 88),
    ];
    const db = createMockDb([
      [
        {
          routerModelId: 'router-a',
          modelConfigId: 'config-a',
          eloRating: '1510',
          providerName: 'openai',
        },
        {
          routerModelId: 'router-b',
          modelConfigId: 'config-b',
          eloRating: '1490',
          providerName: 'anthropic',
        },
      ],
      [
        {
          modelId: 'router-a',
          performanceScore: '0.61',
          latencyMs: 320,
          tokenCount: 2000,
        },
        {
          modelId: 'router-a',
          performanceScore: '0.71',
          latencyMs: 280,
          tokenCount: 1900,
        },
        {
          modelId: 'router-b',
          performanceScore: '0.59',
          latencyMs: 290,
          tokenCount: 2100,
        },
      ],
    ]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValueOnce([]);

    const router = new KnnRouter(db.db, qdrantClient, embeddingService, {
      k: 5,
      minScore: 0.5,
    });

    const decision = await router.routeSingle(candidates, createContext());

    expect(db.selectMock).toHaveBeenCalledTimes(2);
    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.reasoning).toContain('冷启动');
  });
});
