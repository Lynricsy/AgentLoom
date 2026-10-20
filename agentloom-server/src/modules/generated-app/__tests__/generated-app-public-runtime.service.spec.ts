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
  GeneratedAppPublicSubmissionValidationException,
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
  SUBMISSION_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_EXECUTION_ID,
  WORKFLOW_VERSION_ID,
  WORKFLOW_DEFINITION_V7_ID,
  WORKFLOW_EXECUTION_V7_ID,
  GENERATED_PRIVATE_PLUGIN_ID,
  NOW,
  createConfigService,
  createSelectChain,
  createSelectManyChain,
  createSelectPageChain,
  createCountChain,
  createGeneratedAppSubmissionInsertReturningFromPayload,
  createUpdateReturningChain,
  createSubmissionUpdateReturningFromPayload,
  createGeneratedAppUpdateReturningFromPayload,
  createUpdateChain,
  createGeneratedAppServiceWithExecution,
  createPublishCandidateReadiness,
  createReadiness,
  createGeneratedAppSubmission,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createPublicRuntimeServiceForTest,
  buildBuildUnitPlanForTest,
  createGeneratedApp,
  createGeneratedAppWithGate3Workspace,
  mockTenantDb,
} from './generated-app-test-support';

/**
 * 默认测试应用（"自动化中医问诊系统"）命中 medical 运行时表单，
 * 其中 chiefComplaint / duration / symptoms / severity 四项为必填。
 * D-15 起公开提交按运行时表单契约 fail-closed，因此正例必须给全必填字段。
 */
function createValidMedicalInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    chiefComplaint: '头痛',
    duration: '三天',
    symptoms: ['pain'],
    severity: 5,
    ...overrides,
  };
}

