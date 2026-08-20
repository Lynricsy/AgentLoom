// 本文件保留 GeneratedAppService 的稳定 DI token 与公开 import 路径，并显式委托领域服务。

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

import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppArtifactService } from './generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';
import { GeneratedAppGenerationRepairService } from './generated-app-generation-repair.service';
import { GeneratedAppGenerationOrchestratorService } from './generated-app-generation-orchestrator.service';
import { GeneratedAppPublicRuntimeService } from './generated-app-public-runtime.service';
import type {
  GeneratedAppArtifactDefinition,
  GeneratedAppWorkflowExecutionHandoff,
  GeneratedAppWorkflowExecutionNotStartedReason,
} from './generated-app.internal';

@Injectable()
export class GeneratedAppService {
  private readonly repository: GeneratedAppRepository; private readonly artifactService: GeneratedAppArtifactService; private readonly runtimeBindingService: GeneratedAppRuntimeBindingService; private readonly repairService: GeneratedAppGenerationRepairService; private readonly orchestrator: GeneratedAppGenerationOrchestratorService; private readonly publicRuntimeService: GeneratedAppPublicRuntimeService;
  constructor(@Inject(DRIZZLE) db: DrizzleDB, configService: ConfigService, @Optional() gate3WorkspaceRunner?: GeneratedAppGate3WorkspaceRunner, @Optional() gate4IntegrationRunner?: GeneratedAppGate4IntegrationRunner, @Optional() gate5BrowserAcceptanceRunner?: GeneratedAppGate5BrowserAcceptanceRunner, @Optional() gate6IndependentVerifierRunner?: GeneratedAppGate6IndependentVerifierRunner, @Optional() gate7PublishCandidateRunner?: GeneratedAppGate7PublishCandidateRunner, @Optional() pluginService?: PluginService, @Optional() executionService?: ExecutionService, @Optional() storageService?: StorageService, @Optional() repository?: GeneratedAppRepository, @Optional() artifactService?: GeneratedAppArtifactService, @Optional() runtimeBindingService?: GeneratedAppRuntimeBindingService, @Optional() repairService?: GeneratedAppGenerationRepairService, @Optional() orchestrator?: GeneratedAppGenerationOrchestratorService, @Optional() publicRuntimeService?: GeneratedAppPublicRuntimeService) { this.repository = repository ?? new GeneratedAppRepository(db, configService); this.artifactService = artifactService ?? new GeneratedAppArtifactService(this.repository, configService, storageService); this.runtimeBindingService = runtimeBindingService ?? new GeneratedAppRuntimeBindingService(this.repository, this.artifactService, pluginService); this.repairService = repairService ?? new GeneratedAppGenerationRepairService(this.repository); this.orchestrator = orchestrator ?? new GeneratedAppGenerationOrchestratorService(this.repository, this.repairService, this.runtimeBindingService, configService, gate3WorkspaceRunner, gate4IntegrationRunner, gate5BrowserAcceptanceRunner, gate6IndependentVerifierRunner, gate7PublishCandidateRunner); this.publicRuntimeService = publicRuntimeService ?? new GeneratedAppPublicRuntimeService(this.repository, this.artifactService, this.runtimeBindingService, executionService); }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    return this.repository.create(tenantId, userId, dto);
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

  async getRuntimeBindingReadiness(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppRuntimeBindingReadinessResponseDto> {
    return this.runtimeBindingService.getRuntimeBindingReadiness(tenantId, appId);
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

  async startGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<StartGeneratedAppGenerationRunResponseDto> {
    return this.orchestrator.startGenerationRun(tenantId, userId, appId, dto);
  }

  async updateGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
    dto: UpdateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    return this.repository.updateGenerationRun(tenantId, appId, runId, dto);
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
    return this.repository.listRepairAttempts(tenantId, appId, runId, query);
  }

  async createRepairAttempt(
    tenantId: string,
    userId: string,
    appId: string,
    runId: string,
    dto: CreateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    return this.repository.createRepairAttempt(tenantId, userId, appId, runId, dto);
  }

  async updateRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
    dto: UpdateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    return this.repository.updateRepairAttempt(tenantId, appId, runId, repairAttemptId, dto);
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
    return this.publicRuntimeService.regeneratePublicShare(tenantId, userId, appId);
  }

  async disablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    return this.publicRuntimeService.disablePublicShare(tenantId, userId, appId);
  }

  async getPublicApp(token: string): Promise<PublicGeneratedAppResponseDto> {
    return this.publicRuntimeService.getPublicApp(token);
  }

  async getPublicBuildPreviewHtml(token: string): Promise<string> {
    return this.publicRuntimeService.getPublicBuildPreviewHtml(token);
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
    return this.publicRuntimeService.listSubmissions(tenantId, appId, query);
  }

  async findSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmissionResponseDto> {
    return this.publicRuntimeService.findSubmission(tenantId, appId, submissionId);
  }

  async deleteSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    return this.publicRuntimeService.deleteSubmission(tenantId, appId, submissionId);
  }

  async deleteSubmissions(
    tenantId: string,
    appId: string,
    dto: DeleteGeneratedAppSubmissionsDtoType,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    return this.publicRuntimeService.deleteSubmissions(tenantId, appId, dto);
  }

  assertCanEnablePublicShare(app: Pick<GeneratedApp, 'id' | 'readiness'>) {
    return this.repository.assertCanEnablePublicShare(app);
  }

}
