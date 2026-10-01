import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { AgentApiStreamEvent } from '@agentloom/contracts';
import type Redis from 'ioredis';
import { setTimeout as sleep } from 'node:timers/promises';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { safeQuitRedis } from '../../common/redis/redis-shutdown.util';
import {
  AGENT_API_RUN_EVENTS_MAXLEN,
  AGENT_API_RUN_EVENTS_TTL_SECONDS,
  AGENT_API_STREAM_READ_BATCH,
  AGENT_API_STREAM_READ_BLOCK_MS,
  AGENT_API_STREAM_READ_RETRY_MS,
  buildAgentApiRunEventsKey,
} from './agent-api-runtime.constants';

export interface AgentApiStreamEntry {
  id: string;
  event: AgentApiStreamEvent;
}

export interface AgentApiStreamBounds {
  exists: boolean;
  firstId: string | null;
  lastId: string | null;
}

type StreamReply = [key: string, entries: [id: string, fields: string[]][]][];

interface StreamSubscription {
  key: string;
  /** 已投递给该订阅者的最后一个 entry id；只投递严格大于它的条目 */
  lastId: string;
  onEntry: (entry: AgentApiStreamEntry) => void;
  signal: AbortSignal;
}

/**
 * 每个 run 一条 Redis Stream，执行进程写入、任意 HTTP 进程读取。
 *
 * 读取侧每个进程只持有一条专用连接：所有订阅共享一个 `XREAD BLOCK` 循环，
 * 循环在首个订阅出现时启动、在没有订阅时退出，避免每个 SSE 连接各占一条阻塞连接。
 */
