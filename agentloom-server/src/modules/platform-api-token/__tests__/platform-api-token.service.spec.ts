import * as crypto from 'crypto';

import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drizzleMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({
    type: 'and',
    conditions,
  })),
  eq: vi.fn((left: unknown, right: unknown) => ({
    type: 'eq',
    left,
    right,
  })),
  desc: vi.fn((value: unknown) => ({
    type: 'desc',
    value,
  })),
  count: vi.fn(() => ({ type: 'count' })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}));

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
  createMockDb: () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn(),
      returning: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };

    return mockDb;
  },
  createMockRbacCacheService: () => ({
    getUserRole: vi.fn(),
  }),
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');

  return {
    ...actual,
    randomBytes: mocks.randomBytes,
  };
});

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: drizzleMocks.and,
    eq: drizzleMocks.eq,
    desc: drizzleMocks.desc,
    count: drizzleMocks.count,
    sql: drizzleMocks.sql,
  };
});

import { TenantRequiredException } from '../../../common/exceptions/auth.exceptions';
import { RbacCacheService } from '../../../common/services/rbac-cache.service';
import { DRIZZLE } from '../../../database/database.module';
import {
  platformApiTokens,
  type PlatformApiToken,
} from '../../../database/schema';
import {
  PlatformApiTokenAlreadyRevokedException,
  PlatformApiTokenExpiredException,
  PlatformApiTokenInvalidException,
  PlatformApiTokenLimitExceededException,
  PlatformApiTokenNotFoundException,
} from '../platform-api-token.exceptions';
import { QueryPlatformApiTokenSchema } from '../dto/query-platform-api-token.dto';
import { PlatformApiTokenService } from '../platform-api-token.service';

const NOW = new Date('2025-01-01T00:00:00.000Z');
const FUTURE = new Date('2025-12-31T00:00:00.000Z');
const PAST = new Date('2024-12-31T23:59:59.000Z');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';
const FIXED_TOKEN_BYTES = Buffer.from('11'.repeat(32), 'hex');
const FIXED_RAW_TOKEN = `al_${FIXED_TOKEN_BYTES.toString('hex')}`;
const FIXED_TOKEN_HASH = crypto
  .createHash('sha256')
  .update(FIXED_RAW_TOKEN)
  .digest('hex');

