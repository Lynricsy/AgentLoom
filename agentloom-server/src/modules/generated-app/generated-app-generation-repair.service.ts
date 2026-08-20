// 本文件负责失败 Gate 的 repair work order、补丁尝试与再验证台账。

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

@Injectable()
export class GeneratedAppGenerationRepairService {
  constructor(private readonly repository: GeneratedAppRepository) {}



  public async recordAutomaticRepairAttemptForFailedRun(params: {
    tenantId: string;
    userId: string;
    appId: string;
    generationRunId: string;
    maxRepairAttempts: number;
    gateRuns: GeneratedAppGateRunResponseDto[];
    excludeGateRunIds?: string[];
  }): Promise<GeneratedAppRepairAttemptResponseDto | null> {
    if (params.maxRepairAttempts <= 0) {
      return null;
    }

    const excludedGateRunIds = new Set(params.excludeGateRunIds ?? []);
    const failedGateRun = params.gateRuns.find(
      (gateRun) =>
        gateRun.status === 'failed' && !excludedGateRunIds.has(gateRun.id),
    );

    if (!failedGateRun) {
      return null;
    }

    const now = new Date();
    const failureMessage =
      failedGateRun.failure?.message ?? failedGateRun.summary;
    const failureSummary = limitRepairAttemptText(
      `${failedGateRun.gateId} ${failedGateRun.gateName} 失败：${failureMessage}`,
    );
    const changeSummary = limitRepairAttemptText(
      failedGateRun.repairInstructions
        ? `自动修复循环已读取失败证据和修复建议：${failedGateRun.repairInstructions} 当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。`
        : '自动修复循环已读取失败证据。当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。',
    );
    const verificationSummary = limitRepairAttemptText(
      `本次修复尝试未形成可执行补丁，${failedGateRun.gateId} 仍为 failed；重新运行前必须修复对应证据缺口。`,
    );
    const repairPlan = this.buildFailedGateRepairPlan(failedGateRun, now);
    const reverificationPlan = this.buildFailedGateReverificationPlan(
      failedGateRun,
      now,
    );

    const [attempt] = await this.repository.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId: params.tenantId,
        generatedAppId: params.appId,
        generationRunId: params.generationRunId,
        attemptNumber: 1,
        targetGateId: failedGateRun.gateId,
        status: 'failed',
        failureSummary,
        changeSummary,
        verificationSummary,
        repairPlan,
        reverificationPlan,
        startedAt: now,
        completedAt: now,
        createdBy: params.userId,
      })
      .returning();

    return this.repository.toRepairAttemptResponseDto(attempt);
  }


  public async createRunningGate3RepairAttempt(params: {
    tenantId: string;
    userId: string;
    appId: string;
    generationRunId: string;
    failedGateRun: GeneratedAppGateRunResponseDto;
  }): Promise<GeneratedAppRepairAttemptResponseDto> {
    const now = new Date();
    const repairPlan = this.buildFailedGateRepairPlan(
      params.failedGateRun,
      now,
    );
    const reverificationPlan = this.buildFailedGateReverificationPlan(
      params.failedGateRun,
      now,
    );
    const failureMessage =
      params.failedGateRun.failure?.message ?? params.failedGateRun.summary;
    const [attempt] = await this.repository.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId: params.tenantId,
        generatedAppId: params.appId,
        generationRunId: params.generationRunId,
        attemptNumber: 1,
        targetGateId: params.failedGateRun.gateId,
        status: 'running',
        failureSummary: limitRepairAttemptText(
          `${params.failedGateRun.gateId} ${params.failedGateRun.gateName} 失败：${failureMessage}`,
        ),
        changeSummary: null,
        verificationSummary: null,
        repairPlan,
        reverificationPlan,
        startedAt: now,
        completedAt: null,
        createdBy: params.userId,
      })
      .returning();

    return this.repository.toRepairAttemptResponseDto(attempt);
  }


  public async completeGate3RepairAttempt(params: {
    tenantId: string;
    appId: string;
    repairAttemptId: string;
    repairResult: GeneratedAppGate3RepairResult;
  }): Promise<GeneratedAppRepairAttemptResponseDto> {
    const completedAt = new Date();
    const [attempt] = await this.repository.tenantDb
      .update(schema.generatedAppRepairAttempts)
      .set({
        status:
          params.repairResult.status === 'passed' ? 'completed' : 'failed',
        changeSummary: limitRepairAttemptText(
          params.repairResult.changeSummary,
        ),
        verificationSummary: limitRepairAttemptText(
          params.repairResult.verificationSummary,
        ),
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, params.repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, params.tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, params.appId),
        ),
      )
      .returning();

    if (!attempt) {
      throw new GeneratedAppRepairAttemptNotFoundException(
        params.repairAttemptId,
      );
    }

    return this.repository.toRepairAttemptResponseDto(attempt);
  }


  public buildFailedGateRepairPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppRepairPlan {
    const gateDefinition = getGeneratedAppGateDefinition(failedGateRun.gateId);
    const evidenceIds = failedGateRun.evidence.map((item) => item.id);
    const evidenceSummaries = failedGateRun.evidence
      .map((item) => limitRepairAttemptText(item.summary))
      .filter((summary) => summary.length > 0)
      .slice(0, 12);

    const basePlan: GeneratedAppRepairPlan = {
      planVersion: 1,
      source: 'automatic-failed-gate-work-order',
      targetGateId: failedGateRun.gateId,
      targetGateName: gateDefinition?.name ?? failedGateRun.gateName,
      failureCode: failedGateRun.failure?.code ?? null,
      failureSummary: limitRepairAttemptText(
        failedGateRun.failure?.message ?? failedGateRun.summary,
      ),
      repairInstructions: failedGateRun.repairInstructions
        ? limitRepairAttemptText(failedGateRun.repairInstructions)
        : null,
      evidenceIds,
      evidenceSummaries,
      allowedChangeScopes: this.resolveRepairAllowedChangeScopes(
        failedGateRun.gateId,
      ),
      forbiddenChangeScopes: [
        'tenant-boundary',
        'public-share-token',
        'host-absolute-path',
        'production-credentials',
        'external-network-without-permission',
        'unrelated-gate-rewrite',
      ],
      patchTargets: this.resolveRepairPatchTargets(failedGateRun.gateId),
      requiredTraceability: [
        'repair-plan-target-gate',
        'failed-evidence-citation',
        'patch-target-to-reverification-command',
        'post-patch-gate-evidence',
        ...(failedGateRun.gateId === 'gate-5'
          ? [
              'public-runtime-journey-to-acceptance-scenario',
              'browser-e2e-failure-to-runtime-form-or-preview-handoff',
            ]
          : []),
      ],
      generatedAt: generatedAt.toISOString(),
    };

    return failedGateRun.gateId === 'gate-5'
      ? {
          ...basePlan,
          browserRepairTargets: [
            {
              targetId: 'public-runtime-form',
              path: 'generationWorkspace.files.src/generated-app/runtime-form.ts',
              reason:
                'Gate 5 open/fill/submit failures often come from missing generated fields, invalid required validation, or unsectioned runtimeForm fields.',
            },
            {
              targetId: 'public-preview-html',
              path: 'generationWorkspace.files.dist/index.html',
              reason:
                'Public build preview must derive token only from the preview route and submit/poll through same-origin public APIs.',
            },
            {
              targetId: 'public-submission-handoff',
              path: 'publicPreviewSubmissionHandoff',
              reason:
                'The generated frontend must hand off public submissions to POST/GET /generated-apps/public/:token/submissions without creator APIs.',
            },
            {
              targetId: 'workflow-output-summary',
              path: 'workflowRuntimeBinding.outputSummaryMapping',
              reason:
                'Public report/detail views may only use sanitized workflow output summaries, not snapshots, raw steps or checkpoint data.',
            },
            {
              targetId: 'plugin-output-summary',
              path: 'pluginTools.publicOutputSummaryMapping',
              reason:
                'Generated private plugin output may surface only as sanitized business summary, never plugin ids or raw tool data.',
            },
          ],
          e2eRunnerContract: {
            mode: 'real-browser-e2e',
            command: GATE_5_REAL_BROWSER_E2E_COMMAND,
            journey: 'open -> fill -> submit -> detail/report',
            allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
            forbiddenEndpointPatterns: [
              '/generated-apps/{appId}',
              '/generated-apps/{appId}/artifacts',
              '/generated-apps/{appId}/generation-runs',
              '/generated-apps/{appId}/gate-runs',
              '/generated-apps/{appId}/submissions',
              '/workflow-definitions',
              '/executions',
              '/plugins',
              '/internal',
              '/settings',
            ],
            requiredFailureEvidence: [
              'redacted console summary',
              'redacted network summary',
              'journey/action trace without token values',
              'generated-run relative screenshot/video/trace refs when captured',
              'assertionId/journeyId/viewportId/scenarioIds/requirementIds',
            ],
            forbiddenEvidenceFields: [
              'publicShareToken',
              'pluginIds',
              'workflowSnapshots',
              'stepData',
              'checkpointData',
              'rawToolData',
              'hostAbsolutePath',
              'apiKey',
              'secret',
            ],
          },
        }
      : basePlan;
  }


  public buildFailedGateReverificationPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppReverificationPlan {
    return {
      planVersion: 1,
      targetGateId: failedGateRun.gateId,
      requiredGateIds: this.resolveReverificationGateIds(failedGateRun.gateId),
      requiredCommandIds: this.resolveReverificationCommandIds(
        failedGateRun.gateId,
      ),
      requiredEvidenceIds: failedGateRun.evidence.map((item) => item.id),
      successCriteria: [
        `${failedGateRun.gateId} must be recorded as passed before later gates can run.`,
        'All new gate evidence must cite the failed evidence or command output that drove the patch.',
        'No host absolute paths, public share tokens, production credentials, or unrelated gate rewrites may appear in repair evidence.',
        ...(failedGateRun.gateId === 'gate-5'
          ? [
              'Gate 5 real-browser-e2e evidence must not be replaced by fixture or local contract evidence when true E2E was requested.',
              'Public runtime open -> fill -> submit -> detail/report journey must pass against only public token endpoints.',
              'Repair evidence must redact public token values, plugin ids, workflow snapshots, raw steps, checkpoints and tool data.',
            ]
          : []),
      ],
      blockedUntilPatchApplied: true,
      generatedAt: generatedAt.toISOString(),
    };
  }


  public resolveRepairAllowedChangeScopes(
    gateId: string,
  ): GeneratedAppRepairPlan['allowedChangeScopes'] {
    switch (gateId) {
      case 'gate-0':
        return ['app-spec', 'test-contracts'];
      case 'gate-1':
        return ['generation-plan', 'test-contracts'];
      case 'gate-2':
        return [
          'static-contracts',
          'generation-plan',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-3':
        return [
          'frontend-workspace',
          'static-contracts',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-4':
        return [
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-5':
        return [
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-6':
        return [
          'app-spec',
          'generation-plan',
          'static-contracts',
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-7':
        return ['publish-contract', 'test-contracts'];
      default:
        return ['test-contracts'];
    }
  }


  public resolveRepairPatchTargets(gateId: string): string[] {
    switch (gateId) {
      case 'gate-0':
        return ['generated_apps.app_spec'];
      case 'gate-1':
        return ['generated_apps.generation_plan'];
      case 'gate-2':
        return ['generated_apps.generation_plan.staticContracts'];
      case 'gate-3':
        return [
          'generationWorkspace.files',
          'generationWorkspace.commandPlan',
          'generationWorkspace.artifactPaths',
          'generated_apps.generation_plan.buildUnitPlan',
        ];
      case 'gate-4':
        return ['generated_apps.generation_plan.integrationPlan'];
      case 'gate-5':
        return [
          'generated_apps.generation_plan.browserAcceptancePlan',
          'generationWorkspace.files.src/App.tsx',
          'generationWorkspace.files.src/generated-app/runtime-form.ts',
          'generationWorkspace.files.src/generated-app/runtime.ts',
          'generationWorkspace.files.src/generated-app/static-contracts.ts',
          'generationWorkspace.files.dist/index.html',
          'publicPreviewSubmissionHandoff',
          'publicRuntimeSubmissionDetailHandoff',
          'workflowRuntimeBinding.outputSummaryMapping',
          'pluginTools.publicOutputSummaryMapping',
        ];
      case 'gate-6':
        return ['generated_apps.generation_plan.independentVerificationPlan'];
      case 'gate-7':
        return ['generated_apps.generation_plan.publishCandidatePlan'];
      default:
        return ['generated_apps.generation_plan'];
    }
  }


  public resolveReverificationGateIds(gateId: string): string[] {
    const gateDefinition = getGeneratedAppGateDefinition(gateId);

    if (!gateDefinition) {
      return [gateId];
    }

    return [`gate-${gateDefinition.order}`];
  }


  public resolveReverificationCommandIds(gateId: string): string[] {
    switch (gateId) {
      case 'gate-3':
        return [...GATE_3_REQUIRED_COMMAND_IDS];
      case 'gate-4':
        return ['agentloom generated-app gate-4 local-integration'];
      case 'gate-5':
        return [
          'agentloom generated-app gate-5 local-browser-contract',
          'agentloom generated-app gate-5 real-browser-e2e',
        ];
      case 'gate-6':
        return ['agentloom generated-app gate-6 local-independent-verifier'];
      case 'gate-7':
        return ['agentloom generated-app gate-7 publish-candidate'];
      default:
        return [];
    }
  }


  public async resolveLatestFailedRepairContext(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppGenerationRepairContext | null> {
    const [attempt] = await this.repository.tenantDb
      .select()
      .from(schema.generatedAppRepairAttempts)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
          eq(schema.generatedAppRepairAttempts.status, 'failed'),
        ),
      )
      .orderBy(desc(schema.generatedAppRepairAttempts.createdAt))
      .limit(1);

    if (!attempt) {
      return null;
    }

    return {
      source: 'previous-failed-repair-attempt',
      sourceGenerationRunId: attempt.generationRunId,
      sourceRepairAttemptId: attempt.id,
      targetGateId: attempt.targetGateId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      failureSummary: limitRepairAttemptText(attempt.failureSummary),
      changeSummary: attempt.changeSummary
        ? limitRepairAttemptText(attempt.changeSummary)
        : null,
      verificationSummary: attempt.verificationSummary
        ? limitRepairAttemptText(attempt.verificationSummary)
        : null,
      repairPlan: this.repository.getRepairPlanOrNull(attempt.repairPlan),
      reverificationPlan: this.repository.getReverificationPlanOrNull(
        attempt.reverificationPlan,
      ),
      capturedAt: new Date().toISOString(),
    };
  }
}
