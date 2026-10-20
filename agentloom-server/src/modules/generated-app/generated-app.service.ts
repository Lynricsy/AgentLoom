// 本文件保留 GeneratedAppService 的稳定 DI token 与公开 import 路径，并显式委托领域服务。

import { Injectable } from '@nestjs/common';

import type { GeneratedApp } from '../../database/schema';
import type {
  CreateGeneratedAppDtoType,
  CreateGeneratedAppGateRunDtoType,
  CreateGeneratedAppGenerationRunDtoType,
  CreateGeneratedAppRepairAttemptDtoType,
  CreateGeneratedAppResponseDto,
  CreateGeneratedAppSubmissionDtoType,
  DeleteGeneratedAppSubmissionsDtoType,
  DeleteGeneratedAppSubmissionsResponseDto,
  GeneratedAppArtifactContentResponseDto,
  GeneratedAppArtifactManifestResponseDto,
  GeneratedAppGateRunResponseDto,
  GeneratedAppGenerationRunResponseDto,
  GeneratedAppRepairAttemptResponseDto,
  GeneratedAppResponseDto,
  GeneratedAppRuntimeBindingReadinessResponseDto,
  GeneratedAppSubmissionResponseDto,
  PublicGeneratedAppResponseDto,
  PublicGeneratedAppSubmissionResponseDto,
  QueryGeneratedAppGateRunsDtoType,
  QueryGeneratedAppGenerationRunsDtoType,
  QueryGeneratedAppRepairAttemptsDtoType,
  QueryGeneratedAppSubmissionsDtoType,
  QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsDtoType,
  RecordGeneratedAppGateRunResponseDto,
  StartGeneratedAppGenerationRunDtoType,
  StartGeneratedAppGenerationRunResponseDto,
  UpdateGeneratedAppDtoType,
  UpdateGeneratedAppGenerationRunDtoType,
  UpdateGeneratedAppRepairAttemptDtoType,
} from './dto';
import { StartGeneratedAppGenerationRunSchema } from './dto';
import { WorkflowArchivedException } from '../workflow-definition/workflow-version.exceptions';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppArtifactService } from './generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';
import { GeneratedAppGenerationPipelineService } from './generated-app-generation-pipeline.service';
import { GeneratedAppPublicRuntimeService } from './generated-app-public-runtime.service';

@Injectable()
export class GeneratedAppService {
  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly artifactService: GeneratedAppArtifactService,
    private readonly runtimeBindingService: GeneratedAppRuntimeBindingService,
    private readonly pipeline: GeneratedAppGenerationPipelineService,
    private readonly publicRuntimeService: GeneratedAppPublicRuntimeService,
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  /** 创建即排队 initial 生成运行（ADR-0007 §5）；AppSpec 由 worker 中的 Gate 0 生成 */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<CreateGeneratedAppResponseDto> {
    const created = await this.repository.create(tenantId, userId, dto);
    const generationRun = await this.pipeline.enqueueRun(
      tenantId,
      userId,
      created.id,
      StartGeneratedAppGenerationRunSchema.parse({ triggerSource: 'initial' }),
    );
    return { ...created, generationRunId: generationRun.id };
  }

  async list(
    tenantId: string,
    query: QueryGeneratedAppsDtoType,
  ): Promise<{
    data: GeneratedAppResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    return this.repository.list(tenantId, query);
  }

  async findOne(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    return this.repository.findOne(tenantId, appId);
  }
  // 控制器只通过稳定 service 边界访问新写路由，避免把仓储细节泄漏到 HTTP 层。
  async update(
    tenantId: string,
    userId: string,
    appId: string,
    dto: UpdateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    return this.repository.update(tenantId, userId, appId, dto);
  }

  /**
   * 删除应用依次：清理对象存储里的应用前缀（Gate 3 工作区、Gate 5 截图与 trace，含公开页内容），
   * 归档 Gate 4 为它自动创建并发布的运行时工作流（否则工作流仍为 published、可被继续执行），最后删记录。
   * 前两步失败都直接抛出、应用记录保留，用户可重试删除；两步都幂等。对象清理放在最前：
   * 记录一旦删掉就再也找不到该前缀，对象会永久残留（D-177）。
   */
  async delete(tenantId: string, userId: string, appId: string): Promise<void> {
    await this.repository.findOne(tenantId, appId);
    await this.artifactService.deleteAppObjects(tenantId, appId);
    const workflowIds =
      await this.runtimeBindingService.listActiveGeneratedWorkflowRuntimeIds(
        tenantId,
        appId,
      );
    for (const workflowId of workflowIds) {
      try {
        await this.workflowVersionService.archive(workflowId, userId);
      } catch (error) {
        // 并发删除时可能已被归档，目标状态已达成
        if (!(error instanceof WorkflowArchivedException)) throw error;
      }
    }
    return this.repository.delete(tenantId, appId);
  }

