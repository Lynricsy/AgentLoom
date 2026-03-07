import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIZZLE } from '../../../database/database.module';
import { ApiKeyService } from '../api-key.service';
import { EncryptionService } from '../encryption.service';
import {
  ApiKeyNotFoundException,
  ApiKeyLimitExceededException,
  ApiKeyRevokedException,
} from '../api-key.exceptions';
import type { EncryptedData } from '../encryption.service';

const NOW = new Date('2025-01-01T00:00:00Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const KEY_ID = '00000000-0000-0000-0000-000000000100';

const MOCK_ENCRYPTED: EncryptedData = {
  encryptedKey: Buffer.from('enc-key'),
  encryptedDek: Buffer.from('enc-dek'),
  iv: Buffer.from('iv-12bytes!!'),
  authTag: Buffer.from('auth-tag-16bytes'),
};

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function createApiKeyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    provider: 'openai' as const,
    label: 'My OpenAI Key',
    keyPreview: 'sk-...5678',
    status: 'active' as const,
    encryptedKey: Buffer.from('enc-key'),
    encryptedDek: Buffer.from('enc-dek'),
    iv: Buffer.from('iv-12bytes!!'),
    authTag: Buffer.from('auth-tag-16bytes'),
    lastUsedAt: null as Date | null,
    rotatedAt: null as Date | null,
    expiresAt: null as Date | null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let encryptionService: { encrypt: ReturnType<typeof vi.fn>; decrypt: ReturnType<typeof vi.fn> };
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    encryptionService = {
      encrypt: vi.fn().mockReturnValue(MOCK_ENCRYPTED),
      decrypt: vi.fn(),
    };

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: EncryptionService, useValue: encryptionService },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('应当创建加密 API 密钥并返回安全响应', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const countChain = createSelectChain([{ count: 0 }]);
      db.select.mockReturnValueOnce(countChain);

      const orgChain = createSelectChain([{ id: ORG_ID }]);
      db.select.mockReturnValueOnce(orgChain);

      const record = createApiKeyRecord();
      const insertChain = createInsertChain([record]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.create(
        { provider: 'openai', label: 'My OpenAI Key', apiKey: 'sk-test5678' },
        USER_ID,
        TENANT_ID,
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith('sk-test5678');
      expect(result.id).toBe(KEY_ID);
      expect(result.provider).toBe('openai');
      expect(result.keyPreview).toBe('sk-...5678');
      expect(result).not.toHaveProperty('encryptedKey');
      expect(result).not.toHaveProperty('encryptedDek');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"action":"create"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"actorId":"${USER_ID}"`),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"keyId":"${KEY_ID}"`),
      );
    });

    it('应当在达到限制时抛出 ApiKeyLimitExceededException', async () => {
      const countChain = createSelectChain([{ count: 50 }]);
      db.select.mockReturnValueOnce(countChain);

      await expect(
        service.create(
          { provider: 'openai', label: 'Key', apiKey: 'sk-test1234' },
          USER_ID,
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(ApiKeyLimitExceededException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应当正确生成密钥预览（最后 4 位）', async () => {
      const countChain = createSelectChain([{ count: 0 }]);
      db.select.mockReturnValueOnce(countChain);

      const orgChain = createSelectChain([{ id: ORG_ID }]);
      db.select.mockReturnValueOnce(orgChain);

      const record = createApiKeyRecord({ keyPreview: 'sk-...ABCD' });
      const insertChain = createInsertChain([record]);
      db.insert.mockReturnValueOnce(insertChain);

      await service.create(
        { provider: 'anthropic', label: 'Key', apiKey: 'sk-ant-testABCD' },
        USER_ID,
        TENANT_ID,
      );

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ keyPreview: 'sk-...ABCD' }),
      );
    });
  });

  describe('findAllByTenant', () => {
    it('应当返回安全字段列表', async () => {
      const records = [
        createApiKeyRecord(),
        createApiKeyRecord({ id: 'id-2', provider: 'anthropic', label: 'Key 2' }),
      ];
      const selectChain = createSelectChain(records);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.findAllByTenant(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('provider');
      expect(result[0]).not.toHaveProperty('encryptedKey');
    });

    it('应当返回空数组', async () => {
      const selectChain = createSelectChain([]);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.findAllByTenant(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe('rotate', () => {
    it('应当重新加密密钥', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const existing = createApiKeyRecord();
      const selectChain = createSelectChain([existing]);
      db.select.mockReturnValueOnce(selectChain);

      const updated = createApiKeyRecord({
        keyPreview: 'sk-...9999',
        rotatedAt: NOW,
      });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.rotate(
        KEY_ID,
        { apiKey: 'sk-new-key-9999' },
        TENANT_ID,
        USER_ID,
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith('sk-new-key-9999');
      expect(result.id).toBe(KEY_ID);
      expect(result.keyPreview).toBe('sk-...9999');
      expect(result.rotatedAt).toBe(NOW.toISOString());
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          keyPreview: 'sk-...9999',
          rotatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"action":"rotate"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"actorId":"${USER_ID}"`),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"keyId":"${KEY_ID}"`),
      );
    });

    it('应当在密钥不存在时抛出 ApiKeyNotFoundException', async () => {
      const selectChain = createSelectChain([]);
      db.select.mockReturnValueOnce(selectChain);

      await expect(
        service.rotate(KEY_ID, { apiKey: 'sk-new' }, TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(ApiKeyNotFoundException);
    });

    it('应当拒绝轮换已撤销的密钥', async () => {
      const revoked = createApiKeyRecord({ status: 'revoked' });
      const selectChain = createSelectChain([revoked]);
      db.select.mockReturnValueOnce(selectChain);

      await expect(
        service.rotate(KEY_ID, { apiKey: 'sk-new' }, TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(ApiKeyRevokedException);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('应当将加密字段清空并设置状态为 revoked', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const existing = createApiKeyRecord();
      const selectChain = createSelectChain([existing]);
      db.select.mockReturnValueOnce(selectChain);

      const revoked = createApiKeyRecord({
        status: 'revoked',
        encryptedKey: null,
        encryptedDek: null,
        iv: null,
        authTag: null,
      });
      const updateChain = createUpdateChain([revoked]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.revoke(KEY_ID, TENANT_ID, USER_ID);

      expect(result.status).toBe('revoked');
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'revoked',
          encryptedKey: null,
          encryptedDek: null,
          iv: null,
          authTag: null,
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"action":"revoke"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"actorId":"${USER_ID}"`),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"keyId":"${KEY_ID}"`),
      );
    });

    it('应当在密钥不存在时抛出 ApiKeyNotFoundException', async () => {
      const selectChain = createSelectChain([]);
      db.select.mockReturnValueOnce(selectChain);

      await expect(
        service.revoke('non-existent-id', TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(ApiKeyNotFoundException);
    });
  });

  describe('updateLastUsedAt', () => {
    it('应当更新 lastUsedAt 时间戳', async () => {
      const updateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      db.update.mockReturnValueOnce(updateChain);

      await service.updateLastUsedAt(KEY_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      );
    });
  });

  describe('findByIdInternal', () => {
    it('应当返回包含加密字段的完整记录', async () => {
      const record = createApiKeyRecord();
      const selectChain = createSelectChain([record]);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.findByIdInternal(KEY_ID, TENANT_ID);

      expect(result).toEqual(record);
    });

    it('应当在不存在时返回 undefined', async () => {
      const selectChain = createSelectChain([]);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.findByIdInternal(KEY_ID, TENANT_ID);
      expect(result).toBeUndefined();
    });
  });
});
