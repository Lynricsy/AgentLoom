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
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExecutionService } from './execution.service';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';

@ApiTags('Executions')
@Controller()
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post(['workflow-definitions/:workflowId/run', 'workflows/:workflowId/run'])
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '启动工作流执行' })
  @ApiResponse({ status: 202, description: '执行已创建' })
  @ApiResponse({ status: 409, description: '工作流未发布' })
  async runWorkflow(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() dto: RunWorkflowDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const execution = await this.executionService.runWorkflow(
      workflowId,
      dto,
      tenantId,
      userId,
    );
    return { data: this.serializeExecution(execution) };
  }

  @Get('executions/:executionId')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取执行详情' })
  @ApiResponse({ status: 200, description: '执行详情' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async getExecution(@Param('executionId', ParseUUIDPipe) executionId: string) {
    const execution = await this.executionService.getExecution(executionId);
    return { data: this.serializeExecution(execution) };
  }

  @Get([
    'workflow-definitions/:workflowId/executions',
    'workflows/:workflowId/executions',
  ])
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取工作流执行历史' })
  @ApiResponse({ status: 200, description: '执行列表' })
  async listExecutions(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query() query: ListExecutionsQueryDto,
  ) {
    const result = await this.executionService.listExecutions(
      workflowId,
      query.page,
      query.limit,
      query.status,
    );

    return {
      ...result,
      data: result.data.map((execution) => this.serializeExecution(execution)),
    };
  }

  @Post('executions/:executionId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '取消执行' })
  @ApiResponse({ status: 200, description: '执行已取消' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  @ApiResponse({ status: 409, description: '执行不可取消' })
  async cancelExecution(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const execution = await this.executionService.cancelExecution(
      executionId,
      tenantId,
    );
    return { data: this.serializeExecution(execution) };
  }

  private serializeExecution<
    T extends {
      workflowDefinitionId: string;
      steps?: Array<Record<string, unknown>>;
    },
  >(execution: T): T & { workflowId: string } {
    return {
      ...execution,
      workflowId: execution.workflowDefinitionId,
    };
  }
}
