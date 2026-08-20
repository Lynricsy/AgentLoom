// 本文件负责 public token、submission、Workflow handoff 与公开输出脱敏。

import * as crypto from 'crypto';

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  computeContentHash as computePluginArchiveContentHash,
  readArchiveManifest,
  validateManifest as validatePluginManifest,
  verifyArchiveSignature as verifyPluginArchiveSignature,
} from '@agentloom/plugin-sdk';
import JSZip from 'jszip';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRepairContext,
  GeneratedAppGenerationRun,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
  GeneratedAppGateRunFailure,
  GeneratedAppGateRun,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
  GeneratedAppStatus,
  GeneratedAppSubmission,
} from '../../database/schema';
import {
  CreateGeneratedAppGenerationRunSchema,
  type CreateGeneratedAppGenerationRunDtoType,
  CreateGeneratedAppGateRunSchema,
  type CreateGeneratedAppGateRunDtoType,
  CreateGeneratedAppRepairAttemptSchema,
  type CreateGeneratedAppRepairAttemptDtoType,
  type CreateGeneratedAppSubmissionDtoType,
  type CreateGeneratedAppDtoType,
  type DeleteGeneratedAppSubmissionsResponseDto,
  type DeleteGeneratedAppSubmissionsDtoType,
  type GeneratedAppArtifactContentResponseDto,
  type GeneratedAppArtifactKind,
  type GeneratedAppArtifactManifestResponseDto,
  type GeneratedAppArtifactSummaryDto,
  type GeneratedAppGenerationRunResponseDto,
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
  type GeneratedAppRuntimeBindingReadinessResponseDto,
  type GeneratedAppResponseDto,
  type GeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppResponseDto,
  type QueryGeneratedAppGenerationRunsDtoType,
  type QueryGeneratedAppGateRunsDtoType,
  type QueryGeneratedAppRepairAttemptsDtoType,
  type QueryGeneratedAppSubmissionsDtoType,
  type QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsSchema,
  type RecordGeneratedAppGateRunResponseDto,
  type RecordGeneratedAppGateResultsDtoType,
  StartGeneratedAppGenerationRunSchema,
  type StartGeneratedAppGenerationRunDtoType,
  type StartGeneratedAppGenerationRunResponseDto,
  UpdateGeneratedAppGenerationRunSchema,
  type UpdateGeneratedAppGenerationRunDtoType,
  UpdateGeneratedAppRepairAttemptSchema,
  type UpdateGeneratedAppRepairAttemptDtoType,
} from './dto';
import {
  createInitialGeneratedAppGateResults,
  evaluateGeneratedAppReadiness,
  getGeneratedAppGateDefinition,
  getGeneratedAppStatusForReadiness,
  normalizeGeneratedAppGateResults,
} from './generated-app.gates';
import {
  GeneratedAppGateDefinitionNotFoundException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';
import {
  GeneratedAppGate3WorkspaceRunner,
  type GeneratedAppGate3CommandPlan,
  type GeneratedAppGate3RepairResult,
  type GeneratedAppGenerationWorkspaceContract,
} from './generated-app.workspace';
import {
  GeneratedAppGate4IntegrationRunner,
  type GeneratedAppIntegrationExecutionLevel,
} from './generated-app.integration-runner';
import {
  GeneratedAppGate5BrowserAcceptanceRunner,
  type GeneratedAppBrowserAcceptanceExecutionLevel,
} from './generated-app.browser-acceptance-runner';
import {
  GeneratedAppGate6IndependentVerifierRunner,
  type GeneratedAppIndependentVerifierExecutionLevel,
} from './generated-app.independent-verifier-runner';
import {
  GeneratedAppGate7PublishCandidateRunner,
  type GeneratedAppPublishCandidateExecutionLevel,
} from './generated-app.publish-candidate-runner';
import {
  buildGeneratedAppRuntimeForm,
  buildPublicGeneratedAppRuntimeDescription,
  buildPublicGeneratedAppRuntimeSpec,
  evaluateGeneratedAppLocalRuntime,
} from './generated-app.runtime';
import {
  buildGenerationPlan,
  buildStaticContracts,
  evaluateGate2StaticContracts,
  buildBuildUnitPlan,
  evaluateGate3BuildUnitPlan,
  evaluateGate1GenerationPlan,
  GATE_3_REQUIRED_COMMAND_IDS,
  GENERATED_APP_BUILD_UNIT_EXECUTION_LEVELS,
} from './plan-builders/generation-plan.builder';
import {
  buildIntegrationPlan,
  evaluateGate4IntegrationPlan,
} from './plan-builders/integration-plan.builder';
import {
  buildBrowserAcceptancePlan,
  evaluateGate5BrowserAcceptancePlan,
  GATE_5_REAL_BROWSER_E2E_COMMAND,
} from './plan-builders/browser-acceptance-plan.builder';
import {
  buildIndependentVerificationPlan,
  evaluateGate6IndependentVerificationPlan,
} from './plan-builders/independent-verification-plan.builder';
import {
  buildPublishCandidatePlan,
  applyPublishCandidateEvidenceGuard,
  evaluateGate7PublishCandidatePlan,
  buildGate7CompletedRunSummary,
  GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON,
  GATE_7_REQUIRED_GATE_IDS,
} from './plan-builders/publish-candidate-plan.builder';
import {
  isRecord,
  getRecord,
  getRecordArray,
  getStringArray,
  getNonEmptyString,
  isNonEmptyString,
} from './generated-app.plan-validation.util';
import {
  sanitizePublicSubmissionValue,
  sanitizePublicWorkflowOutputValue,
  limitPublicWorkflowOutputText,
  buildPublicWorkflowOutputReportItems,
  getWorkflowExecutionPublicStatusLabel,
  limitRepairAttemptText,
  GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_LIMIT,
  PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN,
  PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN,
} from './generated-app.public-sanitizer.util';
import {
  buildGeneratedWorkflowRuntimeNodes,
  buildGeneratedWorkflowRuntimeEdges,
  buildGeneratedPrivatePluginRegistrationManifest,
  buildGeneratedWorkflowRuntimeInputSchema,
} from './generated-app.runtime-binding.util';
import type { GeneratedAppPrivatePluginBuildReport } from './generated-app.runtime-binding.util';
import {
  buildInitialAppSpec,
  getPublicRuntimePages,
  resolveStatusForShareDisabled,
  evaluateGate0AppSpec,
} from './generated-app.app-spec.util';
import type { Gate0Evaluation } from './generated-app.app-spec.util';
import type {
  Gate1Evaluation,
  Gate2Evaluation,
  Gate3Evaluation,
} from './plan-builders/generation-plan.builder';
import type { Gate4Evaluation } from './plan-builders/integration-plan.builder';
import type { Gate5Evaluation } from './plan-builders/browser-acceptance-plan.builder';
import type { Gate6Evaluation } from './plan-builders/independent-verification-plan.builder';
import type { Gate7Evaluation } from './plan-builders/publish-candidate-plan.builder';
import type {
  InternalRunWorkflowRequest,
  ExecutionTriggerType,
} from '../execution/dto/run-workflow.dto';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { ExecutionService } from '../execution/execution.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import { PluginAlreadyExistsException } from '../plugin/plugin.exceptions';
import { PluginService } from '../plugin/plugin.service';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';

import {
  GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY,
  GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY,
  GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY,
  GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY,
  GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY,
  GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID,
  UUID_LIKE_PATTERN,
  GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
  GeneratedAppWorkflowExecutionNotStartedReason,
  GeneratedAppWorkflowExecutionHandoff,
} from './generated-app.internal';

import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppArtifactService } from './generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';

