import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RedisCacheService } from '../redis-cache.service';
import { REDIS_CLIENT } from '../redis.constants';

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let mockRedis: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      keys: vi.fn(),
      quit: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        RedisCacheService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(RedisCacheService);
  });

  describe('get', () => {
    it('キーに対応する値を返す', async () => {
      mockRedis.get.mockResolvedValue('test-value');

      const result = await service.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('存在しないキーの場合 null を返す', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('missing-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('TTL なしで値をセットする', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.set('key', 'value');

      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
    });

    it('TTL 付きで値をセットする', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.set('key', 'value', 900);

      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value', 'EX', 900);
    });
  });

  describe('del', () => {
    it('キーを削除する', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.del('key');

      expect(mockRedis.del).toHaveBeenCalledWith('key');
    });
  });

  describe('delByPattern', () => {
    it('パターンに一致するキーを全て削除する', async () => {
      mockRedis.keys.mockResolvedValue(['key:1', 'key:2']);
      mockRedis.del.mockResolvedValue(2);

      await service.delByPattern('key:*');

      expect(mockRedis.keys).toHaveBeenCalledWith('key:*');
      expect(mockRedis.del).toHaveBeenCalledWith('key:1', 'key:2');
    });

    it('一致するキーがない場合は削除しない', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await service.delByPattern('nonexistent:*');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('Redis 接続を終了する', async () => {
      mockRedis.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