describe('public migrated scenarios', () => {
  let service: GeneratedAppService;
  let repository: GeneratedAppRepository;
  let artifactService: GeneratedAppArtifactService;
  let runtimeBindingService: GeneratedAppRuntimeBindingService;
  let repairService: GeneratedAppGenerationRepairService;
  let orchestrator: GeneratedAppGenerationOrchestratorService;
  let publicRuntimeService: GeneratedAppPublicRuntimeService;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    const configService = createConfigService();
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const storageService = createStorageServiceMock();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    artifactService = new GeneratedAppArtifactService(
      repository,
      configService,
      storageService,
    );
    runtimeBindingService = new GeneratedAppRuntimeBindingService(repository);
    repairService = new GeneratedAppGenerationRepairService(repository);
    orchestrator = new GeneratedAppGenerationOrchestratorService(
      repository,
      repairService,
      runtimeBindingService,
      configService,
    );
    publicRuntimeService = new GeneratedAppPublicRuntimeService(
      repository,
      artifactService,
      runtimeBindingService,
    );
    service = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      pluginService,
      undefined,
      storageService,
      repository,
      artifactService,
      runtimeBindingService,
      repairService,
      orchestrator,
      publicRuntimeService,
    );
  });

  it('非 publish_candidate 状态启用公开链接时应拒绝', async () => {
    const selectChain = createSelectChain([createGeneratedApp()]);
    mockTenantDb.select.mockReturnValueOnce(selectChain);

    await expect(
      service.enablePublicShare(TENANT_ID, USER_ID, APP_ID),
    ).rejects.toBeInstanceOf(GeneratedAppPublicShareNotReadyException);

    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('publish_candidate 状态启用公开链接时应创建不可猜测 token', async () => {
    const readiness = createPublishCandidateReadiness();
    const app = createGeneratedApp({
      status: 'publish_candidate',
      readiness,
    });
    const updatedApp = createGeneratedApp({
      ...app,
      status: 'published',
      publicShareEnabled: true,
      publicShareToken: 'b'.repeat(64),
      publicShareCreatedAt: NOW,
      publicShareDisabledAt: null,
    });
    const selectChain = createSelectChain([app]);
    const updateChain = createUpdateReturningChain([updatedApp]);
    mockTenantDb.select.mockReturnValueOnce(selectChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.enablePublicShare(
      TENANT_ID,
      USER_ID,
      APP_ID,
    );

    const updatePayload = updateChain.set.mock.calls[0]?.[0] as {
      publicShareToken: string;
      publicShareEnabled: boolean;
      status: string;
    };
    expect(updatePayload.status).toBe('published');
    expect(updatePayload.publicShareEnabled).toBe(true);
    expect(updatePayload.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
    expect(response.publicShareUrl).toBe(
      `https://studio.example.test/generated-apps/public/${updatedApp.publicShareToken}`,
    );
  });

  it('关闭后再次启用公开链接时不应复用旧 token', async () => {
    const oldToken = 'a'.repeat(64);
    const readiness = createPublishCandidateReadiness();
    const app = createGeneratedApp({
      status: 'publish_candidate',
      readiness,
      publicShareEnabled: false,
      publicShareToken: oldToken,
      publicShareDisabledAt: NOW,
    });
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'published',
        publicShareEnabled: true,
        publicShareToken: 'b'.repeat(64),
        publicShareDisabledAt: null,
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    await service.enablePublicShare(TENANT_ID, USER_ID, APP_ID);

    const updatePayload = updateChain.set.mock.calls[0]?.[0] as {
      publicShareToken: string;
    };
    expect(updatePayload.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
    expect(updatePayload.publicShareToken).not.toBe(oldToken);
  });

  it('重新生成公开链接时应替换当前 token', async () => {
    const oldToken = 'c'.repeat(64);
    const readiness = createPublishCandidateReadiness();
    const app = createGeneratedApp({
      status: 'published',
      readiness,
      publicShareEnabled: true,
      publicShareToken: oldToken,
      publicShareCreatedAt: NOW,
    });
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        publicShareToken: 'd'.repeat(64),
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    await service.regeneratePublicShare(TENANT_ID, USER_ID, APP_ID);

    const updatePayload = updateChain.set.mock.calls[0]?.[0] as {
      publicShareToken: string;
    };
    expect(updatePayload.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
    expect(updatePayload.publicShareToken).not.toBe(oldToken);
  });

  it('关闭公开链接时应清空 token 并回到 readiness 对应状态', async () => {
    const readiness = createPublishCandidateReadiness();
    const app = createGeneratedApp({
      status: 'published',
      readiness,
      publicShareEnabled: true,
      publicShareToken: 'e'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'publish_candidate',
        publicShareEnabled: false,
        publicShareToken: null,
        publicShareDisabledAt: NOW,
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    await service.disablePublicShare(TENANT_ID, USER_ID, APP_ID);

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'publish_candidate',
        publicShareToken: null,
        publicShareEnabled: false,
      }),
    );
  });

  it('门禁结果降级为 warning 时应关闭公开链接并清空 token', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'f'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const gateResults = [
      ...createInitialGeneratedAppGateResults(NOW.toISOString()).map(
        (gate) => ({
          ...gate,
          status: 'passed' as const,
          summary: `${gate.name} 已通过`,
        }),
      ),
      {
        gateId: 'ux-warning',
        order: 100,
        name: '体验风险提示',
        blocking: false,
        status: 'warning' as const,
        summary: '移动端仍需补充一次手动响应式检查',
        evidence: [],
        updatedAt: NOW.toISOString(),
      },
    ];
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'trial_ready',
        readiness: createReadiness({
          state: 'trial',
          canCreatePublicShare: false,
          blockingIssueCount: 0,
          warningCount: 1,
          blockers: [],
          warnings: [
            {
              gateId: 'ux-warning',
              name: '体验风险提示',
              status: 'warning',
              summary: '移动端仍需补充一次手动响应式检查',
            },
          ],
        }),
        publicShareEnabled: false,
        publicShareToken: null,
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    await service.recordGateResults(TENANT_ID, USER_ID, APP_ID, {
      gateResults,
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'trial_ready',
        publicShareToken: null,
        publicShareEnabled: false,
      }),
    );
  });

  it('手动记录全 passed 但缺少可信 Gate 7 real-local evidence 时不应进入 publish_candidate', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'a'.repeat(64),
      publicShareCreatedAt: NOW,
      generationPlan: {
        malformed: true,
      },
    });
    const gateResults = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) => ({
      ...gate,
      status: 'passed' as const,
      summary: `${gate.name} 手动标记通过`,
      evidence: [
        {
          id: `${gate.gateId}-manual-evidence`,
          label: `${gate.name} 手动证据`,
          kind: 'manual' as const,
          url: null,
          summary:
            gate.gateId === 'gate-7'
              ? '手动声明 Gate 7 已通过，但缺少 real-local publish candidate runner details。'
              : `${gate.name} 手动声明通过。`,
        },
      ],
    }));
    let updatePayload: Partial<GeneratedApp> = {};
    const updateChain = createGeneratedAppUpdateReturningFromPayload(
      app,
      (payload) => {
        updatePayload = payload;
      },
    );
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateResults(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        gateResults,
      },
    );

    const updatedGate7 = updatePayload.gateResults?.find(
      (gate) => gate.gateId === 'gate-7',
    );
    expect(updatePayload.status).toBe('failed');
    expect(updatePayload.readiness?.state).toBe('blocked');
    expect(updatePayload.publicShareToken).toBeNull();
    expect(updatePayload.publicShareEnabled).toBe(false);
    expect(updatedGate7).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining('publish candidate evidence guard'),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            id: 'gate-7-publish-candidate-evidence-guard',
            summary: expect.stringContaining(
              'generationPlan.publishCandidatePlan.executionLevel',
            ),
          }),
        ]),
      }),
    );
    expect(response.status).toBe('failed');
    expect(response.publicShareToken).toBeNull();
  });

  it('手动记录全 passed 但 Gate 5 real-browser-e2e 未真实执行时不应进入 publish_candidate', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'b'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const generationPlan = buildGenerationPlan(app.appSpec);
    const staticContracts = buildStaticContracts(app.appSpec, generationPlan);
    const buildUnitPlan = buildBuildUnitPlanForTest(
      app.appSpec,
      generationPlan,
      staticContracts,
      undefined,
      undefined,
      'real-local-command-plan',
    );
    const integrationPlan = buildIntegrationPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      'real-local-integration',
    );
    const browserAcceptancePlan = buildBrowserAcceptancePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      'real-browser-e2e',
    );
    const gateResultsThroughGate6 = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) => {
      if (gate.gateId === 'gate-7') {
        return gate;
      }

      return {
        ...gate,
        status: 'passed' as const,
        summary:
          gate.gateId === 'gate-5'
            ? 'Gate 5 手动标记通过，但真实浏览器未执行。'
            : `${gate.name} 已通过。`,
        evidence: [
          gate.gateId === 'gate-5'
            ? {
                id: 'gate-5-real-browser-e2e-unavailable',
                label: 'Gate 5 real browser E2E unavailable',
                kind: 'browser' as const,
                url: null,
                summary:
                  'real-browser-e2e requested but unavailable；executed=false。',
                details: {
                  runnerId: 'gate-5-real-browser-e2e-runner',
                  executionLevel: 'real-browser-e2e',
                  executed: false,
                  playwrightExecuted: false,
                  realBrowserExecuted: false,
                },
              }
            : {
                id:
                  gate.gateId === 'gate-6'
                    ? 'gate-6-independent-verifier-verdict'
                    : `${gate.gateId}-evidence`,
                label: `${gate.name} evidence`,
                kind:
                  gate.gateId === 'gate-6'
                    ? ('verifier' as const)
                    : (gate.evidence[0]?.kind ?? ('manual' as const)),
                url: null,
                summary: `${gate.name} evidence citation`,
              },
        ],
      };
    });
    const independentVerificationPlan = buildIndependentVerificationPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      gateResultsThroughGate6,
      'real-local-independent-verifier',
    );
    const publishCandidatePlan = buildPublishCandidatePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      gateResultsThroughGate6,
      'real-local-publish-candidate-contract',
    );
    const trustedGate7Details = {
      runnerId: 'gate-7-real-publish-candidate-runner',
      executionLevel: 'real-local-publish-candidate-contract',
      executed: true,
      publicShareTokenCreated: false,
      createdPublicShareToken: null,
    };
    const gateResults = gateResultsThroughGate6.map((gate) =>
      gate.gateId === 'gate-7'
        ? {
            ...gate,
            status: 'passed' as const,
            summary:
              'Gate 7 real-local publish candidate contract runner 已签收。',
            evidence: [
              {
                id: 'gate-7-publish-readiness-inputs',
                label: 'Gate 7 publish readiness inputs',
                kind: 'manual' as const,
                url: null,
                summary: 'Gate 7 已校验 readiness inputs。',
                details: trustedGate7Details,
              },
              {
                id: 'gate-7-artifact-release-manifest',
                label: 'Gate 7 artifact release manifest',
                kind: 'manual' as const,
                url: null,
                summary: 'Gate 7 已签收 release manifest contract。',
                details: trustedGate7Details,
              },
              {
                id: 'gate-7-rollback-share-controls',
                label: 'Gate 7 rollback share controls',
                kind: 'manual' as const,
                url: null,
                summary: 'Gate 7 已签收 deferred public-share controls。',
                details: trustedGate7Details,
              },
              {
                id: 'gate-7-final-verdict',
                label: 'Gate 7 final verdict',
                kind: 'manual' as const,
                url: null,
                summary: 'Gate 7 final verdict publishCandidateAllowed=true。',
                details: trustedGate7Details,
              },
            ],
          }
        : gate,
    );
    const completeGenerationPlan: GeneratedAppGenerationPlan = {
      ...generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      publishCandidatePlan,
    };
    let updatePayload: Partial<GeneratedApp> = {};
    const updateChain = createGeneratedAppUpdateReturningFromPayload(
      app,
      (payload) => {
        updatePayload = payload;
      },
    );
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateResults(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        gateResults,
        generationPlan: completeGenerationPlan,
      },
    );

    const updatedGate7 = updatePayload.gateResults?.find(
      (gate) => gate.gateId === 'gate-7',
    );
    const serializedGate7 = JSON.stringify(updatedGate7);

    expect(updatePayload.status).toBe('failed');
    expect(updatePayload.readiness?.state).toBe('blocked');
    expect(updatePayload.publicShareToken).toBeNull();
    expect(updatePayload.publicShareEnabled).toBe(false);
    expect(updatedGate7).toEqual(
      expect.objectContaining({
        status: 'failed',
        evidence: expect.arrayContaining([
          expect.objectContaining({
            id: 'gate-7-publish-candidate-evidence-guard',
            summary: expect.stringContaining(
              'Gate 5 run evidence 必须来自 gate-5-real-browser-e2e-runner',
            ),
          }),
        ]),
      }),
    );
    expect(serializedGate7).toContain(
      'executed=true、playwrightExecuted=true、realBrowserExecuted=true',
    );
    expect(response.status).toBe('failed');
    expect(response.publicShareToken).toBeNull();
  });
});
