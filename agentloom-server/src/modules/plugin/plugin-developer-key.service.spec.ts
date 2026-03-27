import { Test, TestingModule } from '@nestjs/testing';
import { desc } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type { PluginDeveloperKey } from '../../database/schema';
import { pluginDeveloperKeys } from '../../database/schema';
import {
  PluginDeveloperKeyInvalidException,
  PluginDeveloperKeyNotFoundException,
} from './plugin.exceptions';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import { PluginSignatureService } from './plugin-signature.service';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  createMockPluginSignatureService: () => ({
    validatePublicKey: vi.fn(),
    computeKeyFingerprint: vi.fn(),
  }),
}));

vi.mock('../../common/providers/tenant-aware-db.provider', async () => {
  const actual = await vi.importActual<
    typeof import('../../common/providers/tenant-aware-db.provider')
  >('../../common/providers/tenant-aware-db.provider');

  return {
    ...actual,
    getTenantDb: mocks.getTenantDb,
  };
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const KEY_ID = '44444444-4444-4444-8444-444444444444';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----';
const KEY_FINGERPRINT = 'a'.repeat(64);

type MockDb = ReturnType<typeof mocks.createMockDb>;

function createDeveloperKey(
  overrides: Partial<PluginDeveloperKey> = {},
): PluginDeveloperKey {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: KEY_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    publicKey: PUBLIC_KEY,
    keyFingerprint: KEY_FINGERPRINT,
    label: '主开发密钥',
    status: 'active',
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createSelectChain<TResult>(result: TResult[]) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
  };
}

function createSelectChainWithLimit<TResult>(result: TResult[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
    limit,
  };
}

function createSelectChainWithPagination<TResult>(result: TResult[]) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
    orderBy,
    limit,
    offset,
  };
}

function createInsertChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });

  return {
    chain: { values },
    values,
    returning,
  };
}

function createUpdateChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });

  return {
    chain: { set },
    set,
    where,
    returning,
  };
}

describe('PluginDeveloperKeyService', () => {
  let module: TestingModule;
  let service: PluginDeveloperKeyService;
  let db: MockDb;
  let signatureService: ReturnType<
    typeof mocks.createMockPluginSignatureService
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = mocks.createMockDb();
    signatureService = mocks.createMockPluginSignatureService();
    signatureService.computeKeyFingerprint.mockReturnValue(KEY_FINGERPRINT);
    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);

    module = await Test.createTestingModule({
      providers: [
        PluginDeveloperKeyService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
        {
          provide: PluginSignatureService,
          useValue: signatureService,
        },
      ],
    }).compile();

    service = module.get(PluginDeveloperKeyService);
  });

  describe('registerKey', () => {
    it('应校验公钥、计算指纹并创建开发者密钥', async () => {
      const selectQuery = createSelectChainWithLimit<PluginDeveloperKey>([]);
      const createdKey = createDeveloperKey();
      const insertQuery = createInsertChain([createdKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);
      db.insert.mockReturnValueOnce(insertQuery.chain);

      const result = await service.registerKey(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        PUBLIC_KEY,
        '主开发密钥',
      );

      expect(result).toEqual(createdKey);
      expect(signatureService.validatePublicKey).toHaveBeenCalledWith(
        PUBLIC_KEY,
      );
      expect(signatureService.computeKeyFingerprint).toHaveBeenCalledWith(
        PUBLIC_KEY,
      );
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
      expect(db.insert).toHaveBeenCalledWith(pluginDeveloperKeys);
      expect(insertQuery.values).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        orgId: ORG_ID,
        userId: USER_ID,
        publicKey: PUBLIC_KEY,
        keyFingerprint: KEY_FINGERPRINT,
        label: '主开发密钥',
      });
    });

    it('已存在相同指纹的密钥时应抛出异常', async () => {
      const selectQuery = createSelectChainWithLimit([createDeveloperKey()]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.registerKey(TENANT_ID, ORG_ID, USER_ID, PUBLIC_KEY, '重复密钥'),
      ).rejects.toBeInstanceOf(PluginDeveloperKeyInvalidException);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('listKeys', () => {
    it('应返回按创建时间倒序排列的分页结果', async () => {
      const createdKey = createDeveloperKey();
      const dataQuery = createSelectChainWithPagination([createdKey]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select
        .mockReturnValueOnce(dataQuery.chain)
        .mockReturnValueOnce(countQuery.chain);

      const result = await service.listKeys(ORG_ID, {
        status: 'active',
        page: 2,
        pageSize: 10,
      });

      expect(dataQuery.orderBy).toHaveBeenCalledWith(
        desc(pluginDeveloperKeys.createdAt),
      );
      expect(dataQuery.limit).toHaveBeenCalledWith(10);
      expect(dataQuery.offset).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: [createdKey],
        meta: {
          total: 1,
          page: 2,
          pageSize: 10,
          totalPages: 1,
        },
      });
    });

    it('未传查询参数时应使用默认分页配置', async () => {
      const dataQuery = createSelectChainWithPagination<PluginDeveloperKey>([]);
      const countQuery = createSelectChain([{ total: 0 }]);

      db.select
        .mockReturnValueOnce(dataQuery.chain)
        .mockReturnValueOnce(countQuery.chain);

      const result = await service.listKeys(ORG_ID);

      expect(dataQuery.limit).toHaveBeenCalledWith(20);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
    });
  });

  describe('findById', () => {
    it('应返回指定组织下的开发者密钥', async () => {
      const record = createDeveloperKey();
      const selectQuery = createSelectChainWithLimit([record]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findById(ORG_ID, KEY_ID)).resolves.toEqual(record);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
    });

    it('密钥不存在时应抛出异常', async () => {
      const selectQuery = createSelectChainWithLimit<PluginDeveloperKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findById(ORG_ID, KEY_ID)).rejects.toBeInstanceOf(
        PluginDeveloperKeyNotFoundException,
      );
    });
  });

  describe('revokeKey', () => {
    it('应撤销活跃密钥并返回更新后的记录', async () => {
      const selectQuery = createSelectChainWithLimit([createDeveloperKey()]);
      const revokedKey = createDeveloperKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      const updateQuery = createUpdateChain([revokedKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);
      db.update.mockReturnValueOnce(updateQuery.chain);

      const result = await service.revokeKey(ORG_ID, KEY_ID);

      expect(result).toEqual(revokedKey);
      expect(db.update).toHaveBeenCalledWith(pluginDeveloperKeys);
      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'revoked',
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('重复撤销时应抛出异常', async () => {
      const revokedKey = createDeveloperKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-03T00:00:00.000Z'),
      });
      const selectQuery = createSelectChainWithLimit([revokedKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.revokeKey(ORG_ID, KEY_ID)).rejects.toBeInstanceOf(
        PluginDeveloperKeyInvalidException,
      );

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('findActiveKeyByFingerprint', () => {
    it('应返回活跃密钥', async () => {
      const activeKey = createDeveloperKey();
      const selectQuery = createSelectChainWithLimit([activeKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.findActiveKeyByFingerprint(ORG_ID, KEY_FINGERPRINT),
      ).resolves.toEqual(activeKey);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
    });

    it('不存在活跃密钥时应返回 null', async () => {
      const selectQuery = createSelectChainWithLimit<PluginDeveloperKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.findActiveKeyByFingerprint(ORG_ID, KEY_FINGERPRINT),
      ).resolves.toBeNull();
    });
  });
});
