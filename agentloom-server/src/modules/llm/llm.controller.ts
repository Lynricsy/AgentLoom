import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateLlmModelConfigDto } from './dto/create-llm-model-config.dto';
import { ModelThinkingCapabilityResponseDto } from './dto/model-thinking-capability.dto';
import { UpdateLlmModelConfigDto } from './dto/update-llm-model-config.dto';
import { LlmService } from './llm.service';
import { ThinkingCapabilityService } from './thinking-capability.service';

@ApiTags('LLM Models')
@Controller('llm-models')
export class LlmController {
  constructor(
    private readonly llmService: LlmService,
    private readonly thinkingCapabilityService: ThinkingCapabilityService,
  ) {}

  @Post()
  @RequirePermission('llm:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 LLM 模型配置' })
  @ApiResponse({ status: 201, description: 'LLM 模型配置创建成功' })
  @ApiResponse({ status: 409, description: '模型配置名称冲突' })
  async create(
    @Body() dto: CreateLlmModelConfigDto,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.llmService.create(dto, tenantId, userId);
    return { data: result };
  }

  @Get()
  @RequirePermission('llm:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取所有 LLM 模型配置' })
  @ApiResponse({ status: 200, description: '返回 LLM 模型配置列表' })
  async findAll(@CurrentTenant() tenantId: string) {
    const result = await this.llmService.findAll(tenantId);
    return { data: result };
  }

  @Get(':id')
  @RequirePermission('llm:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定 LLM 模型配置' })
  @ApiResponse({ status: 200, description: '返回 LLM 模型配置详情' })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  async findById(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    const result = await this.llmService.findById(id, tenantId);
    return { data: result };
  }

  @Get(':id/thinking-capability')
  @RequirePermission('llm:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取模型的思考强度能力',
    description:
      '按模型真实能力返回可选思考强度：LiteLLM 元数据优先，其次 pi-ai 内置目录；两者都不认识该模型时 status 为 unknown。',
  })
  @ApiResponse({
    status: 200,
    description: '返回模型思考能力',
    type: ModelThinkingCapabilityResponseDto,
  })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  async getThinkingCapability(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const config = await this.llmService.findById(id, tenantId);
    const { capability } = await this.thinkingCapabilityService.resolve({
      providerSlug: config.provider.slug,
      apiProtocol: config.provider.apiProtocol,
      modelId: config.modelId,
    });
    return { data: capability };
  }

  @Patch(':id')
  @RequirePermission('llm:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新 LLM 模型配置' })
  @ApiResponse({ status: 200, description: 'LLM 模型配置更新成功' })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  @ApiResponse({ status: 409, description: '模型配置名称冲突' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLlmModelConfigDto,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.llmService.update(id, dto, tenantId);
    return { data: result };
  }

  @Delete(':id')
  @RequirePermission('llm:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 LLM 模型配置' })
  @ApiResponse({ status: 204, description: 'LLM 模型配置删除成功' })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  async delete(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    await this.llmService.delete(id, tenantId);
  }
}
