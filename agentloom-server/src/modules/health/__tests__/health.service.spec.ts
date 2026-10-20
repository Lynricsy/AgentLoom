import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { Job, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import {
  ServiceNotReadyException,
  ServiceUnhealthyException,
} from '../health.exceptions';
import {
  HEALTH_DEPENDENCY_TIMEOUT_MS,
  HealthService,
  WORKER_STALL_LIVENESS_THRESHOLD_MS,
} from '../health.service';

interface FakeWorker {
  name: string;
  running: boolean;
  blockingStatus: string;
}

class FakeHost extends WorkerHost {
  private readonly fakeWorker: Worker;

  constructor(fake: FakeWorker) {
    super();
    this.fakeWorker = {
      name: fake.name,
      isRunning: () => fake.running,
      getBackend: () => ({
        blockingClient: Promise.resolve({ status: fake.blockingStatus }),
      }),
    } as unknown as Worker;
  }

  override get worker(): Worker {
    return this.fakeWorker;
  }

  async process(_job: Job): Promise<void> {}
}

function setup(workers: FakeWorker[]) {
  const db = { execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const redis = { status: 'ready', ping: vi.fn().mockResolvedValue('PONG') };
  const hosts = workers.map((fake) => new FakeHost(fake));
  const discoveryService = {
    getProviders: () => hosts.map((instance) => ({ instance })),
  };
  const service = new HealthService(
    db as unknown as DrizzleDB,
    redis as unknown as Redis,
    discoveryService as unknown as DiscoveryService,
  );
  return { service, db, redis };
}

async function readinessError(service: HealthService) {
  try {
    await service.checkReadiness();
  } catch (error) {
    return error as ServiceNotReadyException;
  }
  throw new Error('readiness 应当失败');
}

describe('HealthService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('PostgreSQL、Redis 与 worker 都正常时 readiness 通过', async () => {
    const { service } = setup([
      { name: 'a', running: true, blockingStatus: 'ready' },
    ]);

    const checks = await service.checkReadiness();

    expect(checks.database.status).toBe('up');
    expect(checks.redis.status).toBe('up');
    expect(checks.workers).toEqual({ status: 'up', total: 1, unavailable: 0 });
  });

  it('PostgreSQL 查询失败时 readiness 返回 503，并标出 database', async () => {
    const { service, db } = setup([]);
    db.execute.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await readinessError(service);

    expect(error).toBeInstanceOf(ServiceNotReadyException);
    expect(error.getStatus()).toBe(503);
    expect(error.extensions).toEqual({
      checks: expect.objectContaining({
        database: { status: 'down' },
        redis: expect.objectContaining({ status: 'up' }),
      }),
    });
  });

  it('PostgreSQL 挂起时 readiness 超时失败，且后续探针复用同一个查询而不堆积', async () => {
    vi.useFakeTimers();
    const { service, db } = setup([]);
    db.execute.mockReturnValue(new Promise(() => {}));

    const first = readinessError(service);
    await vi.advanceTimersByTimeAsync(HEALTH_DEPENDENCY_TIMEOUT_MS);
    expect((await first).extensions).toEqual({
      checks: expect.objectContaining({ database: { status: 'down' } }),
    });

    const second = readinessError(service);
    await vi.advanceTimersByTimeAsync(HEALTH_DEPENDENCY_TIMEOUT_MS);
    await second;
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('Redis 连接未就绪时 readiness 失败且不发 PING', async () => {
    const { service, redis } = setup([]);
    redis.status = 'reconnecting';

    const error = await readinessError(service);

    expect(error.extensions).toEqual({
      checks: expect.objectContaining({ redis: { status: 'down' } }),
    });
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('worker 停止或阻塞连接未就绪时 readiness 失败', async () => {
    const { service } = setup([
      { name: 'a', running: true, blockingStatus: 'ready' },
      { name: 'b', running: true, blockingStatus: 'reconnecting' },
      { name: 'c', running: false, blockingStatus: 'ready' },
    ]);

    const error = await readinessError(service);

    expect(error.extensions).toEqual({
      checks: expect.objectContaining({
        workers: { status: 'down', total: 3, unavailable: 2 },
      }),
    });
  });

  it('liveness 不受 PostgreSQL、Redis 中断影响', async () => {
    vi.useFakeTimers();
    const fake = { name: 'a', running: true, blockingStatus: 'reconnecting' };
    const { service, db, redis } = setup([fake]);
    db.execute.mockRejectedValue(new Error('down'));
    redis.status = 'reconnecting';

    await service.checkLiveness();
    vi.advanceTimersByTime(WORKER_STALL_LIVENESS_THRESHOLD_MS * 3);
    await expect(service.checkLiveness()).resolves.toBeUndefined();

    // Redis 刚恢复、worker 还在重连的窗口不应被当作卡死
    redis.status = 'ready';
    await expect(service.checkLiveness()).resolves.toBeUndefined();
    fake.blockingStatus = 'ready';
    await expect(service.checkLiveness()).resolves.toBeUndefined();
  });

  it('Redis 可用但 worker 持续无法取任务超过阈值时 liveness 失败，恢复后重新通过', async () => {
    vi.useFakeTimers();
    const fake = { name: 'a', running: true, blockingStatus: 'reconnecting' };
    const { service } = setup([fake]);

    await service.checkLiveness();
    vi.advanceTimersByTime(WORKER_STALL_LIVENESS_THRESHOLD_MS - 1);
    await expect(service.checkLiveness()).resolves.toBeUndefined();

    vi.advanceTimersByTime(1);
    await expect(service.checkLiveness()).rejects.toBeInstanceOf(
      ServiceUnhealthyException,
    );

    fake.blockingStatus = 'ready';
    await expect(service.checkLiveness()).resolves.toBeUndefined();
  });
});
