import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecryptionBoundaryService } from '../decryption-boundary.service';
import { ApiKeyService } from '../api-key.service';
import { EncryptionService } from '../encryption.service';
import {
  DefaultApiKeyNotConfiguredException,
  ApiKeyNotFoundException,
  ApiKeyRevokedException,
} from '../api-key.exceptions';

const KEY_ID = '00000000-0000-0000-0000-000000000100';
const TENANT_ID = '00000000-0000-0000-0000-000000000010';

function createActiveApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    tenantId: TENANT_ID,
    organizationId: '00000000-0000-0000-0000-000000000020',
    userId: '00000000-0000-0000-0000-000000000001',
    provider: 'openai',
    label: 'Test Key',
    keyPreview: 'sk-...5678',
    isDefault: false,
    status: 'active',
    encryptedKey: Buffer.from('encrypted-key'),
    encryptedDek: Buffer.from('encrypted-dek'),
    iv: Buffer.from('iv-data'),
    authTag: Buffer.from('auth-tag'),
    lastUsedAt: null,
    rotatedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function expectAuditLog(
  logSpy: ReturnType<typeof vi.spyOn>,
  outcome: string,
  caller = DecryptionBoundaryService.name,
) {
  const calls = logSpy.mock.calls as unknown[][];
  const matchedCall = calls.find((call) => {
    const [message] = call as [unknown, ...unknown[]];
    return (
      typeof message === 'string' &&
      message.includes(`"outcome":"${outcome}"`)
    );
  });

  expect(matchedCall).toBeDefined();

  const [message] = matchedCall!;
  expect(message).toContain(`"keyId":"${KEY_ID}"`);
  expect(message).toContain(`"caller":"${caller}"`);
  expect(message).toContain('"timestamp":"');
  expect(message).toContain(`"outcome":"${outcome}"`);
}

describe('DecryptionBoundaryService', () => {
  let service: DecryptionBoundaryService;
  let apiKeyService: Partial<ApiKeyService>;
  let encryptionService: Partial<EncryptionService>;

  beforeEach(() => {
    vi.clearAllMocks();

    apiKeyService = {
      findByIdInternal: vi.fn(),
      findDefaultActiveByOrganizationInternal: vi.fn(),
      updateLastUsedAt: vi.fn().mockResolvedValue(undefined),
    };

    encryptionService = {
      decrypt: vi.fn().mockReturnValue('sk-decrypted-plain-key'),
    };

    service = new DecryptionBoundaryService(
      apiKeyService as ApiKeyService,
      encryptionService as EncryptionService,
    );
  });

  describe('decryptApiKey', () => {
    it('应当成功解密活跃的 API 密钥', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const activeKey = createActiveApiKey();
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        activeKey as never,
      );

      const result = await service.decryptApiKey(KEY_ID, TENANT_ID, 'llm-gateway');

      expect(result).toBe('sk-decrypted-plain-key');
      expect(encryptionService.decrypt).toHaveBeenCalledWith({
        encryptedKey: activeKey.encryptedKey,
        encryptedDek: activeKey.encryptedDek,
        iv: activeKey.iv,
        authTag: activeKey.authTag,
      });
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"keyId":"${KEY_ID}"`),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"caller":"llm-gateway"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"timestamp":"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"outcome":"requested"'),
      );
      expectAuditLog(logSpy, 'decrypted', 'llm-gateway');
    });

    it('应当在解密后更新 lastUsedAt', async () => {
      const activeKey = createActiveApiKey();
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        activeKey as never,
      );

      await service.decryptApiKey(KEY_ID, TENANT_ID);

      expect(apiKeyService.updateLastUsedAt).toHaveBeenCalledWith(KEY_ID);
    });

    it('应当在密钥不存在时抛出 ApiKeyNotFoundException', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(undefined);

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyNotFoundException);

      expectAuditLog(logSpy, 'not_found');
    });

    it('应当在密钥已撤销时抛出 ApiKeyRevokedException', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const revokedKey = createActiveApiKey({ status: 'revoked' });
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        revokedKey as never,
      );

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyRevokedException);

      expectAuditLog(logSpy, 'revoked');
    });

    it('应当在加密字段为 null 时抛出 ApiKeyRevokedException', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const nullFieldsKey = createActiveApiKey({
        status: 'active',
        encryptedKey: null,
        encryptedDek: null,
        iv: null,
        authTag: null,
      });
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        nullFieldsKey as never,
      );

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyRevokedException);

      expectAuditLog(logSpy, 'missing_ciphertext');
    });

    it('应当在部分加密字段为 null 时抛出 ApiKeyRevokedException', async () => {
      const partialNullKey = createActiveApiKey({
        status: 'active',
        encryptedKey: Buffer.from('data'),
        encryptedDek: null,
      });
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        partialNullKey as never,
      );

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyRevokedException);
    });

    it('应当在解密失败时记录审计并且不更新 lastUsedAt', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const activeKey = createActiveApiKey();
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        activeKey as never,
      );
      vi.mocked(encryptionService.decrypt!).mockImplementation(() => {
        throw new Error('decrypt failed');
      });

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toThrow('decrypt failed');

      expect(apiKeyService.updateLastUsedAt).not.toHaveBeenCalled();
      expectAuditLog(logSpy, 'decrypt_failed');
    });
  });

  describe('decryptConfiguredApiKey', () => {
    it('应当优先解密显式绑定的 API Key', async () => {
      const activeKey = createActiveApiKey();
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        activeKey as never,
      );

      const result = await service.decryptConfiguredApiKey({
        apiKeyId: KEY_ID,
        organizationId: activeKey.organizationId,
        tenantId: TENANT_ID,
        provider: 'openai',
      });

      expect(result).toBe('sk-decrypted-plain-key');
      expect(apiKeyService.findByIdInternal).toHaveBeenCalledWith(
        KEY_ID,
        TENANT_ID,
      );
      expect(
        apiKeyService.findDefaultActiveByOrganizationInternal,
      ).not.toHaveBeenCalled();
    });

    it('应当在未显式绑定时回退到同 provider 的默认 API Key', async () => {
      const defaultKey = createActiveApiKey({ id: 'default-key-id', isDefault: true });
      vi.mocked(
        apiKeyService.findDefaultActiveByOrganizationInternal!,
      ).mockResolvedValue(defaultKey as never);

      const result = await service.decryptConfiguredApiKey({
        apiKeyId: null,
        organizationId: defaultKey.organizationId,
        tenantId: TENANT_ID,
        provider: 'openai',
      });

      expect(result).toBe('sk-decrypted-plain-key');
      expect(
        apiKeyService.findDefaultActiveByOrganizationInternal,
      ).toHaveBeenCalledWith(defaultKey.organizationId, TENANT_ID, 'openai');
      expect(apiKeyService.updateLastUsedAt).toHaveBeenCalledWith(
        'default-key-id',
      );
    });

    it('应当在缺少默认 API Key 时抛出 DefaultApiKeyNotConfiguredException', async () => {
      vi.mocked(
        apiKeyService.findDefaultActiveByOrganizationInternal!,
      ).mockResolvedValue(undefined);

      await expect(
        service.decryptConfiguredApiKey({
          apiKeyId: null,
          organizationId: 'org-id',
          tenantId: TENANT_ID,
          provider: 'openai',
        }),
      ).rejects.toBeInstanceOf(DefaultApiKeyNotConfiguredException);
    });
  });
});
