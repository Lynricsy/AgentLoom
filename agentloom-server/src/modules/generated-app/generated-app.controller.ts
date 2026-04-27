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
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateGeneratedAppGenerationRunDto,
  CreateGeneratedAppGenerationRunSchema,
  CreateGeneratedAppGateRunDto,
  CreateGeneratedAppGateRunSchema,
  CreateGeneratedAppRepairAttemptDto,
  CreateGeneratedAppRepairAttemptSchema,
  CreateGeneratedAppSubmissionDto,
  CreateGeneratedAppSubmissionSchema,
  CreateGeneratedAppDto,
  CreateGeneratedAppSchema,
  DeleteGeneratedAppSubmissionsDto,
  DeleteGeneratedAppSubmissionsSchema,
  QueryGeneratedAppGenerationRunsDto,
  QueryGeneratedAppGenerationRunsSchema,
  QueryGeneratedAppGateRunsDto,
  QueryGeneratedAppGateRunsSchema,
  QueryGeneratedAppRepairAttemptsDto,
  QueryGeneratedAppRepairAttemptsSchema,
  QueryGeneratedAppSubmissionsDto,
  QueryGeneratedAppSubmissionsSchema,
  QueryGeneratedAppsDto,
  QueryGeneratedAppsSchema,
  RecordGeneratedAppGateResultsDto,
  RecordGeneratedAppGateResultsSchema,
  StartGeneratedAppGenerationRunDto,
  StartGeneratedAppGenerationRunSchema,
  UpdateGeneratedAppGenerationRunDto,
  UpdateGeneratedAppGenerationRunSchema,
  UpdateGeneratedAppRepairAttemptDto,
  UpdateGeneratedAppRepairAttemptSchema,
} from './dto';
import { GeneratedAppService } from './generated-app.service';

