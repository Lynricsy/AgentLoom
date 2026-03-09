import {
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

@ApiTags('Executions')
@Controller()
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post('workflow-definitions/:workflowId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '启动工作流执行' })
  @ApiResponse({ status: 202, description: '执行已创建' })
  @ApiResponse({ status: 409, description: '工作流未发布' })
  async runWorkflow(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const execution = await this.executionService.runWorkflow(
      workflowId,
      tenantId,
      userId,
    );
    return { data: execution };
  }

  @Get('executions/:executionId')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取执行详情' })
  @ApiResponse({ status: 200, description: '执行详情' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async getExecution(@Param('executionId', ParseUUIDPipe) executionId: string) {
    const execution = await this.executionService.getExecution(executionId);
    return { data: execution };
  }

  @Get('workflow-definitions/:workflowId/executions')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取工作流执行历史' })
  @ApiResponse({ status: 200, description: '执行列表' })
  async listExecutions(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query() query: ListExecutionsQueryDto,
  ) {
    return this.executionService.listExecutions(
      workflowId,
      query.page,
      query.pageSize,
      query.status,
    );
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
    return { data: execution };
  }
}
