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
import type { WorkflowTrigger } from '../../database/schema/workflow-triggers.schema';
import {
  CreateTriggerDto,
  QueryTriggerDto,
  QueryTriggerHistoryDto,
  UpdateTriggerDto,
} from './trigger-dto.compat';
import { TriggerHistoryService } from './trigger-history.service';
import { TriggerSchedulerService } from './trigger-scheduler.service';
import { TriggerService } from './trigger.service';
import { TriggerNotFoundException } from './trigger.exceptions';

@ApiTags('Triggers')
@Controller('workflow-definitions/:workflowId/triggers')
export class TriggerController {
  constructor(
    private readonly triggerService: TriggerService,
    private readonly triggerHistoryService: TriggerHistoryService,
    private readonly triggerSchedulerService: TriggerSchedulerService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建工作流触发器' })
  @ApiResponse({ status: 201, description: '触发器创建成功' })
  async create(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() dto: CreateTriggerDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: WorkflowTrigger }> {
    const data = await this.triggerService.create(tenantId, userId, workflowId, dto);

    if (data.type === 'cron' && data.isEnabled) {
      await this.triggerSchedulerService.registerCronJob(data);
    }

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询工作流触发器列表' })
  @ApiResponse({ status: 200, description: '触发器列表' })
  async findAll(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query() query: QueryTriggerDto,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: WorkflowTrigger[] }> {
    const data = await this.triggerService.findAll(tenantId, workflowId, query);
    return { data };
  }

  @Get(':triggerId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取触发器详情' })
  @ApiResponse({ status: 200, description: '触发器详情' })
  @ApiResponse({ status: 404, description: '触发器不存在' })
  async findById(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: WorkflowTrigger }> {
    const data = await this.findTriggerForWorkflow(tenantId, workflowId, triggerId);
    return { data };
  }

  @Patch(':triggerId')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新触发器' })
  @ApiResponse({ status: 200, description: '触发器更新成功' })
  @ApiResponse({ status: 404, description: '触发器不存在' })
  async update(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @Body() dto: UpdateTriggerDto,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: WorkflowTrigger }> {
    const existing = await this.findTriggerForWorkflow(tenantId, workflowId, triggerId);
    const data = await this.triggerService.update(tenantId, triggerId, dto);

    if (existing.type === 'cron') {
      await this.triggerSchedulerService.removeCronJob(triggerId);

      if (data.isEnabled) {
        await this.triggerSchedulerService.registerCronJob(data);
      }
    }

    return { data };
  }

  @Delete(':triggerId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除触发器' })
  @ApiResponse({ status: 204, description: '触发器删除成功' })
  @ApiResponse({ status: 404, description: '触发器不存在' })
  async remove(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<void> {
    const existing = await this.findTriggerForWorkflow(tenantId, workflowId, triggerId);

    await this.triggerService.remove(tenantId, triggerId);

    if (existing.type === 'cron') {
      await this.triggerSchedulerService.removeCronJob(triggerId);
    }
  }

  @Patch(':triggerId/toggle')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '切换触发器启用状态' })
  @ApiResponse({ status: 200, description: '触发器状态切换成功' })
  @ApiResponse({ status: 404, description: '触发器不存在' })
  async toggle(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: WorkflowTrigger }> {
    const existing = await this.findTriggerForWorkflow(tenantId, workflowId, triggerId);
    const data = await this.triggerService.toggle(tenantId, triggerId);

    if (existing.type === 'cron') {
      if (data.isEnabled) {
        await this.triggerSchedulerService.registerCronJob(data);
      } else {
        await this.triggerSchedulerService.removeCronJob(triggerId);
      }
    }

    return { data };
  }

  @Get(':triggerId/history')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询触发器执行历史' })
  @ApiResponse({ status: 200, description: '触发器执行历史' })
  async findHistory(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @Query() query: QueryTriggerHistoryDto,
    @CurrentTenant() tenantId: string,
  ) {
    await this.findTriggerForWorkflow(tenantId, workflowId, triggerId);
    return this.triggerHistoryService.findByTrigger(tenantId, triggerId, query);
  }

  private async findTriggerForWorkflow(
    tenantId: string,
    workflowId: string,
    triggerId: string,
  ): Promise<WorkflowTrigger> {
    const trigger = await this.triggerService.findById(tenantId, triggerId);

    if (trigger.workflowDefinitionId !== workflowId) {
      throw new TriggerNotFoundException(triggerId);
    }

    return trigger;
  }
}
