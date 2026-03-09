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
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateLlmModelConfigDto } from './dto/create-llm-model-config.dto';
import { UpdateLlmModelConfigDto } from './dto/update-llm-model-config.dto';
import { LlmService } from './llm.service';

@ApiTags('LLM Models')
@Controller('llm-models')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post()
  @Roles('owner', 'admin')
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
  @Roles('owner', 'admin', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取所有 LLM 模型配置' })
  @ApiResponse({ status: 200, description: '返回 LLM 模型配置列表' })
  async findAll(@CurrentTenant() tenantId: string) {
    const result = await this.llmService.findAll(tenantId);
    return { data: result };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定 LLM 模型配置' })
  @ApiResponse({ status: 200, description: '返回 LLM 模型配置详情' })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  async findById(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    const result = await this.llmService.findById(id, tenantId);
    return { data: result };
  }

  @Patch(':id')
  @Roles('owner', 'admin')
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
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 LLM 模型配置' })
  @ApiResponse({ status: 204, description: 'LLM 模型配置删除成功' })
  @ApiResponse({ status: 404, description: '模型配置未找到' })
  async delete(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    await this.llmService.delete(id, tenantId);
  }
}
