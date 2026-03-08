import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateVersionDto } from './dto/create-version.dto';
import { ListVersionsQueryDto } from './dto/list-versions-query.dto';
import { PublishWorkflowDto } from './dto/publish-workflow.dto';
import type { VersionResponseDto } from './dto/version-response.dto';
import { WorkflowVersionService } from './workflow-version.service';

@ApiTags('Workflow Versions')
@Controller('workflow-definitions/:workflowId')
export class WorkflowVersionController {
  constructor(
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @Post('versions')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建工作流版本快照' })
  @ApiResponse({ status: 201, description: '版本快照创建成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  @ApiResponse({ status: 409, description: '工作流已归档' })
  async createVersion(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: VersionResponseDto }> {
    const data = await this.workflowVersionService.createVersion(
      workflowId,
      dto,
      userId,
    );
    return { data };
  }

  @Get('versions')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取工作流版本列表' })
  @ApiResponse({ status: 200, description: '版本列表获取成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  async listVersions(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query() query: ListVersionsQueryDto,
  ): Promise<{
    data: VersionResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    return this.workflowVersionService.listVersions(workflowId, query);
  }

  @Post('versions/:versionId/rollback')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回滚到指定版本' })
  @ApiResponse({ status: 200, description: '回滚成功' })
  @ApiResponse({ status: 404, description: '工作流或版本不存在' })
  @ApiResponse({ status: 409, description: '工作流已归档' })
  async rollback(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: VersionResponseDto }> {
    const data = await this.workflowVersionService.rollback(
      workflowId,
      versionId,
      userId,
    );
    return { data };
  }

  @Post('publish')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布工作流' })
  @ApiResponse({ status: 200, description: '工作流发布成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  @ApiResponse({ status: 409, description: '状态转换无效或工作流已归档' })
  @ApiResponse({ status: 422, description: '工作流验证失败' })
  async publish(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() dto: PublishWorkflowDto,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: VersionResponseDto }> {
    const data = await this.workflowVersionService.publish(
      workflowId,
      dto,
      userId,
    );
    return { data };
  }

  @Post('archive')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '归档工作流' })
  @ApiResponse({ status: 204, description: '工作流归档成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  @ApiResponse({ status: 409, description: '工作流已归档' })
  async archive(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.workflowVersionService.archive(workflowId, userId);
  }

  @Get('published-version')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取已发布的工作流版本' })
  @ApiResponse({ status: 200, description: '已发布版本获取成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  async getPublishedVersion(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: VersionResponseDto | null }> {
    const data = await this.workflowVersionService.getPublishedVersion(
      workflowId,
      tenantId,
    );
    return { data };
  }
}
