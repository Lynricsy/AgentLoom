import { DecryptionBoundaryService } from '../decryption-boundary.service';
import { ApiKeyService } from '../api-key.service';
import { EncryptionService } from '../encryption.service';
import {
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
    keyPreview: '...5678',
    status: 'active',
    encryptedKey: Buffer.from('encrypted-key'),
    encryptedDek: Buffer.from('encrypted-dek'),
    iv: Buffer.from('iv-data'),
    authTag: Buffer.from('auth-tag'),
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DecryptionBoundaryService', () => {
  let service: DecryptionBoundaryService;
  let apiKeyService: Partial<ApiKeyService>;
  let encryptionService: Partial<EncryptionService>;

  beforeEach(() => {
    vi.clearAllMocks();

    apiKeyService = {
      findByIdInternal: vi.fn(),
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
      const activeKey = createActiveApiKey();
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        activeKey as never,
      );

      const result = await service.decryptApiKey(KEY_ID, TENANT_ID);

      expect(result).toBe('sk-decrypted-plain-key');
      expect(encryptionService.decrypt).toHaveBeenCalledWith({
        encryptedKey: activeKey.encryptedKey,
        encryptedDek: activeKey.encryptedDek,
        iv: activeKey.iv,
        authTag: activeKey.authTag,
      });
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
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(undefined);

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyNotFoundException);
    });

    it('应当在密钥已撤销时抛出 ApiKeyRevokedException', async () => {
      const revokedKey = createActiveApiKey({ status: 'revoked' });
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(
        revokedKey as never,
      );

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(ApiKeyRevokedException);
    });

    it('应当在加密字段为 null 时抛出 ApiKeyRevokedException', async () => {
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

    it('应当不在解密失败时更新 lastUsedAt', async () => {
      vi.mocked(apiKeyService.findByIdInternal!).mockResolvedValue(undefined);

      await expect(
        service.decryptApiKey(KEY_ID, TENANT_ID),
      ).rejects.toThrow();

      expect(apiKeyService.updateLastUsedAt).not.toHaveBeenCalled();
    });
  });
});
