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

  async decryptApiKey(id: string, tenantId: string): Promise<string> {
    const apiKey = await this.apiKeyService.findByIdInternal(id, tenantId);

    if (!apiKey) {
      throw new ApiKeyNotFoundException(id);
    }

    if (apiKey.status === 'revoked') {
      throw new ApiKeyRevokedException(id);
    }

    if (
      !apiKey.encryptedKey ||
      !apiKey.encryptedDek ||
      !apiKey.iv ||
      !apiKey.authTag
    ) {
      throw new ApiKeyRevokedException(id);
    }

    this.logger.log(
      `解密 API 密钥: id=${id}, provider=${apiKey.provider}, tenantId=${tenantId}`,
    );

    const plaintext = this.encryptionService.decrypt({
      encryptedKey: apiKey.encryptedKey,
      encryptedDek: apiKey.encryptedDek,
      iv: apiKey.iv,
      authTag: apiKey.authTag,
    });

    await this.apiKeyService.updateLastUsedAt(id);

    return plaintext;
  }
}
