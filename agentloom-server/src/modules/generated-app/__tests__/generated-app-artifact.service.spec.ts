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
  GATE_1_RUN_ID,
  GATE_2_RUN_ID,
  GATE_3_RUN_ID,
  GATE_4_RUN_ID,
  NOW,
  StartGenerationRunInput,
  DEFAULT_START_GENERATION_RUN_DTO,
  createConfigService,
  createGate3RunnerStub,
  createGate4RunnerStub,
  createGate3RunnerResult,
  createSelectChain,
  createSelectLatestRunNumberChain,
  createInsertReturningChain,
  createUpdateReturningChain,
  createGeneratedAppUpdateReturningFromPayload,
  createPublishCandidateReadiness,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createGeneratedAppGateRun,
  createGeneratedAppGenerationRun,
  createGeneratedAppRepairAttempt,
  createGeneratedApp,
  createGeneratedAppWithGate3Workspace,
  mockTenantDb
} from './generated-app-test-support';

describe('artifact migrated scenarios', () => {
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

  it('artifact manifest 应返回受控 Gate 3 workspace 源码与测试交付物清单', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-manifest-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace();
    const workspace = app.generationPlan?.buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    await mkdir(join(workspaceRoot, workspace.relativePath, 'src'), {
      recursive: true,
    });
    await writeFile(
      join(workspaceRoot, workspace.relativePath, 'src/App.tsx'),
      'export function App() { return null; }\n',
      'utf8',
    );
    await mkdir(
      join(workspaceRoot, workspace.relativePath, 'src/generated-app'),
      {
        recursive: true,
      },
    );
    await writeFile(
      join(
        workspaceRoot,
        workspace.relativePath,
        'src/generated-app/runtime-form.ts',
      ),
      'export const runtimeForm = { fields: [] } as const;\n',
      'utf8',
    );
    await mkdir(
      join(
        workspaceRoot,
        workspace.relativePath,
        'plugins/tool-guided-intake-analysis',
      ),
      { recursive: true },
    );
    await writeFile(
      join(
        workspaceRoot,
        workspace.relativePath,
        'plugins/tool-guided-intake-analysis/agentloom.plugin.json',
      ),
      '{"id":"com.agentloom.generated.tool-guided-intake-analysis"}\n',
      'utf8',
    );

    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    const response = await artifactService.getArtifactManifest(
      TENANT_ID,
      APP_ID,
    );

    expect(response.workspace).toEqual(
      expect.objectContaining({
        workspaceId: workspace.workspaceId,
        rootLabel: 'generated-app-workspaces',
        relativePath: workspace.relativePath,
        scaffold: 'react-vite-typescript',
        executionLevel: 'real-local-command-plan',
        materialized: true,
      }),
    );
    expect(response.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'source-app-tsx',
          path: 'src/App.tsx',
          materialized: true,
          readable: true,
          contentType: 'text/typescript',
        }),
        expect.objectContaining({
          artifactId: 'source-runtime-form-ts',
          path: 'src/generated-app/runtime-form.ts',
          materialized: true,
          readable: true,
          contentType: 'text/typescript',
        }),
        expect.objectContaining({
          artifactId: 'gate-3-unit-test-report',
          path: 'artifacts/gate-3/unit-test-report.json',
          materialized: false,
        }),
        expect.objectContaining({
          artifactId: 'plugin-tool-guided-intake-analysis-manifest',
          path: 'plugins/tool-guided-intake-analysis/agentloom.plugin.json',
          kind: 'plugin_manifest',
          materialized: true,
          readable: true,
          contentType: 'application/json',
        }),
        expect.objectContaining({
          artifactId: 'plugin-tool-guided-intake-analysis-bundle',
          path: 'artifacts/gate-3/plugins/tool-guided-intake-analysis.alp',
          kind: 'plugin_bundle',
          materialized: false,
          readable: false,
          contentType: 'application/zip',
        }),
      ]),
    );
    expect(JSON.stringify(response)).not.toContain(workspaceRoot);

    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('artifact content 应只按 artifact id 读取受控 workspace 文件内容', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-content-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace();
    const workspace = app.generationPlan?.buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    await mkdir(join(workspaceRoot, workspace.relativePath, 'src'), {
      recursive: true,
    });
    await writeFile(
      join(workspaceRoot, workspace.relativePath, 'src/App.tsx'),
      'export function App() { return <main />; }\n',
      'utf8',
    );

    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    const response = await artifactService.getArtifactContent(
      TENANT_ID,
      APP_ID,
      'source-app-tsx',
    );

    expect(response.artifact).toEqual(
      expect.objectContaining({
        artifactId: 'source-app-tsx',
        path: 'src/App.tsx',
        materialized: true,
        readable: true,
      }),
    );
    expect(response.content).toContain('export function App()');
    expect(response.truncated).toBe(false);
    expect(JSON.stringify(response)).not.toContain(workspaceRoot);

    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('artifact content 对未知 artifact id 应拒绝任意路径读取', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-unknown-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace();

    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    await expect(
      artifactService.getArtifactContent(TENANT_ID, APP_ID, '../secret'),
    ).rejects.toBeInstanceOf(GeneratedAppArtifactNotFoundException);
  });

  it('artifact content 对超出内联限制的产物应返回过大错误', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-large-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
      }),
    );
    const app = createGeneratedAppWithGate3Workspace();
    const workspace = app.generationPlan?.buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    await mkdir(join(workspaceRoot, workspace.relativePath, 'src'), {
      recursive: true,
    });
    await writeFile(
      join(workspaceRoot, workspace.relativePath, 'src/App.tsx'),
      'x'.repeat(256 * 1024 + 1),
      'utf8',
    );

    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    await expect(
      artifactService.getArtifactContent(TENANT_ID, APP_ID, 'source-app-tsx'),
    ).rejects.toBeInstanceOf(GeneratedAppArtifactTooLargeException);

    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('artifact manifest 对未生成 workspace 的应用应返回空清单', async () => {
    const app = createGeneratedApp({ generationPlan: null });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

    const response = await service.getArtifactManifest(TENANT_ID, APP_ID);

    expect(response).toEqual({
      workspace: null,
      artifacts: [],
      updatedAt: app.updatedAt,
    });
  });

  async function startGenerationRunWithGate3Result(
    runnerResult: GeneratedAppGate3RunnerResult,
    dto: StartGenerationRunInput = DEFAULT_START_GENERATION_RUN_DTO,
  ) {
    const configService = createConfigService();
    const gate3Runner = createGate3RunnerStub(configService, runnerResult);
    const serviceWithRunner = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      gate3Runner,
      undefined,
      undefined,
      undefined,
      undefined,
      createGeneratedPrivatePluginServiceMock(),
    );
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: '9'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const run = createGeneratedAppGenerationRun();
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-0',
      gateOrder: 0,
      gateName: '需求规格门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
      evidence: [],
    });
    const gate1Run = createGeneratedAppGateRun({
      id: GATE_1_RUN_ID,
      gateId: 'gate-1',
      gateOrder: 1,
      gateName: '架构计划门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
      evidence: [],
    });
    const gate2Run = createGeneratedAppGateRun({
      id: GATE_2_RUN_ID,
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 2 通过：staticContracts 已覆盖公开运行输入输出、前端路由、Workflow/Agent 编排、插件权限、提交持久化、测试入口和需求 traceability。',
      evidence: [],
    });
    const gate3Run = createGeneratedAppGateRun({
      id: GATE_3_RUN_ID,
      gateId: 'gate-3',
      gateOrder: 3,
      gateName: '构建与单元门禁',
      generationRunId: GENERATION_RUN_ID,
      status: runnerResult.status,
      summary: runnerResult.summary,
      evidence: runnerResult.evidence,
      failure: runnerResult.failure,
      repairInstructions: runnerResult.repairInstructions,
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        runnerResult.failure?.message ??
        'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const shouldRecordAutomaticRepairAttempt = dto.maxRepairAttempts > 0;
    const repairAttempt = createGeneratedAppRepairAttempt({
      targetGateId: 'gate-3',
      status: 'failed',
      failureSummary:
        runnerResult.failure?.message ??
        'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。',
      changeSummary: '自动修复循环已定位 Gate 3 失败，但未应用源码补丁。',
      verificationSummary: 'Gate 3 仍为 failed。',
      completedAt: NOW,
    });
    const insertRepairAttemptChain = shouldRecordAutomaticRepairAttempt
      ? createInsertReturningChain([repairAttempt])
      : undefined;
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate3UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate3UpdatePayload = payload;
      });
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3RunChain);
    if (insertRepairAttemptChain) {
      mockTenantDb.insert.mockReturnValueOnce(insertRepairAttemptChain);
    }
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await serviceWithRunner.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      dto,
    );

    return {
      app,
      gate3Runner,
      gate3UpdatePayload,
      insertGate3RunChain,
      insertRepairAttemptChain,
      response,
      updateRunChain,
    };
  }

  async function startGenerationRunWithGate4Result(
    runnerResult: GeneratedAppGate4RunnerResult,
  ) {
    const configService = createConfigService();
    const gate3Runner = createGate3RunnerStub(
      configService,
      createGate3RunnerResult(),
    );
    const gate4Runner = createGate4RunnerStub(configService, runnerResult);
    const serviceWithRunner = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      gate3Runner,
      gate4Runner,
      undefined,
      undefined,
      undefined,
      createGeneratedPrivatePluginServiceMock(),
    );
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: '8'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const run = createGeneratedAppGenerationRun();
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-0',
      gateOrder: 0,
      gateName: '需求规格门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
      evidence: [],
    });
    const gate1Run = createGeneratedAppGateRun({
      id: GATE_1_RUN_ID,
      gateId: 'gate-1',
      gateOrder: 1,
      gateName: '架构计划门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
      evidence: [],
    });
    const gate2Run = createGeneratedAppGateRun({
      id: GATE_2_RUN_ID,
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 2 通过：staticContracts 已覆盖公开运行输入输出、前端路由、Workflow/Agent 编排、插件权限、提交持久化、测试入口和需求 traceability。',
      evidence: [],
    });
    const gate3Run = createGeneratedAppGateRun({
      id: GATE_3_RUN_ID,
      gateId: 'gate-3',
      gateOrder: 3,
      gateName: '构建与单元门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 3 通过：real-local command plan 已执行受控 build/typecheck/unit/component-golden 命令并产出 evidence。',
      evidence: createGate3RunnerResult().evidence,
      failure: null,
      repairInstructions: null,
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: runnerResult.status,
      summary: runnerResult.summary,
      evidence: runnerResult.evidence,
      failure: runnerResult.failure,
      repairInstructions: runnerResult.repairInstructions,
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        runnerResult.failure?.message ??
        'Gate 4 集成门禁失败，不能继续执行 Gate 5-7。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const insertGate4RunChain = createInsertReturningChain([gate4Run]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate4UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate4Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate4UpdatePayload = payload;
      });
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3RunChain)
      .mockReturnValueOnce(insertGate4RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await serviceWithRunner.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    return {
      app,
      gate3Runner,
      gate4Runner,
      gate4UpdatePayload,
      insertGate4RunChain,
      response,
      updateRunChain,
    };
  }

  it.each([
    {
      name: 'buildUnitPlan 不是对象',
      mutate: (plan: Record<string, unknown>) => {
        plan.buildUnitPlan = null;
      },
    },
    {
      name: 'executionLevel 不受支持',
      mutate: (plan: Record<string, unknown>) => {
        (plan.buildUnitPlan as Record<string, unknown>).executionLevel =
          'remote-command-plan';
      },
    },
    {
      name: 'generationWorkspace 不是对象',
      mutate: (plan: Record<string, unknown>) => {
        (plan.buildUnitPlan as Record<string, unknown>).generationWorkspace =
          null;
      },
    },
    {
      name: 'workspace 必填标识为空',
      mutate: (plan: Record<string, unknown>) => {
        const buildUnitPlan = plan.buildUnitPlan as Record<string, unknown>;
        (
          buildUnitPlan.generationWorkspace as Record<string, unknown>
        ).workspaceId = '';
      },
    },
    {
      name: 'workspace 使用绝对路径',
      mutate: (plan: Record<string, unknown>) => {
        const buildUnitPlan = plan.buildUnitPlan as Record<string, unknown>;
        (
          buildUnitPlan.generationWorkspace as Record<string, unknown>
        ).relativePath = '/tmp/outside-workspace';
      },
    },
    {
      name: 'workspace 使用 traversal 路径',
      mutate: (plan: Record<string, unknown>) => {
        const buildUnitPlan = plan.buildUnitPlan as Record<string, unknown>;
        (
          buildUnitPlan.generationWorkspace as Record<string, unknown>
        ).relativePath = '../outside-workspace';
      },
    },
  ])('artifact manifest 对 $name 应保持不可用', async ({ mutate }) => {
    const app = createGeneratedAppWithGate3Workspace();
    const generationPlan = structuredClone(
      app.generationPlan,
    ) as unknown as Record<string, unknown>;
    mutate(generationPlan);
    const malformedApp = createGeneratedApp({
      generationPlan: generationPlan as unknown as GeneratedAppGenerationPlan,
    });
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([malformedApp]));

    const response = await service.getArtifactManifest(TENANT_ID, APP_ID);

    expect(response).toEqual({
      workspace: null,
      artifacts: [],
      updatedAt: malformedApp.updatedAt,
    });
  });

  it('artifact manifest 不应把同名目录当成已物化文件', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-directory-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({ GENERATED_APP_WORKSPACE_ROOT: workspaceRoot }),
    );
    const app = createGeneratedAppWithGate3Workspace();
    const workspace = app.generationPlan.buildUnitPlan?.generationWorkspace;
    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }

    try {
      await mkdir(join(workspaceRoot, workspace.relativePath, 'src/App.tsx'), {
        recursive: true,
      });
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

      const response = await artifactService.getArtifactManifest(
        TENANT_ID,
        APP_ID,
      );

      expect(response.artifacts).toContainEqual(
        expect.objectContaining({
          artifactId: 'source-app-tsx',
          materialized: false,
          readable: false,
          sizeBytes: null,
        }),
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('artifact content 不应内联可物化的 zip 插件包', async () => {
    const workspaceRoot = join(
      tmpdir(),
      `agentloom-generated-app-artifact-zip-${crypto.randomUUID()}`,
    );
    const artifactService = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService({ GENERATED_APP_WORKSPACE_ROOT: workspaceRoot }),
    );
    const app = createGeneratedAppWithGate3Workspace();
    const workspace = app.generationPlan.buildUnitPlan?.generationWorkspace;
    if (!workspace) {
      throw new Error('test fixture missing workspace');
    }
    const bundlePath = join(
      workspaceRoot,
      workspace.relativePath,
      'artifacts/gate-3/plugins/tool-guided-intake-analysis.alp',
    );

    try {
      await mkdir(join(bundlePath, '..'), { recursive: true });
      await writeFile(bundlePath, 'not-an-inline-public-artifact', 'utf8');
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));

      await expect(
        artifactService.getArtifactContent(
          TENANT_ID,
          APP_ID,
          'plugin-tool-guided-intake-analysis-bundle',
        ),
      ).rejects.toBeInstanceOf(GeneratedAppArtifactNotFoundException);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

// 本文件验证 Generated App artifact service 的受控相对路径边界。

import { describe, expect, it } from 'vitest';

import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppArtifactNotFoundException } from '../generated-app.exceptions';

describe('GeneratedAppArtifactService', () => {
  const service = new GeneratedAppArtifactService();

  it('应把合法 artifact 相对路径解析到 workspace 内', () => {
    expect(
      service.resolveSafeRelativePathInside(
        '/tmp/generated-app',
        'artifacts/gate-3/build.html',
      ),
    ).toBe('/tmp/generated-app/artifacts/gate-3/build.html');
  });

  it.each(['../secret', '/etc/passwd', 'a\\b', './artifact', 'a//b']) (
    '应拒绝越界或非规范 artifact 路径 %s',
    (relativePath) => {
      expect(() =>
        service.resolveSafeRelativePathInside('/tmp/generated-app', relativePath),
      ).toThrow(GeneratedAppArtifactNotFoundException);
    },
  );
});
