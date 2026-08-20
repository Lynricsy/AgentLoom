import { ConfigService } from '@nestjs/config';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import * as crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeContentHash as computePluginArchiveContentHash,
  readArchiveManifest,
  verifyArchiveSignature as verifyPluginArchiveSignature,
} from '@agentloom/plugin-sdk';
import JSZip from 'jszip';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppGateRun,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppReadiness,
  GeneratedAppRepairPlan,
  GeneratedAppRepairAttempt,
  GeneratedAppReverificationPlan,
  GeneratedAppStaticContracts,
  GeneratedAppSubmission,
  WorkflowDefinition,
} from '../../../database/schema';
import {
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppSubmissionNotFoundException,
} from '../generated-app.exceptions';
import * as generationPlanBuilder from '../plan-builders/generation-plan.builder';
import * as integrationPlanBuilder from '../plan-builders/integration-plan.builder';
import * as browserAcceptancePlanBuilder from '../plan-builders/browser-acceptance-plan.builder';
import * as independentVerificationPlanBuilder from '../plan-builders/independent-verification-plan.builder';
import * as publishCandidatePlanBuilder from '../plan-builders/publish-candidate-plan.builder';
import {
  buildBuildUnitPlan,
  buildGenerationPlan,
  buildStaticContracts,
} from '../plan-builders/generation-plan.builder';
import { buildIntegrationPlan } from '../plan-builders/integration-plan.builder';
import { buildBrowserAcceptancePlan } from '../plan-builders/browser-acceptance-plan.builder';
import { buildIndependentVerificationPlan } from '../plan-builders/independent-verification-plan.builder';
import { buildPublishCandidatePlan } from '../plan-builders/publish-candidate-plan.builder';
import { GeneratedAppGate7PublishCandidateRunner } from '../generated-app.publish-candidate-runner';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppService } from '../generated-app.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import { GeneratedAppGenerationRepairService } from '../generated-app-generation-repair.service';
import { GeneratedAppGenerationOrchestratorService } from '../generated-app-generation-orchestrator.service';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import type { ExecutionService } from '../../execution/execution.service';
import type { StorageService } from '../../../infrastructure/storage/storage.service';
import type { PluginService } from '../../plugin/plugin.service';
import { PluginSandboxService } from '../../plugin/plugin-sandbox.service';
import {
  GeneratedAppGate4IntegrationRunner,
  type GeneratedAppGate4RunnerResult,
} from '../generated-app.integration-runner';
import type { GeneratedAppResponseDto } from '../dto';
import { GeneratedAppPublicController } from '../generated-app.controller';
import {
  GeneratedAppGate3WorkspaceRunner,
  type GeneratedAppGate3RepairResult,
  type GeneratedAppGate3RunnerResult,
} from '../generated-app.workspace';

import {
  TENANT_ID,
  USER_ID,
  APP_ID,
  GENERATION_RUN_ID,
  GATE_RUN_ID,
  GATE_5_RUN_ID,
  REPAIR_ATTEMPT_ID,
  NOW,
  createConfigService,
  createGate3RepairResult,
  createInsertReturningChain,
  createUpdateReturningChain,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createRepairServiceForTest,
  createGeneratedAppGateRun,
  createGeneratedAppRepairAttempt,
  mockTenantDb
} from './generated-app-test-support';

