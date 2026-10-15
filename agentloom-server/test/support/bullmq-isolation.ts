import { randomUUID } from 'node:crypto';

import { getSharedConfigToken } from '@nestjs/bullmq';
import type { QueueOptions } from 'bullmq';
import Redis from 'ioredis';

/**
 * 依赖真实队列 worker 的 AppModule e2e 用独立的 BullMQ key 前缀。
 *
 * 多个 spec 并行时各自启动一份 AppModule，全部连同一个 Redis、使用默认前缀 `bull`：
 * 一个 spec 入队的任务（如 jobId=conversationId 的对话执行）会被另一个 spec 的 worker 取走，
 * 在那个 spec 自己的数据库里处理（查不到对话就静默结束），本 spec 的任务因此丢失。
 * 用 `.overrideProvider(isolation.token).useValue(isolation.config)` 覆盖 `BullModule.forRootAsync`
 * 的共享配置，本 spec 的队列与 worker 只读写自己前缀下的 key；`afterAll` 中调用 `cleanup()` 删除这些 key。
 */
export interface BullMqIsolation {
  token: string;
  prefix: string;
  config: QueueOptions;
  cleanup: () => Promise<void>;
}

export function createBullMqIsolation(): BullMqIsolation {
  const redisUrl = process.env.APP_REDIS_URL;
  if (!redisUrl) {
    throw new Error('APP_REDIS_URL 未设置（应由 test/setup-e2e.ts 提供）');
  }
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: parseInt(url.port, 10) || 6379,
    password: url.password || undefined,
    db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
  };
  const prefix = `e2e-${randomUUID()}`;

  return {
    token: getSharedConfigToken(),
    prefix,
    config: { connection, prefix },
    cleanup: async () => {
      const redis = new Redis(connection);
      try {
        const keys: string[] = [];
        for await (const batch of redis.scanStream({
          match: `${prefix}:*`,
          count: 500,
        })) {
          keys.push(...(batch as string[]));
        }
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } finally {
        redis.disconnect();
      }
    },
  };
}
