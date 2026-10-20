import { setTimeout as sleep } from 'node:timers/promises';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RedisThrottlerStorageService } from '../src/common/redis/redis-throttler-storage.service';

const NAME = 'default';

/**
 * 在真实 Redis 上验证节流计数的固定窗口语义（D-211、D-215）：
 * 判定按每次调用传入的上限进行，没有独立于上限的阻断键；被拦截的请求不计数。
 */
describe('RedisThrottlerStorageService (testcontainers)', () => {
  let container: StartedTestContainer;
  let redis: Redis;
  let storage: RedisThrottlerStorageService;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redis = new Redis(container.getMappedPort(6379), container.getHost());
    storage = new RedisThrottlerStorageService(redis);
  }, 120_000);

  afterAll(async () => {
    await redis?.quit();
    await container?.stop();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  it('超限后调高上限，下一次请求立即按新上限放行', async () => {
    await storage.increment('k', 60_000, 2, 60_000, NAME);
    await storage.increment('k', 60_000, 2, 60_000, NAME);
    const blocked = await storage.increment('k', 60_000, 2, 60_000, NAME);

    expect(blocked.isBlocked).toBe(true);
    expect(blocked.totalHits).toBe(2);

    const raised = await storage.increment('k', 60_000, 100, 60_000, NAME);

    expect(raised).toMatchObject({ isBlocked: false, totalHits: 3 });
  });

  it('被拦截的请求不计数：反复重试后小幅调高上限仍能放行对应次数', async () => {
    for (let index = 0; index < 2; index += 1) {
      await storage.increment('k', 60_000, 2, 60_000, NAME);
    }
    for (let index = 0; index < 5; index += 1) {
      const result = await storage.increment('k', 60_000, 2, 60_000, NAME);
      expect(result.isBlocked).toBe(true);
    }

    const allowed = await storage.increment('k', 60_000, 3, 60_000, NAME);
    const blockedAgain = await storage.increment('k', 60_000, 3, 60_000, NAME);

    expect(allowed).toMatchObject({ isBlocked: false, totalHits: 3 });
    expect(blockedAgain).toMatchObject({ isBlocked: true, totalHits: 3 });
  });

  it('调低上限立即生效，拦截时给出窗口剩余秒数', async () => {
    for (let index = 0; index < 3; index += 1) {
      await storage.increment('k', 60_000, 5, 60_000, NAME);
    }

    const blocked = await storage.increment('k', 60_000, 2, 60_000, NAME);

    expect(blocked.isBlocked).toBe(true);
    expect(blocked.totalHits).toBe(3);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    expect(blocked.timeToBlockExpire).toBeLessThanOrEqual(60);
    expect(blocked.timeToExpire).toBe(blocked.timeToBlockExpire);
  });

  it('窗口到期后重新计数', async () => {
    await storage.increment('k', 500, 1, 500, NAME);
    expect((await storage.increment('k', 500, 1, 500, NAME)).isBlocked).toBe(
      true,
    );

    await sleep(650);

    expect(await storage.increment('k', 500, 1, 500, NAME)).toMatchObject({
      isBlocked: false,
      totalHits: 1,
    });
  });

  it('并发请求下放行数恰好等于上限', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        storage.increment('k', 60_000, 10, 60_000, NAME),
      ),
    );

    expect(results.filter((result) => !result.isBlocked)).toHaveLength(10);
  });
});
