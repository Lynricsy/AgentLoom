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
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  NOW,
  createConfigService,
  createSelectChain,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createRuntimeBindingServiceForTest,
  createGeneratedApp,
  createWorkflowDefinitionReadinessRow,
  createGeneratedAppWithGate3Workspace,
  mockTenantDb
} from './generated-app-test-support';

describe('runtime migrated scenarios', () => {
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

  it('runtime binding readiness 无 Workflow 绑定时应返回 deterministic_only', async () => {
    const app = createGeneratedApp({ workflowDefinitionId: null });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    const response = await service.getRuntimeBindingReadiness(
      TENANT_ID,
      APP_ID,
    );

    expect(response).toEqual(
      expect.objectContaining({
        state: 'deterministic_only',
        workflowDefinitionId: null,
        workflowStatus: null,
        publishedVersionId: null,
        canStartWorkflowExecution: false,
        summary: expect.stringContaining('没有绑定 Workflow'),
        notice: expect.stringContaining('deterministic report'),
        updatedAt: NOW,
      }),
    );
    expect(mockTenantDb.select).toHaveBeenCalledTimes(1);
  });

  it('runtime binding readiness 绑定 Workflow 不存在时应返回 workflow_not_found', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectChain([]));

    const response = await service.getRuntimeBindingReadiness(
      TENANT_ID,
      APP_ID,
    );

    expect(response).toEqual(
      expect.objectContaining({
        state: 'workflow_not_found',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowStatus: null,
        publishedVersionId: null,
        canStartWorkflowExecution: false,
        summary: expect.stringContaining('不存在'),
      }),
    );
  });

  it('runtime binding readiness 对 editor handoff draft 即使已发布也不应标记可执行', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          createWorkflowDefinitionReadinessRow({
            status: 'published',
            publishedVersionId: WORKFLOW_VERSION_ID,
            metadata: {
              source: 'generated-app-editor-handoff',
              generatedAppId: APP_ID,
              bindingKind: 'editor-handoff-draft',
              publicRuntimeBoundary:
                'Generated App public runtime never exposes this internal resource id',
            },
          }),
        ]),
      );

    const response = await service.getRuntimeBindingReadiness(
      TENANT_ID,
      APP_ID,
    );

    expect(response).toEqual(
      expect.objectContaining({
        state: 'editor_handoff_draft',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowStatus: 'published',
        publishedVersionId: WORKFLOW_VERSION_ID,
        canStartWorkflowExecution: false,
        summary: expect.stringContaining('专业编辑器草稿'),
        notice: expect.stringContaining('不会被公开提交自动执行'),
      }),
    );
    expect(JSON.stringify(response)).not.toContain('generatedAppId');
    expect(JSON.stringify(response)).not.toContain('publicRuntimeBoundary');
  });

  it('runtime binding readiness 对未发布 Workflow 应返回 workflow_not_published', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          createWorkflowDefinitionReadinessRow({
            status: 'draft',
            publishedVersionId: null,
          }),
        ]),
      );

    const response = await service.getRuntimeBindingReadiness(
      TENANT_ID,
      APP_ID,
    );

    expect(response).toEqual(
      expect.objectContaining({
        state: 'workflow_not_published',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowStatus: 'draft',
        publishedVersionId: null,
        canStartWorkflowExecution: false,
        summary: expect.stringContaining('尚未发布'),
      }),
    );
  });

  it('runtime binding readiness 对已发布非草稿 Workflow 应返回 workflow_published', async () => {
    const app = createGeneratedApp({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([
          createWorkflowDefinitionReadinessRow({
            status: 'published',
            publishedVersionId: WORKFLOW_VERSION_ID,
            metadata: { source: 'manual-runtime-workflow' },
          }),
        ]),
      );

    const response = await service.getRuntimeBindingReadiness(
      TENANT_ID,
      APP_ID,
    );

    expect(response).toEqual(
      expect.objectContaining({
        state: 'workflow_published',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowStatus: 'published',
        publishedVersionId: WORKFLOW_VERSION_ID,
        canStartWorkflowExecution: true,
        summary: expect.stringContaining('已发布'),
        notice: expect.stringContaining('创建异步 Workflow execution'),
      }),
    );
    expect(JSON.stringify(response)).not.toContain('manual-runtime-workflow');
  });

  it('无插件工具时绑定编排应保持应用不变且不访问插件服务', async () => {
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const pluginServiceInstance = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      pluginService,
    );
    const generationPlan = buildGenerationPlan(createGeneratedApp().appSpec);
    const appWithoutPlan = createGeneratedApp({ generationPlan: null });
    const appWithEmptyTools = createGeneratedApp({
      generationPlan: {
        ...generationPlan,
        pluginTools: {
          ...generationPlan.pluginTools,
          tools: [],
        },
      },
    });
    const pluginBindingInternals =
      createRuntimeBindingServiceForTest(pluginService) as unknown as {
      ensureGeneratedPrivatePluginBindings(
        tenantId: string,
        userId: string,
        app: GeneratedApp,
      ): Promise<GeneratedApp>;
    };

    const withoutPlan =
      await pluginBindingInternals.ensureGeneratedPrivatePluginBindings(
        TENANT_ID,
        USER_ID,
        appWithoutPlan,
      );
    const withEmptyTools =
      await pluginBindingInternals.ensureGeneratedPrivatePluginBindings(
        TENANT_ID,
        USER_ID,
        appWithEmptyTools,
      );

    expect(withoutPlan).toBe(appWithoutPlan);
    expect(withEmptyTools).toBe(appWithEmptyTools);
    expect(pluginService.findByPluginId).not.toHaveBeenCalled();
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('存在插件工具但模块缺少 PluginService 时应在任何持久化前失败', async () => {
    const serviceWithoutPlugin = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
    );
    const app = createGeneratedApp({
      generationPlan: buildGenerationPlan(createGeneratedApp().appSpec),
    });
    const pluginBindingInternals =
      createRuntimeBindingServiceForTest() as unknown as {
      ensureGeneratedPrivatePluginBindings(
        tenantId: string,
        userId: string,
        app: GeneratedApp,
      ): Promise<GeneratedApp>;
    };

    await expect(
      pluginBindingInternals.ensureGeneratedPrivatePluginBindings(
        TENANT_ID,
        USER_ID,
        app,
      ),
    ).rejects.toThrow('需要 PluginService');
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('插件绑定应在 Gate 3 workspace 或规范化 toolId 缺失时拒绝进入文件与数据库阶段', async () => {
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const pluginServiceInstance = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      pluginService,
    );
    const pluginBindingInternals =
      createRuntimeBindingServiceForTest(pluginService) as unknown as {
      ensureGeneratedPrivatePluginBindings(
        tenantId: string,
        userId: string,
        app: GeneratedApp,
      ): Promise<GeneratedApp>;
    };
    const planWithoutWorkspace = buildGenerationPlan(
      createGeneratedApp().appSpec,
    );
    const appWithoutWorkspace = createGeneratedApp({
      generationPlan: planWithoutWorkspace,
    });

    await expect(
      pluginBindingInternals.ensureGeneratedPrivatePluginBindings(
        TENANT_ID,
        USER_ID,
        appWithoutWorkspace,
      ),
    ).rejects.toThrow('缺少 Gate 3 workspace');

    const appWithWorkspace = createGeneratedAppWithGate3Workspace();
    const firstTool = appWithWorkspace.generationPlan.pluginTools.tools[0];
    const appWithoutToolId = createGeneratedApp({
      generationPlan: {
        ...appWithWorkspace.generationPlan,
        pluginTools: {
          ...appWithWorkspace.generationPlan.pluginTools,
          tools: firstTool ? [{ ...firstTool, toolId: ' ' }] : [],
        },
      },
    });

    await expect(
      pluginBindingInternals.ensureGeneratedPrivatePluginBindings(
        TENANT_ID,
        USER_ID,
        appWithoutToolId,
      ),
    ).rejects.toThrow('toolId 缺失');
    expect(pluginService.findByPluginId).not.toHaveBeenCalled();
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('插件注册刷新决策应识别 artifact 与每个租户私有 metadata 漂移', () => {
    const wasmBundleUrl = `generated-apps/${APP_ID}/plugins/tool.wasm`;
    const pluginBundle = {
      storageKey: `generated-apps/${APP_ID}/plugins/tool.alp`,
      signature: 'signature-v1',
      contentHash: 'content-hash-v1',
      wasmEntry: 'dist/plugin.wasm',
    };
    const metadata = {
      source: 'generated-app-private-plugin',
      activationScope: 'tenant-private',
      generatedAppId: APP_ID,
      appSpecVersion: 1,
      toolId: 'tool',
      wasmEntry: pluginBundle.wasmEntry,
      wasmBundleUrl,
    };
    const pluginRecord = {
      storageKey: pluginBundle.storageKey,
      signature: pluginBundle.signature,
      contentHash: pluginBundle.contentHash,
      wasmBundleUrl,
      metadata,
    };
    const pluginInternals =
      createRuntimeBindingServiceForTest() as unknown as {
      mustRefreshGeneratedPrivatePluginRegistration(
        app: GeneratedApp,
        toolId: string,
        pluginRecord: {
          storageKey: string | null;
          signature: string | null;
          contentHash: string | null;
          wasmBundleUrl: string | null;
          metadata: Record<string, unknown> | null;
        },
        pluginBundle: {
          storageKey: string;
          signature: string;
          contentHash: string;
          wasmEntry: string | null;
        },
        wasmBundleUrl: string | undefined,
      ): boolean;
    };

    expect(
      pluginInternals.mustRefreshGeneratedPrivatePluginRegistration(
        createGeneratedApp(),
        'tool',
        pluginRecord,
        pluginBundle,
        wasmBundleUrl,
      ),
    ).toBe(false);

    const driftedRecords = [
      { ...pluginRecord, storageKey: 'stale.alp' },
      { ...pluginRecord, signature: 'stale-signature' },
      { ...pluginRecord, contentHash: 'stale-hash' },
      { ...pluginRecord, wasmBundleUrl: null },
      { ...pluginRecord, metadata: { ...metadata, source: 'manual' } },
      {
        ...pluginRecord,
        metadata: { ...metadata, activationScope: 'organization' },
      },
      {
        ...pluginRecord,
        metadata: { ...metadata, generatedAppId: 'other-app' },
      },
      { ...pluginRecord, metadata: { ...metadata, appSpecVersion: 2 } },
      { ...pluginRecord, metadata: { ...metadata, toolId: 'other-tool' } },
      { ...pluginRecord, metadata: { ...metadata, wasmEntry: null } },
      { ...pluginRecord, metadata: { ...metadata, wasmBundleUrl: null } },
      { ...pluginRecord, metadata: null },
    ];

    for (const driftedRecord of driftedRecords) {
      expect(
        pluginInternals.mustRefreshGeneratedPrivatePluginRegistration(
          createGeneratedApp(),
          'tool',
          driftedRecord,
          pluginBundle,
          wasmBundleUrl,
        ),
      ).toBe(true);
    }
  });
});

