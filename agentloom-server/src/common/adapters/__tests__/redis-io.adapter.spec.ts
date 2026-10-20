import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../../modules/agent-conversation/conversation-attachment';

const {
  mockConnect,
  mockDisconnect,
  mockOn,
  mockPublish,
  mockCreateAdapter,
  mockSuperCreateIOServer,
  mockSuperClose,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn(),
  mockOn: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(1),
  mockCreateAdapter: vi.fn().mockReturnValue('redis-adapter-instance'),
  mockSuperCreateIOServer: vi.fn(),
  mockSuperClose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    status = 'ready';
    connect = mockConnect;
    disconnect = mockDisconnect;
    on = mockOn;
    publish = mockPublish;
  },
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('@nestjs/platform-socket.io', () => ({
  IoAdapter: class MockIoAdapter {
    createIOServer(...args: any[]) {
      return mockSuperCreateIOServer(...args);
    }
    close(...args: any[]) {
      return mockSuperClose(...args);
    }
  },
}));

import { RedisIoAdapter } from '../redis-io.adapter';

describe('RedisIoAdapter', () => {
  let adapter: RedisIoAdapter;
  const mockApp = {} as any;
  const redisUrl = 'redis://localhost:6379';

  beforeEach(() => {
    vi.clearAllMocks();
    // 直接通过 constructor 创建，绕过 IoAdapter super() mock 复杂性
    adapter = new RedisIoAdapter(mockApp, redisUrl);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  describe('create()', () => {
    it('应从 ConfigService 读取 APP_REDIS_URL', () => {
      const mockGet = vi.fn().mockReturnValue('redis://test:6379');
      const mockAppWithConfig = {
        get: vi.fn().mockReturnValue({ get: mockGet }),
      } as any;

      const result = RedisIoAdapter.create(mockAppWithConfig);
      expect(result).toBeInstanceOf(RedisIoAdapter);
    });
  });

  describe('connectToRedis()', () => {
    it('应创建 pub/sub 客户端并连接', async () => {
      await adapter.connectToRedis();

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('应为 pub/sub 客户端注册 error 与 ready 事件处理器', async () => {
      await adapter.connectToRedis();
      const events = mockOn.mock.calls.map(([event]) => event as string);
      expect(events.filter((event) => event === 'error')).toHaveLength(2);
      expect(events.filter((event) => event === 'ready')).toHaveLength(2);
    });

    it('Redis 中断时 adapter 的 fire-and-forget publish 失败不应成为未处理的 rejection', async () => {
      const warn = vi.mocked(Logger.prototype.warn);
      mockPublish.mockRejectedValue(
        new Error('Reached the max retries per request limit (which is 3).'),
      );
      mockSuperCreateIOServer.mockReturnValue({ adapter: vi.fn() });
      await adapter.connectToRedis();
      adapter.createIOServer(3000);
      const pubClient = mockCreateAdapter.mock.calls[0]?.[0] as {
        publish: (channel: string, message: Buffer) => Promise<number>;
      };

      await expect(
        pubClient.publish('socket.io#/#', Buffer.from('a')),
      ).resolves.toBe(0);
      await expect(
        pubClient.publish('socket.io#/#', Buffer.from('b')),
      ).resolves.toBe(0);
      // 同一次中断只记一条 WARN
      expect(
        warn.mock.calls.filter(([message]) =>
          String(message).includes('跨实例广播发布失败'),
        ),
      ).toHaveLength(1);

      const log = vi.mocked(Logger.prototype.log);
      mockPublish.mockResolvedValue(1);
      await expect(
        pubClient.publish('socket.io#/#', Buffer.from('c')),
      ).resolves.toBe(1);
      expect(log).toHaveBeenCalledWith(
        'Redis 已恢复，中断期间丢弃了 2 条跨实例广播',
      );
    });

    it('连接失败时应抛出错误', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(adapter.connectToRedis()).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('createIOServer()', () => {
    it('应把 Socket.IO buffer 上限提升到覆盖附件 transport 负载', () => {
      const mockServer = { adapter: vi.fn() };
      mockSuperCreateIOServer.mockReturnValue(mockServer);

      adapter.createIOServer(3000, { cors: { origin: '*' } });

      expect(mockSuperCreateIOServer).toHaveBeenCalledWith(
        3000,
        expect.objectContaining({
          cors: { origin: '*' },
          maxHttpBufferSize: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
        }),
      );
    });

    it('应保留比默认值更大的显式 maxHttpBufferSize', () => {
      const mockServer = { adapter: vi.fn() };
      mockSuperCreateIOServer.mockReturnValue(mockServer);

      adapter.createIOServer(3000, {
        maxHttpBufferSize: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES + 1024,
      });

      expect(mockSuperCreateIOServer).toHaveBeenCalledWith(
        3000,
        expect.objectContaining({
          maxHttpBufferSize: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES + 1024,
        }),
      );
    });

    it('连接后应附加 Redis adapter', async () => {
      const mockServer = { adapter: vi.fn() };
      mockSuperCreateIOServer.mockReturnValue(mockServer);

      await adapter.connectToRedis();
      const result = adapter.createIOServer(3000);

      expect(mockServer.adapter).toHaveBeenCalledWith('redis-adapter-instance');
      expect(result).toBe(mockServer);
    });

    it('未连接时应回退为单实例模式', () => {
      const mockServer = { adapter: vi.fn() };
      mockSuperCreateIOServer.mockReturnValue(mockServer);

      const result = adapter.createIOServer(3000);

      expect(mockServer.adapter).not.toHaveBeenCalled();
      expect(result).toBe(mockServer);
    });
  });

  describe('close()', () => {
    it('连接后关闭应断开 Redis 客户端', async () => {
      await adapter.connectToRedis();

      const mockServer = {} as any;
      await adapter.close(mockServer);

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(mockSuperClose).toHaveBeenCalledWith(mockServer);
    });

    it('未连接时关闭不应断开 Redis', async () => {
      const mockServer = {} as any;
      await adapter.close(mockServer);

      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });
});
