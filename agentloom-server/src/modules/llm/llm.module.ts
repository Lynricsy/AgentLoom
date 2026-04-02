import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiKeyModule } from '../api-key/api-key.module';
import { TenantKeyModule } from '../tenant-key/tenant-key.module';
import { LlmEncryptionService } from './llm-encryption.service';
import { LlmController } from './llm.controller';
import { LlmProviderController } from './llm-provider.controller';
import { LlmProviderService } from './llm-provider.service';
import { LlmService } from './llm.service';
import { ModelDiscoveryService } from './model-discovery.service';
import { PiAiAdapter } from './pi-ai-adapter';

@Module({
  imports: [ConfigModule, ApiKeyModule, TenantKeyModule],
  controllers: [LlmController, LlmProviderController],
  providers: [
    LlmService,
    LlmProviderService,
    PiAiAdapter,
    LlmEncryptionService,
    ModelDiscoveryService,
  ],
  exports: [
    LlmService,
    LlmProviderService,
    PiAiAdapter,
    LlmEncryptionService,
    ModelDiscoveryService,
  ],
})
export class LlmModule {}
