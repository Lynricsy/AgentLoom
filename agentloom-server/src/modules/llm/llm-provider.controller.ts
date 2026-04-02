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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto';
import { TestProviderConnectionDto } from './dto/test-provider-connection.dto';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';
import { LlmProviderService } from './llm-provider.service';
import { ModelDiscoveryService } from './model-discovery.service';

@ApiTags('LLM Providers')
@Controller('llm-providers')
export class LlmProviderController {
  constructor(
    private readonly providerService: LlmProviderService,
    private readonly modelDiscoveryService: ModelDiscoveryService,
  ) {}

  // =========================================================================
  // 静态路由（必须在 :id 参数路由之前注册，避免路由冲突）
  // =========================================================================

  @Get('metadata/lookup')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询 LiteLLM 模型元数据' })
  @ApiResponse({ status: 200, description: '返回模型元数据（可能为 null）' })
  async lookupModelMetadata(
    @Query('providerSlug') providerSlug: string,
    @Query('modelId') modelId: string,
  ) {
    const metadata = await this.modelDiscoveryService.lookupModelMetadata(
      providerSlug,
      modelId,
    );
    return { data: metadata };
  }

  // =========================================================================
  // Provider CRUD
  // =========================================================================

  @Get()
  @Roles('owner', 'admin', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '列出组织下所有 LLM 提供商' })
  @ApiResponse({ status: 200, description: '返回 LLM 提供商列表' })
  async findAll(@CurrentTenant() tenantId: string) {
    const providers = await this.providerService.findAll(tenantId);
    return { data: providers };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定 LLM 提供商详情' })
  @ApiResponse({ status: 200, description: '返回 LLM 提供商详情' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  async findById(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    const provider = await this.providerService.findById(id, tenantId);
    return { data: provider };
  }

  @Post()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建自定义 LLM 提供商' })
  @ApiResponse({ status: 201, description: 'LLM 提供商创建成功' })
  @ApiResponse({ status: 409, description: '提供商标识冲突' })
  async create(
    @Body() dto: CreateLlmProviderDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const provider = await this.providerService.create(dto, tenantId, userId);
    return { data: provider };
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新 LLM 提供商' })
  @ApiResponse({ status: 200, description: 'LLM 提供商更新成功' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  @ApiResponse({ status: 409, description: '提供商标识冲突' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLlmProviderDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const provider = await this.providerService.update(
      id,
      dto,
      tenantId,
      userId,
    );
    return { data: provider };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除自定义 LLM 提供商' })
  @ApiResponse({ status: 204, description: 'LLM 提供商删除成功' })
  @ApiResponse({ status: 403, description: '内置提供商不可删除' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  async delete(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    await this.providerService.delete(id, tenantId);
  }

  // =========================================================================
  // Provider Actions
  // =========================================================================

  @Post(':id/reset-base-url')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置提供商 Base URL 为默认值' })
  @ApiResponse({ status: 200, description: 'Base URL 已重置' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  async resetBaseUrl(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const provider = await this.providerService.resetBaseUrl(id, tenantId);
    return { data: provider };
  }

  @Post(':id/test-connection')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试提供商连接' })
  @ApiResponse({ status: 200, description: '返回连接测试结果' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  @ApiResponse({ status: 502, description: '提供商连接失败' })
  @ApiResponse({ status: 504, description: '提供商连接超时' })
  async testConnection(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() body?: TestProviderConnectionDto,
  ) {
    const provider = await this.providerService.findById(id, tenantId);
    const result = await this.modelDiscoveryService.testConnection(
      provider,
      body?.timeoutMs,
    );
    return { data: result };
  }

  @Post(':id/discover-models')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发现提供商可用模型' })
  @ApiResponse({ status: 200, description: '返回发现的模型列表' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  @ApiResponse({ status: 502, description: '提供商连接失败' })
  async discoverModels(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const provider = await this.providerService.findById(id, tenantId);
    const models = await this.modelDiscoveryService.discoverModels(provider);
    return { data: models };
  }

  // =========================================================================
  // LiteLLM Metadata
  // =========================================================================

  @Get(':id/litellm-models')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '搜索提供商在 LiteLLM 中的模型元数据' })
  @ApiResponse({ status: 200, description: '返回 LiteLLM 模型元数据列表' })
  @ApiResponse({ status: 404, description: '提供商未找到' })
  async searchLiteLLMModels(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const provider = await this.providerService.findById(id, tenantId);
    const models = await this.modelDiscoveryService.searchLiteLLMModels(
      provider.slug,
    );
    return { data: models };
  }
}
