import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentDefinitionService } from './agent-definition.service';
import {
  CreateAgentDefinitionSchema,
  type CreateAgentDefinitionDto,
  UpdateAgentDefinitionSchema,
  type UpdateAgentDefinitionDto,
  SaveAgentCanvasSchema,
  type SaveAgentCanvasDto,
  CreateAgentVersionSchema,
  type CreateAgentVersionDto,
  PublishAgentSchema,
  type PublishAgentDto,
  ListAgentDefinitionsQuerySchema,
  type ListAgentDefinitionsQueryDto,
} from './dto';
import {
  AgentDefinitionDetailResponseSwaggerDto,
  AgentDefinitionDetailEnvelopeSwaggerSchema,
  AgentDefinitionListResponseSwaggerDto,
  AgentDefinitionListResponseSwaggerSchema,
} from './dto/agent-definition-response.dto';

@ApiTags('Agent Definitions')
@Controller('agent-definitions')
export class AgentDefinitionController {
  constructor(
    private readonly agentDefinitionService: AgentDefinitionService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 Agent 定义' })
  @ApiResponse({ status: 201, description: 'Agent 定义创建成功' })
  async create(
    @Body(new ZodValidationPipe(CreateAgentDefinitionSchema))
    dto: CreateAgentDefinitionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.agentDefinitionService.create(dto, userId);
    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取 Agent 定义列表' })
  @ApiResponse({
    status: 200,
    description: 'Agent 定义列表',
    type: AgentDefinitionListResponseSwaggerDto,
  })
  async findAll(
    @Query(new ZodValidationPipe(ListAgentDefinitionsQuerySchema))
    query: ListAgentDefinitionsQueryDto,
  ): Promise<z.infer<typeof AgentDefinitionListResponseSwaggerSchema>> {
    return this.agentDefinitionService.findAll(query);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取 Agent 定义详情' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({
    status: 200,
    description: 'Agent 定义详情',
    type: AgentDefinitionDetailResponseSwaggerDto,
  })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<z.infer<typeof AgentDefinitionDetailEnvelopeSwaggerSchema>> {
    const data = await this.agentDefinitionService.findDetailById(id);
    return { data };
  }

  @Put(':id')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新 Agent 定义（含 OCC 版本校验）' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 200, description: 'Agent 定义更新成功' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  @ApiResponse({ status: 409, description: '版本冲突' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAgentDefinitionSchema))
    dto: UpdateAgentDefinitionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.agentDefinitionService.update(id, dto, userId);
    return { data };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '归档 Agent 定义（软删除）' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 204, description: 'Agent 定义已归档' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.agentDefinitionService.archive(id, userId);
  }

  @Put(':id/canvas')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '保存 Agent 画布（nodes/edges/viewport）' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 200, description: '画布保存成功' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  @ApiResponse({ status: 409, description: '版本冲突或已归档' })
  async saveCanvas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveAgentCanvasSchema))
    dto: SaveAgentCanvasDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.agentDefinitionService.saveCanvas(id, dto, userId);
    return { data };
  }

  @Post(':id/compile')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '编译 Agent 画布为 AgentRuntimeConfig' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 200, description: '编译结果' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  async compileCanvas(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.agentDefinitionService.compileCanvas(id);
    return { data };
  }

  @Post(':id/versions')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 Agent 版本快照' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 201, description: '版本创建成功' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  @ApiResponse({ status: 409, description: 'Agent 已归档' })
  async createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateAgentVersionSchema))
    dto: CreateAgentVersionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.agentDefinitionService.createVersion(
      id,
      dto,
      userId,
    );
    return { data };
  }

  @Get(':id/versions')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取 Agent 版本列表' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 200, description: 'Agent 版本列表' })
  async listVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.agentDefinitionService.listVersions(
      id,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
  }

  @Post(':id/publish')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '发布 Agent 定义' })
  @ApiParam({ name: 'id', description: 'Agent 定义 ID' })
  @ApiResponse({ status: 200, description: '发布成功' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  @ApiResponse({ status: 409, description: 'Agent 已归档' })
  @ApiResponse({ status: 422, description: '画布为空，无法发布' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PublishAgentSchema))
    dto: PublishAgentDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.agentDefinitionService.publish(id, dto, userId);
    return { data };
  }
}
