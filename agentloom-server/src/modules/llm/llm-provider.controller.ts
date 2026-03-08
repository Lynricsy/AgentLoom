import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { LLM_PROVIDER_CATALOG } from './llm-provider-catalog';

@ApiTags('LLM Providers')
@Controller('llm-providers')
export class LlmProviderController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取支持的 LLM 提供商列表' })
  @ApiResponse({ status: 200, description: '返回 LLM 提供商目录' })
  getProviders() {
    return { data: LLM_PROVIDER_CATALOG };
  }
}
