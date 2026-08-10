import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../../../database/database.module';
import type { RoutingCandidate } from '../../../core/routing-candidate';
import type { RoutingContext } from '../../../core/routing-context';
import { MemoryBankRouter } from '../memory-bank.strategy';

type MockDb = Pick<DrizzleDB, 'select'>;

function createCandidate(
  id: string,
  modelConfigId: string,
  costs: { input: number; output: number },
): RoutingCandidate {
  return {
    id,
    modelConfigId,
    name: id,
    provider: 'openai',
    healthStatus: 'healthy',
    routingMeta: {
      contextWindow: 128_000,
      costs,
      qualityRank: 90,
      avgLatencyMs: 320,
      maxInputTokens: 128_000,
      eloRating: 1500,
    },
  };
}

function createContext(
  overrides: Partial<RoutingContext> = {},
): RoutingContext {
  return {
    inputTokenCount: 1_500,
    tenantId: 'tenant-1',
    queryText: '选择适合长上下文总结的模型',
    queryEmbedding: [0.3, 0.2, 0.1],
    taskCategory: 'qa',
    ...overrides,
  };
}

function createMockDb(queryResults: unknown[][]) {
  let callIndex = 0;

  const selectMock = vi.fn(() => {
    const result =
      queryResults[Math.min(callIndex, queryResults.length - 1)] ?? [];
    callIndex += 1;

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    };
  });

  return {
    db: { select: selectMock } as unknown as MockDb,
    selectMock,
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

describe('MemoryBankRouter', () => {
  it('应该按 α/β/γ 加权评分选择 combined score 最高的模型', async () => {
    const db = createMockDb([[], []]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValueOnce([
      {
        id: 'memory-1',
        score: 0.95,
        payload: {
          model_id: 'config-a',
          performance_score: 0.9,
          latency_ms: 400,
          cost: 0.2,
        },
      },
      {
        id: 'memory-2',
        score: 0.85,
        payload: {
          model_id: 'config-a',
          performance_score: 0.8,
          latency_ms: 500,
          cost: 0.3,
        },
      },
      {
        id: 'memory-3',
        score: 0.9,
        payload: {
          model_id: 'config-b',
          performance_score: 0.7,
          latency_ms: 200,
          cost: 0.1,
        },
      },
    ]);
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService, {
      alpha: 0.5,
      beta: 0.3,
      gamma: 0.2,
      topK: 3,
    });
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0.01, output: 0.03 }),
      createCandidate('candidate-b', 'config-b', { input: 0.02, output: 0.04 }),
    ];

    const decision = await router.routeSingle(candidates, createContext());

    expect(qdrantClient.search).toHaveBeenCalledWith('routing_memory', {
      vector: [0.3, 0.2, 0.1],
      limit: 3,
      score_threshold: undefined,
      filter: {
        must: [{ key: 'tenant_id', match: { value: 'tenant-1' } }],
      },
      with_payload: true,
    });
    expect(decision.selectedModelId).toBe('candidate-b');

    const scoreByModelId = Object.fromEntries(
      decision.scores.map((score) => [score.modelId, score.score]),
    );
    expect(scoreByModelId['candidate-a']).toBeCloseTo(42.63888888888889, 10);
    expect(scoreByModelId['candidate-b']).toBeCloseTo(63.921069160443864, 10);
  });
  it('应生成缺失向量、应用请求级 topK，并使用历史字段回退值', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    embeddingService.generateEmbedding.mockResolvedValue([0.9, 0.8]);
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      {
        id: 1,
        score: 1,
        payload: {
          model_id: 'candidate-a',
          success_rate: '2',
          avg_latency_ms: '100',
          avg_cost: '0.4',
        },
      },
      {
        id: 2,
        score: 1,
        payload: {
          model_id: 'config-b',
          success_rate: '-1',
          token_count: '2000',
        },
      },
    ]);
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0.1, output: 0 }),
      createCandidate('candidate-b', 'config-b', { input: 0.1, output: 0 }),
    ];
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService, {
      alpha: 1,
      beta: 0,
      gamma: 0,
      topK: 10,
    });

    const decision = await router.routeSingle(
      candidates,
      createContext({
        queryEmbedding: [],
        strategyConfig: { alpha: 1, beta: 0, gamma: 0, topK: 2 },
      }),
    );

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      '选择适合长上下文总结的模型',
      'tenant-1',
    );
    expect(qdrantClient.search).toHaveBeenCalledWith(
      'routing_memory',
      expect.objectContaining({ vector: [0.9, 0.8], limit: 2 }),
    );
    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.scores.map(({ score }) => score)).toEqual([100, 0]);
  });

  it('应忽略畸形与未知记忆并按质量回退', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      { id: 1, score: 1, payload: null },
      { id: 2, score: 1, payload: [] },
      { id: 3, score: 1, payload: { model_id: '' } },
      { id: 4, score: 1, payload: { model_id: 'unknown' } },
    ]);
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0, output: 0 }),
      createCandidate('candidate-b', 'config-b', { input: 0, output: 0 }),
    ];
    candidates[0].routingMeta.qualityRank = 0;
    candidates[1].routingMeta.qualityRank = 0;
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.reasoning).toContain('回退');
    expect(decision.scores.map(({ score }) => score)).toEqual([0, 0]);
  });

  it('归一化分母为零时应保持有限分数，组合分数相同则保持候选顺序', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([
      {
        id: 1,
        score: 1,
        payload: {
          model_id: 'config-a',
          performance_score: 0.5,
          latency_ms: 0,
          cost: 0,
        },
      },
      {
        id: 2,
        score: 1,
        payload: {
          model_id: 'config-b',
          performance_score: 0.5,
          latency_ms: 0,
          cost: 0,
        },
      },
      {
        id: 3,
        score: -1,
        payload: {
          model_id: 'config-c',
          performance_score: 'bad',
          latency_ms: 'bad',
          cost: 'bad',
        },
      },
    ]);
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0, output: 0 }),
      createCandidate('candidate-b', 'config-b', { input: 0, output: 0 }),
      createCandidate('candidate-c', 'config-c', { input: 0, output: 0 }),
    ];
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService, {
      alpha: 0.5,
      beta: 0.3,
      gamma: 0.2,
    });

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.scores.map(({ score }) => score)).toEqual([75, 75, 0]);
    expect(decision.scores.every(({ score }) => Number.isFinite(score))).toBe(
      true,
    );
  });

  it('无查询文本和向量时应跳过记忆检索并使用冷启动聚合分数', async () => {
    const db = createMockDb([
      [
        { routerModelId: 'router-a', modelConfigId: 'config-a' },
        { routerModelId: 'router-b', modelConfigId: 'candidate-b' },
        { routerModelId: 'router-x', modelConfigId: 'missing' },
      ],
      [
        {
          modelId: 'router-a',
          performanceScore: 2,
          latencyMs: 0,
          tokenCount: 0,
        },
        {
          modelId: 'router-a',
          performanceScore: '-1',
          latencyMs: 0,
          tokenCount: 0,
        },
        {
          modelId: 'router-b',
          performanceScore: 'bad',
          latencyMs: 0,
          tokenCount: 0,
        },
        {
          modelId: 'router-x',
          performanceScore: 1,
          latencyMs: 0,
          tokenCount: 0,
        },
      ],
    ]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0, output: 0 }),
      createCandidate('candidate-b', 'config-b', { input: 0, output: 0 }),
      createCandidate('candidate-c', 'config-c', { input: 0, output: 0 }),
    ];
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService, {
      alpha: 1,
      beta: 0,
      gamma: 0,
    });

    const decision = await router.routeSingle(
      candidates,
      createContext({ queryEmbedding: [], queryText: '' }),
    );

    expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    expect(qdrantClient.search).not.toHaveBeenCalled();
    expect(decision.selectedModelId).toBe('candidate-a');
    expect(decision.reasoning).toContain('冷启动');
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
  ])('$name 时应按质量分数回退', async ({ dbResults }) => {
    const db = createMockDb(dbResults);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([]);
    const candidates = [
      createCandidate('candidate-a', 'config-a', { input: 0, output: 0 }),
      createCandidate('candidate-b', 'config-b', { input: 0, output: 0 }),
    ];
    candidates[0].routingMeta.qualityRank = 50;
    candidates[1].routingMeta.qualityRank = 100;
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService);

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-b');
    expect(decision.scores.map(({ score }) => score)).toEqual([50, 100]);
  });

  it('记忆检索失败时应暴露存储错误且不访问冷启动数据', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockRejectedValue(new Error('memory retrieval failed'));
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService);

    await expect(
      router.routeSingle(
        [
          createCandidate('candidate-a', 'config-a', {
            input: 0,
            output: 0,
          }),
        ],
        createContext(),
      ),
    ).rejects.toThrow('memory retrieval failed');
    expect(db.selectMock).not.toHaveBeenCalled();
  });

  it('空候选集应拒绝产生无模型决策', async () => {
    const db = createMockDb([[]]);
    const embeddingService = createMockEmbeddingService();
    const qdrantClient = createMockQdrantClient();
    qdrantClient.search.mockResolvedValue([]);
    const router = new MemoryBankRouter(db.db, qdrantClient, embeddingService);

    await expect(
      router.routeSingle([], createContext()),
    ).rejects.toBeInstanceOf(TypeError);
    expect(db.selectMock).not.toHaveBeenCalled();
  });
});
