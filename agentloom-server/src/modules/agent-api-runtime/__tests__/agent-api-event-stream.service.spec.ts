import type { AgentApiStreamEvent } from '@agentloom/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentApiEventStreamService,
  type AgentApiStreamEntry,
} from '../agent-api-event-stream.service';
import { buildAgentApiRunEventsKey } from '../agent-api-runtime.constants';

type StreamEntry = [id: string, fields: string[]];

/**
 * 内存版 Redis Stream：只实现服务用到的命令，`XREAD BLOCK` 在有新条目或超时后返回。
 * 所有 duplicate() 连接共享同一份数据，用来模拟同一 Redis 上的多条连接。
 */
class InMemoryStreamRedis {
  readonly streams = new Map<string, StreamEntry[]>();
  readonly duplicates: InMemoryStreamRedis[] = [];
  status = 'ready';
  private sequence = 0;
  private readonly waiters = new Set<(unblocked?: boolean) => void>();

  constructor(private readonly root?: InMemoryStreamRedis) {}

  private get store(): InMemoryStreamRedis {
    return this.root ?? this;
  }

  duplicate(): InMemoryStreamRedis {
    const connection = new InMemoryStreamRedis(this.store);
    this.store.duplicates.push(connection);
    return connection;
  }

  async xadd(key: string, ...args: (string | number)[]): Promise<string> {
    const store = this.store;
    const fields = args.slice(args.indexOf('*') + 1).map(String);
    const id = `${++store.sequence}-0`;
    const entries = store.streams.get(key) ?? [];
    entries.push([id, fields]);
    store.streams.set(key, entries);
    for (const wake of [...store.waiters]) {
      wake();
    }
    return id;
  }

  async expire(): Promise<number> {
    return 1;
  }

  on(): this {
    return this;
  }

  /** `CLIENT ID` / `CLIENT UNBLOCK`：解除阻塞的读取以超时语义返回 null */
  async client(subcommand: string): Promise<number> {
    if (subcommand === 'UNBLOCK') {
      for (const wake of [...this.store.waiters]) {
        wake(true);
      }
    }
    return 1;
  }

  async xread(
    ...args: (string | number)[]
  ): Promise<[string, StreamEntry[]][] | null> {
    const blockMs = Number(args[args.indexOf('BLOCK') + 1]);
    const streamArgs = args.slice(args.indexOf('STREAMS') + 1).map(String);
    const keys = streamArgs.slice(0, streamArgs.length / 2);
    const ids = streamArgs.slice(streamArgs.length / 2);

    const collect = () => {
      const result: [string, StreamEntry[]][] = [];
      keys.forEach((key, index) => {
        const after = Number(ids[index].split('-')[0]);
        const entries = (this.store.streams.get(key) ?? []).filter(
          ([id]) => Number(id.split('-')[0]) > after,
        );
        if (entries.length > 0) {
          result.push([key, entries]);
        }
      });
      return result.length > 0 ? result : null;
    };

    const immediate = collect();
    if (immediate || this.status !== 'ready') {
      return immediate;
    }

    return new Promise((resolve) => {
      const finish = (unblocked = false) => {
        clearTimeout(timer);
        this.store.waiters.delete(finish);
        resolve(unblocked ? null : collect());
      };
      const timer = setTimeout(finish, blockMs);
      this.store.waiters.add(finish);
    });
  }

  async quit(): Promise<'OK'> {
    this.status = 'end';
    for (const wake of [...this.store.waiters]) {
      wake();
    }
    return 'OK';
  }
}

function deltaEvent(runId: string, index: number): AgentApiStreamEvent {
  return {
    event: 'message.delta',
    data: { runId, index, delta: `chunk-${index}` },
  };
}

const RUN_ID = '01900000-0000-7000-8000-000000000001';

