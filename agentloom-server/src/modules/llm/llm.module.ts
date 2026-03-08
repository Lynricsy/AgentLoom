import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiKeyModule } from '../api-key/api-key.module';
import { LlmController } from './llm.controller';
import { LlmProviderController } from './llm-provider.controller';
import { LlmService } from './llm.service';
import { PiAiAdapter } from './pi-ai-adapter';

@Module({
  imports: [ConfigModule, ApiKeyModule],
  controllers: [LlmController, LlmProviderController],
  providers: [LlmService, PiAiAdapter],
  exports: [LlmService, PiAiAdapter],
})
export class LlmModule {}
