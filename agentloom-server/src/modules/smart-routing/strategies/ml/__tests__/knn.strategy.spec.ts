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

function createContext(
  overrides: Partial<RoutingContext> = {},
): RoutingContext {
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
    const result =
      queryResults[Math.min(callIndex, queryResults.length - 1)] ?? [];
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
  it('应在缺少 embedding 时生成向量，并允许请求级配置覆盖默认限制', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 80),
      createCandidate('candidate-b', 'config-b', 90),
    ];
    const db = createMockDb([[], []]);
    const embeddingService = createMockEmbeddingService();
    embeddingService.generateEmbedding.mockResolvedValue([0.7, 0.8]);
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      {
        id: 1,
        score: 0.8,
        payload: { model_id: 'candidate-a', performance_score: '2' },
      },
      {
        id: 2,
        score: 0.8,
        payload: { model_id: 'config-b', performance_score: -2 },
      },
    ]);
    const router = new KnnRouter(db.db, qdrantClient, embeddingService, {
      k: 5,
      minScore: 0.5,
    });

    const decision = await router.routeSingle(
      candidates,
      createContext({
        queryEmbedding: [],
        strategyConfig: { k: 2, minScore: 0.75 },
      }),
    );

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      '实现流式推理代理',
      'tenant-1',
    );
    expect(qdrantClient.search).toHaveBeenCalledWith(
      'routing_memory',
      expect.objectContaining({
        vector: [0.7, 0.8],
        limit: 2,
        score_threshold: 0.75,
      }),
    );
    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.scores.map(({ score }) => score)).toEqual([100, 0]);
  });

  it('应忽略无效、未知及无贡献近邻并回退到质量排序', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 0),
      createCandidate('candidate-b', 'config-b', 0),
    ];
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      { id: 1, score: 1, payload: null },
      { id: 2, score: 1, payload: [] },
      { id: 3, score: 1, payload: { model_id: '' } },
      { id: 4, score: 1, payload: { model_id: 'unknown' } },
    ]);
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.reasoning).toContain('回退');
    expect(decision.scores.map(({ score }) => score)).toEqual([0, 0]);
    expect(db.selectMock).toHaveBeenCalledTimes(1);
  });

  it('近邻票数相同时应保持候选顺序，负相似度和无效分数不得增加票数', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 70),
      createCandidate('candidate-b', 'config-b', 99),
      createCandidate('candidate-c', 'config-c', 60),
    ];
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      {
        id: 1,
        score: 0.5,
        payload: { model_id: 'config-a', performance_score: 1 },
      },
      {
        id: 2,
        score: 1,
        payload: { model_id: 'config-b', performance_score: 0.5 },
      },
      {
        id: 3,
        score: -10,
        payload: { model_id: 'config-c', performance_score: 'not-a-number' },
      },
    ]);
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.reasoning).toContain('3 个相似邻居');
    expect(decision.scores.map(({ score }) => score)).toEqual([100, 100, 0]);
  });

  it('无查询文本和向量时不应访问 embedding 或记忆库，并使用基准分数边界', async () => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 10),
      createCandidate('candidate-b', 'config-b', 20),
      createCandidate('candidate-c', 'config-c', 30),
    ];
    const db = createMockDb([
      [
        { routerModelId: 'router-a', modelConfigId: 'config-a' },
        { routerModelId: 'router-b', modelConfigId: 'candidate-b' },
      ],
      [
        {
          modelId: 'router-a',
          performanceScore: 2,
          latencyMs: 1,
          tokenCount: 1,
        },
        {
          modelId: 'router-a',
          performanceScore: '-1',
          latencyMs: 1,
          tokenCount: 1,
        },
        {
          modelId: 'router-b',
          performanceScore: 'bad',
          latencyMs: 1,
          tokenCount: 1,
        },
        {
          modelId: 'unknown',
          performanceScore: 1,
          latencyMs: 1,
          tokenCount: 1,
        },
      ],
    ]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(
      candidates,
      createContext({ queryEmbedding: [], queryText: '' }),
    );

    expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    expect(qdrantClient.search).not.toHaveBeenCalled();
    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.scores.map(({ score }) => score)).toEqual([50, 0, 0]);
  });

  it.each([
    {
      name: 'router model 为空',
      dbResults: [[]],
    },
    {
      name: 'benchmark 为空',
      dbResults: [
        [{ routerModelId: 'router-a', modelConfigId: 'config-a' }],
        [],
      ],
    },
    {
      name: 'benchmark 无法映射候选',
      dbResults: [
        [{ routerModelId: 'router-a', modelConfigId: 'missing' }],
        [
          {
            modelId: 'router-a',
            performanceScore: 1,
            latencyMs: 1,
            tokenCount: 1,
          },
        ],
      ],
    },
  ])('$name 时应稳定回退到质量最高候选', async ({ dbResults }) => {
    const candidates = [
      createCandidate('candidate-a', 'config-a', 50),
      createCandidate('candidate-b', 'config-b', 100),
    ];
    const db = createMockDb(dbResults);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([]);
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-b');
    expect(decision.scores.map(({ score }) => score)).toEqual([50, 100]);
  });

  it('记忆检索失败时应向调用方暴露错误而不是伪造选择', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockRejectedValue(
      new Error('vector store unavailable'),
    );
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    await expect(
      router.routeSingle(
        [createCandidate('candidate-a', 'config-a', 90)],
        createContext(),
      ),
    ).rejects.toThrow('vector store unavailable');
    expect(db.selectMock).not.toHaveBeenCalled();
  });

  it('空候选集应拒绝产生无模型决策', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([]);
    const router = new KnnRouter(db.db, qdrantClient, embeddingService);

    await expect(
      router.routeSingle([], createContext()),
    ).rejects.toBeInstanceOf(TypeError);
    expect(db.selectMock).not.toHaveBeenCalled();
  });
});
