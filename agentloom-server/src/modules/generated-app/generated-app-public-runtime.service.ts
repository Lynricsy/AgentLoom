// 本文件负责生成应用的公开分享、公开运行（表单 → 校验 → 执行绑定工作流 → 结果分区）与提交台账。

import * as crypto from 'crypto';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { DomainException } from '../../common/exceptions/domain.exception';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppSubmission,
} from '../../database/schema';
import { ExecutionService } from '../execution/execution.service';
import type {
  CreateGeneratedAppSubmissionDtoType,
  DeleteGeneratedAppSubmissionsDtoType,
  DeleteGeneratedAppSubmissionsResponseDto,
  GeneratedAppResponseDto,
  GeneratedAppSubmissionResponseDto,
  PublicGeneratedAppResponseDto,
  PublicGeneratedAppSubmissionResponseDto,
  QueryGeneratedAppSubmissionsDtoType,
} from './dto';
import { resolveStatusForShareDisabled } from './generated-app.app-spec.util';
import {
  GeneratedAppNotFoundException,
  GeneratedAppPublicSubmissionValidationException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';
import {
  getNonEmptyString,
  getRecord,
} from './generated-app.plan-validation.util';
import {
  PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN,
  PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN,
} from './generated-app.public-sanitizer.util';
import { GeneratedAppRepository } from './generated-app.repository';
import {
  buildPublicGeneratedAppRuntimeForm,
  validateGeneratedAppSubmission,
} from './generated-app.runtime';
import {
  extractGeneratedAppRuntimeResult,
  mapGeneratedAppSubmission,
} from './generated-app.runtime-binding.util';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type { GeneratedAppRuntimeResult } from './types/generation-v2.ports';
import { isAppSpecV2 } from './types/generated-app.types';

/** submission.report 中的执行引用（只对创建者可见） */
export const GENERATED_APP_RUNTIME_EXECUTION_REPORT_KIND =
  'generated-app-runtime-execution';

const PUBLIC_DATA_USE_NOTICE =
  '你在此公开应用中提交的内容和运行结果会被保存，并提供给应用创建者查看。';
const PUBLIC_NOT_STARTED_ERROR =
  '应用暂时无法处理提交，请稍后再试或联系应用创建者。';
const PUBLIC_EXECUTION_UNAVAILABLE_ERROR =
  '执行记录不可用，无法取得结果，请重新提交。';

type GeneratedAppWithSpecV2 = GeneratedApp & { appSpec: GeneratedAppSpecV2 };

interface PublicRuntimeAccess {
  access: 'public' | 'acceptance';
  app: GeneratedAppWithSpecV2;
  /** 验收令牌所属的生成运行；公开分享为 null */
  generationRunId: string | null;
}

interface RuntimeExecutionReport {
  kind: typeof GENERATED_APP_RUNTIME_EXECUTION_REPORT_KIND;
  workflowDefinitionId: string | null;
  workflowVersionId: string | null;
  executionId: string | null;
  /** 未启动执行的原因：运行时绑定状态，或 runWorkflow 拒绝时的错误类型 */
  notStartedReason: string | null;
}

@Injectable()
export class GeneratedAppPublicRuntimeService {
  private readonly logger = new Logger(GeneratedAppPublicRuntimeService.name);

  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly runtimeBindingService: GeneratedAppRuntimeBindingService,
    @Optional() private readonly executionService?: ExecutionService,
  ) {}

  async enablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    return this.repository.activatePublicShare(tenantId, userId, app, {
      forceNewToken: false,
    });
  }

  async regeneratePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    return this.repository.activatePublicShare(tenantId, userId, app, {
      forceNewToken: true,
    });
  }

  async disablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const status = resolveStatusForShareDisabled(app.readiness);

    const [updated] = await this.repository.tenantDb
      .update(schema.generatedApps)
      .set({
        status,
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return this.repository.toResponseDto(updated);
  }

  async getPublicApp(token: string): Promise<PublicGeneratedAppResponseDto> {
    const { access, app } = await this.resolvePublicRuntimeAccess(token);
    const appSpec = app.appSpec;
    const previewUrl = app.preview.previewUrl;

    // Gate 5 验收访问不计浏览量
    if (access === 'public') {
      await this.repository.globalDb
        .update(schema.generatedApps)
        .set({
          publicViewCount: sql`${schema.generatedApps.publicViewCount} + 1`,
        })
        .where(eq(schema.generatedApps.id, app.id));
    }

    return {
      token,
      appId: app.id,
      title: appSpec.appName,
      description: appSpec.summary,
      dataUseNotice: PUBLIC_DATA_USE_NOTICE,
      appSpec: {
        version: appSpec.version,
        appName: appSpec.appName,
        summary: appSpec.summary,
        userGoal: appSpec.userGoal,
        actors: appSpec.actors,
        pages: appSpec.pages,
      },
      runtimeSurface: { kind: 'generated-app', previewUrl },
      runtimeForm: buildPublicGeneratedAppRuntimeForm(appSpec),
      createdAt: app.createdAt,
    };
  }

  /**
   * 公开提交：按 AppSpec 严格校验 → 投影到绑定工作流的输入 → 以固定版本创建异步执行。
   * 提交记录与执行在同一个租户事务内创建；运行时绑定不可用或执行被拒绝时，记录一条
   * failed 提交（公开端只看到通用原因，创建者在 report 中看到具体原因）。
   */
  async createPublicSubmission(
    token: string,
    dto: CreateGeneratedAppSubmissionDtoType,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const { access, app, generationRunId } =
      await this.resolvePublicRuntimeAccess(token);
    const validation = validateGeneratedAppSubmission(app.appSpec, dto.input);
    if (!validation.ok) {
      throw new GeneratedAppPublicSubmissionValidationException(
        validation.errors,
      );
    }

    const anonymousSessionId = this.normalizePublicAnonymousSessionId(
      dto.anonymousSessionId,
    );
    const origin = access === 'acceptance' ? 'gate-acceptance' : 'public';
    const now = new Date();

    const submission = await runInTenantTransaction(
      this.repository.globalDb,
      app.tenantId,
      async (db) => {
        const target = await this.runtimeBindingService.resolveRuntimeTarget(
          db,
          app,
          app.appSpec,
        );
        const report: RuntimeExecutionReport = {
          kind: GENERATED_APP_RUNTIME_EXECUTION_REPORT_KIND,
          workflowDefinitionId: target.workflowDefinitionId,
          workflowVersionId: target.available ? target.workflowVersionId : null,
          executionId: null,
          notStartedReason: target.available ? null : target.state,
        };
        let executionStatus: schema.WorkflowExecution['status'] | null = null;

        if (target.available && !this.executionService) {
          report.notStartedReason = 'execution-service-unavailable';
        } else if (target.available && this.executionService) {
          const runRequest = mapGeneratedAppSubmission(
            app.appSpec,
            target,
            validation.values,
          );
          try {
            const execution = await this.executionService.runWorkflow(
              runRequest.workflowDefinitionId,
              {
                inputParams: {
                  ...runRequest.inputParams,
                  _meta: {
                    generatedAppId: app.id,
                    submissionSource:
                      origin === 'gate-acceptance'
                        ? 'generated-app-gate-acceptance'
                        : 'generated-app-public-submission',
                    ...(generationRunId ? { generationRunId } : {}),
                    anonymousSessionId,
                  },
                },
                launchSource: 'api',
                triggerType: 'api',
                schemaVersion: runRequest.schemaVersion,
                workflowVersionId: runRequest.workflowVersionId,
              },
              app.tenantId,
              app.createdBy,
            );
            report.executionId = execution.id;
            executionStatus = execution.status;
          } catch (error) {
            // 领域异常（输入契约 422、版本不存在、治理拦截等）记为未启动；其余错误照常抛出
            if (!(error instanceof DomainException)) {
              throw error;
            }
            report.notStartedReason = error.type;
            this.logger.warn(
              `Generated app submission not started: ${JSON.stringify({ appId: app.id, type: error.type, detail: error.detail })}`,
            );
          }
        }

        const result: GeneratedAppRuntimeResult = report.executionId
          ? { status: 'running', sections: [], publicError: null }
          : {
              status: 'failed',
              sections: [],
              publicError: PUBLIC_NOT_STARTED_ERROR,
            };
        const [inserted] = await db
          .insert(schema.generatedAppSubmissions)
          .values({
            tenantId: app.tenantId,
            generatedAppId: app.id,
            appSpecVersion: app.appSpec.version,
            publicShareToken: access === 'public' ? token : null,
            origin,
            generationRunId,
            anonymousSessionId,
            status: executionStatus
              ? this.toSubmissionStatus(executionStatus)
              : 'failed',
            input: validation.values,
            result: { ...result },
            report: { ...report },
            errorMessage: result.publicError,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return inserted;
      },
    );

    return this.repository.toPublicSubmissionResponseDto(submission);
  }

  async getPublicSubmission(
    token: string,
    submissionId: string,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const { access, app, generationRunId } =
      await this.resolvePublicRuntimeAccess(token);
    const [submission] = await this.repository.globalDb
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.generatedAppId, app.id),
          isNull(schema.generatedAppSubmissions.deletedAt),
          // 公开分享只能读本令牌下的提交；验收令牌只能读本次生成运行的验收提交
          access === 'public'
            ? eq(schema.generatedAppSubmissions.publicShareToken, token)
            : and(
                eq(schema.generatedAppSubmissions.origin, 'gate-acceptance'),
                eq(
                  schema.generatedAppSubmissions.generationRunId,
                  generationRunId ?? '',
                ),
              ),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    const refreshed = await this.refreshSubmissionResult(
      app,
      app.appSpec,
      submission,
    );

    return this.repository.toPublicSubmissionResponseDto(refreshed);
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
    const page = query.page;
    const pageSize = query.pageSize;
    const filters = and(
      eq(schema.generatedAppSubmissions.tenantId, tenantId),
      eq(schema.generatedAppSubmissions.generatedAppId, appId),
      eq(schema.generatedAppSubmissions.origin, query.origin),
      isNull(schema.generatedAppSubmissions.deletedAt),
      query.status
        ? eq(schema.generatedAppSubmissions.status, query.status)
        : undefined,
    );

    const [submissions, countRows] = await Promise.all([
      this.repository.tenantDb
        .select()
        .from(schema.generatedAppSubmissions)
        .where(filters)
        .orderBy(desc(schema.generatedAppSubmissions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.repository.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppSubmissions)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;
    const app = submissions.some((submission) =>
      this.isSubmissionInFlight(submission),
    )
      ? await this.repository.findGeneratedAppRecord(tenantId, appId)
      : null;
    const appSpec =
      app?.appSpec && isAppSpecV2(app.appSpec) ? app.appSpec : null;
    const refreshed =
      app && appSpec
        ? await Promise.all(
            submissions.map((submission) =>
              this.refreshSubmissionResult(app, appSpec, submission),
            ),
          )
        : submissions;

    return {
      data: refreshed.map((submission) =>
        this.repository.toSubmissionResponseDto(submission),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmissionResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const submission = await this.repository.findSubmissionRecord(
      tenantId,
      appId,
      submissionId,
    );
    const refreshed =
      app.appSpec && isAppSpecV2(app.appSpec)
        ? await this.refreshSubmissionResult(app, app.appSpec, submission)
        : submission;

    return this.repository.toSubmissionResponseDto(refreshed);
  }

  async deleteSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const [deleted] = await this.repository.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    if (!deleted) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return { deletedCount: 1 };
  }

  async deleteSubmissions(
    tenantId: string,
    appId: string,
    dto: DeleteGeneratedAppSubmissionsDtoType,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const ids = [...new Set(dto.ids)];
    const deleted = await this.repository.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          inArray(schema.generatedAppSubmissions.id, ids),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    return { deletedCount: deleted.length };
  }

  public normalizePublicAnonymousSessionId(value: string | undefined): string {
    const trimmed = value?.trim();

    if (
      !trimmed ||
      PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN.test(trimmed) ||
      PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN.test(trimmed)
    ) {
      return crypto.randomUUID();
    }

    return trimmed;
  }

  /**
   * 公开令牌 → 应用。只服务 v2 AppSpec；公开分享还要求应用仍满足发布门槛，
   * 验收令牌在发布前使用，不检查门槛。
   */
  private async resolvePublicRuntimeAccess(
    token: string,
  ): Promise<PublicRuntimeAccess> {
    const found = await this.repository.findByPublicOrAcceptanceToken(token);
    const appSpec = found?.app.appSpec;

    if (!found || !appSpec || !isAppSpecV2(appSpec)) {
      throw new GeneratedAppNotFoundException('公开链接');
    }

    if (found.access === 'public') {
      this.repository.assertCanEnablePublicShare(found.app);
    }

    return {
      access: found.access,
      app: { ...found.app, appSpec },
      generationRunId:
        found.access === 'acceptance' ? found.generationRunId : null,
    };
  }

  private isSubmissionInFlight(submission: GeneratedAppSubmission): boolean {
    return submission.status === 'received' || submission.status === 'running';
  }

  /**
   * 进行中的提交按执行状态刷新：执行结束时按 outputMapping 抽取结果分区并落库，
   * 之后的读取不再查询执行。
   */
  private async refreshSubmissionResult(
    app: Pick<GeneratedApp, 'tenantId'>,
    appSpec: GeneratedAppSpecV2,
    submission: GeneratedAppSubmission,
  ): Promise<GeneratedAppSubmission> {
    const report = getRecord(submission.report);
    const executionId = getNonEmptyString(report?.executionId);

    if (
      !this.isSubmissionInFlight(submission) ||
      report?.kind !== GENERATED_APP_RUNTIME_EXECUTION_REPORT_KIND ||
      !executionId
    ) {
      return submission;
    }

    return runInTenantTransaction(
      this.repository.globalDb,
      app.tenantId,
      async (db) => {
        const [execution] = await db
          .select({
            status: schema.workflowExecutions.status,
            workflowDefinitionId:
              schema.workflowExecutions.workflowDefinitionId,
          })
          .from(schema.workflowExecutions)
          .where(
            and(
              eq(schema.workflowExecutions.id, executionId),
              eq(schema.workflowExecutions.tenantId, app.tenantId),
            ),
          )
          .limit(1);

        let result: GeneratedAppRuntimeResult;
        if (
          !execution ||
          execution.workflowDefinitionId !== report.workflowDefinitionId
        ) {
          result = {
            status: 'failed',
            sections: [],
            publicError: PUBLIC_EXECUTION_UNAVAILABLE_ERROR,
          };
        } else {
          const status = this.toSubmissionStatus(execution.status);
          if (status === 'received' || status === 'running') {
            return status === submission.status
              ? submission
              : this.persistSubmissionRefresh(db, submission, {
                  status,
                  result: submission.result,
                  errorMessage: submission.errorMessage,
                });
          }

          const steps =
            execution.status === 'completed'
              ? await db
                  .select({
                    nodeId: schema.executionSteps.nodeId,
                    status: schema.executionSteps.status,
                    result: schema.executionSteps.result,
                  })
                  .from(schema.executionSteps)
                  .where(eq(schema.executionSteps.executionId, executionId))
              : [];
          result = extractGeneratedAppRuntimeResult(appSpec, {
            status: execution.status,
            steps,
          });
        }

        return this.persistSubmissionRefresh(db, submission, {
          status: result.status === 'completed' ? 'completed' : 'failed',
          result: { ...result },
          errorMessage: result.publicError,
        });
      },
    );
  }

  private async persistSubmissionRefresh(
    db: DrizzleDB,
    submission: GeneratedAppSubmission,
    patch: Pick<GeneratedAppSubmission, 'status' | 'result' | 'errorMessage'>,
  ): Promise<GeneratedAppSubmission> {
    const [updated] = await db
      .update(schema.generatedAppSubmissions)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submission.id),
          eq(schema.generatedAppSubmissions.tenantId, submission.tenantId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning();

    return updated ?? { ...submission, ...patch };
  }

  private toSubmissionStatus(
    executionStatus: schema.WorkflowExecution['status'],
  ): schema.GeneratedAppSubmissionStatus {
    switch (executionStatus) {
      case 'pending':
        return 'received';
      case 'running':
      case 'paused':
        return 'running';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
        return 'failed';
    }
  }
}
