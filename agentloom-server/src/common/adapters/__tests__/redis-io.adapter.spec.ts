import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';

const {
  mockConnect,
  mockDisconnect,
  mockOn,
  mockCreateAdapter,
  mockSuperCreateIOServer,
  mockSuperClose,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn(),
  mockOn: vi.fn(),
  mockCreateAdapter: vi.fn().mockReturnValue('redis-adapter-instance'),
  mockSuperCreateIOServer: vi.fn(),
  mockSuperClose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    connect = mockConnect;
    disconnect = mockDisconnect;
    on = mockOn;
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
      expect(mockOn).toHaveBeenCalledTimes(2);
    });

    it('应注册 error 事件处理器', async () => {
      await adapter.connectToRedis();
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockOn).toHaveBeenCalledTimes(2);
    });

    it('连接失败时应抛出错误', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(adapter.connectToRedis()).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('createIOServer()', () => {
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
