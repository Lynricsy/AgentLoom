import { Module } from '@nestjs/common';

import { BuiltinToolsProvider } from './builtin-tools.provider';
import { WebSearchService } from './web-search/web-search.service';

/** 服务端内置 Agent 工具（web_search 等），两种运行态共用 */
@Module({
  providers: [BuiltinToolsProvider, WebSearchService],
  exports: [BuiltinToolsProvider, WebSearchService],
})
export class BuiltinToolsModule {}