@Injectable()
export class AgentApiEventStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentApiEventStreamService.name);
  private readonly subscriptions = new Set<StreamSubscription>();
  private reader: Redis | null = null;
  /** 读取连接的 `CLIENT ID`（重连后失效），用于 `CLIENT UNBLOCK` */
  private readerClientId: number | null = null;
  private readBlocked = false;
  private readLoop: Promise<void> | null = null;
  private destroyed = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 追加一条事件并返回 entry id。
   * `XADD` 在调用当拍同步发出：同一连接上的命令按发出顺序执行，调用方依赖这一点保证事件顺序。
   */
  async append(runId: string, event: AgentApiStreamEvent): Promise<string> {
    const id = await this.redis.xadd(
      buildAgentApiRunEventsKey(runId),
      'MAXLEN',
      '~',
      AGENT_API_RUN_EVENTS_MAXLEN,
      '*',
      'event',
      event.event,
      'data',
      JSON.stringify(event.data),
    );

    if (!id) {
      throw new Error(`XADD returned no entry id for run ${runId}`);
    }

    return id;
  }

  async expire(
    runId: string,
    seconds = AGENT_API_RUN_EVENTS_TTL_SECONDS,
  ): Promise<void> {
    await this.redis.expire(buildAgentApiRunEventsKey(runId), seconds);
  }

  async getBounds(runId: string): Promise<AgentApiStreamBounds> {
    const key = buildAgentApiRunEventsKey(runId);
    const [first, last] = await Promise.all([
      this.redis.xrange(key, '-', '+', 'COUNT', 1),
      this.redis.xrevrange(key, '+', '-', 'COUNT', 1),
    ]);
    const firstId = first[0]?.[0] ?? null;
    const lastId = last[0]?.[0] ?? null;

    return { exists: firstId !== null, firstId, lastId };
  }

  /**
   * 订阅某个 run 的事件流：`afterId` 为 null 时从头读取。
   * 条目按流顺序、每条恰好一次投递；`signal` 中止后 resolve。
   */
  subscribe(
    runId: string,
    afterId: string | null,
    onEntry: (entry: AgentApiStreamEntry) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted || this.destroyed) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const subscription: StreamSubscription = {
        key: buildAgentApiRunEventsKey(runId),
        lastId: afterId ?? '0-0',
        onEntry,
        signal,
      };

      const finish = () => {
        this.subscriptions.delete(subscription);
        resolve();
      };

      signal.addEventListener('abort', finish, { once: true });
      if (this.destroyed) {
        finish();
        return;
      }

      this.subscriptions.add(subscription);
      this.ensureReadLoop();
      this.interruptBlockedRead();
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.subscriptions.clear();

    if (this.reader) {
      await safeQuitRedis(this.reader);
    }
  }

  private ensureReadLoop(): void {
    if (this.readLoop || this.destroyed) {
      return;
    }

    this.readLoop = this.runReadLoop().finally(() => {
      this.readLoop = null;
      // 循环退出与新订阅加入之间可能交错，补一次启动检查
      if (this.subscriptions.size > 0) {
        this.ensureReadLoop();
      }
    });
  }

  private getReader(): Redis {
    if (!this.reader) {
      const reader = this.redis.duplicate();
      reader.on('ready', () => {
        this.readerClientId = null;
      });
      this.reader = reader;
    }
    return this.reader;
  }

  /**
   * 读取连接正阻塞在旧的游标集合上时，让它立即返回，新订阅无需等满一个阻塞周期。
   * 与读取返回交错时最多多跑一轮循环，没有副作用。
   */
  private interruptBlockedRead(): void {
    if (!this.readBlocked || this.readerClientId === null) {
      return;
    }

    void this.redis
      .client('UNBLOCK', this.readerClientId)
      .catch((error: unknown) => {
        this.logger.debug(
          `CLIENT UNBLOCK 失败，新订阅将在下一个读取周期加入: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async runReadLoop(): Promise<void> {
    const reader = this.getReader();

    while (!this.destroyed && this.subscriptions.size > 0) {
      // 本轮参与者快照：读取期间新加入的订阅等下一轮按自己的游标读取，
      // 否则会从比它游标更靠后的位置开始投递而漏掉中间条目。
      const participants = [...this.subscriptions].filter(
        (subscription) => !subscription.signal.aborted,
      );
      const cursors = new Map<string, string>();
      for (const subscription of participants) {
        const current = cursors.get(subscription.key);
        if (!current || compareStreamIds(subscription.lastId, current) < 0) {
          cursors.set(subscription.key, subscription.lastId);
        }
      }

      if (cursors.size === 0) {
        continue;
      }

      let reply: StreamReply | null;
      try {
        this.readerClientId ??= Number(await reader.client('ID'));
        this.readBlocked = true;
        reply = (await reader.xread(
          'COUNT',
          AGENT_API_STREAM_READ_BATCH,
          'BLOCK',
          AGENT_API_STREAM_READ_BLOCK_MS,
          'STREAMS',
          ...cursors.keys(),
          ...cursors.values(),
        )) as StreamReply | null;
      } catch (error) {
        if (this.destroyed) {
          return;
        }

        this.logger.warn(
          `Agent API 事件流读取失败，${AGENT_API_STREAM_READ_RETRY_MS}ms 后重试: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await sleep(AGENT_API_STREAM_READ_RETRY_MS);
        continue;
      } finally {
        this.readBlocked = false;
      }

      if (!reply) {
        continue;
      }

      for (const [key, entries] of reply) {
        this.dispatch(
          participants.filter((subscription) => subscription.key === key),
          entries,
        );
      }
    }
  }

  private dispatch(
    subscriptions: StreamSubscription[],
    entries: [id: string, fields: string[]][],
  ): void {
    for (const [id, fields] of entries) {
      const event = parseStreamEvent(fields);
      if (!event) {
        this.logger.warn(`忽略无法解析的 Agent API 事件流条目 ${id}`);
      }

      for (const subscription of subscriptions) {
        if (
          subscription.signal.aborted ||
          compareStreamIds(id, subscription.lastId) <= 0
        ) {
          continue;
        }

        subscription.lastId = id;
        if (!event) {
          continue;
        }

        try {
          subscription.onEntry({ id, event });
        } catch (error) {
          this.logger.warn(
            `Agent API 事件订阅回调失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }
}

function parseStreamEvent(fields: string[]): AgentApiStreamEvent | null {
  let name: string | undefined;
  let rawData: string | undefined;
  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (fields[index] === 'event') {
      name = fields[index + 1];
    } else if (fields[index] === 'data') {
      rawData = fields[index + 1];
    }
  }

  if (!name || rawData === undefined) {
    return null;
  }

  try {
    return {
      event: name,
      data: JSON.parse(rawData) as unknown,
    } as AgentApiStreamEvent;
  } catch {
    return null;
  }
}

/** 按 `<ms>-<seq>` 数值比较 stream entry id */
export function compareStreamIds(left: string, right: string): number {
  const [leftMs, leftSeq] = splitStreamId(left);
  const [rightMs, rightSeq] = splitStreamId(right);
  if (leftMs !== rightMs) {
    return leftMs < rightMs ? -1 : 1;
  }
  if (leftSeq !== rightSeq) {
    return leftSeq < rightSeq ? -1 : 1;
  }
  return 0;
}

function splitStreamId(id: string): [bigint, bigint] {
  const [ms, seq] = id.split('-');
  return [BigInt(ms || '0'), BigInt(seq || '0')];
}