function createPlatformApiTokenRecord(
  overrides: Partial<PlatformApiToken> = {},
): PlatformApiToken {
  return {
    id: TOKEN_ID,
    userId: USER_ID,
    tenantId: TENANT_ID,
    name: '主访问令牌',
    tokenHash: FIXED_TOKEN_HASH,
    tokenPrefix: 'al_11111111',
    scopes: 'workflow:read workflow:run',
    lastUsedAt: null,
    expiresAt: FUTURE,
    isRevoked: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function hasEqCall(left: unknown, right?: unknown): boolean {
  return drizzleMocks.eq.mock.calls.some(([actualLeft, actualRight]) => {
    if (right === undefined) {
      return actualLeft === left;
    }

    return actualLeft === left && actualRight === right;
  });
}

describe('PlatformApiTokenService', () => {
  let service: PlatformApiTokenService;
  let mockDb: ReturnType<typeof mocks.createMockDb>;
  let mockRbacCacheService: ReturnType<typeof mocks.createMockRbacCacheService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.randomBytes.mockReturnValue(FIXED_TOKEN_BYTES);

    mockDb = mocks.createMockDb();
    mockRbacCacheService = mocks.createMockRbacCacheService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformApiTokenService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: RbacCacheService, useValue: mockRbacCacheService },
      ],
    }).compile();

    service = module.get(PlatformApiTokenService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('generateToken', () => {
    it('应在提供全部字段时成功创建 Token', async () => {
      const expiresAt = '2025-12-31T00:00:00.000Z';
      const createdRecord = createPlatformApiTokenRecord({
        name: '部署令牌',
        scopes: 'workflow:read workflow:run',
        expiresAt: new Date(expiresAt),
      });

      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.returning.mockResolvedValueOnce([createdRecord]);

      const result = await service.generateToken(TENANT_ID, USER_ID, {
        name: '部署令牌',
        scopes: 'workflow:read workflow:run',
        expires_at: expiresAt,
      });

      expect(result).toEqual({
        id: TOKEN_ID,
        name: '部署令牌',
        tokenPrefix: 'al_11111111',
        scopes: 'workflow:read workflow:run',
        lastUsedAt: null,
        expiresAt: new Date(expiresAt),
        isRevoked: false,
        createdAt: NOW,
        token: FIXED_RAW_TOKEN,
      });
      expect(mockDb.insert).toHaveBeenCalledWith(platformApiTokens);
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: USER_ID,
        tenantId: TENANT_ID,
        name: '部署令牌',
        tokenHash: FIXED_TOKEN_HASH,
        tokenPrefix: 'al_11111111',
        scopes: 'workflow:read workflow:run',
        expiresAt: new Date(expiresAt),
      });
    });

    it('应在未提供可选字段时写入 null', async () => {
      const createdRecord = createPlatformApiTokenRecord({
        name: '仅名称令牌',
        scopes: null,
        expiresAt: null,
      });

      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.returning.mockResolvedValueOnce([createdRecord]);

      const result = await service.generateToken(TENANT_ID, USER_ID, {
        name: '仅名称令牌',
      });

      expect(result.scopes).toBeNull();
      expect(result.expiresAt).toBeNull();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: null,
          expiresAt: null,
        }),
      );
    });

    it('应生成以 al_ 开头的明文 token 与展示前缀', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.returning.mockResolvedValueOnce([
        createPlatformApiTokenRecord({ tokenPrefix: 'al_11111111' }),
      ]);

      const result = await service.generateToken(TENANT_ID, USER_ID, {
        name: '前缀校验令牌',
      });

      expect(result.token.startsWith('al_')).toBe(true);
      expect(result.tokenPrefix.startsWith('al_')).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenPrefix: 'al_11111111',
        }),
      );
    });

    it('应在达到 20 个有效 Token 时抛出数量超限异常', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 20 }]);

      await expect(
        service.generateToken(TENANT_ID, USER_ID, {
          name: '超限令牌',
        }),
      ).rejects.toBeInstanceOf(PlatformApiTokenLimitExceededException);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('应在 tenantId 缺失时抛出租户缺失异常', async () => {
      await expect(
        service.generateToken('', USER_ID, {
          name: '无租户令牌',
        }),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('应默认仅查询 active Token 并返回分页结果', async () => {
      const records = [createPlatformApiTokenRecord()];

      mockDb.where.mockImplementationOnce(() => mockDb).mockResolvedValueOnce([
        { count: 1 },
      ]);
      mockDb.offset.mockResolvedValueOnce(records);

      const result = await service.findAll(
        TENANT_ID,
        USER_ID,
        QueryPlatformApiTokenSchema.parse({}),
      );

      expect(result).toEqual({
        data: [
          {
            id: TOKEN_ID,
            name: '主访问令牌',
            tokenPrefix: 'al_11111111',
            scopes: 'workflow:read workflow:run',
            lastUsedAt: null,
            expiresAt: FUTURE,
            isRevoked: false,
            createdAt: NOW,
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
        },
      });
      expect(hasEqCall(platformApiTokens.isRevoked, false)).toBe(true);
      expect(mockDb.limit).toHaveBeenCalledWith(20);
      expect(mockDb.offset).toHaveBeenCalledWith(0);
      expect(drizzleMocks.desc).toHaveBeenCalledWith(platformApiTokens.createdAt);
    });

    it('应支持按 revoked 状态过滤', async () => {
      mockDb.where.mockImplementationOnce(() => mockDb).mockResolvedValueOnce([
        { count: 1 },
      ]);
      mockDb.offset.mockResolvedValueOnce([
        createPlatformApiTokenRecord({ isRevoked: true }),
      ]);

      const result = await service.findAll(
        TENANT_ID,
        USER_ID,
        QueryPlatformApiTokenSchema.parse({ status: 'revoked' }),
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.isRevoked).toBe(true);
      expect(hasEqCall(platformApiTokens.isRevoked, true)).toBe(true);
    });

    it('应在 status=all 时不过滤撤销状态', async () => {
      mockDb.where.mockImplementationOnce(() => mockDb).mockResolvedValueOnce([
        { count: 2 },
      ]);
      mockDb.offset.mockResolvedValueOnce([
        createPlatformApiTokenRecord(),
        createPlatformApiTokenRecord({
          id: '44444444-4444-4444-8444-444444444444',
          isRevoked: true,
          name: '已撤销令牌',
        }),
      ]);

      const result = await service.findAll(
        TENANT_ID,
        USER_ID,
        QueryPlatformApiTokenSchema.parse({ status: 'all' }),
      );

      expect(result.data).toHaveLength(2);
      expect(hasEqCall(platformApiTokens.isRevoked)).toBe(false);
    });

    it('应正确处理自定义分页参数', async () => {
      mockDb.where.mockImplementationOnce(() => mockDb).mockResolvedValueOnce([
        { count: 23 },
      ]);
      mockDb.offset.mockResolvedValueOnce([]);

      const result = await service.findAll(
        TENANT_ID,
        USER_ID,
        QueryPlatformApiTokenSchema.parse({
          page: 3,
          page_size: 5,
          status: 'active',
        }),
      );

      expect(result.meta).toEqual({
        page: 3,
        pageSize: 5,
        total: 23,
      });
      expect(mockDb.limit).toHaveBeenCalledWith(5);
      expect(mockDb.offset).toHaveBeenCalledWith(10);
    });
  });

  describe('revoke', () => {
    it('应成功撤销指定 Token', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ id: TOKEN_ID, isRevoked: false }])
        .mockResolvedValueOnce(undefined);

      await expect(
        service.revoke(TENANT_ID, USER_ID, TOKEN_ID),
      ).resolves.toBeUndefined();

      expect(mockDb.update).toHaveBeenCalledWith(platformApiTokens);
      expect(mockDb.set).toHaveBeenCalledWith({
        isRevoked: true,
        updatedAt: NOW,
      });
      expect(hasEqCall(platformApiTokens.id, TOKEN_ID)).toBe(true);
    });

    it('应在 Token 不存在时抛出未找到异常', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(
        service.revoke(TENANT_ID, USER_ID, TOKEN_ID),
      ).rejects.toBeInstanceOf(PlatformApiTokenNotFoundException);

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('应在 Token 已撤销时抛出冲突异常', async () => {
      mockDb.where.mockResolvedValueOnce([{ id: TOKEN_ID, isRevoked: true }]);

      await expect(
        service.revoke(TENANT_ID, USER_ID, TOKEN_ID),
      ).rejects.toBeInstanceOf(PlatformApiTokenAlreadyRevokedException);

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('应在 tenantId 缺失时拒绝撤销', async () => {
      await expect(service.revoke('', USER_ID, TOKEN_ID)).rejects.toBeInstanceOf(
        TenantRequiredException,
      );

      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('validateToken', () => {
    it('应在 Token 有效时返回认证上下文', async () => {
      mockDb.where.mockResolvedValueOnce([
        createPlatformApiTokenRecord({
          scopes: 'workflow:read',
          expiresAt: FUTURE,
        }),
      ]);
      mockRbacCacheService.getUserRole.mockResolvedValueOnce(null);

      const result = await service.validateToken(FIXED_RAW_TOKEN);

      expect(result).toEqual({
        userId: USER_ID,
        tenantId: TENANT_ID,
        scopes: 'workflow:read',
        tokenId: TOKEN_ID,
        tenantRole: undefined,
      });
      expect(mockRbacCacheService.getUserRole).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
    });

    it('应在 Token 前缀非法时直接抛出无效异常', async () => {
      await expect(service.validateToken('invalid-token')).rejects.toBeInstanceOf(
        PlatformApiTokenInvalidException,
      );

      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('应在数据库中不存在 Token 时抛出无效异常', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.validateToken(FIXED_RAW_TOKEN)).rejects.toBeInstanceOf(
        PlatformApiTokenInvalidException,
      );
    });

    it('应在 Token 已撤销时抛出无效异常', async () => {
      mockDb.where.mockResolvedValueOnce([
        createPlatformApiTokenRecord({ isRevoked: true }),
      ]);

      await expect(service.validateToken(FIXED_RAW_TOKEN)).rejects.toBeInstanceOf(
        PlatformApiTokenInvalidException,
      );
      expect(mockRbacCacheService.getUserRole).not.toHaveBeenCalled();
    });

    it('应在 Token 已过期时抛出过期异常', async () => {
      mockDb.where.mockResolvedValueOnce([
        createPlatformApiTokenRecord({ expiresAt: PAST }),
      ]);

      await expect(service.validateToken(FIXED_RAW_TOKEN)).rejects.toBeInstanceOf(
        PlatformApiTokenExpiredException,
      );
      expect(mockRbacCacheService.getUserRole).not.toHaveBeenCalled();
    });

    it('应解析并返回租户角色', async () => {
      mockDb.where.mockResolvedValueOnce([
        createPlatformApiTokenRecord({ scopes: null, expiresAt: FUTURE }),
      ]);
      mockRbacCacheService.getUserRole.mockResolvedValueOnce('creator');

      const result = await service.validateToken(FIXED_RAW_TOKEN);

      expect(result.tenantRole).toBe('creator');
      expect(result.scopes).toBeNull();
    });
  });
});
