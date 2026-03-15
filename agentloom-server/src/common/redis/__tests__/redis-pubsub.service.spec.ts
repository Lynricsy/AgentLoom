import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisPubSubService } from '../redis-pubsub.service';
import { RedisCacheService } from '../redis-cache.service';
import { REDIS_CLIENT, CACHE_INVALIDATION_CHANNEL } from '../redis.constants';

vi.mock('ioredis', () => {
  const mockSubscriber = {
    status: 'ready',
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return {
    default: vi.fn(function () {
      return mockSubscriber;
    }),
  };
});

describe('RedisPubSubService', () => {
  let service: RedisPubSubService;
  let mockPublisher: Record<string, ReturnType<typeof vi.fn>>;
  let mockCacheService: Record<string, ReturnType<typeof vi.fn>>;

  async function getSubscriberMock(): Promise<{
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }> {
    const { default: Redis } = await import('ioredis');
    const redisConstructor = Redis as unknown as ReturnType<typeof vi.fn>;
    const latestResult =
      redisConstructor.mock.results[redisConstructor.mock.results.length - 1];

    expect(latestResult?.value).toBeDefined();

    return latestResult.value as {
      subscribe: ReturnType<typeof vi.fn>;
      unsubscribe: ReturnType<typeof vi.fn>;
      quit: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
  }

  async function getMessageHandler(): Promise<
    (channel: string, message: string) => Promise<void>
  > {
    const mockInstance = await getSubscriberMock();
    const messageCall = mockInstance.on.mock.calls.find(
      ([eventName]) => eventName === 'message',
    );

    expect(messageCall).toBeDefined();
    const handler = messageCall?.[1];
    expect(handler).toBeTypeOf('function');

    return handler as (channel: string, message: string) => Promise<void>;
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPublisher = {
      publish: vi.fn().mockResolvedValue(1),
    };

    mockCacheService = {
      del: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        RedisPubSubService,
        { provide: REDIS_CLIENT, useValue: mockPublisher },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('redis://localhost:6379') },
        },
        { provide: RedisCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get(RedisPubSubService);
  });

  describe('publish', () => {
    it('キャッシュ失効メッセージを Pub/Sub に送信する', async () => {
      await service.publish('tenant:rbac:user');

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        CACHE_INVALIDATION_CHANNEL,
        JSON.stringify({ key: 'tenant:rbac:user' }),
      );
    });
  });

  describe('onModuleInit', () => {
    it('キャッシュ失効チャネルを購読する', async () => {
      await service.onModuleInit();

      const mockInstance = await getSubscriberMock();

      expect(mockInstance.subscribe).toHaveBeenCalledWith(
        CACHE_INVALIDATION_CHANNEL,
      );
      expect(mockInstance.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });

    it('收到正确频道的有效消息时删除对应缓存键', async () => {
      await service.onModuleInit();
      const messageHandler = await getMessageHandler();

      await messageHandler(
        CACHE_INVALIDATION_CHANNEL,
        JSON.stringify({ key: 'tenant:rbac:user' }),
      );

      expect(mockCacheService.del).toHaveBeenCalledWith('tenant:rbac:user');
    });

    it('收到其他频道消息时忽略缓存失效逻辑', async () => {
      await service.onModuleInit();
      const messageHandler = await getMessageHandler();

      await messageHandler(
        'other-channel',
        JSON.stringify({ key: 'tenant:rbac:user' }),
      );

      expect(mockCacheService.del).not.toHaveBeenCalled();
    });

    it('消息不是合法 JSON 时记录错误且不中断', async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await service.onModuleInit();
      const messageHandler = await getMessageHandler();

      await expect(
        messageHandler(CACHE_INVALIDATION_CHANNEL, '{invalid-json'),
      ).resolves.toBeUndefined();

      expect(mockCacheService.del).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        '缓存失效处理失败',
        expect.any(SyntaxError),
      );

      errorSpy.mockRestore();
    });
  });

  describe('onModuleDestroy', () => {
    it('購読を解除して接続を終了する', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      const mockInstance = await getSubscriberMock();

      expect(mockInstance.unsubscribe).toHaveBeenCalledWith(
        CACHE_INVALIDATION_CHANNEL,
      );
      expect(mockInstance.quit).toHaveBeenCalled();
    });

    it('接続が既に終了している場合は unsubscribe/quit を呼ばない', async () => {
      await service.onModuleInit();
      const mockInstance = await getSubscriberMock();
      mockInstance.status = 'end';

      await service.onModuleDestroy();

      expect(mockInstance.unsubscribe).not.toHaveBeenCalledWith(
        CACHE_INVALIDATION_CHANNEL,
      );
      expect(mockInstance.quit).not.toHaveBeenCalled();
    });

    it('接続クローズ済みエラーは無視して終了する', async () => {
      await service.onModuleInit();
      const mockInstance = await getSubscriberMock();
      mockInstance.status = 'ready';
      mockInstance.unsubscribe.mockRejectedValue(new Error('Connection is closed.'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockInstance.unsubscribe).toHaveBeenCalledWith(
        CACHE_INVALIDATION_CHANNEL,
      );
      expect(mockInstance.quit).toHaveBeenCalled();
    });
  });
});