@ApiTags('Generated Apps')
@Controller('generated-apps')
export class GeneratedAppController {
  constructor(private readonly generatedAppService: GeneratedAppService) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从一句自然语言需求创建生成应用任务' })
  @ApiResponse({ status: 201, description: '生成应用任务已创建' })
  async create(
    @Body(new ZodValidationPipe(CreateGeneratedAppSchema))
    dto: CreateGeneratedAppDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.create(tenantId, userId, dto);

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询生成应用任务' })
  @ApiResponse({ status: 200, description: '生成应用任务列表' })
  async list(
    @Query(new ZodValidationPipe(QueryGeneratedAppsSchema))
    query: QueryGeneratedAppsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.generatedAppService.list(tenantId, query);
  }

  @Get(':appId/generation-runs')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询生成应用自动开发运行台账' })
  @ApiResponse({ status: 200, description: '生成应用运行台账列表' })
  async listGenerationRuns(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Query(new ZodValidationPipe(QueryGeneratedAppGenerationRunsSchema))
    query: QueryGeneratedAppGenerationRunsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.generatedAppService.listGenerationRuns(tenantId, appId, query);
  }

  @Post(':appId/generation-runs')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建一次生成应用自动开发运行台账' })
  @ApiResponse({ status: 201, description: '生成应用运行台账已创建' })
  @ApiResponse({ status: 404, description: '生成应用任务不存在' })
  async createGenerationRun(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body(new ZodValidationPipe(CreateGeneratedAppGenerationRunSchema))
    dto: CreateGeneratedAppGenerationRunDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.createGenerationRun(
      tenantId,
      userId,
      appId,
      dto,
    );

    return { data };
  }

  @Post(':appId/generation-runs/start')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '启动同步轻量生成门禁运行器' })
  @ApiResponse({ status: 201, description: '生成门禁运行器已完成同步切片' })
  @ApiResponse({ status: 404, description: '生成应用任务不存在' })
  async startGenerationRun(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body(new ZodValidationPipe(StartGeneratedAppGenerationRunSchema))
    dto: StartGeneratedAppGenerationRunDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.startGenerationRun(
      tenantId,
      userId,
      appId,
      dto,
    );

    return { data };
  }

  @Patch(':appId/generation-runs/:runId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新生成应用自动开发运行台账状态' })
  @ApiResponse({ status: 200, description: '生成应用运行台账已更新' })
  @ApiResponse({ status: 404, description: '生成应用任务或运行台账不存在' })
  async updateGenerationRun(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(UpdateGeneratedAppGenerationRunSchema))
    dto: UpdateGeneratedAppGenerationRunDto,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.updateGenerationRun(
      tenantId,
      appId,
      runId,
      dto,
    );

    return { data };
  }

  @Get(':appId/generation-runs/:runId/repair-attempts')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询生成应用修复尝试台账' })
  @ApiResponse({ status: 200, description: '生成应用修复尝试列表' })
  async listRepairAttempts(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query(new ZodValidationPipe(QueryGeneratedAppRepairAttemptsSchema))
    query: QueryGeneratedAppRepairAttemptsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.generatedAppService.listRepairAttempts(
      tenantId,
      appId,
      runId,
      query,
    );
  }

  @Post(':appId/generation-runs/:runId/repair-attempts')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建一次生成应用修复尝试台账' })
  @ApiResponse({ status: 201, description: '生成应用修复尝试已创建' })
  @ApiResponse({ status: 404, description: '生成应用任务或运行台账不存在' })
  async createRepairAttempt(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(CreateGeneratedAppRepairAttemptSchema))
    dto: CreateGeneratedAppRepairAttemptDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.createRepairAttempt(
      tenantId,
      userId,
      appId,
      runId,
      dto,
    );

    return { data };
  }

  @Patch(':appId/generation-runs/:runId/repair-attempts/:repairAttemptId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新生成应用修复尝试台账状态' })
  @ApiResponse({ status: 200, description: '生成应用修复尝试已更新' })
  @ApiResponse({ status: 404, description: '修复尝试不存在' })
  async updateRepairAttempt(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('repairAttemptId', ParseUUIDPipe) repairAttemptId: string,
    @Body(new ZodValidationPipe(UpdateGeneratedAppRepairAttemptSchema))
    dto: UpdateGeneratedAppRepairAttemptDto,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.updateRepairAttempt(
      tenantId,
      appId,
      runId,
      repairAttemptId,
      dto,
    );

    return { data };
  }

  @Get(':appId/gate-runs')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询生成应用门禁运行证据记录' })
  @ApiResponse({ status: 200, description: '生成应用门禁运行记录列表' })
  async listGateRuns(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Query(new ZodValidationPipe(QueryGeneratedAppGateRunsSchema))
    query: QueryGeneratedAppGateRunsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.generatedAppService.listGateRuns(tenantId, appId, query);
  }

  @Post(':appId/gate-runs')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录一次生成应用门禁运行并同步 readiness' })
  @ApiResponse({ status: 201, description: '生成应用门禁运行记录已创建' })
  @ApiResponse({ status: 404, description: '生成应用任务不存在' })
  async recordGateRun(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body(new ZodValidationPipe(CreateGeneratedAppGateRunSchema))
    dto: CreateGeneratedAppGateRunDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.recordGateRun(
      tenantId,
      userId,
      appId,
      dto,
    );

    return { data };
  }

  @Get(':appId/submissions')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页查询生成应用公开提交记录' })
  @ApiResponse({ status: 200, description: '生成应用提交记录列表' })
  async listSubmissions(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Query(new ZodValidationPipe(QueryGeneratedAppSubmissionsSchema))
    query: QueryGeneratedAppSubmissionsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.generatedAppService.listSubmissions(tenantId, appId, query);
  }

  @Get(':appId/submissions/:submissionId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取生成应用公开提交记录详情' })
  @ApiResponse({ status: 200, description: '生成应用提交记录详情' })
  @ApiResponse({ status: 404, description: '提交记录不存在或已删除' })
  async findSubmission(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.findSubmission(
      tenantId,
      appId,
      submissionId,
    );

    return { data };
  }

  @Delete(':appId/submissions/:submissionId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删除单条生成应用公开提交记录' })
  @ApiResponse({ status: 200, description: '提交记录已删除' })
  @ApiResponse({ status: 404, description: '提交记录不存在或已删除' })
  async deleteSubmission(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.deleteSubmission(
      tenantId,
      appId,
      submissionId,
    );

    return { data };
  }

  @Post(':appId/submissions/delete')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量软删除生成应用公开提交记录' })
  @ApiResponse({ status: 200, description: '提交记录批量删除结果' })
  async deleteSubmissions(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body(new ZodValidationPipe(DeleteGeneratedAppSubmissionsSchema))
    dto: DeleteGeneratedAppSubmissionsDto,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.deleteSubmissions(
      tenantId,
      appId,
      dto,
    );

    return { data };
  }

  @Get(':appId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取生成应用任务详情' })
  @ApiResponse({ status: 200, description: '生成应用任务详情' })
  @ApiResponse({ status: 404, description: '生成应用任务不存在' })
  async findOne(
    @Param('appId', ParseUUIDPipe) appId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.generatedAppService.findOne(tenantId, appId);
    return { data };
  }

  @Patch(':appId/gates')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录生成应用门禁结果并重新计算发布 readiness' })
  @ApiResponse({ status: 200, description: '门禁结果已更新' })
  @ApiResponse({ status: 404, description: '生成应用任务不存在' })
  async recordGateResults(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body(new ZodValidationPipe(RecordGeneratedAppGateResultsSchema))
    dto: RecordGeneratedAppGateResultsDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.recordGateResults(
      tenantId,
      userId,
      appId,
      dto,
    );

    return { data };
  }

  @Post(':appId/public-share')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '在发布门禁全绿后启用生成应用公开链接' })
  @ApiResponse({ status: 200, description: '公开链接已启用' })
  @ApiResponse({ status: 409, description: '生成应用尚未达到发布候选门槛' })
  async enablePublicShare(
    @Param('appId', ParseUUIDPipe) appId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.enablePublicShare(
      tenantId,
      userId,
      appId,
    );

    return { data };
  }

  @Post(':appId/public-share/regenerate')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新生成生成应用公开链接 token' })
  @ApiResponse({ status: 200, description: '公开链接 token 已重新生成' })
  @ApiResponse({ status: 409, description: '生成应用尚未达到发布候选门槛' })
  async regeneratePublicShare(
    @Param('appId', ParseUUIDPipe) appId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.regeneratePublicShare(
      tenantId,
      userId,
      appId,
    );

    return { data };
  }

  @Delete(':appId/public-share')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关闭生成应用公开链接' })
  @ApiResponse({ status: 200, description: '公开链接已关闭' })
  async disablePublicShare(
    @Param('appId', ParseUUIDPipe) appId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.generatedAppService.disablePublicShare(
      tenantId,
      userId,
      appId,
    );

    return { data };
  }
}

