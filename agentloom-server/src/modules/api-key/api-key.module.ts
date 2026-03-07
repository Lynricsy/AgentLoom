import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { EncryptionService } from './encryption.service';
import { DecryptionBoundaryService } from './decryption-boundary.service';

@Module({
  controllers: [ApiKeyController],
  providers: [ApiKeyService, EncryptionService, DecryptionBoundaryService],
  exports: [DecryptionBoundaryService],
})
export class ApiKeyModule {}