describe('AgentApiEventStreamService', () => {
  let redis: InMemoryStreamRedis;
  let service: AgentApiEventStreamService;

  beforeEach(() => {
    redis = new InMemoryStreamRedis();
    service = new AgentApiEventStreamService(redis as never);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('append 写入 event/data 字段并返回 entry id，getBounds 返回首尾 id', async () => {
    const xrange = vi.fn(async () => [redis.streams.get(key)![0]]);
    const xrevrange = vi.fn(async () => [redis.streams.get(key)!.at(-1)!]);
    Object.assign(redis, { xrange, xrevrange });
    const key = buildAgentApiRunEventsKey(RUN_ID);

    const firstId = await service.append(RUN_ID, deltaEvent(RUN_ID, 0));
    const lastId = await service.append(RUN_ID, deltaEvent(RUN_ID, 1));

    expect(redis.streams.get(key)![0][1]).toEqual([
      'event',
      'message.delta',
      'data',
      JSON.stringify({ runId: RUN_ID, index: 0, delta: 'chunk-0' }),
    ]);
    await expect(service.getBounds(RUN_ID)).resolves.toEqual({
      exists: true,
      firstId,
      lastId,
    });
  });

  it('同一流上的两个订阅者共享一条读取连接，各自按序且恰好一次收到游标之后的条目，中止后停止', async () => {
    const firstId = await service.append(RUN_ID, deltaEvent(RUN_ID, 0));

    const receivedA: AgentApiStreamEntry[] = [];
    const receivedB: AgentApiStreamEntry[] = [];
    const abortA = new AbortController();
    const abortB = new AbortController();

    const subscriptionA = service.subscribe(
      RUN_ID,
      null,
      (entry) => receivedA.push(entry),
      abortA.signal,
    );
    const subscriptionB = service.subscribe(
      RUN_ID,
      firstId,
      (entry) => receivedB.push(entry),
      abortB.signal,
    );

    await service.append(RUN_ID, deltaEvent(RUN_ID, 1));
    await service.append(RUN_ID, deltaEvent(RUN_ID, 2));
    await vi.waitFor(() => {
      expect(receivedA).toHaveLength(3);
      expect(receivedB).toHaveLength(2);
    });

    abortA.abort();
    await subscriptionA;
    await service.append(RUN_ID, deltaEvent(RUN_ID, 3));
    await vi.waitFor(() => expect(receivedB).toHaveLength(3));

    abortB.abort();
    await subscriptionB;

    expect(
      receivedA.map((entry) =>
        entry.event.event === 'message.delta' ? entry.event.data.index : -1,
      ),
    ).toEqual([0, 1, 2]);
    expect(
      receivedB.map((entry) =>
        entry.event.event === 'message.delta' ? entry.event.data.index : -1,
      ),
    ).toEqual([1, 2, 3]);
    expect(receivedB[0]?.event).toEqual(deltaEvent(RUN_ID, 1));
    expect(redis.duplicates).toHaveLength(1);
  });

  it('读取进行中加入的订阅者从自己的游标开始，不会漏掉更早的条目', async () => {
    const receivedA: AgentApiStreamEntry[] = [];
    const receivedB: AgentApiStreamEntry[] = [];
    const abort = new AbortController();

    void service.subscribe(
      RUN_ID,
      null,
      (entry) => receivedA.push(entry),
      abort.signal,
    );
    await service.append(RUN_ID, deltaEvent(RUN_ID, 0));
    await service.append(RUN_ID, deltaEvent(RUN_ID, 1));
    await vi.waitFor(() => expect(receivedA).toHaveLength(2));

    void service.subscribe(
      RUN_ID,
      null,
      (entry) => receivedB.push(entry),
      abort.signal,
    );
    await service.append(RUN_ID, deltaEvent(RUN_ID, 2));

    await vi.waitFor(() => expect(receivedB).toHaveLength(3));
    expect(receivedA).toHaveLength(3);
    expect(receivedB.map((entry) => entry.id)).toEqual(
      receivedA.map((entry) => entry.id),
    );
    abort.abort();
  });

  it('读取连接阻塞时新订阅立即加入，不必等满一个阻塞周期', async () => {
    const abort = new AbortController();
    const receivedA: AgentApiStreamEntry[] = [];
    const receivedB: AgentApiStreamEntry[] = [];
    void service.subscribe(
      RUN_ID,
      null,
      (entry) => receivedA.push(entry),
      abort.signal,
    );
    await service.append(RUN_ID, deltaEvent(RUN_ID, 0));
    await vi.waitFor(() => expect(receivedA).toHaveLength(1));
    // 让读取循环重新进入阻塞
    await new Promise((resolve) => setTimeout(resolve, 20));

    void service.subscribe(
      RUN_ID,
      null,
      (entry) => receivedB.push(entry),
      abort.signal,
    );

    // 阻塞周期为 1000ms，这里要求明显更快地拿到历史条目
    await vi.waitFor(() => expect(receivedB).toHaveLength(1), {
      timeout: 300,
    });
    abort.abort();
  });

  it('已中止的 signal 直接 resolve，不建立读取连接', async () => {
    const abort = new AbortController();
    abort.abort();

    await service.subscribe(RUN_ID, null, vi.fn(), abort.signal);

    expect(redis.duplicates).toHaveLength(0);
  });
});