  async getRuntimeBindingReadiness(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppRuntimeBindingReadinessResponseDto> {
    return this.runtimeBindingService.getRuntimeBindingReadiness(
      tenantId,
      appId,
    );
  }

  async getArtifactManifest(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppArtifactManifestResponseDto> {
    return this.artifactService.getArtifactManifest(tenantId, appId);
  }

  async getArtifactContent(
    tenantId: string,
    appId: string,
    artifactId: string,
  ): Promise<GeneratedAppArtifactContentResponseDto> {
    return this.artifactService.getArtifactContent(tenantId, appId, artifactId);
  }

  async recordGateResults(
    tenantId: string,
    userId: string,
    appId: string,
    dto: RecordGeneratedAppGateResultsDtoType,
  ): Promise<GeneratedAppResponseDto> {
    return this.repository.recordGateResults(tenantId, userId, appId, dto);
  }

  async listGenerationRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGenerationRunsDtoType,
  ): Promise<{
    data: GeneratedAppGenerationRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    await this.assertAppExists(tenantId, appId);
    return this.repository.listGenerationRuns(tenantId, appId, query);
  }

  async createGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    return this.repository.createGenerationRun(tenantId, userId, appId, dto);
  }

  /** 只写 queued 运行并入队，立即返回（HTTP 202）；运行结果通过运行/门禁列表查询 */
  async startGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<StartGeneratedAppGenerationRunResponseDto> {
    const generationRun = await this.pipeline.enqueueRun(
      tenantId,
      userId,
      appId,
      dto,
    );
    return {
      generationRun,
      gateRuns: [],
      app: await this.repository.findOne(tenantId, appId),
    };
  }

  async updateGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
    dto: UpdateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    return this.repository.updateGenerationRun(tenantId, appId, runId, dto);
  }
  // 详情委托保留 appId/runId 全路径，避免后续调用方降级成仅按子资源 ID 查询。
  async findGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    return this.repository.findGenerationRun(tenantId, appId, runId);
  }

  async listRepairAttempts(
    tenantId: string,
    appId: string,
    runId: string,
    query: QueryGeneratedAppRepairAttemptsDtoType,
  ): Promise<{
    data: GeneratedAppRepairAttemptResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    await this.assertAppExists(tenantId, appId);
    // 运行不存在或不属于路由中的应用时同样 404，而不是空列表
    await this.repository.findGenerationRunRecord(tenantId, appId, runId);
    return this.repository.listRepairAttempts(tenantId, appId, runId, query);
  }

  async createRepairAttempt(
    tenantId: string,
    userId: string,
    appId: string,
    runId: string,
    dto: CreateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    return this.repository.createRepairAttempt(
      tenantId,
      userId,
      appId,
      runId,
      dto,
    );
  }

  async updateRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
    dto: UpdateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    return this.repository.updateRepairAttempt(
      tenantId,
      appId,
      runId,
      repairAttemptId,
      dto,
    );
  }
  // 修复详情与删除共享完整父链参数，确保 HTTP 层不会丢失任一租户边界。
  async findRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    return this.repository.findRepairAttempt(
      tenantId,
      appId,
      runId,
      repairAttemptId,
    );
  }

  async deleteRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
  ): Promise<void> {
    return this.repository.deleteRepairAttempt(
      tenantId,
      appId,
      runId,
      repairAttemptId,
    );
  }

  async listGateRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGateRunsDtoType,
  ): Promise<{
    data: GeneratedAppGateRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    await this.assertAppExists(tenantId, appId);
    return this.repository.listGateRuns(tenantId, appId, query);
  }

  async recordGateRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGateRunDtoType,
  ): Promise<RecordGeneratedAppGateRunResponseDto> {
    return this.repository.recordGateRun(tenantId, userId, appId, dto);
  }

  async enablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    return this.publicRuntimeService.enablePublicShare(tenantId, userId, appId);
  }

  async regeneratePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    return this.publicRuntimeService.regeneratePublicShare(
      tenantId,
      userId,
      appId,
    );
  }

  async disablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    return this.publicRuntimeService.disablePublicShare(
      tenantId,
      userId,
      appId,
    );
  }

  async getPublicApp(token: string): Promise<PublicGeneratedAppResponseDto> {
    return this.publicRuntimeService.getPublicApp(token);
  }

  async createPublicSubmission(
    token: string,
    dto: CreateGeneratedAppSubmissionDtoType,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    return this.publicRuntimeService.createPublicSubmission(token, dto);
  }

  async getPublicSubmission(
    token: string,
    submissionId: string,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    return this.publicRuntimeService.getPublicSubmission(token, submissionId);
  }

  async listSubmissions(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppSubmissionsDtoType,
  ): Promise<{
    data: GeneratedAppSubmissionResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    await this.assertAppExists(tenantId, appId);
    return this.publicRuntimeService.listSubmissions(tenantId, appId, query);
  }

  async findSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmissionResponseDto> {
    return this.publicRuntimeService.findSubmission(
      tenantId,
      appId,
      submissionId,
    );
  }

  async deleteSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    return this.publicRuntimeService.deleteSubmission(
      tenantId,
      appId,
      submissionId,
    );
  }

  async deleteSubmissions(
    tenantId: string,
    appId: string,
    dto: DeleteGeneratedAppSubmissionsDtoType,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    await this.assertAppExists(tenantId, appId);
    return this.publicRuntimeService.deleteSubmissions(tenantId, appId, dto);
  }

  /**
   * 子集合表受 RLS 过滤，不存在或他租户的应用会得到空列表（批量删除得到 deletedCount 0）；
   * 列表与批量操作先在租户内断言应用存在，否则 404。
   */
  private async assertAppExists(tenantId: string, appId: string) {
    await this.repository.findGeneratedAppRecord(tenantId, appId);
  }

  assertCanEnablePublicShare(app: Pick<GeneratedApp, 'id' | 'readiness'>) {
    return this.repository.assertCanEnablePublicShare(app);
  }
}
