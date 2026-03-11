import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { WorkflowVersionService } from './workflow-version.service';

@ApiTags('Workflow Definitions')
@Controller('workflow-definitions')
export class WorkflowDefinitionCreateController {
  constructor(
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

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
}
