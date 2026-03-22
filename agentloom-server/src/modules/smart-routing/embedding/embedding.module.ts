import { Module } from '@nestjs/common';

import { ApiKeyModule } from '../../api-key/api-key.module';
import { LlmModule } from '../../llm/llm.module';
import { EmbeddingIntegrationService } from './embedding.service';

@Module({
  imports: [ApiKeyModule, LlmModule],
  providers: [EmbeddingIntegrationService],
  exports: [EmbeddingIntegrationService],
})
export class EmbeddingModule {}
