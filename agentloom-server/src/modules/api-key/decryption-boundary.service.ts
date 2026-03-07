import { Injectable, Logger } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { EncryptionService } from './encryption.service';
import {
  ApiKeyNotFoundException,
  ApiKeyRevokedException,
} from './api-key.exceptions';

@Injectable()
export class DecryptionBoundaryService {
  private readonly logger = new Logger(DecryptionBoundaryService.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async decryptApiKey(
    id: string,
    tenantId: string,
    caller = DecryptionBoundaryService.name,
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    this.logAuditEvent({
      keyId: id,
      caller,
      tenantId,
      timestamp,
      outcome: 'requested',
    });

    const apiKey = await this.apiKeyService.findByIdInternal(id, tenantId);

    if (!apiKey) {
      this.logAuditEvent({
        keyId: id,
        caller,
        tenantId,
        timestamp,
        outcome: 'not_found',
      });
      throw new ApiKeyNotFoundException(id);
    }

    if (apiKey.status === 'revoked') {
      this.logAuditEvent({
        keyId: id,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'revoked',
      });
      throw new ApiKeyRevokedException(id);
    }

    if (
      !apiKey.encryptedKey ||
      !apiKey.encryptedDek ||
      !apiKey.iv ||
      !apiKey.authTag
    ) {
      this.logAuditEvent({
        keyId: id,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'missing_ciphertext',
      });
      throw new ApiKeyRevokedException(id);
    }

    let plaintext: string;
    try {
      plaintext = this.encryptionService.decrypt({
        encryptedKey: apiKey.encryptedKey,
        encryptedDek: apiKey.encryptedDek,
        iv: apiKey.iv,
        authTag: apiKey.authTag,
      });
    } catch (error) {
      this.logAuditEvent({
        keyId: id,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'decrypt_failed',
      });
      throw error;
    }

    await this.apiKeyService.updateLastUsedAt(id);

    this.logAuditEvent({
      keyId: id,
      caller,
      tenantId,
      timestamp,
      provider: apiKey.provider,
      outcome: 'decrypted',
    });

    return plaintext;
  }

  private logAuditEvent(event: {
    keyId: string;
    caller: string;
    tenantId: string;
    timestamp: string;
    outcome:
      | 'requested'
      | 'not_found'
      | 'revoked'
      | 'missing_ciphertext'
      | 'decrypt_failed'
      | 'decrypted';
    provider?: string;
  }): void {
    this.logger.log(`API Key 解密审计 ${JSON.stringify(event)}`);
  }
}
