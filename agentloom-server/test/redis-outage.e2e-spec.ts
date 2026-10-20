import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

import { Logger, type INestApplication } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Server } from 'socket.io';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { RedisIoAdapter } from '../src/common/adapters/redis-io.adapter';
import { toBullMqConnectionOptions } from '../src/common/redis/redis-connection.util';
import {
  startTcpFaultProxy,
  type TcpFaultProxy,
} from './support/tcp-fault-proxy';

/**
 * Redis 中断故障注入（D-220 / D-221）：经可中断的 TCP 代理连接真实 Redis，
 * 断开代理模拟 `docker stop redis`，不影响共享 Redis 上的其他连接。
 */
describe('Redis 中断恢复', () => {
  const redisUrl = new URL(process.env.APP_REDIS_URL!);
  let proxy: TcpFaultProxy;
  let proxiedUrl: string;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeAll(async () => {
    proxy = await startTcpFaultProxy(
      redisUrl.hostname,
      parseInt(redisUrl.port, 10) || 6379,
    );
    const url = new URL(redisUrl);
    url.hostname = '127.0.0.1';
    url.port = String(proxy.port);
    proxiedUrl = url.toString();
    process.on('unhandledRejection', onUnhandled);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await proxy.up().catch(() => {});
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandled);
    await proxy.close();
    vi.restoreAllMocks();
  });

  it('中断约 3 秒期间持续广播 Socket.IO 事件，进程不出现未处理的 rejection，恢复后可继续广播', async () => {
    const httpServer: HttpServer = createServer();
    const adapter = new RedisIoAdapter(
      httpServer as unknown as INestApplication,
      proxiedUrl,
    );
    await adapter.connectToRedis();
    const io = adapter.createIOServer(0) as Server;
    const probe = new Redis(redisUrl.toString());
    try {
      // adapter 构造时的 psubscribe/subscribe 不处理 rejection（启动时 Redis 正常），先等它们完成再断开
      await sleep(500);
      await proxy.down();
      for (let i = 0; i < 6; i += 1) {
        io.emit('e2e-c5fix-redis-outage', { i });
        await sleep(500);
      }
      // 等 ioredis 用完 maxRetriesPerRequest 的重试，被拒绝的 publish 都已结算
      await sleep(1_500);
      expect(unhandled).toEqual([]);

      await proxy.up();
      const channel = `socket.io#/#`;
      const subscriber = probe.duplicate();
      await subscriber.psubscribe(`${channel}*`);
      const received = new Promise<void>((resolve) =>
        subscriber.once('pmessageBuffer', () => resolve()),
      );
      // 重连退避封顶 2s
      const deadline = Date.now() + 10_000;
      let delivered = false;
      while (!delivered && Date.now() < deadline) {
        io.emit('e2e-c5fix-redis-outage', { recovered: true });
        delivered = await Promise.race([
          received.then(() => true),
          sleep(500).then(() => false),
        ]);
      }
      subscriber.disconnect();
      expect(delivered).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      probe.disconnect();
      await adapter.close(io);
    }
  }, 30_000);

  it('Redis 空闲中断超过 worker 阻塞看门狗周期后恢复，worker 继续取任务', async () => {
    const prefix = `e2e-c5fix-redis-${randomUUID()}`;
    const queueName = 'outage';
    const processed: string[] = [];
    const worker = new Worker(
      queueName,
      async (job) => {
        processed.push(job.name);
      },
      { connection: toBullMqConnectionOptions(proxiedUrl), prefix },
    );
    worker.on('error', () => {});
    const queue = new Queue(queueName, {
      connection: toBullMqConnectionOptions(redisUrl.toString()),
      prefix,
    });

    try {
      await worker.waitUntilReady();
      await queue.add('before', {});
      await vi.waitFor(() => expect(processed).toContain('before'), {
        timeout: 5_000,
      });

      // drainDelay 5s + 看门狗余量 1s：中断 8s 必然跨过一次看门狗触发（bullmq#4585 的触发条件）
      await proxy.down();
      await sleep(8_000);
      await proxy.up();

      await queue.add('after', {});
      await vi.waitFor(() => expect(processed).toContain('after'), {
        timeout: 20_000,
        interval: 250,
      });
    } finally {
      await worker.close(true);
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    }
  }, 60_000);
});
