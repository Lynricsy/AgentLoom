import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { EncryptionService } from './encryption.service';
import { DecryptionBoundaryService } from './decryption-boundary.service';

@Module({
  imports: [ConfigModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, EncryptionService, DecryptionBoundaryService],
  exports: [ApiKeyService, EncryptionService, DecryptionBoundaryService],
})
export class ApiKeyModule {}