@Public()
@ApiTags('Generated Apps')
@Controller('generated-apps/public')
export class GeneratedAppPublicController {
  constructor(private readonly generatedAppService: GeneratedAppService) {}

  @Post(':token/submissions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '公开生成应用提交终端用户输入' })
  @ApiResponse({ status: 201, description: '公开提交记录已创建' })
  @ApiResponse({ status: 404, description: '公开链接不存在或已关闭' })
  @ApiResponse({ status: 409, description: '生成应用不再满足发布门槛' })
  async createPublicSubmission(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(CreateGeneratedAppSubmissionSchema))
    dto: CreateGeneratedAppSubmissionDto,
  ) {
    const data = await this.generatedAppService.createPublicSubmission(
      token,
      dto,
    );

    return { data };
  }

  @Get(':token/submissions/:submissionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '公开读取生成应用提交结果详情' })
  @ApiResponse({ status: 200, description: '公开提交记录详情' })
  @ApiResponse({ status: 404, description: '公开链接或提交记录不存在' })
  @ApiResponse({ status: 409, description: '生成应用不再满足发布门槛' })
  async getPublicSubmission(
    @Param('token') token: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    const data = await this.generatedAppService.getPublicSubmission(
      token,
      submissionId,
    );

    return { data };
  }

  @Get(':token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '公开访问已发布的生成应用 runtime surface' })
  @ApiResponse({ status: 200, description: '公开生成应用详情' })
  @ApiResponse({ status: 404, description: '公开链接不存在或已关闭' })
  @ApiResponse({ status: 409, description: '生成应用不再满足发布门槛' })
  async getPublicApp(@Param('token') token: string) {
    const data = await this.generatedAppService.getPublicApp(token);
    return { data };
  }
}
