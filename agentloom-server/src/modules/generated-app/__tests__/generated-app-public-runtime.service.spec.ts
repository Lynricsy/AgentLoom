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
  mockTenantDb
} from './generated-app-test-support';

describe('public migrated scenarios', () => {
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

  it('公开 endpoint 只返回 end-user runtime surface', async () => {
    const token = '1'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      preview: {
        previewUrl: 'https://preview.example.test/apps/1',
        sourceArtifactUrl: 'https://internal.example.test/source.zip',
        testReportUrl: 'https://internal.example.test/report.json',
      },
      pluginIds: ['plugin-private'],
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(createUpdateChain());

    const response = await service.getPublicApp(token);

    expect(response).not.toHaveProperty('gateResults');
    expect(response).not.toHaveProperty('readiness');
    expect(response).not.toHaveProperty('pluginIds');
    expect(response).not.toHaveProperty('publicShareToken');
    expect(response.runtimeSurface).toEqual({
      kind: 'generated-app',
      previewUrl: app.preview.previewUrl,
    });
    expect(response.runtimeForm).toEqual(
      expect.objectContaining({
        title: expect.stringContaining('问诊采集表'),
        fields: expect.arrayContaining([
          expect.objectContaining({
            id: 'chiefComplaint',
            type: 'text',
            required: true,
          }),
          expect.objectContaining({
            id: 'symptoms',
            type: 'multi_select',
            required: true,
          }),
          expect.objectContaining({
            id: 'severity',
            type: 'range',
          }),
        ]),
        resultView: expect.objectContaining({
          successTitle: '已生成问诊摘要',
        }),
      }),
    );
    expect(response.appSpec.pages).toEqual([
      expect.objectContaining({ id: 'page-public-runtime' }),
    ]);
    expect(JSON.stringify(response)).not.toContain('sourceArtifactUrl');
    expect(JSON.stringify(response)).not.toContain('testReportUrl');
    expect(JSON.stringify(response)).not.toContain('plugin-private');
  });

  it('公开 endpoint 有 Gate 3 构建产物时应返回 public preview URL 而非源码 artifact', async () => {
    const token = '6'.repeat(64);
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-public-preview-${crypto.randomUUID()}`,
    );
    const previewService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      preview: {
        previewUrl: 'https://legacy-preview.example.test/apps/1',
        sourceArtifactUrl: 'https://internal.example.test/source.zip',
        testReportUrl: 'https://internal.example.test/report.json',
      },
      pluginIds: ['plugin-private'],
    });
    const workspace = app.generationPlan?.buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    try {
      await mkdir(join(workspaceRoot, workspace.relativePath, 'dist'), {
        recursive: true,
      });
      await writeFile(
        join(workspaceRoot, workspace.relativePath, 'dist/index.html'),
        '<!doctype html><html><body><h1>公开构建预览</h1></body></html>',
        'utf8',
      );
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
      mockTenantDb.update.mockReturnValueOnce(createUpdateChain());

      const response = await previewService.getPublicApp(token);
      const serialized = JSON.stringify(response);

      expect(response.runtimeSurface).toEqual({
        kind: 'generated-app',
        previewUrl: `/api/v1/generated-apps/public/${token}/preview`,
      });
      expect(serialized).not.toContain('sourceArtifactUrl');
      expect(serialized).not.toContain('testReportUrl');
      expect(serialized).not.toContain('plugin-private');
      expect(serialized).not.toContain(workspaceRoot);
      expect(serialized).not.toContain('source-app-tsx');
      expect(serialized).not.toContain('gate-3-unit-test-report');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('公开构建预览端点应只返回 Gate 3 build output HTML', async () => {
    const token = '7'.repeat(64);
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-public-preview-html-${crypto.randomUUID()}`,
    );
    const previewService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    const workspace = app.generationPlan?.buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    try {
      await mkdir(join(workspaceRoot, workspace.relativePath, 'dist'), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, workspace.relativePath, 'src'), {
        recursive: true,
      });
      await writeFile(
        join(workspaceRoot, workspace.relativePath, 'dist/index.html'),
        '<!doctype html><html><body><main>终端用户界面</main></body></html>',
        'utf8',
      );
      await writeFile(
        join(workspaceRoot, workspace.relativePath, 'src/App.tsx'),
        'export const internalSource = "不应公开";\n',
        'utf8',
      );
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

      const html = await previewService.getPublicBuildPreviewHtml(token);

      expect(html).toContain('<main>终端用户界面</main>');
      expect(html).not.toContain('internalSource');
      expect(html).not.toContain(workspaceRoot);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('公开构建预览端点缺少 Gate 3 build output 时应拒绝读取', async () => {
    const token = 'a'.repeat(64);
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-public-preview-missing-${crypto.randomUUID()}`,
    );
    const previewService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });

    try {
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

      await expect(
        previewService.getPublicBuildPreviewHtml(token),
      ).rejects.toBeInstanceOf(GeneratedAppArtifactNotFoundException);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('公开构建预览响应头应仅允许同源 public submission API 连接', () => {
    const handler = Object.getOwnPropertyDescriptor(
      GeneratedAppPublicController.prototype,
      'getPublicBuildPreview',
    )?.value as object;

    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as
      | Array<{ name: string; value: string }>
      | undefined;
    const contentSecurityPolicy = headers?.find(
      (header) => header.name === 'Content-Security-Policy',
    )?.value;

    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).toContain("default-src 'none'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).not.toContain('https:');
    expect(contentSecurityPolicy).not.toContain('*');
  });

  it('公开 endpoint 应脱敏白名单字段内部承载的 token、artifact、host path 和医疗建议文案', async () => {
    const token = '8'.repeat(64);
    const baseApp = createGeneratedApp();
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      appName: 'publicShareToken sk-test-redacted',
      description: 'sourceArtifactUrl /root/AgentLoom/source.zip 生成处方',
      appSpec: {
        ...baseApp.appSpec,
        appName: 'publicShareToken sk-test-redacted',
        summary: 'sourceArtifactUrl /root/AgentLoom/source.zip 生成处方',
        userGoal: '自动化中医问诊并生成诊断处方',
        actors: ['publicShareToken', '终端用户'],
        pages: [
          {
            id: 'page-public-runtime-sourceArtifactUrl',
            name: 'testReportUrl',
            purpose:
              'pluginIds Bearer real-secret-token-value /root/AgentLoom/.env',
          },
        ],
        coreRequirements: [
          { id: 'req-1', text: '自动化中医问诊并生成诊断处方' },
        ],
      },
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(createUpdateChain());

    const response = await service.getPublicApp(token);
    const serialized = JSON.stringify(response);

    expect(response.title).toBe('Generated App');
    expect(response.description).toBe(
      '请填写问诊采集信息，提交后查看结构化摘要、下一步问题和非诊断边界说明。',
    );
    expect(response.appSpec.appName).toBe('Generated App');
    expect(response.appSpec.summary).toBe(
      '用于整理问诊提交信息、生成下一步问题和免责声明的公开应用。',
    );
    expect(response.appSpec.userGoal).toBe(
      '整理问诊提交信息、生成下一步问题和免责声明',
    );
    expect(response.appSpec.actors).toEqual(['终端用户']);
    expect(response.appSpec.pages).toEqual([
      {
        id: 'page-1',
        name: '问诊运行页',
        purpose: '终端用户填写问诊信息并查看结构化摘要和边界说明。',
      },
    ]);
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain('pluginIds');
    expect(serialized).not.toContain('real-secret-token-value');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sk-test-redacted');
    expect(serialized).not.toContain('生成处方');
  });

  it('公开 endpoint 遇到非 publish_candidate readiness 时应拒绝', async () => {
    const token = '2'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createReadiness({
        state: 'trial',
        canCreatePublicShare: true,
        blockingIssueCount: 0,
        warningCount: 1,
        blockers: [],
        warnings: [
          {
            gateId: 'ux-warning',
            name: '体验风险提示',
            status: 'warning',
            summary: '仍存在非阻断 warning。',
          },
        ],
      }),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    await expect(service.getPublicApp(token)).rejects.toBeInstanceOf(
      GeneratedAppPublicShareNotReadyException,
    );
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('公开提交应写入创建者租户、快照当前 token，并同步生成 completed result/report', async () => {
    const token = '3'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await service.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      tenantId: string;
      generatedAppId: string;
      publicShareToken: string;
      anonymousSessionId: string;
      status: string;
      input: Record<string, unknown>;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
      errorMessage: string | null;
    };
    expect(insertPayload.tenantId).toBe(TENANT_ID);
    expect(insertPayload.generatedAppId).toBe(APP_ID);
    expect(insertPayload.publicShareToken).toBe(token);
    expect(insertPayload.anonymousSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.input).toEqual({ chiefComplaint: '头痛' });
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        appName: app.appName,
        userGoal: '整理问诊提交信息、生成下一步问题和免责声明',
        inputSummary: expect.objectContaining({
          textPreview: expect.stringContaining('头痛'),
        }),
        matchedRequirements: expect.any(Array),
        scenarioCoverage: expect.any(Array),
        nextStepQuestions: expect.arrayContaining([
          expect.stringContaining('主要不适从什么时候开始'),
        ]),
        reportSections: expect.any(Array),
        runtimeNotice: expect.stringContaining('未调用外部模型'),
      }),
    );
    expect(insertPayload.report).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        title: `${app.appName} 本地运行报告`,
        disclaimers: expect.arrayContaining([
          expect.stringContaining('不提供诊断结论'),
        ]),
      }),
    );
    expect(insertPayload.errorMessage).toBeNull();
    expect(response.status).toBe('completed');
    expect(response.result).toEqual(insertPayload.result);
    expect(response.report).toEqual(insertPayload.report);
  });

  it('公开提交绑定已发布 Workflow 时应创建异步 execution 并只写入安全 handoff 字段', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn().mockResolvedValue({
      id: WORKFLOW_EXECUTION_ID,
      status: 'pending',
    });
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: '55555555-5555-4555-8555-555555555559',
            inputSchema: { version: 7 },
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      anonymousSessionId: 'browser-session-1',
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      WORKFLOW_DEFINITION_ID,
      expect.objectContaining({
        launchSource: 'api',
        triggerType: 'api',
        schemaVersion: 7,
        inputParams: expect.objectContaining({
          chiefComplaint: '头痛',
          _meta: expect.objectContaining({
            launchSource: 'api',
            generatedAppId: APP_ID,
            appSpecVersion: app.appSpec.version,
            submissionSource: 'generated-app-public-submission',
            submission: expect.objectContaining({
              source: 'generated-app-public-submission',
              anonymousSessionId: 'browser-session-1',
            }),
            runtime: expect.objectContaining({
              kind: 'generated-app-public-runtime',
            }),
          }),
        }),
      }),
      TENANT_ID,
      USER_ID,
    );

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
    };
    expect(insertPayload.status).toBe('received');
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-created',
        workflowExecutionNotStartedReason: null,
      }),
    );
    expect(insertPayload.report).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-created',
      }),
    );
    expect(response.result).toEqual(insertPayload.result);
    expect(response.status).toBe('received');
    expect(JSON.stringify(response)).not.toContain(token);
    expect(JSON.stringify(response)).not.toContain('generationPlan');
    expect(JSON.stringify(response)).not.toContain('gateResults');
    expect(JSON.stringify(response)).not.toContain('sourceArtifactUrl');
    expect(JSON.stringify(response)).not.toContain('testReportUrl');
    expect(JSON.stringify(response)).not.toContain('plugin-private');
  });

  it('公开提交绑定 Gate 7 自动 runtime Workflow 时应创建异步 execution', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn().mockResolvedValue({
      id: WORKFLOW_EXECUTION_ID,
      status: 'pending',
    });
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: WORKFLOW_VERSION_ID,
            metadata: {
              source: 'generated-app-runtime-workflow',
              generatedAppId: APP_ID,
              bindingKind: 'public-runtime-workflow',
              publicRuntimeBoundary:
                'Generated App public runtime exposes only execution handoff ids/status',
            },
            inputSchema: null,
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      anonymousSessionId: 'browser-session-1',
      input: { chiefComplaint: '头痛', duration: '三天' },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      WORKFLOW_DEFINITION_ID,
      expect.objectContaining({
        launchSource: 'api',
        triggerType: 'api',
        schemaVersion: undefined,
        inputParams: expect.objectContaining({
          chiefComplaint: '头痛',
          duration: '三天',
          _meta: expect.objectContaining({
            launchSource: 'api',
            generatedAppId: APP_ID,
            submissionSource: 'generated-app-public-submission',
          }),
        }),
      }),
      TENANT_ID,
      USER_ID,
    );
    expect(response.result).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      }),
    );
    expect(response.status).toBe('received');
    expect(JSON.stringify(response)).not.toContain(
      'generated-app-runtime-workflow',
    );
    expect(JSON.stringify(response)).not.toContain('public-runtime-workflow');
    expect(JSON.stringify(response)).not.toContain('publicRuntimeBoundary');
  });

  it('公开提交应先归一化 Workflow inputSchema 默认值再传递 schemaVersion', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn().mockResolvedValue({
      id: WORKFLOW_EXECUTION_ID,
      status: 'pending',
    });
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: '55555555-5555-4555-8555-555555555559',
            inputSchema: {
              collectionMode: 'form',
              fields: [
                {
                  id: 'chiefComplaint',
                  type: 'text',
                  label: '主诉',
                  required: true,
                },
              ],
            },
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      WORKFLOW_DEFINITION_ID,
      expect.objectContaining({
        schemaVersion: 1,
      }),
      TENANT_ID,
      USER_ID,
    );
  });

  it('公开提交绑定 draft/unpublished Workflow 时不应调用 execution 且应标记 workflow-not-published', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn();
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'draft',
            publishedVersionId: null,
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).not.toHaveBeenCalled();

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
    };
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        workflowExecution: false,
        executionId: null,
        executionStatus: null,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'local-deterministic-report-only',
        workflowExecutionNotStartedReason: 'workflow-not-published',
        workflowExecutionNotice: expect.stringContaining('尚未发布'),
      }),
    );
    expect(insertPayload.report).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        workflowExecutionNotStartedReason: 'workflow-not-published',
      }),
    );
    expect(response.status).toBe('completed');
    expect(response.result).toEqual(insertPayload.result);
  });

  it('公开提交绑定 editor handoff draft 即使异常 published 也不应调用 execution', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn();
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: WORKFLOW_VERSION_ID,
            metadata: {
              source: 'generated-app-editor-handoff',
              bindingKind: 'editor-handoff-draft',
              generatedAppId: APP_ID,
              publicRuntimeBoundary:
                'Generated App public runtime never exposes this internal resource id',
            },
            inputSchema: {
              collectionMode: 'form',
              fields: [
                {
                  id: 'chiefComplaint',
                  type: 'text',
                  label: '主诉',
                  required: true,
                },
              ],
            },
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).not.toHaveBeenCalled();

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
    };
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        executionId: null,
        executionStatus: null,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'local-deterministic-report-only',
        workflowExecutionNotStartedReason: 'workflow-not-published',
        workflowExecutionNotice: expect.stringContaining('尚未发布'),
      }),
    );
    expect(insertPayload.report).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        workflowExecutionNotStartedReason: 'workflow-not-published',
      }),
    );
    expect(JSON.stringify(response)).not.toContain(
      'generated-app-editor-handoff',
    );
    expect(JSON.stringify(response)).not.toContain('editor-handoff-draft');
    expect(JSON.stringify(response)).not.toContain('publicRuntimeBoundary');
  });

  it('公开提交绑定不存在或跨租户 Workflow 时不应调用 execution', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi.fn();
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).not.toHaveBeenCalled();

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown>;
    };
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'local-deterministic-report-only',
        workflowExecutionNotStartedReason: 'workflow-not-published',
      }),
    );
    expect(response.result).toEqual(insertPayload.result);
  });

  it('公开提交遇到 execution service 抛错时应安全收口且不泄露堆栈或 token', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'internal stack Bearer secret-token-value sk-test-redacted governance sourceArtifactUrl testReportUrl pluginIds readiness generationPlan gateResults',
        ),
      );
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: '55555555-5555-4555-8555-555555555559',
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
      errorMessage: string | null;
    };
    const serialized = JSON.stringify(response);
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.errorMessage).toBeNull();
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        executionId: null,
        executionStatus: null,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'local-deterministic-report-only',
        workflowExecutionNotStartedReason: 'workflow-execution-blocked',
      }),
    );
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('sk-test-redacted');
    expect(serialized).not.toContain('internal stack');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('governance');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain('pluginIds');
    expect(serialized).not.toContain('readiness');
    expect(serialized).not.toContain('generationPlan');
    expect(serialized).not.toContain('gateResults');
  });

  it('公开提交遇到 runWorkflow 再次报告未发布时应保持 deterministic report 且不泄露 WorkflowNotPublished detail', async () => {
    const token = '3'.repeat(64);
    const runWorkflow = vi
      .fn()
      .mockRejectedValue(
        new WorkflowNotPublishedException(WORKFLOW_DEFINITION_ID),
      );
    const serviceWithExecution = createGeneratedAppServiceWithExecution({
      runWorkflow,
    });
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_DEFINITION_ID,
            status: 'published',
            publishedVersionId: '55555555-5555-4555-8555-555555555559',
          },
        ]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await serviceWithExecution.createPublicSubmission(token, {
      input: { chiefComplaint: '头痛' },
    });

    expect(runWorkflow).toHaveBeenCalledTimes(1);

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      result: Record<string, unknown>;
    };
    expect(insertPayload.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        workflowExecutionNotStartedReason: 'workflow-not-published',
      }),
    );
    expect(JSON.stringify(response)).not.toContain('尚未发布，无法启动执行');
  });

  it('公开提交遇到过期或未满足 readiness 的公开应用时应拒绝', async () => {
    const staleToken = '4'.repeat(64);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([]));

    try {
      await service.createPublicSubmission(staleToken, { input: {} });
      throw new Error('expected stale token rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedAppNotFoundException);
      expect((error as GeneratedAppNotFoundException).detail).not.toContain(
        staleToken,
      );
    }

    vi.clearAllMocks();

    const notReadyToken = '5'.repeat(64);
    const notReadyApp = createGeneratedApp({
      status: 'published',
      readiness: createReadiness({
        state: 'blocked',
        canCreatePublicShare: false,
      }),
      publicShareEnabled: true,
      publicShareToken: notReadyToken,
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([notReadyApp]));

    await expect(
      service.createPublicSubmission(notReadyToken, { input: {} }),
    ).rejects.toBeInstanceOf(GeneratedAppPublicShareNotReadyException);
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
  });

  it('公开提交响应不应暴露租户、token、readiness、gate 或内部 artifact 字段', async () => {
    const token = '6'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      preview: {
        previewUrl: 'https://preview.example.test/apps/1',
        sourceArtifactUrl: 'https://internal.example.test/source.zip',
        testReportUrl: 'https://internal.example.test/report.json',
      },
      pluginIds: ['plugin-private'],
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(
      createGeneratedAppSubmissionInsertReturningFromPayload(),
    );

    const response = await service.createPublicSubmission(token, {
      anonymousSessionId: 'browser-session-1',
      input: { name: '访客' },
      clientContext: { userAgent: 'test-browser' },
    });

    expect(response).not.toHaveProperty('tenantId');
    expect(response).not.toHaveProperty('publicShareToken');
    expect(response).not.toHaveProperty('readiness');
    expect(response).not.toHaveProperty('gateResults');
    expect(response).not.toHaveProperty('preview');
    expect(response).not.toHaveProperty('pluginIds');
    expect(response).not.toHaveProperty('sourceArtifactUrl');
    expect(response).not.toHaveProperty('testReportUrl');
    expect(JSON.stringify(response)).not.toContain(token);
  });

  it('公开提交会脱敏 token-like/path 输入，非法结构保存 failed 状态', async () => {
    const token = '6'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await service.createPublicSubmission(token, {
      anonymousSessionId: 'Bearer very-secret-token-value',
      input: {
        publicShareToken: 'a'.repeat(64),
        note: 'Bearer very-secret-token-value',
        attachmentPath: '/root/AgentLoom/.env',
        chiefComplaint: '头痛',
      },
    });

    const insertPayload = insertChain.values.mock.calls[0]?.[0] as {
      status: string;
      input: Record<string, unknown>;
      result: Record<string, unknown>;
      report: Record<string, unknown>;
      errorMessage: string | null;
      anonymousSessionId: string;
    };
    const serializedRuntimeOutput = JSON.stringify({
      input: insertPayload.input,
      result: insertPayload.result,
      report: insertPayload.report,
      errorMessage: insertPayload.errorMessage,
    });
    expect(insertPayload.status).toBe('completed');
    expect(insertPayload.anonymousSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(insertPayload.anonymousSessionId).not.toContain(
      'very-secret-token-value',
    );
    expect(insertPayload.input).toEqual(
      expect.objectContaining({
        redactedField1: '[REDACTED]',
        note: '[REDACTED_TOKEN]',
        attachmentPath: '[REDACTED_PATH]',
        chiefComplaint: '头痛',
      }),
    );
    expect(serializedRuntimeOutput).not.toContain('publicShareToken');
    expect(serializedRuntimeOutput).not.toContain('very-secret-token-value');
    expect(serializedRuntimeOutput).not.toContain('/root/AgentLoom');
    expect(response.input).toEqual(insertPayload.input);
    expect(response.errorMessage).toBeNull();

    vi.clearAllMocks();

    const failedInsertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(failedInsertChain);

    const failedResponse = await service.createPublicSubmission(token, {
      input: { ['__proto__']: { polluted: true }, safe: 'value' },
    });
    const failedInsertPayload = failedInsertChain.values.mock.calls[0]?.[0] as {
      status: string;
      result: Record<string, unknown> | null;
      report: Record<string, unknown> | null;
      errorMessage: string | null;
    };

    expect(failedInsertPayload.status).toBe('failed');
    expect(failedInsertPayload.result).toBeNull();
    expect(failedInsertPayload.report).toBeNull();
    expect(failedInsertPayload.errorMessage).toContain('无法处理的结构');
    expect(failedResponse.status).toBe('failed');
    expect(failedResponse.errorMessage).toBe(failedInsertPayload.errorMessage);

    vi.clearAllMocks();

    const arrayFailedInsertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(arrayFailedInsertChain);

    const arrayFailedResponse = await service.createPublicSubmission(token, {
      input: ['array input is not supported'],
    });
    const arrayFailedInsertPayload = arrayFailedInsertChain.values.mock
      .calls[0]?.[0] as {
      status: string;
      input: Record<string, unknown>;
      result: Record<string, unknown> | null;
      report: Record<string, unknown> | null;
      errorMessage: string | null;
    };

    expect(arrayFailedInsertPayload.status).toBe('failed');
    expect(arrayFailedInsertPayload.input).toEqual({});
    expect(arrayFailedInsertPayload.result).toBeNull();
    expect(arrayFailedInsertPayload.report).toBeNull();
    expect(arrayFailedInsertPayload.errorMessage).toContain('无法处理的结构');
    expect(arrayFailedResponse.status).toBe('failed');
  });

  it('创建者提交列表和详情只返回当前租户、应用且未删除的记录，并能看到同一 completed report', async () => {
    const app = createGeneratedApp();
    const submission = createGeneratedAppSubmission({
      status: 'completed',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '已生成本地运行结果。',
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '自动化中医问诊系统 本地运行报告',
      },
    });
    const listChain = createSelectPageChain([submission]);
    const countChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(listChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]));

    const list = await service.listSubmissions(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
      status: 'received',
    });
    const detail = await service.findSubmission(
      TENANT_ID,
      APP_ID,
      SUBMISSION_ID,
    );

    expect(listChain.where).toHaveBeenCalledTimes(1);
    expect(countChain.where).toHaveBeenCalledTimes(1);
    expect(list.data).toEqual([
      expect.objectContaining({
        id: SUBMISSION_ID,
        tenantId: TENANT_ID,
        appId: APP_ID,
        deletedAt: null,
        status: 'completed',
        result: submission.result,
        report: submission.report,
      }),
    ]);
    expect(list.meta).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    expect(detail).toEqual(
      expect.objectContaining({
        id: SUBMISSION_ID,
        tenantId: TENANT_ID,
        appId: APP_ID,
        publicShareToken: submission.publicShareToken,
        status: 'completed',
        result: submission.result,
        report: submission.report,
      }),
    );
  });

  it('创建者提交列表应刷新当前页内未终止的 Workflow handoff 并持久化状态', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const submission = createGeneratedAppSubmission({
      status: 'received',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留列表可见业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-created',
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '本地运行报告',
        sections: [],
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });
    const listChain = createSelectPageChain([submission]);
    const countChain = createCountChain(1);
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(listChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_ID,
            status: 'running',
            completedAt: null,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 2,
            completedSteps: 1,
            updatedAt: NOW,
            inputParams: {
              _meta: {
                generatedAppId: APP_ID,
                appSpecVersion: 1,
                submissionSource: 'generated-app-public-submission',
                submission: {
                  anonymousSessionId: 'anonymous-session-1',
                  submittedAt: NOW.toISOString(),
                },
              },
            },
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const list = await service.listSubmissions(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(list.data).toEqual([
      expect.objectContaining({
        id: SUBMISSION_ID,
        status: 'running',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
          workflowExecutionUpdatedAt: NOW.toISOString(),
        }),
        report: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
        }),
      }),
    ]);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
        }),
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('创建者提交详情应把 running execution handoff 刷新到 result/report', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const submission = createGeneratedAppSubmission({
      status: 'completed',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留创建者可见业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-created',
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '本地运行报告',
        sections: [
          {
            id: 'submitted-information',
            title: '提交内容摘要',
            body: '保留业务段落。',
            items: [],
          },
        ],
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_ID,
            status: 'running',
            completedAt: null,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 4,
            completedSteps: 2,
            updatedAt: NOW,
            inputParams: {
              chiefComplaint: '头痛',
              _meta: {
                generatedAppId: APP_ID,
                appSpecVersion: 1,
                submissionSource: 'generated-app-public-submission',
                submission: {
                  anonymousSessionId: 'anonymous-session-1',
                  submittedAt: NOW.toISOString(),
                },
              },
            },
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const detail = await service.findSubmission(
      TENANT_ID,
      APP_ID,
      SUBMISSION_ID,
    );

    expect(detail.status).toBe('running');
    expect(detail.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留创建者可见业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-created',
        workflowExecutionUpdatedAt: NOW.toISOString(),
        workflowExecutionCompletedAt: null,
        workflowExecutionNotice: expect.stringContaining('2/4'),
      }),
    );
    expect(detail.report).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionStatus: 'running',
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: 'workflow-execution-status',
            body: expect.stringContaining('2/4'),
          }),
        ]),
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
          workflowExecutionUpdatedAt: NOW.toISOString(),
        }),
        report: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(detail.tenantId).toBe(TENANT_ID);
    expect(detail.publicShareToken).toBe(submission.publicShareToken);
  });

  it('创建者提交详情刷新 Workflow handoff 时应优先使用 report 中的执行记录', async () => {
    const reportExecutionId = WORKFLOW_EXECUTION_V7_ID;
    const staleWorkflowDefinitionId = '55555555-5555-4555-8555-555555555558';
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const submission = createGeneratedAppSubmission({
      status: 'running',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: staleWorkflowDefinitionId,
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '本地运行报告',
        sections: [
          {
            id: 'workflow-execution-status',
            title: '旧执行状态',
            body: '旧状态会被替换。',
            items: [],
          },
        ],
        workflowExecution: true,
        executionId: reportExecutionId,
        executionStatus: 'paused',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: reportExecutionId,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_ID,
            status: 'completed',
            completedAt: NOW,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 2,
            completedSteps: 2,
            updatedAt: NOW,
            inputParams: {
              _meta: {
                generatedAppId: APP_ID,
                appSpecVersion: 1,
                submissionSource: 'generated-app-public-submission',
                submission: {
                  anonymousSessionId: 'anonymous-session-1',
                  submittedAt: NOW.toISOString(),
                },
              },
            },
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectManyChain([
          {
            status: 'completed',
            completedAt: NOW,
          },
          {
            status: 'completed',
            completedAt: NOW,
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const detail = await service.findSubmission(
      TENANT_ID,
      APP_ID,
      SUBMISSION_ID,
    );

    expect(detail.status).toBe('completed');
    expect(detail.result).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: reportExecutionId,
        executionStatus: 'completed',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowExecutionCompletedAt: NOW.toISOString(),
      }),
    );
    expect(detail.report).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: reportExecutionId,
        executionStatus: 'completed',
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        result: expect.objectContaining({
          executionId: reportExecutionId,
          executionStatus: 'completed',
        }),
        report: expect.objectContaining({
          executionId: reportExecutionId,
          executionStatus: 'completed',
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(detail)).not.toContain(WORKFLOW_EXECUTION_ID);
  });

  it('创建者提交详情应把 completed execution 刷新为步骤计数摘要且不泄露内部字段', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const submission = createGeneratedAppSubmission({
      status: 'running',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        _meta: { publicShareToken: '1'.repeat(64) },
        definitionSnapshot: { nodes: [{ id: 'internal-node' }] },
        nodeData: { path: '/root/AgentLoom/.env' },
        checkpointData: { sourceArtifactUrl: 'https://internal/source.zip' },
        toolCalls: [{ authorization: 'Bearer private-token' }],
        inputParams: {
          _meta: { secret: 'secret-token-value' },
        },
        stack: 'internal stack',
        sourceArtifactUrl: 'https://internal/source.zip',
        testReportUrl: 'https://internal/report.json',
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '本地运行报告',
        sections: [
          {
            id: 'workflow-execution-status',
            title: '旧执行状态',
            body: '旧状态会被替换。',
            items: [],
          },
          {
            id: 'submitted-information',
            title: '提交内容摘要',
            body: '保留业务段落。',
            items: ['内部路径 /root/AgentLoom/.env 需要移除'],
            nodeData: { path: '/root/AgentLoom/.env' },
          },
        ],
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_ID,
            status: 'completed',
            completedAt: NOW,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 3,
            completedSteps: 3,
            updatedAt: NOW,
            inputParams: {
              chiefComplaint: '头痛',
              _meta: {
                generatedAppId: APP_ID,
                appSpecVersion: 1,
                submissionSource: 'generated-app-public-submission',
                submission: {
                  anonymousSessionId: 'anonymous-session-1',
                  submittedAt: NOW.toISOString(),
                },
                publicShareToken: '1'.repeat(64),
              },
            },
            definitionSnapshot: {
              nodes: [{ data: { apiKey: 'secret-token-value' } }],
            },
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectManyChain([
          {
            status: 'completed',
            completedAt: NOW,
            result: {
              nodeData: 'do-not-leak',
              toolCalls: [{ token: 'secret-token-value' }],
            },
            checkpointData: { stack: 'internal stack' },
            nodeData: { path: '/root/AgentLoom/.env' },
          },
          {
            status: 'failed',
            completedAt: NOW,
            result: { sourceArtifactUrl: 'https://internal/source.zip' },
            checkpointData: { testReportUrl: 'https://internal/report.json' },
          },
          {
            status: 'cancelled',
            completedAt: NOW,
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const detail = await service.findSubmission(
      TENANT_ID,
      APP_ID,
      SUBMISSION_ID,
    );
    const serialized = JSON.stringify(detail);

    expect(detail.status).toBe('completed');
    expect(detail.result).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'completed',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionBoundary: 'async-workflow-execution-completed',
        workflowExecutionCompletedAt: NOW.toISOString(),
        workflowExecutionSummary: {
          summary:
            'Workflow execution 已完成。出于公开链接安全边界，仅展示步骤计数摘要，不展开节点输出或内部执行快照。',
          completedSteps: 1,
          failedSteps: 1,
          cancelledSteps: 1,
          totalSteps: 3,
          latestStepCompletedAt: NOW.toISOString(),
          publicOutputs: [],
        },
      }),
    );
    expect(serialized).not.toContain('_meta');
    expect(serialized).not.toContain('definitionSnapshot');
    expect(serialized).not.toContain('inputParams');
    expect(serialized).not.toContain('nodeData');
    expect(serialized).not.toContain('checkpointData');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('internal stack');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).toContain('保留业务摘要');
    expect(serialized).toContain('保留业务段落');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'completed',
          workflowExecutionSummary: expect.objectContaining({
            totalSteps: 3,
          }),
        }),
        report: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'completed',
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(updateChain.set.mock.calls[0]?.[0])).not.toContain(
      'secret-token-value',
    );
  });

  it.each([
    ['missing execution', []],
    [
      'workflow mismatch',
      [
        {
          id: WORKFLOW_EXECUTION_ID,
          tenantId: TENANT_ID,
          workflowDefinitionId: '55555555-5555-4555-8555-555555555558',
          status: 'running',
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          totalSteps: 1,
          completedSteps: 0,
          updatedAt: NOW,
          inputParams: {
            _meta: {
              generatedAppId: APP_ID,
              appSpecVersion: 1,
              submissionSource: 'generated-app-public-submission',
              submission: {
                anonymousSessionId: 'anonymous-session-1',
                submittedAt: NOW.toISOString(),
              },
            },
          },
        },
      ],
    ],
    [
      'metadata mismatch',
      [
        {
          id: WORKFLOW_EXECUTION_ID,
          tenantId: TENANT_ID,
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          status: 'running',
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          totalSteps: 1,
          completedSteps: 0,
          updatedAt: NOW,
          inputParams: {
            _meta: {
              generatedAppId: APP_ID,
              appSpecVersion: 1,
              submissionSource: 'generated-app-public-submission',
              submission: {
                anonymousSessionId: 'different-session',
                submittedAt: NOW.toISOString(),
              },
            },
          },
        },
      ],
    ],
    [
      'same session but different submittedAt',
      [
        {
          id: WORKFLOW_EXECUTION_ID,
          tenantId: TENANT_ID,
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          status: 'running',
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          totalSteps: 1,
          completedSteps: 0,
          updatedAt: NOW,
          inputParams: {
            _meta: {
              generatedAppId: APP_ID,
              appSpecVersion: 1,
              submissionSource: 'generated-app-public-submission',
              submission: {
                anonymousSessionId: 'anonymous-session-1',
                submittedAt: new Date(NOW.getTime() + 1000).toISOString(),
              },
            },
          },
        },
      ],
    ],
  ] as const)(
    '创建者提交详情遇到 %s 时应安全降级为 workflow-execution-unavailable',
    async (_caseName, executionRows) => {
      const app = createGeneratedApp({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      });
      const submission = createGeneratedAppSubmission({
        status: 'running',
        result: {
          runtimeKind: 'local-generated-app-deterministic-report',
          workflowExecution: true,
          executionId: WORKFLOW_EXECUTION_ID,
          executionStatus: 'running',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          token: 'secret-token-value',
        },
        report: {
          title: '本地运行报告',
          workflowExecution: true,
          executionId: WORKFLOW_EXECUTION_ID,
          executionStatus: 'running',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        },
      });
      const updateChain =
        createSubmissionUpdateReturningFromPayload(submission);

      mockTenantDb.select
        .mockReturnValueOnce(createSelectChain([app]))
        .mockReturnValueOnce(createSelectChain([submission]))
        .mockReturnValueOnce(createSelectChain([...executionRows]));
      mockTenantDb.update.mockReturnValueOnce(updateChain);

      const detail = await service.findSubmission(
        TENANT_ID,
        APP_ID,
        SUBMISSION_ID,
      );

      expect(detail.result).toEqual(
        expect.objectContaining({
          workflowExecution: false,
          executionId: null,
          executionStatus: null,
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
          workflowExecutionNotice: expect.stringContaining('当前不可用'),
        }),
      );
      expect(JSON.stringify(detail)).not.toContain('secret-token-value');
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          result: expect.objectContaining({
            workflowExecution: false,
            executionStatus: null,
            workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
          }),
          updatedAt: expect.any(Date),
        }),
      );
    },
  );

  it('创建者单条和批量删除提交记录时应只做软删除', async () => {
    const singleDeleteChain = createUpdateReturningChain([
      { id: SUBMISSION_ID },
    ]);
    const batchDeleteChain = createUpdateReturningChain([
      { id: SUBMISSION_ID },
      { id: '55555555-5555-4555-8555-555555555555' },
    ]);
    mockTenantDb.update
      .mockReturnValueOnce(singleDeleteChain)
      .mockReturnValueOnce(batchDeleteChain);

    const single = await service.deleteSubmission(
      TENANT_ID,
      APP_ID,
      SUBMISSION_ID,
    );
    const batch = await service.deleteSubmissions(TENANT_ID, APP_ID, {
      ids: [SUBMISSION_ID, '55555555-5555-4555-8555-555555555555'],
    });

    expect(singleDeleteChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(batchDeleteChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(single).toEqual({ deletedCount: 1 });
    expect(batch).toEqual({ deletedCount: 2 });
  });

  it('公开详情不能读取已删除提交，也不能在 token 轮换后用旧 token 读取', async () => {
    const token = '7'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([]));

    await expect(
      service.getPublicSubmission(token, SUBMISSION_ID),
    ).rejects.toBeInstanceOf(GeneratedAppSubmissionNotFoundException);

    vi.clearAllMocks();

    const oldToken = '8'.repeat(64);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([]));

    try {
      await service.getPublicSubmission(oldToken, SUBMISSION_ID);
      throw new Error('expected old token rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedAppNotFoundException);
      expect((error as GeneratedAppNotFoundException).detail).not.toContain(
        oldToken,
      );
    }
  });

  it('公开提交详情应把 pending handoff 刷新为 running 且只返回安全字段', async () => {
    const token = '9'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
    });
    const submission = createGeneratedAppSubmission({
      status: 'completed',
      publicShareToken: token,
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
        executionBoundary: 'async-workflow-execution-created',
        workflowExecutionNotice: '已创建异步 Workflow execution。',
        token: 'secret-token-value',
        stack: 'internal stack',
        definitionSnapshot: { nodes: [{ id: 'internal-node' }] },
        nodeData: { path: '/root/AgentLoom/.env' },
        checkpointData: { sourceArtifactUrl: 'https://internal/source.zip' },
        toolCalls: [{ authorization: 'Bearer private-token' }],
        sourceArtifactUrl: 'https://internal/source.zip',
        testReportUrl: 'https://internal/report.json',
      },
      report: {
        runtimeKind: 'local-generated-app-deterministic-report',
        title: '本地运行报告',
        sections: [
          {
            id: 'submitted-information',
            title: '提交内容摘要',
            body: '保留业务段落。',
            items: [
              '业务字段：可以展示',
              '内部路径 /root/AgentLoom/.env 需要移除',
            ],
            nodeData: { path: '/root/AgentLoom/.env' },
          },
        ],
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'pending',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
        executionBoundary: 'async-workflow-execution-created',
        workflowExecutionNotice: '已创建异步 Workflow execution。',
        inputParams: {
          _meta: { publicShareToken: token },
        },
      },
    });
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_V7_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
            status: 'running',
            completedAt: null,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 3,
            completedSteps: 1,
            updatedAt: NOW,
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.getPublicSubmission(token, SUBMISSION_ID);

    expect(response.status).toBe('running');
    expect(response.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        summary: '保留业务摘要。',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
        executionBoundary: 'async-workflow-execution-created',
        workflowExecutionUpdatedAt: NOW.toISOString(),
        workflowExecutionCompletedAt: null,
        workflowExecutionNotice: expect.stringContaining('仍在执行中'),
      }),
    );
    expect(response.report).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionStatus: 'running',
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: 'workflow-execution-status',
            title: 'Workflow 执行状态',
            body: expect.stringContaining('仍在执行中'),
          }),
        ]),
      }),
    );
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('definitionSnapshot');
    expect(serialized).not.toContain('inputParams');
    expect(serialized).not.toContain('nodeData');
    expect(serialized).not.toContain('checkpointData');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('internal stack');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain(token);
    expect(serialized).toContain('保留业务摘要');
    expect(serialized).toContain('保留业务段落');
    expect(response).not.toHaveProperty('tenantId');
    expect(response).not.toHaveProperty('publicShareToken');
    expect(response).not.toHaveProperty('gateResults');
    expect(response).not.toHaveProperty('sourceArtifactUrl');
    expect(response).not.toHaveProperty('testReportUrl');
    expect(response).not.toHaveProperty('pluginIds');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
          workflowExecutionUpdatedAt: NOW.toISOString(),
        }),
        report: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'running',
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(updateChain.set.mock.calls[0]?.[0])).not.toContain(
      token,
    );
  });

  it('公开提交详情应把 completed execution 刷新为安全摘要且不泄露内部执行数据', async () => {
    const token = '9'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
    });
    const submission = createGeneratedAppSubmission({
      publicShareToken: token,
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
        executionBoundary: 'async-workflow-execution-created',
      },
      report: {
        title: '本地运行报告',
        sections: [
          {
            id: 'workflow-execution-status',
            title: '旧执行状态',
            body: '旧状态会被替换。',
            items: [],
          },
        ],
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
      },
    });
    const updateChain = createSubmissionUpdateReturningFromPayload(submission);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_V7_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
            status: 'completed',
            completedAt: NOW,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 2,
            completedSteps: 2,
            updatedAt: NOW,
            definitionSnapshot: {
              nodes: [{ data: { apiKey: 'secret-token-value' } }],
            },
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectManyChain([
          {
            nodeId: 'generated-app-plugin-tool-guided-intake-analysis',
            nodeType: 'plugin',
            status: 'completed',
            completedAt: NOW,
            result: {
              analysis: {
                riskLevel: 'follow-up',
                score: 42,
                signalCount: 2,
                mode: 'screening',
                followUpQuestions: ['请补充症状持续时间。'],
                boundaryNotice: '只做信息整理。',
                pluginId: GENERATED_PRIVATE_PLUGIN_ID,
                sourceArtifactUrl: 'https://internal/source.zip',
                nodeData: 'do-not-leak',
              },
              toolCalls: [{ token: 'secret-token-value' }],
            },
            checkpointData: { stack: 'internal stack' },
            nodeData: { path: '/root/AgentLoom/.env' },
          },
          {
            nodeId: 'generated-app-runtime-output',
            nodeType: 'text-output',
            status: 'completed',
            completedAt: NOW,
            result: {
              content: 'Workflow 已生成可公开展示的问诊整理摘要。',
              sourceArtifactUrl: 'https://internal/source.zip',
            },
            checkpointData: { testReportUrl: 'https://internal/report.json' },
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.getPublicSubmission(token, SUBMISSION_ID);
    const serialized = JSON.stringify(response);

    expect(response.status).toBe('completed');
    expect(response.result).toEqual(
      expect.objectContaining({
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_V7_ID,
        executionStatus: 'completed',
        workflowDefinitionId: WORKFLOW_DEFINITION_V7_ID,
        executionBoundary: 'async-workflow-execution-completed',
        workflowExecutionCompletedAt: NOW.toISOString(),
        workflowExecutionSummary: {
          summary:
            'Workflow execution 已完成；公开页面展示经过白名单过滤的业务输出摘要，并继续隐藏内部执行快照。',
          completedSteps: 2,
          failedSteps: 0,
          cancelledSteps: 0,
          totalSteps: 2,
          latestStepCompletedAt: NOW.toISOString(),
          publicOutputs: [
            {
              kind: 'analysis',
              title: '私有工具分析摘要',
              nodeId: 'generated-app-plugin-tool-guided-intake-analysis',
              nodeType: 'plugin',
              value: expect.objectContaining({
                riskLevel: 'follow-up',
                score: 42,
                signalCount: 2,
                mode: 'screening',
                followUpQuestions: ['请补充症状持续时间。'],
                boundaryNotice: '只做信息整理。',
              }),
            },
            {
              kind: 'text',
              title: 'Workflow 文本输出',
              nodeId: 'generated-app-runtime-output',
              nodeType: 'text-output',
              value: 'Workflow 已生成可公开展示的问诊整理摘要。',
            },
          ],
        },
      }),
    );
    expect(response.report).toEqual(
      expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: 'workflow-execution-status',
            items: expect.arrayContaining([
              expect.stringContaining('私有工具分析摘要'),
              expect.stringContaining('风险等级=follow-up'),
              expect.stringContaining('Workflow 文本输出'),
            ]),
          }),
        ]),
      }),
    );
    expect(serialized).not.toContain('definitionSnapshot');
    expect(serialized).not.toContain('nodeData');
    expect(serialized).not.toContain('checkpointData');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('internal stack');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain(GENERATED_PRIVATE_PLUGIN_ID);
    expect(serialized).toContain('follow-up');
    expect(serialized).toContain('请补充症状持续时间');
    expect(serialized).toContain('Workflow 已生成可公开展示的问诊整理摘要');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        result: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'completed',
          workflowExecutionSummary: expect.objectContaining({
            totalSteps: 2,
          }),
        }),
        report: expect.objectContaining({
          workflowExecution: true,
          executionStatus: 'completed',
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(updateChain.set.mock.calls[0]?.[0])).not.toContain(
      'secret-token-value',
    );
  });

  it.each([
    ['failed', 'async-workflow-execution-failed'],
    ['cancelled', 'async-workflow-execution-cancelled'],
  ] as const)(
    '公开提交详情应把 %s execution 降为失败态并保留 deterministic fallback',
    async (executionStatus, boundary) => {
      const token = '9'.repeat(64);
      const app = createGeneratedApp({
        status: 'published',
        readiness: createPublishCandidateReadiness(),
        publicShareEnabled: true,
        publicShareToken: token,
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      });
      const submission = createGeneratedAppSubmission({
        publicShareToken: token,
        status: 'completed',
        result: {
          runtimeKind: 'local-generated-app-deterministic-report',
          workflowExecution: true,
          executionId: WORKFLOW_EXECUTION_ID,
          executionStatus: 'running',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        },
        report: {
          title: '本地运行报告',
          workflowExecution: true,
          executionId: WORKFLOW_EXECUTION_ID,
          executionStatus: 'running',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        },
      });
      const updateChain =
        createSubmissionUpdateReturningFromPayload(submission);
      mockTenantDb.select
        .mockReturnValueOnce(createSelectChain([app]))
        .mockReturnValueOnce(createSelectChain([submission]))
        .mockReturnValueOnce(
          createSelectChain([
            {
              id: WORKFLOW_EXECUTION_ID,
              tenantId: TENANT_ID,
              workflowDefinitionId: WORKFLOW_DEFINITION_ID,
              status: executionStatus,
              completedAt: null,
              failedAt: executionStatus === 'failed' ? NOW : null,
              cancelledAt: executionStatus === 'cancelled' ? NOW : null,
              totalSteps: 2,
              completedSteps: 1,
              updatedAt: NOW,
            },
          ]),
        );
      mockTenantDb.update.mockReturnValueOnce(updateChain);

      const response = await service.getPublicSubmission(token, SUBMISSION_ID);

      expect(response.status).toBe('failed');
      expect(response.result).toEqual(
        expect.objectContaining({
          runtimeKind: 'local-generated-app-deterministic-report',
          workflowExecution: true,
          executionStatus,
          executionBoundary: boundary,
          workflowExecutionNotice: expect.stringMatching(/未完成|已取消/),
        }),
      );
      expect(JSON.stringify(response)).not.toContain('stack');
      expect(JSON.stringify(response)).not.toContain(token);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          result: expect.objectContaining({
            workflowExecution: true,
            executionStatus,
            executionBoundary: boundary,
          }),
          updatedAt: expect.any(Date),
        }),
      );
    },
  );

  it('公开提交详情遇到 execution 不存在、跨租户或 workflow mismatch 时应安全降级', async () => {
    const token = '9'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const submission = createGeneratedAppSubmission({
      publicShareToken: token,
      status: 'completed',
      result: {
        runtimeKind: 'local-generated-app-deterministic-report',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
      report: {
        title: '本地运行报告',
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        executionStatus: 'running',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });
    const unavailableUpdateChain =
      createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(createSelectChain([]));
    mockTenantDb.update.mockReturnValueOnce(unavailableUpdateChain);

    const unavailableResponse = await service.getPublicSubmission(
      token,
      SUBMISSION_ID,
    );

    expect(unavailableResponse.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        executionId: null,
        executionStatus: null,
        workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
        workflowExecutionNotice: expect.stringContaining('当前不可用'),
      }),
    );
    expect(JSON.stringify(unavailableResponse)).not.toContain(token);
    expect(unavailableResponse.status).toBe('failed');
    expect(unavailableUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({
          workflowExecution: false,
          executionStatus: null,
          workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
        }),
        updatedAt: expect.any(Date),
      }),
    );

    vi.clearAllMocks();
    const mismatchUpdateChain =
      createSubmissionUpdateReturningFromPayload(submission);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([submission]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: WORKFLOW_EXECUTION_ID,
            tenantId: TENANT_ID,
            workflowDefinitionId: '55555555-5555-4555-8555-555555555558',
            status: 'completed',
            completedAt: NOW,
            failedAt: null,
            cancelledAt: null,
            totalSteps: 1,
            completedSteps: 1,
            updatedAt: NOW,
          },
        ]),
      );
    mockTenantDb.update.mockReturnValueOnce(mismatchUpdateChain);

    const mismatchResponse = await service.getPublicSubmission(
      token,
      SUBMISSION_ID,
    );

    expect(mismatchResponse.result).toEqual(
      expect.objectContaining({
        workflowExecution: false,
        executionId: null,
        executionStatus: null,
        workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
      }),
    );
    expect(mismatchResponse.status).toBe('failed');
    expect(mismatchUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({
          workflowExecution: false,
          executionStatus: null,
        }),
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('重复启用现有公开链接应复用 token，并在缺少创建时间时补记时间', async () => {
    const token = 'b'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
      publicShareCreatedAt: null,
    });
    const updateChain = createGeneratedAppUpdateReturningFromPayload(app);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.enablePublicShare(
      TENANT_ID,
      USER_ID,
      APP_ID,
    );

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publicShareEnabled: true,
        publicShareToken: token,
        publicShareCreatedAt: expect.any(Date),
        publicShareDisabledAt: null,
      }),
    );
    expect(response.publicShareToken).toBe(token);
    expect(response.publicShareUrl).toContain(token);
  });

  it('公开链接写入零行时不应返回伪成功，且 APP_BASE_URL 应作为 DTO 地址回退', async () => {
    const app = createGeneratedApp({
      status: 'publish_candidate',
      readiness: createPublishCandidateReadiness(),
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(createUpdateReturningChain([]));

    await expect(
      service.enablePublicShare(TENANT_ID, USER_ID, APP_ID),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);

    const token = 'c'.repeat(64);
    const configService = createConfigService({
      APP_FRONTEND_URL: undefined,
      APP_BASE_URL: 'https://api.example.test///',
    });
    const fallbackService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    mockTenantDb.select.mockReturnValueOnce(
      createSelectChain([
        createGeneratedApp({
          status: 'published',
          readiness: createPublishCandidateReadiness(),
          publicShareEnabled: true,
          publicShareToken: token,
        }),
      ]),
    );

    const response = await fallbackService.findOne(TENANT_ID, APP_ID);

    expect(response.publicShareUrl).toBe(
      `https://api.example.test/generated-apps/public/${token}`,
    );
  });

  it('公开提交省略 input 时应按空对象执行并持久化确定性报告', async () => {
    const token = 'd'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    const insertChain =
      createGeneratedAppSubmissionInsertReturningFromPayload();
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await service.createPublicSubmission(token, {
      input: undefined,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        publicShareToken: token,
        input: {},
        status: 'completed',
        result: expect.objectContaining({
          runtimeKind: 'local-generated-app-deterministic-report',
        }),
        report: expect.objectContaining({
          runtimeKind: 'local-generated-app-deterministic-report',
        }),
        errorMessage: null,
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        appId: APP_ID,
        status: 'completed',
        input: {},
      }),
    );
  });

  it('公开链接关闭写入零行时应报告应用不存在而不返回旧状态', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'e'.repeat(64),
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(createUpdateReturningChain([]));

    await expect(
      service.disablePublicShare(TENANT_ID, USER_ID, APP_ID),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);
  });

  it('workflow handoff 刷新策略应区分全部运行态与终态', () => {
    const internals = createPublicRuntimeServiceForTest() as unknown as {
      shouldRefreshSubmissionWorkflowHandoff(
        submission: GeneratedAppSubmission,
      ): boolean;
    };
    const handoff = {
      workflowExecution: true,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      executionId: WORKFLOW_EXECUTION_ID,
    };

    for (const status of ['pending', 'running', 'paused'] as const) {
      expect(
        internals.shouldRefreshSubmissionWorkflowHandoff(
          createGeneratedAppSubmission({
            report: { ...handoff, executionStatus: status },
          }),
        ),
      ).toBe(true);
    }
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      expect(
        internals.shouldRefreshSubmissionWorkflowHandoff(
          createGeneratedAppSubmission({
            report: { ...handoff, executionStatus: status },
          }),
        ),
      ).toBe(false);
    }
    expect(
      internals.shouldRefreshSubmissionWorkflowHandoff(
        createGeneratedAppSubmission({
          report: { ...handoff, executionStatus: 'unknown' },
          result: { ...handoff, executionStatus: 'running' },
        }),
      ),
    ).toBe(true);
  });

  it('workflow handoff 应拒绝非法 execution 与 workflow 标识', () => {
    const internals = createPublicRuntimeServiceForTest() as unknown as {
      extractPublicWorkflowExecutionHandoffFromPayload(
        payload: Record<string, unknown>,
      ): {
        executionId: string;
        workflowDefinitionId: string | null;
      } | null;
    };

    expect(
      internals.extractPublicWorkflowExecutionHandoffFromPayload({
        workflowExecution: true,
        executionId: 'not-a-uuid',
      }),
    ).toBeNull();
    expect(
      internals.extractPublicWorkflowExecutionHandoffFromPayload({
        workflowExecution: true,
        executionId: WORKFLOW_EXECUTION_ID,
        workflowDefinitionId: 'not-a-uuid',
      }),
    ).toBeNull();
  });

  it('workflow 运行中 handoff 应仅在存在步骤总数时公开进度', () => {
    const internals = createPublicRuntimeServiceForTest() as unknown as {
      buildRefreshedWorkflowExecutionHandoff(params: {
        workflowDefinitionId: string;
        executionId: string;
        status:
          | 'pending'
          | 'running'
          | 'paused'
          | 'completed'
          | 'failed'
          | 'cancelled';
        updatedAt: Date;
        completedAt: Date | null;
        completedSteps: number;
        totalSteps: number;
      }): Record<string, unknown>;
    };
    const build = (
      status: 'running' | 'paused',
      completedSteps: number,
      totalSteps: number,
    ) =>
      internals.buildRefreshedWorkflowExecutionHandoff({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        executionId: WORKFLOW_EXECUTION_ID,
        status,
        updatedAt: NOW,
        completedAt: null,
        completedSteps,
        totalSteps,
      });

    expect(build('running', 0, 0)).toEqual(
      expect.objectContaining({
        executionStatus: 'running',
        notice: 'Workflow execution 仍在执行中；公开页面会继续轮询安全状态。',
      }),
    );
    expect(build('paused', 9, 3)).toEqual(
      expect.objectContaining({
        executionStatus: 'paused',
        notice: expect.stringContaining('3/3'),
      }),
    );
  });

  it('workflow 完成摘要应过滤非白名单输出并处理缺失完成时间', async () => {
    const steps = [
      {
        nodeId: 'analysis-node',
        nodeType: 'agent',
        status: 'completed',
        completedAt: null,
        result: { analysis: { score: 86 } },
      },
      {
        nodeId: 'text-empty',
        nodeType: 'text-output',
        status: 'completed',
        completedAt: null,
        result: { content: '' },
      },
      {
        nodeId: 'text-output',
        nodeType: 'text-output',
        status: 'completed',
        completedAt: null,
        result: { content: '公开业务结论' },
      },
      {
        nodeId: 'json-output',
        nodeType: 'json-output',
        status: 'completed',
        completedAt: null,
        result: { json: { recommendation: '复核' } },
      },
      {
        nodeId: 'json-empty',
        nodeType: 'json-output',
        status: 'completed',
        completedAt: null,
        result: { json: null },
      },
      {
        nodeId: 'failed-node',
        nodeType: 'plugin',
        status: 'failed',
        completedAt: null,
        result: { internalError: 'hidden' },
      },
      {
        nodeId: 'cancelled-node',
        nodeType: 'plugin',
        status: 'cancelled',
        completedAt: null,
        result: null,
      },
    ];
    mockTenantDb.select.mockReturnValueOnce(createSelectManyChain(steps));
    const internals = createPublicRuntimeServiceForTest() as unknown as {
      buildPublicWorkflowExecutionSummary(
        executionId: string,
        tenantId: string,
      ): Promise<Record<string, unknown>>;
    };

    const summary = await internals.buildPublicWorkflowExecutionSummary(
      WORKFLOW_EXECUTION_ID,
      TENANT_ID,
    );

    expect(summary).toEqual(
      expect.objectContaining({
        completedSteps: 5,
        failedSteps: 1,
        cancelledSteps: 1,
        totalSteps: 7,
        latestStepCompletedAt: null,
        publicOutputs: [
          expect.objectContaining({
            kind: 'analysis',
            title: '结构化分析摘要',
          }),
          expect.objectContaining({
            kind: 'text',
            value: '公开业务结论',
          }),
          expect.objectContaining({
            kind: 'json',
            value: { recommendation: '复核' },
          }),
        ],
      }),
    );
    expect(JSON.stringify(summary)).not.toContain('internalError');
  });
});

