import { Module } from '@nestjs/common';

import { ApiKeyModule } from '../api-key/api-key.module';
import { LlmModule } from '../llm/llm.module';
import { BuiltinToolsProvider } from './builtin-tools.provider';
import { ImageGenerationService } from './image-generation/image-generation.service';
import { WebSearchService } from './web-search/web-search.service';

/** 服务端内置 Agent 工具（web_search、generate_image），两种运行态共用 */
@Module({
  imports: [ApiKeyModule, LlmModule],
  providers: [BuiltinToolsProvider, ImageGenerationService, WebSearchService],
  exports: [BuiltinToolsProvider, ImageGenerationService, WebSearchService],
})
export class BuiltinToolsModule {}
