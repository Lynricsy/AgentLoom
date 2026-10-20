import { Inject, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { collectQueueWorkers } from '../../common/services/queue-workers.util';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  ServiceNotReadyException,
  ServiceUnhealthyException,
} from './health.exceptions';

/** 单项依赖检查的超时；探针的 timeoutSeconds 必须大于它 */
export const HEALTH_DEPENDENCY_TIMEOUT_MS = 2_000;

/**
 * Redis 连接正常、但 worker 持续无法取任务超过这个时长时，liveness 失败，交给编排层重启进程。
 * 只在 Redis 可用期间计时，Redis 中断本身不会触发重启。
 */
export const WORKER_STALL_LIVENESS_THRESHOLD_MS = 120_000;

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs?: number;
}

export interface WorkersCheck {
  status: 'up' | 'down';
  total: number;
  unavailable: number;
}

export interface ReadinessChecks {
  database: DependencyCheck;
  redis: DependencyCheck;
  workers: WorkersCheck;
}

type ProbeName = 'database' | 'redis';

/**
 * 健康检查语义：
 * - liveness 只回答“进程是否需要重启”：事件循环能响应即通过；唯一的失败条件是 Redis 可用但 worker
 *   长时间取不到任务（重连失败卡死，只能重启恢复）。PostgreSQL、Redis 中断不会让 liveness 失败。
 * - readiness 回答“现在能否处理请求和任务”：PostgreSQL `select 1`、Redis `PING` 与全部队列 worker
 *   都正常才通过。
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  /** 进行中的依赖探测：依赖挂起时后续探针复用同一个请求，不在连接池里堆积查询 */
  private readonly inflightProbes = new Map<ProbeName, Promise<unknown>>();
  private readonly lastProbeStatus = new Map<
    ProbeName,
    DependencyCheck['status']
  >();
  /** worker → Redis 可用期间首次观察到它无法取任务的时间 */
  private readonly unavailableSince = new Map<Worker, number>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly discoveryService: DiscoveryService,
  ) {}

  async checkReadiness(): Promise<ReadinessChecks> {
    const [database, redis, workers] = await Promise.all([
      this.probe('database', () => this.db.execute(sql`select 1`)),
      this.redis.status === 'ready'
        ? this.probe('redis', () => this.redis.ping())
        : this.markProbe('redis', { status: 'down' }),
      this.checkWorkers(),
    ]);
    const checks: ReadinessChecks = { database, redis, workers };
    if (
      database.status === 'down' ||
      redis.status === 'down' ||
      workers.status === 'down'
    ) {
      throw new ServiceNotReadyException(checks);
    }
    return checks;
  }

  async checkLiveness(): Promise<void> {
    await this.checkWorkers();
    const now = Date.now();
    const stalledSince = [...this.unavailableSince.values()].filter(
      (since) => now - since >= WORKER_STALL_LIVENESS_THRESHOLD_MS,
    );
    if (stalledSince.length > 0) {
      throw new ServiceUnhealthyException(
        stalledSince.length,
        Math.floor((now - Math.min(...stalledSince)) / 1000),
      );
    }
  }

  /**
   * worker 可取任务 = 正在运行且专用阻塞连接处于 ready。
   * 同时维护 stall 计时：Redis 主连接不可用时清零，避免依赖恢复后的重连窗口被误判为卡死。
   */
  private async checkWorkers(): Promise<WorkersCheck> {
    const workers = collectQueueWorkers(this.discoveryService);
    const redisReady = this.redis.status === 'ready';
    const now = Date.now();
    let unavailable = 0;

    for (const worker of workers) {
      if (await this.isWorkerFetching(worker)) {
        if (this.unavailableSince.delete(worker)) {
          this.logger.log(`队列 ${worker.name} 的 worker 已恢复取任务`);
        }
        continue;
      }
      unavailable += 1;
      if (!redisReady) {
        this.unavailableSince.delete(worker);
      } else if (!this.unavailableSince.has(worker)) {
        this.unavailableSince.set(worker, now);
        this.logger.warn(
          `Redis 可用，但队列 ${worker.name} 的 worker 无法取任务（未运行或阻塞连接未就绪）`,
        );
      }
    }
    for (const worker of this.unavailableSince.keys()) {
      if (!workers.includes(worker)) {
        this.unavailableSince.delete(worker);
      }
    }

    return {
      status: unavailable === 0 ? 'up' : 'down',
      total: workers.length,
      unavailable,
    };
  }

  private async isWorkerFetching(worker: Worker): Promise<boolean> {
    if (!worker.isRunning()) {
      return false;
    }
    try {
      const blockingClient = await worker.getBackend().blockingClient;
      return blockingClient?.status === 'ready';
    } catch {
      // 连接初始化失败
      return false;
    }
  }

  private async probe(
    name: ProbeName,
    run: () => Promise<unknown>,
  ): Promise<DependencyCheck> {
    const startedAt = Date.now();
    let inflight = this.inflightProbes.get(name);
    if (!inflight) {
      inflight = run().finally(() => this.inflightProbes.delete(name));
      this.inflightProbes.set(name, inflight);
    }

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${HEALTH_DEPENDENCY_TIMEOUT_MS}ms 内没有响应`)),
        HEALTH_DEPENDENCY_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([inflight, timeout]);
      return this.markProbe(name, {
        status: 'up',
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      return this.markProbe(
        name,
        { status: 'down' },
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** 只在状态切换时记日志，依赖长时间中断期间探针不刷屏 */
  private markProbe(
    name: ProbeName,
    check: DependencyCheck,
    reason = '连接未就绪',
  ): DependencyCheck {
    const previous = this.lastProbeStatus.get(name);
    if (previous !== check.status) {
      this.lastProbeStatus.set(name, check.status);
      if (check.status === 'down') {
        this.logger.warn(`健康检查：${name} 不可用: ${reason}`);
      } else if (previous === 'down') {
        this.logger.log(`健康检查：${name} 已恢复`);
      }
    }
    return check;
  }
}
