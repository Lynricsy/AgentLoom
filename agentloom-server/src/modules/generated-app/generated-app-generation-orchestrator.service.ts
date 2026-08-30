// 本文件负责 startGenerationRun 的 Gate 0-7 状态机与 generation run 终态保证。

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
import { GeneratedAppGenerationRepairService } from './generated-app-generation-repair.service';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';

export async function runGenerationToTerminal<T>(
  runGates: (markTerminalPersisted: () => void) => Promise<T>,
  persistFailure: () => Promise<void>,
): Promise<T> {
  let terminalPersisted = false;
  try {
    return await runGates(() => {
      terminalPersisted = true;
    });
  } finally {
    if (!terminalPersisted) await persistFailure();
  }
}

@Injectable()
export class GeneratedAppGenerationOrchestratorService {
  private readonly gate3WorkspaceRunner: GeneratedAppGate3WorkspaceRunner;
  private readonly gate4IntegrationRunner: GeneratedAppGate4IntegrationRunner;
  private readonly gate5BrowserAcceptanceRunner: GeneratedAppGate5BrowserAcceptanceRunner;
  private readonly gate6IndependentVerifierRunner: GeneratedAppGate6IndependentVerifierRunner;
  private readonly gate7PublishCandidateRunner: GeneratedAppGate7PublishCandidateRunner;
  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly repairService: GeneratedAppGenerationRepairService,
    private readonly runtimeBindingService: GeneratedAppRuntimeBindingService,
    configService: ConfigService,
    @Optional() gate3WorkspaceRunner?: GeneratedAppGate3WorkspaceRunner,
    @Optional() gate4IntegrationRunner?: GeneratedAppGate4IntegrationRunner,
    @Optional()
    gate5BrowserAcceptanceRunner?: GeneratedAppGate5BrowserAcceptanceRunner,
    @Optional()
    gate6IndependentVerifierRunner?: GeneratedAppGate6IndependentVerifierRunner,
    @Optional()
    gate7PublishCandidateRunner?: GeneratedAppGate7PublishCandidateRunner,
  ) {
    this.gate3WorkspaceRunner =
      gate3WorkspaceRunner ??
      new GeneratedAppGate3WorkspaceRunner(configService);
    this.gate4IntegrationRunner =
      gate4IntegrationRunner ??
      new GeneratedAppGate4IntegrationRunner(configService);
    this.gate5BrowserAcceptanceRunner =
      gate5BrowserAcceptanceRunner ??
      new GeneratedAppGate5BrowserAcceptanceRunner(configService);
    this.gate6IndependentVerifierRunner =
      gate6IndependentVerifierRunner ??
      new GeneratedAppGate6IndependentVerifierRunner(configService);
    this.gate7PublishCandidateRunner =
      gate7PublishCandidateRunner ??
      new GeneratedAppGate7PublishCandidateRunner(configService);
  }

  async startGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<StartGeneratedAppGenerationRunResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const parsed = StartGeneratedAppGenerationRunSchema.parse(dto);
    const startedAt = new Date();
    const runNumber = await this.repository.resolveNextGenerationRunNumber(
      tenantId,
      appId,
    );

    const [run] = await this.repository.tenantDb
      .insert(schema.generatedAppGenerationRuns)
      .values({
        tenantId,
        generatedAppId: appId,
        runNumber,
        status: 'running',
        triggerSource: parsed.triggerSource,
        maxRepairAttempts: parsed.maxRepairAttempts,
        maxRuntimeSeconds: parsed.maxRuntimeSeconds,
        summary: '门禁运行器骨架已启动，正在执行 Gate 0 AppSpec 完整性检查。',
        failureReason: null,
        startedAt,
        completedAt: null,
        createdBy: userId,
      })
      .returning();
    return runGenerationToTerminal(
      async (markTerminalPersisted) => {
        const retryRepairContext =
          parsed.triggerSource === 'retry'
            ? await this.repairService.resolveLatestFailedRepairContext(
                tenantId,
                appId,
              )
            : null;

        const gate0Evaluation = evaluateGate0AppSpec(app.appSpec);
        const gateCompletedAt = new Date();
        const gateRunResult = await this.repository.createGateRunAndUpdateApp(
          tenantId,
          userId,
          app,
          {
            gateId: 'gate-0',
            generationRunId: run.id,
            attemptNumber: 1,
            status: gate0Evaluation.status,
            summary: gate0Evaluation.summary,
            evidence: gate0Evaluation.evidence,
            failure: gate0Evaluation.failure,
            repairInstructions: gate0Evaluation.repairInstructions,
            startedAt: startedAt.toISOString(),
            completedAt: gateCompletedAt.toISOString(),
          },
          {
            buildGateResults: (gateResult, nowIso) =>
              this.repository.buildRunnerGateResults(app, [gateResult], nowIso),
          },
        );
        const producedGateRuns: GeneratedAppGateRunResponseDto[] = [
          gateRunResult.gateRun,
        ];
        const automaticRepairGateRunIdsToExclude = new Set<string>();
        let latestApp = gateRunResult.app;
        let finalFailureReason: string | null =
          gate0Evaluation.failure?.message ??
          'Gate 0 AppSpec 完整性检查失败，不能继续执行 Gate 1 架构计划门禁。';
        let completedSummary =
          '门禁运行器骨架在 Gate 0 AppSpec 完整性检查失败；当前应用保持不可发布。';
        let completedAt = gateCompletedAt;
        let completedStatus: schema.GeneratedAppGenerationRunStatus = 'failed';

        if (gate0Evaluation.status === 'passed') {
          const generationPlan = buildGenerationPlan(
            app.appSpec,
            retryRepairContext,
          );
          const gate1Evaluation = evaluateGate1GenerationPlan(
            app.appSpec,
            generationPlan,
          );
          const gate0Result = latestApp.gateResults.find(
            (gate) => gate.gateId === 'gate-0',
          );
          const gate1StartedAt = new Date();
          const gate1CompletedAt = new Date();
          const gate1AppSnapshot: GeneratedApp = {
            ...app,
            gateResults: latestApp.gateResults,
            generationPlan: latestApp.generationPlan,
          };
          const gate1RunResult =
            await this.repository.createGateRunAndUpdateApp(
              tenantId,
              userId,
              gate1AppSnapshot,
              {
                gateId: 'gate-1',
                generationRunId: run.id,
                attemptNumber: 1,
                status: gate1Evaluation.status,
                summary: gate1Evaluation.summary,
                evidence: gate1Evaluation.evidence,
                failure: gate1Evaluation.failure,
                repairInstructions: gate1Evaluation.repairInstructions,
                startedAt: gate1StartedAt.toISOString(),
                completedAt: gate1CompletedAt.toISOString(),
              },
              {
                generationPlan,
                buildGateResults: (gate1Result, nowIso) =>
                  this.repository.buildRunnerGateResults(
                    app,
                    gate0Result ? [gate0Result, gate1Result] : [gate1Result],
                    nowIso,
                  ),
              },
            );

          producedGateRuns.push(gate1RunResult.gateRun);
          latestApp = gate1RunResult.app;
          completedAt = gate1CompletedAt;

          if (gate1Evaluation.status === 'failed') {
            finalFailureReason =
              gate1Evaluation.failure?.message ??
              'Gate 1 架构计划门禁失败，不能继续执行 Gate 2-7。';
            completedSummary =
              '门禁运行器骨架完成 Gate 0，但 Gate 1 架构计划门禁失败；当前应用保持不可发布。';
          } else {
            const staticContracts = buildStaticContracts(
              app.appSpec,
              generationPlan,
            );
            const generationPlanWithStaticContracts: GeneratedAppGenerationPlan =
              {
                ...generationPlan,
                staticContracts,
              };
            const gate2Evaluation = evaluateGate2StaticContracts(
              app.appSpec,
              generationPlan,
              staticContracts,
            );
            const gate1Result = latestApp.gateResults.find(
              (gate) => gate.gateId === 'gate-1',
            );
            const gate2StartedAt = new Date();
            const gate2CompletedAt = new Date();
            const gate2AppSnapshot: GeneratedApp = {
              ...app,
              gateResults: latestApp.gateResults,
              generationPlan: latestApp.generationPlan,
            };
            const gate2RunResult =
              await this.repository.createGateRunAndUpdateApp(
                tenantId,
                userId,
                gate2AppSnapshot,
                {
                  gateId: 'gate-2',
                  generationRunId: run.id,
                  attemptNumber: 1,
                  status: gate2Evaluation.status,
                  summary: gate2Evaluation.summary,
                  evidence: gate2Evaluation.evidence,
                  failure: gate2Evaluation.failure,
                  repairInstructions: gate2Evaluation.repairInstructions,
                  startedAt: gate2StartedAt.toISOString(),
                  completedAt: gate2CompletedAt.toISOString(),
                },
                {
                  generationPlan: generationPlanWithStaticContracts,
                  buildGateResults: (gate2Result, nowIso) =>
                    this.repository.buildRunnerGateResults(
                      app,
                      [
                        ...(gate0Result ? [gate0Result] : []),
                        ...(gate1Result ? [gate1Result] : []),
                        gate2Result,
                      ],
                      nowIso,
                    ),
                },
              );

            producedGateRuns.push(gate2RunResult.gateRun);
            latestApp = gate2RunResult.app;
            completedAt = gate2CompletedAt;

            if (gate2Evaluation.status === 'failed') {
              finalFailureReason =
                gate2Evaluation.failure?.message ??
                'Gate 2 静态合约门禁失败，不能继续执行 Gate 3-7。';
              completedSummary =
                '门禁运行器骨架完成 Gate 0 和 Gate 1，但 Gate 2 静态合约门禁失败；当前应用保持不可发布。';
            } else {
              const gate3Workspace =
                this.gate3WorkspaceRunner.buildWorkspaceContract({
                  tenantId,
                  appId,
                  generationRunId: run.id,
                  appSpec: app.appSpec,
                  staticContracts,
                });
              const gate3CommandPlan =
                this.gate3WorkspaceRunner.buildCommandPlan({
                  workspace: gate3Workspace,
                  requirementIds: app.appSpec.coreRequirements.map(
                    (requirement) => requirement.id,
                  ),
                  scenarioIds: app.appSpec.acceptanceScenarios.map(
                    (scenario) => scenario.id,
                  ),
                });
              const buildUnitPlan = buildBuildUnitPlan(
                app.appSpec,
                generationPlan,
                staticContracts,
                gate3Workspace,
                gate3CommandPlan,
                this.gate3WorkspaceRunner.getExecutionLevel(),
              );
              const generationPlanWithBuildUnitPlan: GeneratedAppGenerationPlan =
                {
                  ...generationPlanWithStaticContracts,
                  buildUnitPlan,
                };
              let gate3Evaluation = evaluateGate3BuildUnitPlan(
                app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
              );
              if (gate3Evaluation.status === 'passed') {
                gate3Evaluation =
                  await this.gate3WorkspaceRunner.materializeAndRun({
                    tenantId,
                    appId,
                    generationRunId: run.id,
                    appSpec: app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    workspace: gate3Workspace,
                    commandPlan: gate3CommandPlan,
                  });
              }
              const gate2Result = latestApp.gateResults.find(
                (gate) => gate.gateId === 'gate-2',
              );
              const gate3StartedAt = new Date();
              const gate3CompletedAt = new Date();
              const gate3AppSnapshot: GeneratedApp = {
                ...app,
                gateResults: latestApp.gateResults,
                generationPlan: latestApp.generationPlan,
              };
              const gate3RunResult =
                await this.repository.createGateRunAndUpdateApp(
                  tenantId,
                  userId,
                  gate3AppSnapshot,
                  {
                    gateId: 'gate-3',
                    generationRunId: run.id,
                    attemptNumber: 1,
                    status: gate3Evaluation.status,
                    summary: gate3Evaluation.summary,
                    evidence: gate3Evaluation.evidence,
                    failure: gate3Evaluation.failure,
                    repairInstructions: gate3Evaluation.repairInstructions,
                    startedAt: gate3StartedAt.toISOString(),
                    completedAt: gate3CompletedAt.toISOString(),
                  },
                  {
                    generationPlan: generationPlanWithBuildUnitPlan,
                    buildGateResults: (gate3Result, nowIso) =>
                      this.repository.buildRunnerGateResults(
                        app,
                        [
                          ...(gate0Result ? [gate0Result] : []),
                          ...(gate1Result ? [gate1Result] : []),
                          ...(gate2Result ? [gate2Result] : []),
                          gate3Result,
                        ],
                        nowIso,
                      ),
                  },
                );

              producedGateRuns.push(gate3RunResult.gateRun);
              latestApp = gate3RunResult.app;
              completedAt = gate3CompletedAt;

              if (
                gate3Evaluation.status === 'failed' &&
                parsed.maxRepairAttempts > 0 &&
                buildUnitPlan.executionLevel === 'real-local-command-plan'
              ) {
                const repairAttempt =
                  await this.repairService.createRunningGate3RepairAttempt({
                    tenantId,
                    userId,
                    appId,
                    generationRunId: run.id,
                    failedGateRun: gate3RunResult.gateRun,
                  });
                const repairResult =
                  await this.gate3WorkspaceRunner.applyRepairPatchAndRun({
                    tenantId,
                    appId,
                    generationRunId: run.id,
                    appSpec: app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    workspace: gate3Workspace,
                    commandPlan: gate3CommandPlan,
                    repairPlan: repairAttempt.repairPlan!,
                    reverificationPlan: repairAttempt.reverificationPlan!,
                  });
                const repairStartedAt = new Date();
                const repairCompletedAt = new Date();
                const gate3RepairRunResult =
                  await this.repository.createGateRunAndUpdateApp(
                    tenantId,
                    userId,
                    {
                      ...app,
                      gateResults: latestApp.gateResults,
                      generationPlan: latestApp.generationPlan,
                    },
                    {
                      gateId: 'gate-3',
                      generationRunId: run.id,
                      repairAttemptId: repairAttempt.id,
                      attemptNumber: 2,
                      status: repairResult.status,
                      summary: repairResult.summary,
                      evidence: repairResult.evidence,
                      failure: repairResult.failure,
                      repairInstructions: repairResult.repairInstructions,
                      startedAt: repairStartedAt.toISOString(),
                      completedAt: repairCompletedAt.toISOString(),
                    },
                    {
                      generationPlan: generationPlanWithBuildUnitPlan,
                      buildGateResults: (gate3RepairResult, nowIso) =>
                        this.repository.buildRunnerGateResults(
                          app,
                          [
                            ...(gate0Result ? [gate0Result] : []),
                            ...(gate1Result ? [gate1Result] : []),
                            ...(gate2Result ? [gate2Result] : []),
                            gate3RepairResult,
                          ],
                          nowIso,
                        ),
                    },
                  );

                await this.repairService.completeGate3RepairAttempt({
                  tenantId,
                  appId,
                  repairAttemptId: repairAttempt.id,
                  repairResult,
                });

                producedGateRuns.push(gate3RepairRunResult.gateRun);
                latestApp = gate3RepairRunResult.app;
                completedAt = repairCompletedAt;
                automaticRepairGateRunIdsToExclude.add(
                  gate3RunResult.gateRun.id,
                );
                automaticRepairGateRunIdsToExclude.add(
                  gate3RepairRunResult.gateRun.id,
                );
                gate3Evaluation = repairResult;
              }

              if (gate3Evaluation.status === 'failed') {
                finalFailureReason =
                  gate3Evaluation.failure?.message ??
                  'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。';
                completedSummary = automaticRepairGateRunIdsToExclude.has(
                  gate3RunResult.gateRun.id,
                )
                  ? '门禁运行器完成 Gate 0、Gate 1 和 Gate 2；Gate 3 自动修复补丁已尝试并重新验证，但 Gate 3 仍失败；Gate 4-7 未执行，当前应用保持不可发布。'
                  : '门禁运行器完成 Gate 0、Gate 1 和 Gate 2，但 Gate 3 Generation Workspace、构建/单元执行或 buildUnitPlan 检查失败；Gate 4-7 未执行，当前应用保持不可发布。';
              } else {
                const integrationPlan = buildIntegrationPlan(
                  app.appSpec,
                  generationPlan,
                  staticContracts,
                  buildUnitPlan,
                  this.gate4IntegrationRunner.getExecutionLevel(),
                );
                const generationPlanWithIntegrationPlan: GeneratedAppGenerationPlan =
                  {
                    ...generationPlanWithBuildUnitPlan,
                    integrationPlan,
                  };
                let gate4Evaluation = evaluateGate4IntegrationPlan(
                  app.appSpec,
                  generationPlan,
                  staticContracts,
                  buildUnitPlan,
                  integrationPlan,
                );
                if (gate4Evaluation.status === 'passed') {
                  gate4Evaluation = this.gate4IntegrationRunner.run({
                    appSpec: app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                  });
                }
                const gate3Result = latestApp.gateResults.find(
                  (gate) => gate.gateId === 'gate-3',
                );
                const gate4StartedAt = new Date();
                const gate4CompletedAt = new Date();
                const gate4AppSnapshot: GeneratedApp = {
                  ...app,
                  gateResults: latestApp.gateResults,
                  generationPlan: latestApp.generationPlan,
                };
                const gate4RunResult =
                  await this.repository.createGateRunAndUpdateApp(
                    tenantId,
                    userId,
                    gate4AppSnapshot,
                    {
                      gateId: 'gate-4',
                      generationRunId: run.id,
                      attemptNumber: 1,
                      status: gate4Evaluation.status,
                      summary: gate4Evaluation.summary,
                      evidence: gate4Evaluation.evidence,
                      failure: gate4Evaluation.failure,
                      repairInstructions: gate4Evaluation.repairInstructions,
                      startedAt: gate4StartedAt.toISOString(),
                      completedAt: gate4CompletedAt.toISOString(),
                    },
                    {
                      generationPlan: generationPlanWithIntegrationPlan,
                      buildGateResults: (gate4Result, nowIso) =>
                        this.repository.buildRunnerGateResults(
                          app,
                          [
                            ...(gate0Result ? [gate0Result] : []),
                            ...(gate1Result ? [gate1Result] : []),
                            ...(gate2Result ? [gate2Result] : []),
                            ...(gate3Result ? [gate3Result] : []),
                            gate4Result,
                          ],
                          nowIso,
                        ),
                    },
                  );

                producedGateRuns.push(gate4RunResult.gateRun);
                latestApp = gate4RunResult.app;
                completedAt = gate4CompletedAt;

                if (gate4Evaluation.status === 'failed') {
                  finalFailureReason =
                    gate4Evaluation.failure?.message ??
                    'Gate 4 集成门禁失败，不能继续执行 Gate 5-7。';
                  completedSummary =
                    '门禁运行器完成 Gate 0、Gate 1、Gate 2 和 Gate 3，但 Gate 4 integration runner 或 integrationPlan 检查失败；Gate 5-7 未执行，当前应用保持不可发布。';
                } else {
                  const browserAcceptancePlan = buildBrowserAcceptancePlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    this.gate5BrowserAcceptanceRunner.getExecutionLevel(),
                  );
                  const generationPlanWithBrowserAcceptancePlan: GeneratedAppGenerationPlan =
                    {
                      ...generationPlanWithIntegrationPlan,
                      browserAcceptancePlan,
                    };
                  let gate5Evaluation = evaluateGate5BrowserAcceptancePlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                  );
                  if (gate5Evaluation.status === 'passed') {
                    gate5Evaluation = this.gate5BrowserAcceptanceRunner.run({
                      appSpec: app.appSpec,
                      generationPlan,
                      staticContracts,
                      buildUnitPlan,
                      integrationPlan,
                      browserAcceptancePlan,
                    });
                  }
                  const gate4Result = latestApp.gateResults.find(
                    (gate) => gate.gateId === 'gate-4',
                  );
                  const gate5StartedAt = new Date();
                  const gate5CompletedAt = new Date();
                  const gate5AppSnapshot: GeneratedApp = {
                    ...app,
                    gateResults: latestApp.gateResults,
                    generationPlan: latestApp.generationPlan,
                  };
                  const gate5RunResult =
                    await this.repository.createGateRunAndUpdateApp(
                      tenantId,
                      userId,
                      gate5AppSnapshot,
                      {
                        gateId: 'gate-5',
                        generationRunId: run.id,
                        attemptNumber: 1,
                        status: gate5Evaluation.status,
                        summary: gate5Evaluation.summary,
                        evidence: gate5Evaluation.evidence,
                        failure: gate5Evaluation.failure,
                        repairInstructions: gate5Evaluation.repairInstructions,
                        startedAt: gate5StartedAt.toISOString(),
                        completedAt: gate5CompletedAt.toISOString(),
                      },
                      {
                        generationPlan: generationPlanWithBrowserAcceptancePlan,
                        buildGateResults: (gate5Result, nowIso) =>
                          this.repository.buildRunnerGateResults(
                            app,
                            [
                              ...(gate0Result ? [gate0Result] : []),
                              ...(gate1Result ? [gate1Result] : []),
                              ...(gate2Result ? [gate2Result] : []),
                              ...(gate3Result ? [gate3Result] : []),
                              ...(gate4Result ? [gate4Result] : []),
                              gate5Result,
                            ],
                            nowIso,
                          ),
                      },
                    );

                  producedGateRuns.push(gate5RunResult.gateRun);
                  latestApp = gate5RunResult.app;
                  completedAt = gate5CompletedAt;

                  if (gate5Evaluation.status === 'failed') {
                    finalFailureReason =
                      gate5Evaluation.failure?.message ??
                      'Gate 5 浏览器验收门禁失败，不能继续执行 Gate 6-7。';
                    completedSummary =
                      '门禁运行器完成 Gate 0、Gate 1、Gate 2、Gate 3 和 Gate 4，但 Gate 5 browser acceptance plan 或执行器检查失败；Gate 6-7 未执行，当前应用保持不可发布。';
                  } else {
                    const independentVerificationPlan =
                      buildIndependentVerificationPlan(
                        app.appSpec,
                        generationPlan,
                        staticContracts,
                        buildUnitPlan,
                        integrationPlan,
                        browserAcceptancePlan,
                        latestApp.gateResults,
                        this.gate6IndependentVerifierRunner.getExecutionLevel(),
                      );
                    const generationPlanWithIndependentVerificationPlan: GeneratedAppGenerationPlan =
                      {
                        ...generationPlanWithBrowserAcceptancePlan,
                        independentVerificationPlan,
                      };
                    let gate6Evaluation =
                      evaluateGate6IndependentVerificationPlan(
                        app.appSpec,
                        generationPlan,
                        staticContracts,
                        buildUnitPlan,
                        integrationPlan,
                        browserAcceptancePlan,
                        latestApp.gateResults,
                        independentVerificationPlan,
                      );
                    if (gate6Evaluation.status === 'passed') {
                      gate6Evaluation = this.gate6IndependentVerifierRunner.run(
                        {
                          appSpec: app.appSpec,
                          generationPlan,
                          staticContracts,
                          buildUnitPlan,
                          integrationPlan,
                          browserAcceptancePlan,
                          gateResults: latestApp.gateResults,
                          independentVerificationPlan,
                        },
                      );
                    }
                    const gate5Result = latestApp.gateResults.find(
                      (gate) => gate.gateId === 'gate-5',
                    );
                    const gate6StartedAt = new Date();
                    const gate6CompletedAt = new Date();
                    const gate6AppSnapshot: GeneratedApp = {
                      ...app,
                      gateResults: latestApp.gateResults,
                      generationPlan: latestApp.generationPlan,
                    };
                    const gate6RunResult =
                      await this.repository.createGateRunAndUpdateApp(
                        tenantId,
                        userId,
                        gate6AppSnapshot,
                        {
                          gateId: 'gate-6',
                          generationRunId: run.id,
                          attemptNumber: 1,
                          status: gate6Evaluation.status,
                          summary: gate6Evaluation.summary,
                          evidence: gate6Evaluation.evidence,
                          failure: gate6Evaluation.failure,
                          repairInstructions:
                            gate6Evaluation.repairInstructions,
                          startedAt: gate6StartedAt.toISOString(),
                          completedAt: gate6CompletedAt.toISOString(),
                        },
                        {
                          generationPlan:
                            generationPlanWithIndependentVerificationPlan,
                          buildGateResults: (gate6Result, nowIso) =>
                            this.repository.buildRunnerGateResults(
                              app,
                              [
                                ...(gate0Result ? [gate0Result] : []),
                                ...(gate1Result ? [gate1Result] : []),
                                ...(gate2Result ? [gate2Result] : []),
                                ...(gate3Result ? [gate3Result] : []),
                                ...(gate4Result ? [gate4Result] : []),
                                ...(gate5Result ? [gate5Result] : []),
                                gate6Result,
                              ],
                              nowIso,
                            ),
                        },
                      );

                    producedGateRuns.push(gate6RunResult.gateRun);
                    latestApp = gate6RunResult.app;
                    completedAt = gate6CompletedAt;

                    if (gate6Evaluation.status === 'failed') {
                      finalFailureReason =
                        gate6Evaluation.failure?.message ??
                        'Gate 6 独立审查计划或执行器失败，不能继续执行 Gate 7。';
                      completedSummary =
                        '门禁运行器完成 Gate 0、Gate 1、Gate 2、Gate 3、Gate 4 和 Gate 5，但 Gate 6 independent verifier 计划或执行器失败；当前应用保持不可发布。';
                    } else {
                      const publishCandidatePlan = buildPublishCandidatePlan(
                        app.appSpec,
                        generationPlan,
                        staticContracts,
                        buildUnitPlan,
                        integrationPlan,
                        browserAcceptancePlan,
                        independentVerificationPlan,
                        latestApp.gateResults,
                        this.gate7PublishCandidateRunner.getExecutionLevel(),
                      );
                      const generationPlanWithPublishCandidatePlan: GeneratedAppGenerationPlan =
                        {
                          ...generationPlanWithIndependentVerificationPlan,
                          publishCandidatePlan,
                        };
                      let gate7Evaluation = evaluateGate7PublishCandidatePlan(
                        app.appSpec,
                        generationPlan,
                        staticContracts,
                        buildUnitPlan,
                        integrationPlan,
                        browserAcceptancePlan,
                        independentVerificationPlan,
                        latestApp.gateResults,
                        publishCandidatePlan,
                      );
                      if (gate7Evaluation.status === 'passed') {
                        gate7Evaluation = this.gate7PublishCandidateRunner.run({
                          appSpec: app.appSpec,
                          generationPlan,
                          staticContracts,
                          buildUnitPlan,
                          integrationPlan,
                          browserAcceptancePlan,
                          independentVerificationPlan,
                          gateResults: latestApp.gateResults,
                          publishCandidatePlan,
                        });
                      }
                      const gate6Result = latestApp.gateResults.find(
                        (gate) => gate.gateId === 'gate-6',
                      );
                      const gate7StartedAt = new Date();
                      const gate7CompletedAt = new Date();
                      const gate7AppSnapshot: GeneratedApp = {
                        ...app,
                        gateResults: latestApp.gateResults,
                        generationPlan: latestApp.generationPlan,
                      };
                      const gate7RunResult =
                        await this.repository.createGateRunAndUpdateApp(
                          tenantId,
                          userId,
                          gate7AppSnapshot,
                          {
                            gateId: 'gate-7',
                            generationRunId: run.id,
                            attemptNumber: 1,
                            status: gate7Evaluation.status,
                            summary: gate7Evaluation.summary,
                            evidence: gate7Evaluation.evidence,
                            failure: gate7Evaluation.failure,
                            repairInstructions:
                              gate7Evaluation.repairInstructions,
                            startedAt: gate7StartedAt.toISOString(),
                            completedAt: gate7CompletedAt.toISOString(),
                          },
                          {
                            generationPlan:
                              generationPlanWithPublishCandidatePlan,
                            buildGateResults: (gate7Result, nowIso) =>
                              this.repository.buildRunnerGateResults(
                                app,
                                [
                                  ...(gate0Result ? [gate0Result] : []),
                                  ...(gate1Result ? [gate1Result] : []),
                                  ...(gate2Result ? [gate2Result] : []),
                                  ...(gate3Result ? [gate3Result] : []),
                                  ...(gate4Result ? [gate4Result] : []),
                                  ...(gate5Result ? [gate5Result] : []),
                                  ...(gate6Result ? [gate6Result] : []),
                                  gate7Result,
                                ],
                                nowIso,
                              ),
                          },
                        );

                      producedGateRuns.push(gate7RunResult.gateRun);
                      latestApp = gate7RunResult.app;
                      completedAt = gate7CompletedAt;
                      if (gate7Evaluation.status === 'passed') {
                        latestApp =
                          await this.runtimeBindingService.ensureGeneratedPrivatePluginBindings(
                            tenantId,
                            userId,
                            latestApp,
                          );
                        latestApp =
                          await this.runtimeBindingService.ensureGeneratedWorkflowRuntimeBinding(
                            tenantId,
                            userId,
                            latestApp,
                            run.id,
                          );
                        completedStatus = 'passed';
                        finalFailureReason = null;
                        completedSummary =
                          '门禁运行器完成 Gate 0-7；Gate 7 real-local publish candidate contract runner 已签收 release manifest contract、artifact checksum placeholders、Gate 0-6 evidence citations 和 deferred public-share controls，并创建或复用已发布 Generated App runtime Workflow，注册/激活通过硬门槛的租户私有生成插件；当前应用进入 publish_candidate，但不会自动创建 public share token。';
                      } else {
                        finalFailureReason =
                          gate7Evaluation.failure?.message ??
                          GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON;
                        completedSummary = buildGate7CompletedRunSummary(
                          buildUnitPlan,
                          integrationPlan,
                          browserAcceptancePlan,
                          independentVerificationPlan,
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (completedStatus === 'failed') {
          await this.repairService.recordAutomaticRepairAttemptForFailedRun({
            tenantId,
            userId,
            appId,
            generationRunId: run.id,
            maxRepairAttempts: parsed.maxRepairAttempts,
            gateRuns: producedGateRuns,
            excludeGateRunIds: [...automaticRepairGateRunIdsToExclude],
          });
        }

        const [completedRun] = await this.repository.tenantDb
          .update(schema.generatedAppGenerationRuns)
          .set({
            status: completedStatus,
            summary: completedSummary,
            failureReason: finalFailureReason,
            completedAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.generatedAppGenerationRuns.id, run.id),
              eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
              eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
            ),
          )
          .returning();

        if (!completedRun) {
          throw new GeneratedAppGenerationRunNotFoundException(run.id);
        }

        markTerminalPersisted();

        return {
          generationRun:
            this.repository.toGenerationRunResponseDto(completedRun),
          gateRuns: producedGateRuns,
          app: latestApp,
        };
      },
      async () => {
        await this.repository.markGenerationRunFailed({
          tenantId,
          appId,
          runId: run.id,
          summary:
            '门禁运行器异常中止；generation run 已由终态保护标记为失败。',
          failureReason:
            '门禁运行器在完成全部 Gate 前抛出异常，请检查 Gate runner 日志。',
          completedAt: new Date(),
        });
      },
    );
  }
}
