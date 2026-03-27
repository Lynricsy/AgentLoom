import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiKeyModule } from '../api-key/api-key.module';
import { TenantKeyModule } from '../tenant-key/tenant-key.module';
import { LlmEncryptionService } from './llm-encryption.service';
import { LlmController } from './llm.controller';
import { LlmProviderController } from './llm-provider.controller';
import { LlmService } from './llm.service';
import { PiAiAdapter } from './pi-ai-adapter';
import { PrivateCloudController } from './private-cloud.controller';
import { PrivateCloudService } from './private-cloud.service';

@Module({
  imports: [ConfigModule, ApiKeyModule, TenantKeyModule],
  controllers: [LlmController, LlmProviderController, PrivateCloudController],
  providers: [
    LlmService,
    PiAiAdapter,
    LlmEncryptionService,
    PrivateCloudService,
  ],
  exports: [LlmService, PiAiAdapter, LlmEncryptionService],
})
export class LlmModule {}
