import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { providerHealthStatus } from '../../../../database/schema/provider-health-status.schema';
import { CircuitBreakerService } from '../circuit-breaker.service';

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

type ProviderHealthRow = typeof providerHealthStatus.$inferSelect;

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const PROVIDER = 'openai';
const MODEL_ID = '00000000-0000-0000-0000-000000000110';

function createPersistedRow(
  overrides: Partial<ProviderHealthRow> = {},
): ProviderHealthRow {
  return {
    id: '00000000-0000-0000-0000-000000000999',
    tenantId: TENANT_ID,
    providerName: PROVIDER,
    modelId: MODEL_ID,
    status: 'healthy',
    failureCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    circuitOpenedAt: null,
    windowStartAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CircuitBreakerService', () => {
  let db: ReturnType<typeof createMockDb>;
  let service: CircuitBreakerService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    db = createMockDb();
    db.select.mockReturnValue(createSelectChain([]));
    db.insert.mockImplementation(() => createInsertChain());

    const breakerDb = db as ConstructorParameters<typeof CircuitBreakerService>[0];

    service = new CircuitBreakerService(breakerDb, {
      persistenceIntervalMs: 0,
      recoveryTimeoutMs: 5 * 60 * 1000,
      windowMs: 5 * 60 * 1000,
    });
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('三次连续失败后会打开熔断器并持久化 open 状态', async () => {
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-1'));
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-2'));
    const snapshot = await service.recordFailure(
      TENANT_ID,
      PROVIDER,
      MODEL_ID,
      new Error('boom-3'),
    );

    expect(snapshot.status).toBe('open');
    expect(snapshot.phase).toBe('open');
    expect(snapshot.consecutiveFailureCount).toBe(3);
    expect(snapshot.failureCount).toBe(3);
    expect(snapshot.circuitOpenedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(db.insert).toHaveBeenCalledTimes(3);
  });

  it('滑动窗口内失败率超过 50% 时进入 degraded，窗口过期后恢复 healthy', async () => {
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-1'));
    await service.recordSuccess(TENANT_ID, PROVIDER, MODEL_ID);
    const degraded = await service.recordFailure(
      TENANT_ID,
      PROVIDER,
      MODEL_ID,
      new Error('boom-2'),
    );

    expect(degraded.status).toBe('degraded');
    expect(degraded.phase).toBe('closed');
    expect(degraded.failureRate).toBeCloseTo(2 / 3, 5);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const recovered = await service.getStatus(TENANT_ID, PROVIDER, MODEL_ID);

    expect(recovered.status).toBe('healthy');
    expect(recovered.failureRate).toBe(0);
    expect(recovered.failureCount).toBe(0);
  });

  it('恢复超时后会自动进入 half-open，并在探测成功后恢复 healthy', async () => {
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-1'));
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-2'));
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-3'));

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    const stillOpen = await service.getStatus(TENANT_ID, PROVIDER, MODEL_ID);
    expect(stillOpen.status).toBe('open');
    expect(stillOpen.phase).toBe('open');

    vi.advanceTimersByTime(1);
    const halfOpen = await service.getStatus(TENANT_ID, PROVIDER, MODEL_ID);
    expect(halfOpen.status).toBe('degraded');
    expect(halfOpen.phase).toBe('half-open');

    const recovered = await service.recordSuccess(TENANT_ID, PROVIDER, MODEL_ID);
    expect(recovered.status).toBe('healthy');
    expect(recovered.phase).toBe('closed');
    expect(recovered.consecutiveFailureCount).toBe(0);
    expect(recovered.circuitOpenedAt).toBeNull();
  });

  it('half-open 探测失败会重新打开熔断器并刷新打开时间', async () => {
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-1'));
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-2'));
    await service.recordFailure(TENANT_ID, PROVIDER, MODEL_ID, new Error('boom-3'));

    vi.advanceTimersByTime(5 * 60 * 1000);
    const halfOpen = await service.getStatus(TENANT_ID, PROVIDER, MODEL_ID);
    expect(halfOpen.phase).toBe('half-open');

    vi.advanceTimersByTime(15_000);
    const reopened = await service.recordFailure(
      TENANT_ID,
      PROVIDER,
      MODEL_ID,
      new Error('probe failed'),
    );

    expect(reopened.status).toBe('open');
    expect(reopened.phase).toBe('open');
    expect(reopened.circuitOpenedAt).toBe('2025-01-01T00:05:15.000Z');
  });

  it('缓存未命中时会从 provider_health_status 表加载已持久化状态', async () => {
    service.onModuleDestroy();

    const selectChain = createSelectChain([
      createPersistedRow({
        status: 'open',
        failureCount: 3,
        lastFailureAt: new Date('2025-01-01T00:00:00.000Z'),
        circuitOpenedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    db.select.mockReturnValueOnce(selectChain);

    const breakerDb = db as ConstructorParameters<typeof CircuitBreakerService>[0];

    service = new CircuitBreakerService(breakerDb, {
      persistenceIntervalMs: 0,
      recoveryTimeoutMs: 5 * 60 * 1000,
      windowMs: 5 * 60 * 1000,
    });

    const snapshot = await service.getStatus(TENANT_ID, PROVIDER, MODEL_ID);

    expect(selectChain.from).toHaveBeenCalledWith(providerHealthStatus);
    expect(snapshot.status).toBe('open');
    expect(snapshot.phase).toBe('open');
    expect(snapshot.failureCount).toBe(3);
  });
});