@Injectable()
export class GeneratedAppPublicRuntimeService {
  constructor(private readonly repository: GeneratedAppRepository, private readonly artifactService: GeneratedAppArtifactService, private readonly runtimeBindingService: GeneratedAppRuntimeBindingService, @Optional() private readonly executionService?: ExecutionService) {}



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
    const app = await this.repository.findPublicGeneratedAppRecord(token);
    const publicAppSpec = buildPublicGeneratedAppRuntimeSpec({
      appSpec: app.appSpec,
      pages: getPublicRuntimePages(app.appSpec),
    });
    const publicDescription = buildPublicGeneratedAppRuntimeDescription({
      appSpec: app.appSpec,
      description: app.description,
    });
    const previewUrl = await this.artifactService.resolvePublicRuntimePreviewUrl(app, token);

    await this.repository.globalDb
      .update(schema.generatedApps)
      .set({
        publicViewCount: sql`${schema.generatedApps.publicViewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.generatedApps.id, app.id));

    return {
      token,
      appId: app.id,
      title: publicAppSpec.appName,
      description: publicDescription,
      dataUseNotice:
        '你在此公开应用中提交的内容、运行结果和最终报告会被保存，并提供给应用创建者查看。',
      appSpec: publicAppSpec,
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl,
      },
      runtimeForm: buildGeneratedAppRuntimeForm({
        appSpec: app.appSpec,
        generationPlan: app.generationPlan,
        description: app.description,
      }),
      createdAt: app.createdAt,
    };
  }


  async getPublicBuildPreviewHtml(token: string): Promise<string> {
    const app = await this.repository.findPublicGeneratedAppRecord(token);
    const artifact = await this.artifactService.resolveArtifactContentForApp(
      app,
      GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
    );

    return artifact.content;
  }


  async createPublicSubmission(
    token: string,
    dto: CreateGeneratedAppSubmissionDtoType,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.repository.findPublicGeneratedAppRecord(token);
    const anonymousSessionId = this.normalizePublicAnonymousSessionId(
      dto.anonymousSessionId,
    );
    const now = new Date();
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app,
      input: dto.input ?? {},
      now,
    });
    const workflowExecutionHandoff =
      evaluation.status === 'completed'
        ? await this.createPublicWorkflowExecutionHandoff({
            app,
            input: evaluation.input,
            anonymousSessionId,
            submittedAt: now,
          })
        : null;
    const result = workflowExecutionHandoff
      ? this.attachWorkflowExecutionHandoff(
          evaluation.result,
          workflowExecutionHandoff,
        )
      : evaluation.result;
    const report = workflowExecutionHandoff
      ? this.attachWorkflowExecutionHandoff(
          evaluation.report,
          workflowExecutionHandoff,
        )
      : evaluation.report;

    const submissionStatus = workflowExecutionHandoff
      ? this.getPublicSubmissionStatusForWorkflowExecutionStatus(
          evaluation.status,
          workflowExecutionHandoff.executionStatus,
        )
      : evaluation.status;

    const [submission] = await this.repository.globalDb
      .insert(schema.generatedAppSubmissions)
      .values({
        tenantId: app.tenantId,
        generatedAppId: app.id,
        appSpecVersion: app.appSpec.version,
        publicShareToken: token,
        anonymousSessionId,
        status: submissionStatus,
        input: evaluation.input,
        result,
        report,
        errorMessage: evaluation.errorMessage,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.repository.toPublicSubmissionResponseDto(submission);
  }


  async getPublicSubmission(
    token: string,
    submissionId: string,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.repository.findPublicGeneratedAppRecord(token);
    const [submission] = await this.repository.globalDb
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.generatedAppId, app.id),
          eq(schema.generatedAppSubmissions.publicShareToken, token),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    const refreshedSubmission =
      await this.refreshPublicSubmissionWorkflowHandoff(app, submission);

    return this.repository.toPublicSubmissionResponseDto(refreshedSubmission);
  }


  public async refreshPublicSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): Promise<GeneratedAppSubmission> {
    return this.refreshSubmissionWorkflowHandoff(app, submission, {
      requireGeneratedAppMetadata: false,
    });
  }


  public async refreshCreatorSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): Promise<GeneratedAppSubmission> {
    return this.refreshSubmissionWorkflowHandoff(app, submission, {
      requireGeneratedAppMetadata: true,
    });
  }


  public async refreshSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
    options: { requireGeneratedAppMetadata: boolean },
  ): Promise<GeneratedAppSubmission> {
    const handoff = this.extractPublicWorkflowExecutionHandoff(submission);

    if (!handoff) {
      return submission;
    }

    try {
      const [execution] = await this.repository.globalDb
        .select({
          id: schema.workflowExecutions.id,
          tenantId: schema.workflowExecutions.tenantId,
          workflowDefinitionId: schema.workflowExecutions.workflowDefinitionId,
          status: schema.workflowExecutions.status,
          completedAt: schema.workflowExecutions.completedAt,
          failedAt: schema.workflowExecutions.failedAt,
          cancelledAt: schema.workflowExecutions.cancelledAt,
          totalSteps: schema.workflowExecutions.totalSteps,
          completedSteps: schema.workflowExecutions.completedSteps,
          updatedAt: schema.workflowExecutions.updatedAt,
          inputParams: schema.workflowExecutions.inputParams,
        })
        .from(schema.workflowExecutions)
        .where(
          and(
            eq(schema.workflowExecutions.id, handoff.executionId),
            eq(schema.workflowExecutions.tenantId, app.tenantId),
          ),
        )
        .limit(1);
      const expectedWorkflowDefinitionId =
        handoff.workflowDefinitionId ?? app.workflowDefinitionId ?? null;

      if (
        !execution ||
        !expectedWorkflowDefinitionId ||
        execution.workflowDefinitionId !== expectedWorkflowDefinitionId ||
        (options.requireGeneratedAppMetadata &&
          !this.isWorkflowExecutionForGeneratedAppSubmission(
            execution.inputParams,
            app,
            submission,
          ))
      ) {
        return this.persistRefreshedSubmissionWorkflowHandoff(
          submission,
          this.buildWorkflowExecutionNotStartedHandoff(
            handoff.workflowDefinitionId ?? app.workflowDefinitionId,
            'workflow-execution-unavailable',
          ),
        );
      }

      const safeSummary =
        execution.status === 'completed'
          ? await this.buildPublicWorkflowExecutionSummary(
              execution.id,
              app.tenantId,
            )
          : undefined;

      return this.persistRefreshedSubmissionWorkflowHandoff(
        submission,
        this.buildRefreshedWorkflowExecutionHandoff({
          workflowDefinitionId: execution.workflowDefinitionId,
          executionId: execution.id,
          status: execution.status,
          updatedAt: execution.updatedAt,
          completedAt:
            execution.completedAt ??
            execution.failedAt ??
            execution.cancelledAt ??
            null,
          completedSteps: execution.completedSteps,
          totalSteps: execution.totalSteps,
          summary: safeSummary,
        }),
      );
    } catch {
      return this.persistRefreshedSubmissionWorkflowHandoff(
        submission,
        this.buildWorkflowExecutionNotStartedHandoff(
          handoff.workflowDefinitionId ?? app.workflowDefinitionId,
          'workflow-execution-unavailable',
        ),
      );
    }
  }


  public isWorkflowExecutionForGeneratedAppSubmission(
    inputParams: Record<string, unknown> | null,
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): boolean {
    const metadata = getRecord(inputParams?._meta);

    if (!metadata) {
      return false;
    }

    const submissionMetadata = getRecord(metadata.submission);
    const submittedAt = getNonEmptyString(submissionMetadata?.submittedAt);
    const submittedAtTime = submittedAt ? Date.parse(submittedAt) : Number.NaN;

    return (
      getNonEmptyString(metadata.generatedAppId) === app.id &&
      getNonEmptyString(metadata.submissionSource) ===
        'generated-app-public-submission' &&
      Number(metadata.appSpecVersion) === submission.appSpecVersion &&
      getNonEmptyString(submissionMetadata?.anonymousSessionId) ===
        submission.anonymousSessionId &&
      Number.isFinite(submittedAtTime) &&
      submittedAtTime === submission.createdAt.getTime()
    );
  }


  public shouldRefreshSubmissionWorkflowHandoff(
    submission: GeneratedAppSubmission,
  ): boolean {
    const handoff = this.extractPublicWorkflowExecutionHandoff(submission);

    if (!handoff) {
      return false;
    }

    const reportStatus = this.getWorkflowExecutionStatusFromPayload(
      submission.report,
    );

    if (reportStatus) {
      return this.isRefreshableWorkflowExecutionStatus(reportStatus);
    }

    const resultStatus = this.getWorkflowExecutionStatusFromPayload(
      submission.result,
    );

    return resultStatus
      ? this.isRefreshableWorkflowExecutionStatus(resultStatus)
      : true;
  }


  public getWorkflowExecutionStatusFromPayload(
    payload: Record<string, unknown> | null,
  ): schema.WorkflowExecution['status'] | null {
    const record = getRecord(payload);
    const status = getNonEmptyString(record?.executionStatus);

    return this.isWorkflowExecutionStatus(status) ? status : null;
  }


  public isWorkflowExecutionStatus(
    status: string | null | undefined,
  ): status is schema.WorkflowExecution['status'] {
    return (
      status === 'pending' ||
      status === 'running' ||
      status === 'paused' ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
    );
  }


  public isRefreshableWorkflowExecutionStatus(
    status: schema.WorkflowExecution['status'],
  ): boolean {
    return status === 'pending' || status === 'running' || status === 'paused';
  }


  public extractPublicWorkflowExecutionHandoff(
    submission: GeneratedAppSubmission,
  ): { executionId: string; workflowDefinitionId: string | null } | null {
    const reportHandoff = this.extractPublicWorkflowExecutionHandoffFromPayload(
      submission.report,
    );

    if (reportHandoff) {
      return reportHandoff;
    }

    return this.extractPublicWorkflowExecutionHandoffFromPayload(
      submission.result,
    );
  }


  public extractPublicWorkflowExecutionHandoffFromPayload(
    payload: Record<string, unknown> | null,
  ): { executionId: string; workflowDefinitionId: string | null } | null {
    const record = getRecord(payload);

    if (!record || record.workflowExecution !== true) {
      return null;
    }

    const executionId = getNonEmptyString(record.executionId);

    if (!executionId || !UUID_LIKE_PATTERN.test(executionId)) {
      return null;
    }

    const workflowDefinitionId = getNonEmptyString(record.workflowDefinitionId);

    if (workflowDefinitionId && !UUID_LIKE_PATTERN.test(workflowDefinitionId)) {
      return null;
    }

    return { executionId, workflowDefinitionId };
  }


  public buildRefreshedWorkflowExecutionHandoff(params: {
    workflowDefinitionId: string;
    executionId: string;
    status: schema.WorkflowExecution['status'];
    updatedAt: Date;
    completedAt: Date | null;
    completedSteps: number;
    totalSteps: number;
    summary?: Record<string, unknown>;
  }): GeneratedAppWorkflowExecutionHandoff {
    const completedAt = params.completedAt?.toISOString() ?? null;
    const updatedAt = params.updatedAt.toISOString();
    const progress =
      params.totalSteps > 0
        ? `${Math.min(params.completedSteps, params.totalSteps)}/${params.totalSteps}`
        : null;

    switch (params.status) {
      case 'completed':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 已完成；公开页面仅展示安全执行摘要，并继续保留本地 deterministic report。',
          updatedAt,
          completedAt,
          summary: params.summary,
        };
      case 'failed':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 未完成；公开页面继续保留本地 deterministic report fallback，不展示内部错误细节。',
          updatedAt,
          completedAt,
        };
      case 'cancelled':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 已取消；公开页面继续保留本地 deterministic report fallback。',
          updatedAt,
          completedAt,
        };
      case 'running':
      case 'pending':
      case 'paused':
      default:
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY,
          notStartedReason: null,
          notice: progress
            ? `Workflow execution 仍在执行中（${progress}）；公开页面会继续轮询安全状态。`
            : 'Workflow execution 仍在执行中；公开页面会继续轮询安全状态。',
          updatedAt,
          completedAt: null,
        };
    }
  }


  public async buildPublicWorkflowExecutionSummary(
    executionId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const steps = await this.repository.globalDb
      .select({
        nodeId: schema.executionSteps.nodeId,
        nodeType: schema.executionSteps.nodeType,
        status: schema.executionSteps.status,
        completedAt: schema.executionSteps.completedAt,
        result: schema.executionSteps.result,
      })
      .from(schema.executionSteps)
      .innerJoin(
        schema.workflowExecutions,
        eq(schema.workflowExecutions.id, schema.executionSteps.executionId),
      )
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          eq(schema.workflowExecutions.tenantId, tenantId),
        ),
      );

    const completedCount = steps.filter(
      (step) => step.status === 'completed',
    ).length;
    const failedCount = steps.filter((step) => step.status === 'failed').length;
    const cancelledCount = steps.filter(
      (step) => step.status === 'cancelled',
    ).length;
    const latestCompletedAt = steps
      .map((step) => step.completedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const publicOutputs = steps
      .filter((step) => step.status === 'completed')
      .flatMap((step) =>
        this.extractPublicWorkflowStepOutputs({
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          result: step.result,
        }),
      )
      .slice(0, GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_LIMIT);

    return {
      summary:
        publicOutputs.length > 0
          ? 'Workflow execution 已完成；公开页面展示经过白名单过滤的业务输出摘要，并继续隐藏内部执行快照。'
          : 'Workflow execution 已完成。出于公开链接安全边界，仅展示步骤计数摘要，不展开节点输出或内部执行快照。',
      completedSteps: completedCount,
      failedSteps: failedCount,
      cancelledSteps: cancelledCount,
      totalSteps: steps.length,
      latestStepCompletedAt: latestCompletedAt?.toISOString() ?? null,
      publicOutputs,
    };
  }


  public extractPublicWorkflowStepOutputs(params: {
    nodeId: string;
    nodeType: string | null;
    result: Record<string, unknown> | null;
  }): Array<Record<string, unknown>> {
    const result = getRecord(params.result);

    if (!result) {
      return [];
    }

    const analysis =
      getRecord(result.analysis) ?? getRecord(result['analysis-out']);

    if (analysis) {
      return [
        {
          kind: 'analysis',
          title:
            params.nodeType === 'plugin'
              ? '私有工具分析摘要'
              : '结构化分析摘要',
          nodeId: params.nodeId,
          nodeType: params.nodeType,
          value: sanitizePublicWorkflowOutputValue(analysis),
        },
      ];
    }

    if (params.nodeType === 'text-output') {
      const content = getNonEmptyString(result.content);

      return content
        ? [
            {
              kind: 'text',
              title: 'Workflow 文本输出',
              nodeId: params.nodeId,
              nodeType: params.nodeType,
              value: limitPublicWorkflowOutputText(content),
            },
          ]
        : [];
    }

    if (params.nodeType === 'json-output') {
      const json = getRecord(result.json);

      return json
        ? [
            {
              kind: 'json',
              title: 'Workflow JSON 输出',
              nodeId: params.nodeId,
              nodeType: params.nodeType,
              value: sanitizePublicWorkflowOutputValue(json),
            },
          ]
        : [];
    }

    return [];
  }


  public withRefreshedWorkflowHandoff(
    submission: GeneratedAppSubmission,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): GeneratedAppSubmission {
    const result = this.attachWorkflowExecutionHandoff(
      this.repository.sanitizePublicSubmissionResultReport(submission.result),
      handoff,
    );
    const report = this.attachWorkflowExecutionHandoff(
      this.removeWorkflowExecutionStatusSection(
        this.repository.sanitizePublicSubmissionResultReport(submission.report),
      ),
      handoff,
    );

    return {
      ...submission,
      status: this.getPublicSubmissionStatusForWorkflowHandoff(
        submission.status,
        handoff,
      ),
      result,
      report: this.appendWorkflowExecutionReportSection(report, handoff),
      updatedAt: new Date(),
    };
  }


  public async persistRefreshedSubmissionWorkflowHandoff(
    submission: GeneratedAppSubmission,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): Promise<GeneratedAppSubmission> {
    const refreshed = this.withRefreshedWorkflowHandoff(submission, handoff);
    const [updated] = await this.repository.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        status: refreshed.status,
        result: refreshed.result,
        report: refreshed.report,
        errorMessage: refreshed.errorMessage,
        updatedAt: refreshed.updatedAt,
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submission.id),
          eq(schema.generatedAppSubmissions.tenantId, submission.tenantId),
          eq(
            schema.generatedAppSubmissions.generatedAppId,
            submission.generatedAppId,
          ),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning();

    return updated ?? refreshed;
  }


  public getPublicSubmissionStatusForWorkflowHandoff(
    currentStatus: schema.GeneratedAppSubmissionStatus,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): schema.GeneratedAppSubmissionStatus {
    if (handoff.workflowExecution === false) {
      return 'failed';
    }

    return this.getPublicSubmissionStatusForWorkflowExecutionStatus(
      currentStatus,
      handoff.executionStatus,
    );
  }


  public getPublicSubmissionStatusForWorkflowExecutionStatus(
    currentStatus: schema.GeneratedAppSubmissionStatus,
    executionStatus: schema.WorkflowExecution['status'] | null,
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
      default:
        return currentStatus;
    }
  }


  public async createPublicWorkflowExecutionHandoff(params: {
    app: GeneratedApp;
    input: Record<string, unknown>;
    anonymousSessionId: string;
    submittedAt: Date;
  }): Promise<GeneratedAppWorkflowExecutionHandoff> {
    if (!params.app.workflowDefinitionId) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        null,
        'no-workflow-bound',
      );
    }

    const workflowDefinitionId = params.app.workflowDefinitionId;
    const [workflow] = await this.repository.globalDb
      .select({
        id: schema.workflowDefinitions.id,
        status: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        metadata: schema.workflowDefinitions.metadata,
        inputSchema: schema.workflowDefinitions.inputSchema,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowDefinitionId),
          eq(schema.workflowDefinitions.tenantId, params.app.tenantId),
        ),
      )
      .limit(1);

    if (
      !workflow ||
      this.runtimeBindingService.isGeneratedAppEditorHandoffWorkflowMetadata(workflow.metadata) ||
      workflow.status !== 'published' ||
      !workflow.publishedVersionId
    ) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        'workflow-not-published',
      );
    }

    if (!this.executionService) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        'workflow-execution-unavailable',
      );
    }

    try {
      const workflowInputSchema = workflow.inputSchema
        ? workflowInputSchemaSchema.parse(workflow.inputSchema)
        : null;
      const execution = await this.executionService.runWorkflow(
        workflowDefinitionId,
        this.buildGeneratedAppPublicRunRequest({
          app: params.app,
          input: params.input,
          anonymousSessionId: params.anonymousSessionId,
          submittedAt: params.submittedAt,
          workflowInputSchemaVersion: workflowInputSchema?.version,
        }),
        params.app.tenantId,
        params.app.createdBy,
      );

      return {
        workflowExecution: true,
        workflowDefinitionId,
        executionId: execution.id,
        executionStatus: execution.status,
        executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY,
        notStartedReason: null,
        notice:
          '已创建异步 Workflow execution；公开提交响应只展示 execution id/status/boundary，不等待执行完成，也不伪造最终 Workflow 输出。',
      };
    } catch (error) {
      const reason =
        error instanceof WorkflowNotPublishedException
          ? 'workflow-not-published'
          : 'workflow-execution-blocked';

      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        reason,
      );
    }
  }


  public buildGeneratedAppPublicRunRequest(params: {
    app: GeneratedApp;
    input: Record<string, unknown>;
    anonymousSessionId: string;
    submittedAt: Date;
    workflowInputSchemaVersion?: number;
  }): InternalRunWorkflowRequest {
    const inputParams: Record<string, unknown> = {
      ...params.input,
      _meta: {
        launchSource: 'api',
        generatedAppId: params.app.id,
        appSpecVersion: params.app.appSpec.version,
        submissionSource: 'generated-app-public-submission',
        submission: {
          source: 'generated-app-public-submission',
          anonymousSessionId: params.anonymousSessionId,
          submittedAt: params.submittedAt.toISOString(),
        },
        runtime: {
          kind: 'generated-app-public-runtime',
          boundary: 'public-generated-app-async-workflow-handoff',
        },
        executionBoundary:
          'public submission creates async Workflow execution only',
      },
    };

    return {
      inputParams,
      launchSource: 'api',
      schemaVersion: params.workflowInputSchemaVersion,
      triggerType: 'api' satisfies ExecutionTriggerType,
    };
  }


  public buildWorkflowExecutionNotStartedHandoff(
    workflowDefinitionId: string | null,
    reason: GeneratedAppWorkflowExecutionNotStartedReason,
  ): GeneratedAppWorkflowExecutionHandoff {
    return {
      workflowExecution: false,
      workflowDefinitionId,
      executionId: null,
      executionStatus: null,
      executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY,
      notStartedReason: reason,
      notice: this.getWorkflowExecutionNotStartedNotice(reason),
    };
  }


  public getWorkflowExecutionNotStartedNotice(
    reason: GeneratedAppWorkflowExecutionNotStartedReason,
  ): string {
    switch (reason) {
      case 'workflow-not-published':
        return '未创建 Workflow execution：绑定 Workflow 尚未发布，公开提交继续返回本地 deterministic report。';
      case 'workflow-execution-unavailable':
        return 'Workflow execution 当前不可用：公开提交继续返回本地 deterministic report。';
      case 'workflow-execution-blocked':
        return '未创建 Workflow execution：执行启动被平台安全或治理边界阻止，公开提交继续返回本地 deterministic report。';
      case 'no-workflow-bound':
      default:
        return '未创建 Workflow execution：当前 Generated App 没有绑定可执行 Workflow，公开提交继续返回本地 deterministic report。';
    }
  }


  public attachWorkflowExecutionHandoff<T extends Record<string, unknown>>(
    payload: T | null,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): T | null {
    if (!payload) {
      return payload;
    }

    return {
      ...payload,
      workflowExecution: handoff.workflowExecution,
      executionId: handoff.executionId,
      executionStatus: handoff.executionStatus,
      workflowDefinitionId: handoff.workflowDefinitionId,
      executionBoundary: handoff.executionBoundary,
      workflowExecutionNotStartedReason: handoff.notStartedReason,
      workflowExecutionNotice: handoff.notice,
      workflowExecutionUpdatedAt: handoff.updatedAt ?? null,
      workflowExecutionCompletedAt: handoff.completedAt ?? null,
      workflowExecutionSummary: handoff.summary ?? null,
    };
  }


  public removeWorkflowExecutionStatusSection(
    report: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!report) {
      return report;
    }

    const sections = getRecordArray(report.sections).filter(
      (section) =>
        getNonEmptyString(section.id) !==
        GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID,
    );

    if (!Array.isArray(report.sections)) {
      return report;
    }

    return {
      ...report,
      sections,
    };
  }


  public appendWorkflowExecutionReportSection(
    report: Record<string, unknown> | null,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): Record<string, unknown> | null {
    if (!report || handoff.workflowExecution !== true) {
      return report;
    }

    const sections = getRecordArray(report.sections);
    const statusLabel = getWorkflowExecutionPublicStatusLabel(
      handoff.executionStatus,
    );
    const items = [
      `执行状态：${statusLabel}`,
      handoff.completedAt ? `完成时间：${handoff.completedAt}` : null,
      handoff.updatedAt ? `更新时间：${handoff.updatedAt}` : null,
      handoff.summary
        ? `安全摘要：${getNonEmptyString(handoff.summary.summary) ?? '执行已完成，公开页面仅展示步骤计数摘要。'}`
        : null,
      ...buildPublicWorkflowOutputReportItems(handoff.summary),
    ].filter((item): item is string => Boolean(item));

    return {
      ...report,
      sections: [
        ...sections,
        {
          id: GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID,
          title: 'Workflow 执行状态',
          body: handoff.notice,
          items,
        },
      ],
    };
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
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppSubmissions.tenantId, tenantId),
      eq(schema.generatedAppSubmissions.generatedAppId, appId),
      isNull(schema.generatedAppSubmissions.deletedAt),
    ];
    const filters = query.status
      ? and(
          ...baseFilters,
          eq(schema.generatedAppSubmissions.status, query.status),
        )
      : and(...baseFilters);

    const [submissions, countRows] = await Promise.all([
      this.repository.tenantDb
        .select()
        .from(schema.generatedAppSubmissions)
        .where(filters)
        .orderBy(desc(schema.generatedAppSubmissions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.repository.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppSubmissions)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;
    const app = submissions.some((submission) =>
      this.shouldRefreshSubmissionWorkflowHandoff(submission),
    )
      ? await this.repository.findGeneratedAppRecord(tenantId, appId)
      : null;
    const refreshedSubmissions = app
      ? await Promise.all(
          submissions.map((submission) =>
            this.shouldRefreshSubmissionWorkflowHandoff(submission)
              ? this.refreshCreatorSubmissionWorkflowHandoff(app, submission)
              : submission,
          ),
        )
      : submissions;

    return {
      data: refreshedSubmissions.map((submission) =>
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
    const refreshedSubmission =
      await this.refreshCreatorSubmissionWorkflowHandoff(app, submission);

    return this.repository.toSubmissionResponseDto(refreshedSubmission);
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

    if (!trimmed) {
      return crypto.randomUUID();
    }

    if (
      PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN.test(trimmed) ||
      PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN.test(trimmed)
    ) {
      return crypto.randomUUID();
    }

    return trimmed;
  }
  assertCanEnablePublicShare(app: Pick<GeneratedApp, 'id' | 'readiness'>): void {
    if (
      app.readiness.state !== 'publish_candidate' ||
      !app.readiness.canCreatePublicShare
    ) {
      throw new GeneratedAppPublicShareNotReadyException(
        app.id,
        app.readiness.summary,
      );
    }
  }

  normalizeAnonymousSessionId(value: string | undefined): string {
    return this.normalizePublicAnonymousSessionId(value);
  }

}
