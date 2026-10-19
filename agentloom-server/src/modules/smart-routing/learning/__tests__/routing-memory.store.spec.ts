import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../../database/database.module';
import type { RoutingCandidate } from '../../core/routing-candidate';
import { KnnRouter } from '../../strategies/ml/knn.strategy';
import { MemoryBankRouter } from '../../strategies/ml/memory-bank.strategy';
import { RoutingMemoryStore } from '../routing-memory.store';

/** Qdrant 对不存在集合的检索返回 404，客户端抛出只有 "Not Found" 的错误 */
function createQdrantClient(options: { exists: boolean }) {
  return {
    collectionExists: vi.fn().mockResolvedValue({ exists: options.exists }),
    createCollection: vi.fn().mockResolvedValue(true),
    createPayloadIndex: vi.fn().mockResolvedValue({}),
    search: options.exists
      ? vi.fn().mockResolvedValue([])
      : vi.fn().mockRejectedValue(new Error('Not Found')),
    upsert: vi.fn().mockResolvedValue({}),
  };
}

function createCandidate(id: string, qualityRank: number): RoutingCandidate {
  return {
    id,
    modelConfigId: id,
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

/** 冷启动查询（router_models / benchmarks）均无数据 */
function createEmptyDb(): Pick<DrizzleDB, 'select'> {
  return {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })),
  } as unknown as Pick<DrizzleDB, 'select'>;
}

const context = {
  inputTokenCount: 100,
  tenantId: 'tenant-1',
  queryText: '总结这段文字',
  queryEmbedding: [0.1, 0.2, 0.3],
};

describe('RoutingMemoryStore', () => {
  it('集合不存在时检索返回空且不访问 Qdrant 检索接口', async () => {
    const client = createQdrantClient({ exists: false });
    const store = new RoutingMemoryStore(client as never);

    await expect(
      store.search({ tenantId: 'tenant-1', vector: [0.1], limit: 5 }),
    ).resolves.toEqual([]);
    expect(client.search).not.toHaveBeenCalled();
  });

  it('集合存在时按租户过滤检索，并缓存存在性', async () => {
    const client = createQdrantClient({ exists: true });
    const store = new RoutingMemoryStore(client as never);

    await store.search({
      tenantId: 'tenant-1',
      vector: [0.1, 0.2],
      limit: 3,
      scoreThreshold: 0.5,
    });
    await store.search({ tenantId: 'tenant-1', vector: [0.1, 0.2], limit: 3 });

    expect(client.collectionExists).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith('routing_memory', {
      vector: [0.1, 0.2],
      limit: 3,
      score_threshold: 0.5,
      filter: {
        must: [{ key: 'tenant_id', match: { value: 'tenant-1' } }],
      },
      with_payload: true,
    });
  });

  it('首次写入时按向量维度建集合与 payload 索引，并发写入只建一次', async () => {
    const client = createQdrantClient({ exists: false });
    const store = new RoutingMemoryStore(client as never);
    const record = {
      id: 'decision-1',
      vector: [0.1, 0.2, 0.3],
      payload: { tenant_id: 'tenant-1' },
    };

    await Promise.all([
      store.upsert(record),
      store.upsert({ ...record, id: 'decision-2' }),
    ]);

    expect(client.createCollection).toHaveBeenCalledTimes(1);
    expect(client.createCollection).toHaveBeenCalledWith('routing_memory', {
      vectors: { size: 3, distance: 'Cosine' },
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith(
      'routing_memory',
      expect.objectContaining({
        field_name: 'tenant_id',
        field_schema: 'keyword',
      }),
    );
    expect(client.upsert).toHaveBeenCalledTimes(2);
    expect(client.upsert).toHaveBeenCalledWith('routing_memory', {
      wait: false,
      points: [record],
    });
  });

  it('其他实例已建好集合时建集合冲突不影响写入', async () => {
    const client = createQdrantClient({ exists: false });
    client.collectionExists
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: true });
    client.createCollection.mockRejectedValueOnce(new Error('Conflict'));
    const store = new RoutingMemoryStore(client as never);

    await store.upsert({ id: 'decision-1', vector: [0.1], payload: {} });

    expect(client.createPayloadIndex).not.toHaveBeenCalled();
    expect(client.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'knn',
      (store: RoutingMemoryStore) =>
        new KnnRouter(createEmptyDb(), store, { generateEmbedding: vi.fn() }),
    ],
    [
      'memory_bank',
      (store: RoutingMemoryStore) =>
        new MemoryBankRouter(createEmptyDb(), store, {
          generateEmbedding: vi.fn(),
        }),
    ],
  ])(
    '%s 在 routing_memory 集合不存在时走冷启动回退而不是报 Not Found',
    async (_name, createRouter) => {
      const store = new RoutingMemoryStore(
        createQdrantClient({ exists: false }) as never,
      );
      const router = createRouter(store);

      const decision = await router.route(
        [createCandidate('model-a', 60), createCandidate('model-b', 90)],
        context,
      );

      expect(decision.selectedModelId).toBe('model-b');
    },
  );
});
