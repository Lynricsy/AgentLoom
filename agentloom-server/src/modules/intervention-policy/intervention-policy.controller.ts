import {
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
  Body,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InterventionPolicyService } from './intervention-policy.service';

@ApiTags('Intervention Policies')
@Controller('workflow-definitions/:workflowId/intervention-policies')
export class InterventionPolicyController {
  constructor(
    private readonly interventionPolicyService: InterventionPolicyService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.interventionPolicyService.findAll(
      tenantId,
      workflowId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('resolve')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async resolvePolicy(
    @CurrentTenant() tenantId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query('nodeId') nodeId?: string,
  ) {
    const resolved = await this.interventionPolicyService.resolvePolicy(
      tenantId,
      workflowId,
      nodeId,
    );
    return { data: resolved };
  }

  @Get(':policyId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
  ) {
    const policy = await this.interventionPolicyService.findById(
      tenantId,
      policyId,
    );
    return { data: policy };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'admin', 'creator')
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const policy = await this.interventionPolicyService.create(tenantId, userId, {
      ...body,
      workflowId,
    });
    return { data: policy };
  }

  @Patch(':policyId')
  @Roles('owner', 'admin', 'creator')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const policy = await this.interventionPolicyService.update(
      tenantId,
      policyId,
      body,
    );
    return { data: policy };
  }

  @Delete(':policyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin', 'creator')
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
  ) {
    await this.interventionPolicyService.remove(tenantId, policyId);
  }
}
