import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExecutionService } from '../execution/execution.service';
import {
  type TerminateExecutionDto,
  TerminateExecutionRequestDto,
} from './dto/terminate-execution.dto';
import { UpsertExecutionGovernanceControlsRequestDto } from './dto/upsert-execution-governance-controls.dto';
import { UpsertTenantQuotaRequestDto } from './dto/upsert-tenant-quota.dto';
import { ResourceGovernanceService } from './resource-governance.service';

@ApiTags('Resource Governance')
@Controller()
export class ResourceGovernanceController {
  constructor(
    private readonly resourceGovernanceService: ResourceGovernanceService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Get('organizations/:id/resource-governance')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取组织资源治理状态' })
  @ApiResponse({ status: 200, description: '资源治理状态' })
  async getResourceGovernanceState(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const state = await this.resourceGovernanceService.getEffectiveState(
      organizationId,
      userId,
    );

    return { data: state };
  }

  @Put('organizations/:id/resource-governance/quota')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新组织资源配额' })
  @ApiResponse({ status: 200, description: '更新后的资源配额' })
  async updateQuota(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpsertTenantQuotaRequestDto,
    @CurrentUser('sub') userId: string,
  ) {
    const quota = await this.resourceGovernanceService.upsertTenantQuota(
      organizationId,
      dto,
      userId,
    );

    return { data: quota };
  }

  @Put('organizations/:id/resource-governance/controls')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新组织执行治理控制' })
  @ApiResponse({ status: 200, description: '更新后的执行治理控制' })
  async updateControls(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpsertExecutionGovernanceControlsRequestDto,
    @CurrentUser('sub') userId: string,
  ) {
    const requestedAt = new Date().toISOString();
    const governance =
      await this.resourceGovernanceService.upsertExecutionGovernanceControls(
        organizationId,
        dto,
        userId,
      );
    const state = await this.resourceGovernanceService.getEffectiveState(
      organizationId,
      userId,
    );
    const effectedAt = this.resourceGovernanceService.resolveGovernanceEffectedAt(
      governance,
      requestedAt,
    );
    const response = this.resourceGovernanceService.buildGovernanceActionResponse({
      organizationId,
      requestedBy: userId,
      requestedAt,
      effectedAt,
      reason:
        dto.tenantControl?.reason ??
        dto.workflowControls?.find((control) => control.reason)?.reason ??
        null,
      effectiveState: state,
      workflowTargetIds:
        dto.workflowControls?.map((control) => control.targetId) ?? [],
      tenantControlUpdated: dto.tenantControl !== undefined,
    });

    return { data: response };
  }

  @Post('organizations/:id/resource-governance/executions/:executionId/terminate')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '终止异常执行' })
  @ApiResponse({ status: 200, description: '异常执行已终止' })
  async terminateExecution(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() dto: TerminateExecutionRequestDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.resourceGovernanceService.getEffectiveState(organizationId, userId);

    const requestedAt = new Date().toISOString();
    const execution = await this.getExecutionService().cancelExecution(
      executionId,
      tenantId,
    );

    const response =
      await this.resourceGovernanceService.finalizeAnomalousExecutionTermination({
        tenantId,
        organizationId,
        executionId: execution.id,
        workflowId: execution.workflowDefinitionId,
        requestedBy: userId,
        reason: (dto as TerminateExecutionDto).reason,
        requestedAt,
        finalStatus: execution.status,
      });

    return { data: response };
  }

  private getExecutionService(): ExecutionService {
    return this.moduleRef.get(ExecutionService, { strict: false });
  }
}
