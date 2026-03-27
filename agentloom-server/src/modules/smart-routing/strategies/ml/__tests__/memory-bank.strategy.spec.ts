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

function createMockDb(queryResults: unknown[][]): { db: MockDb } {
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
});
