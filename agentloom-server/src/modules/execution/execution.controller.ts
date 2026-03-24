import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { FastifyReply } from 'fastify';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CaptureAuditLog, auditLogCaptureConfigs } from '../evidence/audit-log.capture';
import { SandboxAgentAdapter } from '../agent/sandbox-agent.adapter';
import { ExecutionService } from './execution.service';
import { CheckpointService } from './checkpoint.service';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { ResumeExecutionDto } from './dto/resume-execution.dto';
import {
  InterveneStepDto,
  interveneStepSchema,
} from './dto/intervene-step.dto';
import {
  ResolveToolPermissionDto,
  resolveToolPermissionSchema,
} from './dto/resolve-tool-permission.dto';
import { EXECUTION_QUEUE } from './execution.constants';
import { InterventionPermissionDeniedException } from './execution.exceptions';
import { NodeSchedulerService } from './node-scheduler.service';

const INTERVENTION_NOT_ALLOWED_RESPONSE = {
  error: 'INTERVENTION_NOT_ALLOWED',
  message: 'Your role does not have permission to intervene on this node',
} as const;

@ApiTags('Executions')
@Controller()
export class ExecutionController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly nodeScheduler: NodeSchedulerService,
    private readonly checkpointService: CheckpointService,
    private readonly sandboxAgentAdapter: SandboxAgentAdapter,
    @InjectQueue(EXECUTION_QUEUE) private readonly executionQueue: Queue,
  ) {}

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

  @Post('executions/:executionId/resume')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '恢复失败的执行' })
  @ApiResponse({ status: 202, description: '执行恢复已启动' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  @ApiResponse({ status: 409, description: '执行不可恢复' })
  async resumeExecution(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() dto: ResumeExecutionDto,
    @CurrentTenant() tenantId: string,
  ) {
    const execution = await this.checkpointService.resumeExecution(
      tenantId,
      executionId,
      dto.fromNodeId,
    );
    await this.executionQueue.add('resume-execution', {
      executionId,
      tenantId,
    });
    return { data: this.serializeExecution(execution) };
  }

  @Post('executions/:executionId/steps/:stepId/intervene')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '对等待干预的步骤提交反馈' })
  @ApiResponse({ status: 202, description: '干预反馈已接受' })
  @ApiResponse({ status: 409, description: '步骤状态不允许干预' })
  async interveneStep(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: InterveneStepDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    const resolution = interveneStepSchema.parse(dto);
    try {
      await this.nodeScheduler.resolveIntervention(
        executionId,
        stepId,
        tenantId,
        userId,
        resolution,
      );
    } catch (error) {
      if (error instanceof InterventionPermissionDeniedException) {
        reply?.code(HttpStatus.FORBIDDEN);
        return INTERVENTION_NOT_ALLOWED_RESPONSE;
      }

      throw error;
    }

    return { data: { executionId, stepId, status: 'intervention_accepted' } };
  }

  @Post('executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin', 'creator', 'operator')
  @CaptureAuditLog(auditLogCaptureConfigs.resolveToolPermission)
  @ApiOperation({ summary: '解析工具调用权限（批准/拒绝）' })
  @ApiResponse({ status: 202, description: '权限解析已接受' })
  @ApiResponse({ status: 409, description: '工具调用状态不允许解析' })
  async resolveToolPermission(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Param('toolCallId') toolCallId: string,
    @Body() dto: ResolveToolPermissionDto,
    @CurrentTenant() tenantId: string,
  ) {
    const resolution = resolveToolPermissionSchema.parse(dto);
    await this.nodeScheduler.resolveToolPermission(
      executionId,
      stepId,
      toolCallId,
      tenantId,
      { toolCallId, ...resolution },
    );
    return {
      data: {
        executionId,
        stepId,
        toolCallId,
        status: 'permission_resolved',
      },
    };
  }

  @Get('dlq')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询死信队列中的失败任务' })
  @ApiResponse({ status: 200, description: '返回失败任务列表' })
  async listDeadLetterJobs(
    @CurrentTenant() tenantId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.executionService.getDeadLetterJobs(
      tenantId,
      Number(page),
      Number(limit),
    );
  }

  @Post('dlq/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '重试死信队列中的失败任务' })
  @ApiResponse({ status: 202, description: '任务已重新入队' })
  async retryDeadLetterJob(
    @Param('jobId') jobId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.executionService.retryDeadLetterJob(tenantId, jobId);
    return { data: { jobId, status: 'retrying' } };
  }

  @Post('dlq/:jobId/discard')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '丢弃死信队列中的失败任务' })
  @ApiResponse({ status: 200, description: '任务已丢弃' })
  async discardDeadLetterJob(
    @Param('jobId') jobId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.executionService.discardDeadLetterJob(tenantId, jobId);
    return { data: { jobId, status: 'discarded' } };
  }

  // ── PTY 代理端点 ──

  @Get('executions/:executionId/pty/sessions')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取执行关联沙箱的 PTY 会话列表' })
  @ApiResponse({ status: 200, description: 'PTY 会话列表' })
  @ApiResponse({ status: 503, description: '沙箱不可用' })
  async listPtySessions(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    try {
      const data = await this.sandboxAgentAdapter.listPtySessions(
        { executionId },
        tenantId,
      );
      return { data };
    } catch (error) {
      throw this.mapPtyError(error);
    }
  }

  @Post('executions/:executionId/pty/buffer-dump')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取执行关联沙箱的 PTY buffer 数据' })
  @ApiResponse({ status: 200, description: 'PTY buffer 数据' })
  @ApiResponse({ status: 503, description: '沙箱不可用' })
  async ptyBufferDump(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() body: { sessionId: string; offset?: number; limit?: number; pattern?: string },
    @CurrentTenant() tenantId: string,
  ) {
    try {
      const { sessionId, ...options } = body;
      const data = await this.sandboxAgentAdapter.ptyBufferDump(
        { executionId },
        tenantId,
        sessionId,
        options,
      );
      return { data };
    } catch (error) {
      throw this.mapPtyError(error);
    }
  }

  @Post('executions/:executionId/pty/write')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '向执行关联沙箱的 PTY 会话写入数据' })
  @ApiResponse({ status: 200, description: 'PTY 写入成功' })
  @ApiResponse({ status: 503, description: '沙箱不可用' })
  async ptyWrite(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() body: { sessionId: string; data: string },
    @CurrentTenant() tenantId: string,
  ) {
    try {
      const result = await this.sandboxAgentAdapter.ptyWrite(
        { executionId },
        tenantId,
        body.sessionId,
        body.data,
      );
      return { data: result };
    } catch (error) {
      throw this.mapPtyError(error);
    }
  }

  private mapPtyError(error: unknown): HttpException {
    const message = error instanceof Error ? error.message : 'PTY 代理失败';
    if (message.includes('not found')) {
      return new HttpException(
        { error: 'SANDBOX_NOT_FOUND', message },
        HttpStatus.NOT_FOUND,
      );
    }
    return new HttpException(
      { error: 'SANDBOX_UNAVAILABLE', message },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
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
