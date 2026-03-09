import { Injectable, Logger } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { EncryptionService } from './encryption.service';
import {
  DefaultApiKeyNotConfiguredException,
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
    return this.decryptStoredKey(
      await this.apiKeyService.findByIdInternal(id, tenantId),
      id,
      tenantId,
      caller,
    );
  }

  async decryptConfiguredApiKey(
    config: {
      apiKeyId: string | null;
      organizationId: string;
      tenantId: string;
      provider: string;
    },
    caller = DecryptionBoundaryService.name,
  ): Promise<string> {
    if (config.apiKeyId) {
      return this.decryptApiKey(config.apiKeyId, config.tenantId, caller);
    }

    const defaultApiKey =
      await this.apiKeyService.findDefaultActiveByOrganizationInternal(
        config.organizationId,
        config.tenantId,
        config.provider,
      );

    if (!defaultApiKey) {
      throw new DefaultApiKeyNotConfiguredException(config.provider);
    }

    return this.decryptStoredKey(
      defaultApiKey,
      defaultApiKey.id,
      config.tenantId,
      caller,
    );
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

  private async decryptStoredKey(
    apiKey: Awaited<ReturnType<ApiKeyService['findByIdInternal']>>,
    keyId: string,
    tenantId: string,
    caller: string,
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    this.logAuditEvent({
      keyId,
      caller,
      tenantId,
      timestamp,
      outcome: 'requested',
    });

    if (!apiKey) {
      this.logAuditEvent({
        keyId,
        caller,
        tenantId,
        timestamp,
        outcome: 'not_found',
      });
      throw new ApiKeyNotFoundException(keyId);
    }

    if (apiKey.status === 'revoked') {
      this.logAuditEvent({
        keyId,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'revoked',
      });
      throw new ApiKeyRevokedException(keyId);
    }

    if (
      !apiKey.encryptedKey ||
      !apiKey.encryptedDek ||
      !apiKey.iv ||
      !apiKey.authTag
    ) {
      this.logAuditEvent({
        keyId,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'missing_ciphertext',
      });
      throw new ApiKeyRevokedException(keyId);
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
        keyId,
        caller,
        tenantId,
        timestamp,
        provider: apiKey.provider,
        outcome: 'decrypt_failed',
      });
      throw error;
    }

    await this.apiKeyService.updateLastUsedAt(keyId);

    this.logAuditEvent({
      keyId,
      caller,
      tenantId,
      timestamp,
      provider: apiKey.provider,
      outcome: 'decrypted',
    });

    return plaintext;
  }
}