describe('repair migrated scenarios', () => {
  let service: GeneratedAppService;
  let repository: GeneratedAppRepository;
  let artifactService: GeneratedAppArtifactService;
  let runtimeBindingService: GeneratedAppRuntimeBindingService;
  let repairService: GeneratedAppGenerationRepairService;
  let orchestrator: GeneratedAppGenerationOrchestratorService;
  let publicRuntimeService: GeneratedAppPublicRuntimeService;

  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks();
    const configService = createConfigService();
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const storageService = createStorageServiceMock();
    repository = new GeneratedAppRepository(mockTenantDb as unknown as DrizzleDB, configService);
    artifactService = new GeneratedAppArtifactService(repository, configService, storageService);
    runtimeBindingService = new GeneratedAppRuntimeBindingService(repository, artifactService, pluginService);
    repairService = new GeneratedAppGenerationRepairService(repository);
    orchestrator = new GeneratedAppGenerationOrchestratorService(repository, repairService, runtimeBindingService, configService);
    publicRuntimeService = new GeneratedAppPublicRuntimeService(repository, artifactService, runtimeBindingService);
    service = new GeneratedAppService(mockTenantDb as unknown as DrizzleDB, configService, undefined, undefined, undefined, undefined, undefined, pluginService, undefined, storageService, repository, artifactService, runtimeBindingService, repairService, orchestrator, publicRuntimeService);
  });

  it('Gate 5 real-browser-e2e 失败应生成脱敏 repairPlan 和可执行再验证工作单', () => {
    const failedGateRun = createGeneratedAppGateRun({
      id: GATE_5_RUN_ID,
      gateId: 'gate-5',
      gateOrder: 5,
      gateName: '浏览器验收门禁',
      status: 'failed',
      summary:
        'Gate 5 real-browser-e2e 失败：publicShareToken=abc sk-sensitive /root/generated-app/private pluginIds workflowSnapshots rawToolData',
      evidence: [
        {
          id: 'gate-5-real-browser-e2e-unavailable',
          label: 'Gate 5 real browser E2E runner availability',
          kind: 'browser',
          url: null,
          summary:
            'real-browser-e2e unavailable /root/.cache/ms-playwright sk-secret-token publicShareToken=abc pluginIds workflowSnapshots checkpointData rawToolData',
          details: {
            runnerId: 'gate-5-real-browser-e2e-runner',
            executionMode: 'real_browser_e2e',
            executionLevel: 'real-browser-e2e',
          },
        },
      ],
      failure: {
        code: 'gate-5-real-browser-e2e-unavailable',
        message:
          'Gate 5 failed with Bearer secret-token and /root/preview public_share_token=abc workflowSnapshots',
      },
      repairInstructions:
        '修复 publicShareToken、pluginIds、workflowSnapshots、rawToolData、/root/preview 和 sk-secret 后重新运行。',
    });
    const internals = createRepairServiceForTest() as unknown as {
      buildFailedGateRepairPlan(
        failedGateRun: GeneratedAppGateRun,
        now: Date,
      ): GeneratedAppRepairPlan;
      buildFailedGateReverificationPlan(
        failedGateRun: GeneratedAppGateRun,
        now: Date,
      ): GeneratedAppReverificationPlan;
    };

    const repairPlan = internals.buildFailedGateRepairPlan(failedGateRun, NOW);
    const reverificationPlan = internals.buildFailedGateReverificationPlan(
      failedGateRun,
      NOW,
    );
    const serializedWorkOrder = JSON.stringify({
      repairPlan,
      reverificationPlan,
    });
    const sanitizedTextSections = JSON.stringify({
      failureSummary: repairPlan.failureSummary,
      repairInstructions: repairPlan.repairInstructions,
      evidenceSummaries: repairPlan.evidenceSummaries,
    });

    expect(repairPlan).toEqual(
      expect.objectContaining({
        source: 'automatic-failed-gate-work-order',
        targetGateId: 'gate-5',
        failureCode: 'gate-5-real-browser-e2e-unavailable',
        allowedChangeScopes: expect.arrayContaining([
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ]),
        forbiddenChangeScopes: expect.arrayContaining([
          'public-share-token',
          'host-absolute-path',
          'production-credentials',
        ]),
        patchTargets: expect.arrayContaining([
          'generationWorkspace.files.src/generated-app/runtime-form.ts',
          'generationWorkspace.files.dist/index.html',
          'publicPreviewSubmissionHandoff',
          'publicRuntimeSubmissionDetailHandoff',
          'workflowRuntimeBinding.outputSummaryMapping',
          'pluginTools.publicOutputSummaryMapping',
        ]),
        browserRepairTargets: expect.arrayContaining([
          expect.objectContaining({
            targetId: 'public-runtime-form',
            path: 'generationWorkspace.files.src/generated-app/runtime-form.ts',
          }),
          expect.objectContaining({
            targetId: 'public-preview-html',
            path: 'generationWorkspace.files.dist/index.html',
          }),
          expect.objectContaining({
            targetId: 'workflow-output-summary',
            path: 'workflowRuntimeBinding.outputSummaryMapping',
          }),
          expect.objectContaining({
            targetId: 'plugin-output-summary',
            path: 'pluginTools.publicOutputSummaryMapping',
          }),
        ]),
        e2eRunnerContract: expect.objectContaining({
          mode: 'real-browser-e2e',
          command: 'agentloom generated-app gate-5 real-browser-e2e',
          journey: 'open -> fill -> submit -> detail/report',
          allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
          forbiddenEndpointPatterns: expect.arrayContaining([
            '/generated-apps/{appId}',
            '/plugins',
            '/workflow-definitions',
            '/internal',
            '/settings',
          ]),
          forbiddenEvidenceFields: expect.arrayContaining([
            'publicShareToken',
            'pluginIds',
            'workflowSnapshots',
            'checkpointData',
            'rawToolData',
          ]),
        }),
      }),
    );
    expect(reverificationPlan).toEqual(
      expect.objectContaining({
        targetGateId: 'gate-5',
        requiredGateIds: ['gate-5'],
        requiredCommandIds: [
          'agentloom generated-app gate-5 local-browser-contract',
          'agentloom generated-app gate-5 real-browser-e2e',
        ],
        requiredEvidenceIds: ['gate-5-real-browser-e2e-unavailable'],
        successCriteria: expect.arrayContaining([
          expect.stringContaining('fixture or local contract evidence'),
          expect.stringContaining('open -> fill -> submit -> detail/report'),
          expect.stringContaining('plugin ids'),
        ]),
        blockedUntilPatchApplied: true,
      }),
    );
    expect(serializedWorkOrder).toContain('[已移除内部内容]');
    expect(serializedWorkOrder).not.toContain('/root/');
    expect(serializedWorkOrder).not.toContain('sk-secret');
    expect(serializedWorkOrder).not.toContain('secret-token');
    expect(serializedWorkOrder).not.toContain('publicShareToken=abc');
    expect(serializedWorkOrder).not.toContain('public_share_token=abc');
    expect(sanitizedTextSections).not.toContain('workflowSnapshots');
    expect(sanitizedTextSections).not.toContain('rawToolData');
    expect(sanitizedTextSections).not.toContain('checkpointData');
  });

  it('Gate 3 自动修复失败应持久化 failed，更新零行时应暴露修复台账丢失', async () => {
    const failedAttempt = createGeneratedAppRepairAttempt({
      status: 'failed',
      changeSummary: '补丁已应用但未修复构建。',
      verificationSummary: 'unit 仍失败。',
      completedAt: NOW,
    });
    const failedUpdateChain = createUpdateReturningChain([failedAttempt]);
    const missingUpdateChain = createUpdateReturningChain([]);
    mockTenantDb.update
      .mockReturnValueOnce(failedUpdateChain)
      .mockReturnValueOnce(missingUpdateChain);
    const repairInternals = createRepairServiceForTest() as unknown as {
      completeGate3RepairAttempt(params: {
        tenantId: string;
        appId: string;
        repairAttemptId: string;
        repairResult: GeneratedAppGate3RepairResult;
      }): Promise<unknown>;
    };
    const repairResult = createGate3RepairResult({
      status: 'failed',
      changeSummary: '补丁已应用但未修复构建。',
      verificationSummary: 'unit 仍失败。',
    });

    const response = await repairInternals.completeGate3RepairAttempt({
      tenantId: TENANT_ID,
      appId: APP_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
      repairResult,
    });

    expect(failedUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        changeSummary: '补丁已应用但未修复构建。',
        verificationSummary: 'unit 仍失败。',
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({ id: REPAIR_ATTEMPT_ID, status: 'failed' }),
    );
    await expect(
      repairInternals.completeGate3RepairAttempt({
        tenantId: TENANT_ID,
        appId: APP_ID,
        repairAttemptId: REPAIR_ATTEMPT_ID,
        repairResult,
      }),
    ).rejects.toBeInstanceOf(GeneratedAppRepairAttemptNotFoundException);
  });

  it.each([
    ['gate-0', ['app-spec', 'test-contracts'], ['generated_apps.app_spec'], []],
    [
      'gate-1',
      ['generation-plan', 'test-contracts'],
      ['generated_apps.generation_plan'],
      [],
    ],
    [
      'gate-2',
      [
        'static-contracts',
        'generation-plan',
        'workflow-orchestration',
        'plugin-tools',
        'test-contracts',
      ],
      ['generated_apps.generation_plan.staticContracts'],
      [],
    ],
    [
      'gate-6',
      [
        'app-spec',
        'generation-plan',
        'static-contracts',
        'frontend-workspace',
        'workflow-orchestration',
        'plugin-tools',
        'test-contracts',
      ],
      ['generated_apps.generation_plan.independentVerificationPlan'],
      ['agentloom generated-app gate-6 local-independent-verifier'],
    ],
    [
      'gate-7',
      ['publish-contract', 'test-contracts'],
      ['generated_apps.generation_plan.publishCandidatePlan'],
      ['agentloom generated-app gate-7 publish-candidate'],
    ],
    [
      'gate-extension',
      ['test-contracts'],
      ['generated_apps.generation_plan'],
      [],
    ],
  ] as const)(
    '%s 自动修复工单应把失败证据映射到受控范围、补丁目标和再验证命令',
    async (gateId, allowedChangeScopes, patchTargets, requiredCommandIds) => {
      const gateRun = {
        ...createGeneratedAppGateRun({
          id: `${GATE_RUN_ID}-${gateId}`,
          gateId,
          gateName: `${gateId} 扩展门禁`,
          status: 'failed',
          summary: `${gateId} runner summary`,
          evidence: [
            {
              id: `${gateId}-evidence`,
              label: `${gateId} evidence`,
              kind: 'verifier',
              url: null,
              summary: '  ',
            },
          ],
          failure: null,
          repairInstructions: null,
        }),
        appId: APP_ID,
      };
      const returnedAttempt = createGeneratedAppRepairAttempt({
        targetGateId: gateId,
        status: 'failed',
      });
      const insertChain = createInsertReturningChain([returnedAttempt]);
      mockTenantDb.insert.mockReturnValueOnce(insertChain);
      const repairInternals = createRepairServiceForTest() as unknown as {
        recordAutomaticRepairAttemptForFailedRun(params: {
          tenantId: string;
          userId: string;
          appId: string;
          generationRunId: string;
          maxRepairAttempts: number;
          gateRuns: unknown[];
        }): Promise<unknown>;
      };
      const response =
        await repairInternals.recordAutomaticRepairAttemptForFailedRun({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          generationRunId: GENERATION_RUN_ID,
          maxRepairAttempts: 1,
          gateRuns: [gateRun],
        });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          targetGateId: gateId,
          status: 'failed',
          failureSummary: expect.stringContaining(`${gateId} runner summary`),
          changeSummary: expect.stringContaining('已读取失败证据'),
          verificationSummary: expect.stringContaining('仍为 failed'),
          repairPlan: expect.objectContaining({
            targetGateId: gateId,
            failureCode: null,
            repairInstructions: null,
            evidenceIds: [`${gateId}-evidence`],
            evidenceSummaries: [],
            allowedChangeScopes: [...allowedChangeScopes],
            patchTargets: [...patchTargets],
          }),
          reverificationPlan: expect.objectContaining({
            targetGateId: gateId,
            requiredCommandIds: [...requiredCommandIds],
            requiredEvidenceIds: [`${gateId}-evidence`],
          }),
          createdBy: USER_ID,
        }),
      );
      expect(response).toEqual(
        expect.objectContaining({ id: REPAIR_ATTEMPT_ID, status: 'failed' }),
      );
    },
  );

  it('自动修复预算耗尽或没有未排除失败门禁时不应写入修复台账', async () => {
    const failedGate = {
      ...createGeneratedAppGateRun({
        status: 'failed',
        failure: null,
      }),
      appId: APP_ID,
    };
    const repairInternals = createRepairServiceForTest() as unknown as {
      recordAutomaticRepairAttemptForFailedRun(params: {
        tenantId: string;
        userId: string;
        appId: string;
        generationRunId: string;
        maxRepairAttempts: number;
        gateRuns: unknown[];
        excludeGateRunIds?: string[];
      }): Promise<unknown>;
    };
    const recordAutomaticRepairAttemptForFailedRun =
      repairInternals.recordAutomaticRepairAttemptForFailedRun.bind(service);

    const exhausted = await recordAutomaticRepairAttemptForFailedRun({
      tenantId: TENANT_ID,
      userId: USER_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      maxRepairAttempts: 0,
      gateRuns: [failedGate],
    });
    const excluded = await recordAutomaticRepairAttemptForFailedRun({
      tenantId: TENANT_ID,
      userId: USER_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      maxRepairAttempts: 1,
      gateRuns: [failedGate],
      excludeGateRunIds: [failedGate.id],
    });

    expect(exhausted).toBeNull();
    expect(excluded).toBeNull();
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
  });
});

