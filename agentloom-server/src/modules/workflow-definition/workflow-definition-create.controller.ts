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
import { type z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import {
  CaptureAuditLog,
  auditLogCaptureConfigs,
} from '../evidence/audit-log.capture';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { ListWorkflowDefinitionsQueryDto } from './dto/list-workflow-definitions-query.dto';
import { UpdateWorkflowDefinitionDto } from './dto/update-workflow-definition.dto';
import type { WorkflowExportDto } from './dto/workflow-export.dto';
import type { WorkflowDefinitionDetailResponseDto } from './dto/workflow-definition-response.dto';
import {
  WorkflowDefinitionDetailResponseSwaggerDto,
  WorkflowDefinitionDetailEnvelopeSwaggerSchema,
  WorkflowDefinitionListResponseSwaggerDto,
  WorkflowDefinitionListResponseSwaggerSchema,
} from './dto/workflow-definition-response.dto';
import type { ImportValidationResult } from './utils/validate-import.utils';
import { validateImportFile } from './utils/validate-import.utils';
import { WorkflowVersionService } from './workflow-version.service';

function isImportValidationBodyWithFileContent(
  body: unknown,
): body is { file_content: unknown } {
  return typeof body === 'object' && body !== null && 'file_content' in body;
}

@ApiTags('Workflow Definitions')
@Controller('workflow-definitions')
export class WorkflowDefinitionCreateController {
  constructor(
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询工作流定义列表' })
  @ApiResponse({
    status: 200,
    description: '工作流定义列表',
    type: WorkflowDefinitionListResponseSwaggerDto,
  })
  async findAll(
    @Query() query: ListWorkflowDefinitionsQueryDto,
    @CurrentTenant() _tenantId: string,
  ): Promise<z.infer<typeof WorkflowDefinitionListResponseSwaggerSchema>> {
    return this.workflowVersionService.findAllDefinitions(query);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询工作流定义详情' })
  @ApiResponse({
    status: 200,
    description: '工作流定义详情',
    type: WorkflowDefinitionDetailResponseSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '工作流定义不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() _tenantId: string,
  ): Promise<z.infer<typeof WorkflowDefinitionDetailEnvelopeSwaggerSchema>> {
    const data = await this.workflowVersionService.findDefinitionDetailById(id);
    return { data };
  }

  @Get(':workflowId/export')
  @Roles('owner', 'admin', 'creator', 'operator')
  @CaptureAuditLog(auditLogCaptureConfigs.exportWorkflow)
  @ApiOperation({ summary: '导出工作流定义' })
  @ApiResponse({ status: 200, description: '工作流导出成功' })
  @ApiResponse({ status: 404, description: '工作流定义不存在' })
  async exportWorkflow(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<WorkflowExportDto> {
    return this.workflowVersionService.exportWorkflow(tenantId, workflowId);
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

  @Post('import/validate')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '校验导入工作流文件' })
  @ApiResponse({ status: 200, description: '导入文件校验结果' })
  async validateImport(@Body() body: unknown): Promise<ImportValidationResult> {
    return validateImportFile(
      isImportValidationBodyWithFileContent(body) ? body.file_content : body,
    );
  }

  @Post('import')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '导入工作流定义' })
  @ApiResponse({ status: 201, description: '工作流定义导入成功' })
  @ApiResponse({ status: 422, description: '导入工作流文件校验失败' })
  async importWorkflow(
    // 保留原始请求体给 service 统一映射 422，避免 Zod pipe 抢先返回 400。
    @Body() dto: unknown,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ id: string; name: string; slug: string }> {
    return this.workflowVersionService.importWorkflow(tenantId, userId, dto);
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
