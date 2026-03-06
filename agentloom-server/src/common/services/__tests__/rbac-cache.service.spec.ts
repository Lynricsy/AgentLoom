import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RbacCacheService } from '../rbac-cache.service';
import { RedisCacheService } from '../../redis/redis-cache.service';
import { RedisPubSubService } from '../../redis/redis-pubsub.service';
import { DRIZZLE } from '../../../database/database.module';

describe('RbacCacheService', () => {
  let service: RbacCacheService;
  let mockCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPubSubService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, unknown>;
  let mockSelectChain: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };

    mockPubSubService = {
      publish: vi.fn(),
    };

    mockSelectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };

    mockDb = {
      select: vi.fn().mockReturnValue(mockSelectChain),
    };

    const module = await Test.createTestingModule({
      providers: [
        RbacCacheService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: RedisCacheService, useValue: mockCacheService },
        { provide: RedisPubSubService, useValue: mockPubSubService },
      ],
    }).compile();

    service = module.get(RbacCacheService);
  });

  describe('getUserRole', () => {
    it('キャッシュに役割がある場合キャッシュから返す', async () => {
      mockCacheService.get.mockResolvedValue('admin');

      const role = await service.getUserRole('tenant-1', 'user-1');

      expect(role).toBe('admin');
      expect(mockCacheService.get).toHaveBeenCalledWith('tenant-1:rbac:user-1');
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('キャッシュミスの場合 DB を問い合わせてキャッシュに保存する', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockSelectChain.limit.mockResolvedValue([{ role: 'owner' }]);

      const role = await service.getUserRole('tenant-1', 'user-1');

      expect(role).toBe('owner');
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalledWith('tenant-1:rbac:user-1', 'owner', 900);
    });

    it('DB にメンバーがいない場合 null を返す', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockSelectChain.limit.mockResolvedValue([]);

      const role = await service.getUserRole('tenant-1', 'user-1');

      expect(role).toBeNull();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('invalidateUserRole', () => {
    it('キャッシュを削除して Pub/Sub に通知する', async () => {
      mockCacheService.del.mockResolvedValue(undefined);
      mockPubSubService.publish.mockResolvedValue(undefined);

      await service.invalidateUserRole('tenant-1', 'user-1');

      expect(mockCacheService.del).toHaveBeenCalledWith('tenant-1:rbac:user-1');
      expect(mockPubSubService.publish).toHaveBeenCalledWith('tenant-1:rbac:user-1');
    });
  });
});
