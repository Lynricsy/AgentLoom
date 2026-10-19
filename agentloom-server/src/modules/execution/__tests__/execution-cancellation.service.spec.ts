import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExecutionCancellationService,
  WORKFLOW_EXECUTION_CANCEL_CHANNEL,
} from '../services/execution-cancellation.service';

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';

type MessageListener = (channel: string, message: string) => void;

interface RedisStub {
  readonly redis: Redis;
  readonly publish: ReturnType<typeof vi.fn>;
  readonly subscriber: { subscribe: ReturnType<typeof vi.fn> };
  deliver(channel: string, message: string): void;
}

function createRedisStub(): RedisStub {
  let listener: MessageListener | undefined;
  const subscriber = {
    on: vi.fn((event: string, handler: MessageListener) => {
      if (event === 'message') {
        listener = handler;
      }
    }),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
  };
  const redis = {
    duplicate: vi.fn(() => subscriber),
    publish: vi.fn().mockResolvedValue(1),
  };
  return {
    // 只实现服务用到的 ioredis 子集
    redis: redis as unknown as Redis,
    publish: redis.publish,
    subscriber,
    deliver: (channel: string, message: string) => listener?.(channel, message),
  };
}

describe('ExecutionCancellationService', () => {
  let stub: RedisStub;
  let service: ExecutionCancellationService;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    stub = createRedisStub();
    service = new ExecutionCancellationService(stub.redis);
    await service.onModuleInit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('取消执行时中止本实例登记的 Agent 会话并广播给其他实例', async () => {
    const runtime = { cancel: vi.fn().mockResolvedValue(undefined) };
    service.registerSession(EXECUTION_ID, runtime, 'session-1');

    await service.cancelExecution(EXECUTION_ID);

    expect(runtime.cancel).toHaveBeenCalledWith('session-1');
    expect(stub.publish).toHaveBeenCalledWith(
      WORKFLOW_EXECUTION_CANCEL_CHANNEL,
      JSON.stringify({ executionId: EXECUTION_ID }),
    );
    expect(stub.subscriber.subscribe).toHaveBeenCalledWith(
      WORKFLOW_EXECUTION_CANCEL_CHANNEL,
    );
  });

  it('收到其他实例的取消消息时中止本地会话', () => {
    const runtime = { cancel: vi.fn().mockResolvedValue(undefined) };
    service.registerSession(EXECUTION_ID, runtime, 'session-2');

    stub.deliver(
      WORKFLOW_EXECUTION_CANCEL_CHANNEL,
      JSON.stringify({ executionId: EXECUTION_ID }),
    );

    expect(runtime.cancel).toHaveBeenCalledWith('session-2');
  });

  it('会话结束注销后不再被取消', async () => {
    const runtime = { cancel: vi.fn().mockResolvedValue(undefined) };
    const unregister = service.registerSession(
      EXECUTION_ID,
      runtime,
      'session-3',
    );
    unregister();

    await service.cancelExecution(EXECUTION_ID);

    expect(runtime.cancel).not.toHaveBeenCalled();
  });

  it('取消信号早于会话创建时，晚到的会话登记即被中止', async () => {
    await service.cancelExecution(EXECUTION_ID);

    const runtime = { cancel: vi.fn().mockResolvedValue(undefined) };
    service.registerSession(EXECUTION_ID, runtime, 'session-late');

    expect(runtime.cancel).toHaveBeenCalledWith('session-late');
  });

  it('runtime.cancel 失败只记录告警，不影响其他会话', async () => {
    const failing = { cancel: vi.fn().mockRejectedValue(new Error('gone')) };
    const healthy = { cancel: vi.fn().mockResolvedValue(undefined) };
    service.registerSession(EXECUTION_ID, failing, 'session-a');
    service.registerSession(EXECUTION_ID, healthy, 'session-b');

    await service.cancelExecution(EXECUTION_ID);

    expect(healthy.cancel).toHaveBeenCalledWith('session-b');
  });
});
