import { Injectable, Logger } from '@nestjs/common';
import {
  constants,
  createCipheriv,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';

import { TenantKeyService } from '../tenant-key/tenant-key.service';

export interface EncryptedPayload {
  ciphertext: string;
  encryptedSessionKey: string;
  iv: string;
  authTag: string;
  aad: string;
  keyFingerprint: string;
  algorithm: string;
}

export const E2EE_ALGORITHM = 'RSA-OAEP-4096+AES-256-GCM';

@Injectable()
export class LlmEncryptionService {
  private readonly logger = new Logger(LlmEncryptionService.name);

  constructor(private readonly tenantKeyService: TenantKeyService) {}

  async isE2EEEnabled(tenantId: string, orgId: string): Promise<boolean> {
    try {
      const key = await this.tenantKeyService.getActiveKey(tenantId, orgId);
      return key !== null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`检查租户 ${tenantId} E2EE 状态失败: ${reason}`);
      return false;
    }
  }

  async encryptForTenant(
    tenantId: string,
    orgId: string,
    plaintext: string,
  ): Promise<EncryptedPayload> {
    const tenantKey = await this.tenantKeyService.getActiveKey(tenantId, orgId);

    if (!tenantKey) {
      throw new Error(`租户 ${tenantId} 未配置活跃的加密密钥`);
    }

    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const timestamp = new Date().toISOString();
    const aad = `${tenantId}:${timestamp}`;

    try {
      const cipher = createCipheriv('aes-256-gcm', dek, iv);
      cipher.setAAD(Buffer.from(aad, 'utf-8'));

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf-8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const encryptedSessionKey = publicEncrypt(
        {
          key: tenantKey.publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        dek,
      );

      return {
        ciphertext: encrypted.toString('base64'),
        encryptedSessionKey: encryptedSessionKey.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        aad,
        keyFingerprint: tenantKey.keyFingerprint,
        algorithm: E2EE_ALGORITHM,
      };
    } finally {
      dek.fill(0);
    }
  }
}