// 本文件验证 Generated App 公开运行时的分享就绪与匿名会话脱敏边界。

import { describe, expect, it } from 'vitest';

import { GeneratedAppPublicShareNotReadyException } from '../generated-app.exceptions';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';

describe('GeneratedAppPublicRuntimeService', () => {
  const service = new GeneratedAppPublicRuntimeService();

  it('publish_candidate 且允许分享时应通过公开分享校验', () => {
    expect(() =>
      service.assertCanEnablePublicShare({
        id: 'app-1',
        readiness: {
          state: 'publish_candidate',
          canCreatePublicShare: true,
          blockingIssueCount: 0,
          warningCount: 0,
          summary: 'ready',
          blockers: [],
          warnings: [],
        },
      }),
    ).not.toThrow();
  });

  it('未达到 publish_candidate 时应拒绝公开分享', () => {
    expect(() =>
      service.assertCanEnablePublicShare({
        id: 'app-1',
        readiness: {
          state: 'preview',
          canCreatePublicShare: false,
          blockingIssueCount: 1,
          warningCount: 0,
          summary: 'blocked',
          blockers: [],
          warnings: [],
        },
      }),
    ).toThrow(GeneratedAppPublicShareNotReadyException);
  });

  it('token-like 匿名会话值应替换为随机 UUID', () => {
    const normalized = service.normalizeAnonymousSessionId('a'.repeat(64));

    expect(normalized).not.toBe('a'.repeat(64));
    expect(normalized).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('普通匿名会话值应只 trim 不改写', () => {
    expect(service.normalizeAnonymousSessionId('  visitor-123  ')).toBe(
      'visitor-123',
    );
  });
});
