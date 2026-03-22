import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoutingCandidate } from '../../core/routing-candidate';
import { CircuitBreakerService } from '../circuit-breaker.service';
import { HealthMonitorService } from '../health-monitor.service';

const {
  createInsertChain,
  createMockDb,
  createSelectChain,
} = vi.hoisted(() => {
  type SelectChain<T> = {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  } & Promise<T[]>;

  function createSelectChain<T>(data: T[]): SelectChain<T> {
    const chain = Promise.resolve(data) as SelectChain<T>;
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    return chain;
  }

  function createInsertChain() {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    return {
      values,
      onConflictDoUpdate,
    };
  }

  return {
    createSelectChain,
    createInsertChain,
    createMockDb: () => ({
      select: vi.fn(),
      insert: vi.fn(),
    }),
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db) => db),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000010';

function createCandidate(
  id: string,
  provider: string,
  healthStatus: RoutingCandidate['healthStatus'] = 'healthy',
): RoutingCandidate {
  return {
    id,
    modelConfigId: `${id}-config`,
    name: `${provider}-${id}`,
    provider,
    healthStatus,
    routingMeta: {
      contextWindow: 128_000,
      costs: {
        input: 0.001,
        output: 0.002,
      },
      qualityRank: 90,
      avgLatencyMs: 400,
      maxInputTokens: 128_000,
      eloRating: 1_500,
    },
  };
}

describe('HealthMonitorService', () => {
  let db: ReturnType<typeof createMockDb>;
  let breaker: CircuitBreakerService;
  let service: HealthMonitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    db = createMockDb();
    db.select.mockReturnValue(createSelectChain([]));
    db.insert.mockImplementation(() => createInsertChain());

    const breakerDb = db as ConstructorParameters<typeof CircuitBreakerService>[0];

    breaker = new CircuitBreakerService(breakerDb, {
      persistenceIntervalMs: 0,
      recoveryTimeoutMs: 5 * 60 * 1000,
      windowMs: 5 * 60 * 1000,
    });
    service = new HealthMonitorService(breaker);
  });

  afterEach(() => {
    breaker.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recordSuccess / recordFailure 会更新并返回可查询的健康状态', async () => {
    await service.recordFailure(
      TENANT_ID,
      'openai',
      '00000000-0000-0000-0000-000000000101',
      new Error('boom'),
    );
    await service.recordSuccess(
      TENANT_ID,
      'anthropic',
      '00000000-0000-0000-0000-000000000102',
    );

    const allStatuses = await service.getHealthStatus(TENANT_ID);
    const openAiStatuses = await service.getHealthStatus(TENANT_ID, 'openai');
    const singleStatus = await service.getHealthStatus(
      TENANT_ID,
      'anthropic',
      '00000000-0000-0000-0000-000000000102',
    );

    expect(allStatuses).toHaveLength(2);
    expect(openAiStatuses).toHaveLength(1);
    expect(openAiStatuses[0]?.provider).toBe('openai');
    expect(singleStatus).toEqual([
      expect.objectContaining({
        provider: 'anthropic',
        modelId: '00000000-0000-0000-0000-000000000102',
        status: 'healthy',
      }),
    ]);
  });

  it('filterHealthyCandidates 会移除 open 候选并同步更新剩余候选的 healthStatus', async () => {
    const openCandidate = createCandidate(
      '00000000-0000-0000-0000-000000000201',
      'openai',
    );
    const degradedCandidate = createCandidate(
      '00000000-0000-0000-0000-000000000202',
      'anthropic',
    );
    const healthyCandidate = createCandidate(
      '00000000-0000-0000-0000-000000000203',
      'google',
    );

    await service.recordFailure(
      TENANT_ID,
      openCandidate.provider,
      openCandidate.id,
      new Error('boom-1'),
    );
    await service.recordFailure(
      TENANT_ID,
      openCandidate.provider,
      openCandidate.id,
      new Error('boom-2'),
    );
    await service.recordFailure(
      TENANT_ID,
      openCandidate.provider,
      openCandidate.id,
      new Error('boom-3'),
    );

    await service.recordFailure(
      TENANT_ID,
      degradedCandidate.provider,
      degradedCandidate.id,
      new Error('boom-a'),
    );
    await service.recordSuccess(
      TENANT_ID,
      degradedCandidate.provider,
      degradedCandidate.id,
    );
    await service.recordFailure(
      TENANT_ID,
      degradedCandidate.provider,
      degradedCandidate.id,
      new Error('boom-b'),
    );

    const filtered = await service.filterHealthyCandidates(TENANT_ID, [
      openCandidate,
      degradedCandidate,
      healthyCandidate,
    ]);

    expect(filtered.map((candidate) => candidate.id)).toEqual([
      degradedCandidate.id,
      healthyCandidate.id,
    ]);
    expect(filtered[0]?.healthStatus).toBe('degraded');
    expect(filtered[1]?.healthStatus).toBe('healthy');
  });

  it('当所有候选都不可用时会抛出异常而不是返回空数组', async () => {
    const onlyCandidate = createCandidate(
      '00000000-0000-0000-0000-000000000301',
      'openai',
    );

    await service.recordFailure(
      TENANT_ID,
      onlyCandidate.provider,
      onlyCandidate.id,
      new Error('boom-1'),
    );
    await service.recordFailure(
      TENANT_ID,
      onlyCandidate.provider,
      onlyCandidate.id,
      new Error('boom-2'),
    );
    await service.recordFailure(
      TENANT_ID,
      onlyCandidate.provider,
      onlyCandidate.id,
      new Error('boom-3'),
    );

    await expect(
      service.filterHealthyCandidates(TENANT_ID, [onlyCandidate]),
    ).rejects.toThrow('No healthy routing candidates available');
  });
});
