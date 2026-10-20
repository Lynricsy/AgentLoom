import type { Logger } from '@nestjs/common';
import type { RedisOptions } from 'bullmq';
import type Redis from 'ioredis';

/** 断线重连的最大间隔：Redis 恢复后，各连接最迟在这个时间内重新连上 */
export const REDIS_RECONNECT_MAX_DELAY_MS = 2_000;

/**
 * 全部 ioredis 连接共用的重连退避：每次多等 200ms，封顶 2s，永不放弃。
 *
 * BullMQ 默认按 e^n 退避到 20s，Redis 中断十几秒后 worker 可能还要再等近 20s 才重连，
 * 因此 BullMQ 连接也显式使用这个策略。
 */
export function redisReconnectDelay(times: number): number {
  return Math.min(times * 200, REDIS_RECONNECT_MAX_DELAY_MS);
}

/**
 * 把 `APP_REDIS_URL` 转成 BullMQ 连接参数（BullMQ 按参数自建连接，不接受 URL）。
 * 阻塞连接的 `maxRetriesPerRequest: null` 由 BullMQ 自行设置。
 */
export function toBullMqConnectionOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
    retryStrategy: redisReconnectDelay,
  };
}

/**
 * 给 ioredis 连接挂上错误与恢复日志。
 *
 * 没有 `error` 监听时 ioredis 会把每次重连失败打成 `[ioredis] Unhandled error event` 刷屏，
 * 恢复时也没有任何日志。这里一次中断只记一条 WARN，重新 ready 时记一条恢复日志；
 * 连接正常时出现的错误照常逐条记录。
 */
export function observeRedisConnection(
  client: Redis,
  name: string,
  logger: Pick<Logger, 'warn' | 'log'>,
): Redis {
  let outageLogged = false;

  client.on('error', (error: Error) => {
    if (outageLogged) {
      return;
    }
    logger.warn(`Redis 连接 ${name} 出错，将自动重连: ${error.message}`);
    if (client.status !== 'ready') {
      outageLogged = true;
    }
  });
  client.on('ready', () => {
    if (outageLogged) {
      outageLogged = false;
      logger.log(`Redis 连接 ${name} 已恢复`);
    }
  });

  return client;
}
