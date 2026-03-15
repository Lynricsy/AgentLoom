import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  tenantEncryptionKeys,
  type TenantEncryptionKey,
} from '../../../database/schema';
import { UploadPublicKeyDto } from '../dto/tenant-key.dto';
import {
  TenantKeyAlreadyExistsException,
  TenantKeyNotFoundException,
  TenantKeyRevokedException,
} from '../exceptions/tenant-key.exceptions';
import { TenantKeyService } from '../tenant-key.service';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  validateRsaPublicKey: vi.fn(),
  computeKeyFingerprint: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('../rsa-key-utils', () => ({
  validateRsaPublicKey: mocks.validateRsaPublicKey,
  computeKeyFingerprint: mocks.computeKeyFingerprint,
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '33333333-3333-4333-8333-333333333333';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----';
const NEXT_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\nnext\n-----END PUBLIC KEY-----';
const KEY_FINGERPRINT = 'a'.repeat(64);

type MockDb = ReturnType<typeof mocks.createMockDb>;

function createTenantKey(
  overrides: Partial<TenantEncryptionKey> = {},
): TenantEncryptionKey {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: KEY_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    publicKey: PUBLIC_KEY,
    keyFingerprint: KEY_FINGERPRINT,
    status: 'active',
    activatedAt: now,
    rotatedAt: null,
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

describe('TenantKeyService', () => {
  let module: TestingModule;
  let service: TenantKeyService;
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);
    mocks.computeKeyFingerprint.mockReturnValue(KEY_FINGERPRINT);

    module = await Test.createTestingModule({
      providers: [
        TenantKeyService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    service = module.get(TenantKeyService);
  });

  describe('uploadPublicKey', () => {
    it('应上传并返回创建的公钥记录', async () => {
      const dto: UploadPublicKeyDto = { publicKey: PUBLIC_KEY };
      const createdKey = createTenantKey();
      const activeKeyQuery = createSelectChain<TenantEncryptionKey>([]);
      const insertQuery = createInsertChain([createdKey]);

      db.select.mockReturnValueOnce(activeKeyQuery.chain);
      db.insert.mockReturnValueOnce(insertQuery.chain);

      const result = await service.uploadPublicKey(TENANT_ID, ORG_ID, dto);

      expect(result).toEqual(createdKey);
      expect(mocks.validateRsaPublicKey).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(mocks.computeKeyFingerprint).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(db.insert).toHaveBeenCalledWith(tenantEncryptionKeys);
      expect(insertQuery.values).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        publicKey: PUBLIC_KEY,
        keyFingerprint: KEY_FINGERPRINT,
        status: 'active',
      });
    });

    it('组织已有活跃密钥时应抛出异常', async () => {
      const dto: UploadPublicKeyDto = { publicKey: PUBLIC_KEY };
      const activeKeyQuery = createSelectChain([createTenantKey()]);

      db.select.mockReturnValueOnce(activeKeyQuery.chain);

      await expect(
        service.uploadPublicKey(TENANT_ID, ORG_ID, dto),
      ).rejects.toBeInstanceOf(TenantKeyAlreadyExistsException);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('findByOrg', () => {
    it('应返回当前组织的密钥列表', async () => {
      const records = [createTenantKey()];
      const selectQuery = createSelectChain(records);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findByOrg(TENANT_ID, ORG_ID)).resolves.toEqual(records);
    });
  });

  describe('findById', () => {
    it('应返回指定密钥', async () => {
      const record = createTenantKey();
      const selectQuery = createSelectChain([record]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findById(TENANT_ID, KEY_ID)).resolves.toEqual(record);
    });

    it('密钥不存在时应抛出异常', async () => {
      const selectQuery = createSelectChain<TenantEncryptionKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findById(TENANT_ID, KEY_ID)).rejects.toBeInstanceOf(
        TenantKeyNotFoundException,
      );
    });
  });

  describe('rotateKey', () => {
    it('应轮换公钥并返回更新后的记录', async () => {
      const dto: UploadPublicKeyDto = { publicKey: NEXT_PUBLIC_KEY };
      const existingKey = createTenantKey();
      const updatedKey = createTenantKey({
        publicKey: NEXT_PUBLIC_KEY,
        keyFingerprint: 'b'.repeat(64),
        rotatedAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      const selectQuery = createSelectChain([existingKey]);
      const updateQuery = createUpdateChain([updatedKey]);

      mocks.computeKeyFingerprint.mockReturnValue('b'.repeat(64));
      db.select.mockReturnValueOnce(selectQuery.chain);
      db.update.mockReturnValueOnce(updateQuery.chain);

      const result = await service.rotateKey(TENANT_ID, KEY_ID, dto);

      expect(result).toEqual(updatedKey);
      expect(mocks.validateRsaPublicKey).toHaveBeenCalledWith(NEXT_PUBLIC_KEY);
      expect(mocks.computeKeyFingerprint).toHaveBeenCalledWith(NEXT_PUBLIC_KEY);
      expect(db.update).toHaveBeenCalledWith(tenantEncryptionKeys);
      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: NEXT_PUBLIC_KEY,
          keyFingerprint: 'b'.repeat(64),
          status: 'active',
          rotatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('密钥不存在时应抛出异常', async () => {
      const dto: UploadPublicKeyDto = { publicKey: NEXT_PUBLIC_KEY };
      const selectQuery = createSelectChain<TenantEncryptionKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.rotateKey(TENANT_ID, KEY_ID, dto),
      ).rejects.toBeInstanceOf(TenantKeyNotFoundException);

      expect(mocks.validateRsaPublicKey).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('已撤销密钥不能轮换', async () => {
      const dto: UploadPublicKeyDto = { publicKey: NEXT_PUBLIC_KEY };
      const revokedKey = createTenantKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-03T00:00:00.000Z'),
      });
      const selectQuery = createSelectChain([revokedKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.rotateKey(TENANT_ID, KEY_ID, dto),
      ).rejects.toBeInstanceOf(TenantKeyRevokedException);

      expect(mocks.validateRsaPublicKey).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeKey', () => {
    it('应撤销密钥并返回更新后的记录', async () => {
      const existingKey = createTenantKey();
      const revokedKey = createTenantKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-04T00:00:00.000Z'),
        updatedAt: new Date('2025-01-04T00:00:00.000Z'),
      });
      const selectQuery = createSelectChain([existingKey]);
      const updateQuery = createUpdateChain([revokedKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);
      db.update.mockReturnValueOnce(updateQuery.chain);

      const result = await service.revokeKey(TENANT_ID, KEY_ID);

      expect(result).toEqual(revokedKey);
      expect(db.update).toHaveBeenCalledWith(tenantEncryptionKeys);
      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'revoked',
          revokedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('密钥不存在时应抛出异常', async () => {
      const selectQuery = createSelectChain<TenantEncryptionKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.revokeKey(TENANT_ID, KEY_ID)).rejects.toBeInstanceOf(
        TenantKeyNotFoundException,
      );

      expect(db.update).not.toHaveBeenCalled();
    });

    it('重复撤销时应抛出异常', async () => {
      const revokedKey = createTenantKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-05T00:00:00.000Z'),
      });
      const selectQuery = createSelectChain([revokedKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.revokeKey(TENANT_ID, KEY_ID)).rejects.toBeInstanceOf(
        TenantKeyRevokedException,
      );

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('getActiveKey', () => {
    it('应返回活跃密钥', async () => {
      const activeKey = createTenantKey();
      const selectQuery = createSelectChain([activeKey]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.getActiveKey(TENANT_ID, ORG_ID)).resolves.toEqual(
        activeKey,
      );
    });

    it('不存在活跃密钥时应返回 null', async () => {
      const selectQuery = createSelectChain<TenantEncryptionKey>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.getActiveKey(TENANT_ID, ORG_ID)).resolves.toBeNull();
    });
  });
});
