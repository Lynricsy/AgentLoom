import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { ListWorkflowDefinitionsQueryDto } from './dto/list-workflow-definitions-query.dto';
import { UpdateWorkflowDefinitionDto } from './dto/update-workflow-definition.dto';
import type {
  WorkflowDefinitionDetailResponseDto,
  WorkflowDefinitionListResponseDto,
} from './dto/workflow-definition-response.dto';
import { WorkflowVersionService } from './workflow-version.service';

@ApiTags('Workflow Definitions')
@Controller('workflow-definitions')
export class WorkflowDefinitionCreateController {
  constructor(
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询工作流定义列表' })
  @ApiResponse({ status: 200, description: '工作流定义列表' })
  async findAll(
    @Query() query: ListWorkflowDefinitionsQueryDto,
    @CurrentTenant() _tenantId: string,
  ): Promise<WorkflowDefinitionListResponseDto> {
    return this.workflowVersionService.findAllDefinitions(query);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询工作流定义详情' })
  @ApiResponse({ status: 200, description: '工作流定义详情' })
  @ApiResponse({ status: 404, description: '工作流定义不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() _tenantId: string,
  ): Promise<{ data: WorkflowDefinitionDetailResponseDto }> {
    const data =
      await this.workflowVersionService.findDefinitionDetailById(id);
    return { data };
  }

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建工作流定义' })
  @ApiResponse({ status: 201, description: '工作流定义创建成功' })
  async create(
    @Body() dto: CreateWorkflowDefinitionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: WorkflowDefinition }> {
    const data = await this.workflowVersionService.create(
      tenantId,
      userId,
      dto,
    );
    return { data };
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新工作流定义' })
  @ApiResponse({ status: 200, description: '工作流定义更新成功' })
  @ApiResponse({ status: 404, description: '工作流定义不存在' })
  @ApiResponse({ status: 409, description: '版本冲突' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDefinitionDto,
    @CurrentTenant() _tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: WorkflowDefinitionDetailResponseDto }> {
    const data = await this.workflowVersionService.updateDefinition(
      id,
      userId,
      dto,
    );
    return { data };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除（归档）工作流定义' })
  @ApiResponse({ status: 204, description: '工作流定义删除成功' })
  @ApiResponse({ status: 404, description: '工作流定义不存在' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() _tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.workflowVersionService.archive(id, userId);
  }
}
