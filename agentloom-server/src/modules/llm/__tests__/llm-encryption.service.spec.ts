import { Test, TestingModule } from '@nestjs/testing';
import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
} from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TenantEncryptionKey } from '../../../database/schema/tenant-encryption-keys.schema';
import { TenantKeyService } from '../../tenant-key/tenant-key.service';
import {
  E2EE_ALGORITHM,
  type EncryptedPayload,
  LlmEncryptionService,
} from '../llm-encryption.service';

const { mockTenantKeyService } = vi.hoisted(() => ({
  mockTenantKeyService: {
    getActiveKey: vi.fn(),
  },
}));

const NOW = new Date('2026-03-15T12:34:56.000Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const KEY_ID = '00000000-0000-0000-0000-000000000030';
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

let testKeyPair: { publicKey: string; privateKey: string };

function createTenantKeyRecord(
  overrides: Partial<TenantEncryptionKey> = {},
): TenantEncryptionKey {
  return {
    id: KEY_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    publicKey: testKeyPair.publicKey,
    keyFingerprint:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status: 'active',
    activatedAt: NOW,
    rotatedAt: null,
    revokedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function decryptPayload(payload: EncryptedPayload, privateKeyPem: string): string {
  const dek = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(payload.encryptedSessionKey, 'base64'),
  );

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(payload.aad, 'utf-8'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } finally {
    dek.fill(0);
  }
}

describe('LlmEncryptionService', () => {
  let service: LlmEncryptionService;

  beforeAll(() => {
    testKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmEncryptionService,
        {
          provide: TenantKeyService,
          useValue: mockTenantKeyService,
        },
      ],
    }).compile();

    service = module.get<LlmEncryptionService>(LlmEncryptionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isE2EEEnabled', () => {
    it('当存在活跃密钥时返回 true', async () => {
      mockTenantKeyService.getActiveKey.mockResolvedValue(createTenantKeyRecord());

      await expect(service.isE2EEEnabled(TENANT_ID, ORG_ID)).resolves.toBe(true);
    });

    it('当不存在活跃密钥时返回 false', async () => {
      mockTenantKeyService.getActiveKey.mockResolvedValue(null);

      await expect(service.isE2EEEnabled(TENANT_ID, ORG_ID)).resolves.toBe(false);
    });
  });

  describe('encryptForTenant', () => {
    it('成功加密并返回完整 EncryptedPayload', async () => {
      mockTenantKeyService.getActiveKey.mockResolvedValue(createTenantKeyRecord());

      const payload = await service.encryptForTenant(
        TENANT_ID,
        ORG_ID,
        '你好，AgentLoom！',
      );

      expect(payload.ciphertext).toMatch(BASE64_REGEX);
      expect(payload.encryptedSessionKey).toMatch(BASE64_REGEX);
      expect(payload.iv).toMatch(BASE64_REGEX);
      expect(payload.authTag).toMatch(BASE64_REGEX);

      expect(payload.iv).toHaveLength(16);
      expect(Buffer.from(payload.iv, 'base64')).toHaveLength(12);
      expect(Buffer.from(payload.authTag, 'base64')).toHaveLength(16);
      expect(payload.aad).toContain(TENANT_ID);
      expect(payload.aad).toBe(`${TENANT_ID}:${NOW.toISOString()}`);
      expect(payload.algorithm).toBe(E2EE_ALGORITHM);
      expect(payload.keyFingerprint).toBe(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      );
    });

    it('加密完成后应清零 DEK 缓冲区', async () => {
      mockTenantKeyService.getActiveKey.mockResolvedValue(createTenantKeyRecord());

      const fillSpy = vi.spyOn(Buffer.prototype, 'fill');

      await service.encryptForTenant(TENANT_ID, ORG_ID, 'wipe me');

      expect(fillSpy).toHaveBeenCalledWith(0);
    });

    it('当未找到活跃密钥时抛出异常', async () => {
      mockTenantKeyService.getActiveKey.mockResolvedValue(null);

      await expect(
        service.encryptForTenant(TENANT_ID, ORG_ID, 'secret'),
      ).rejects.toThrow(`租户 ${TENANT_ID} 未配置活跃的加密密钥`);
    });

    it('应当支持真实 RSA + AES 回环解密', async () => {
      const plaintext = 'Roundtrip 测试：混合加密内容 ✅';
      mockTenantKeyService.getActiveKey.mockResolvedValue(createTenantKeyRecord());

      const payload = await service.encryptForTenant(TENANT_ID, ORG_ID, plaintext);

      expect(decryptPayload(payload, testKeyPair.privateKey)).toBe(plaintext);
    });
  });
});
