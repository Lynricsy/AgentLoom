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

const { mockTenantDb } = vi.hoisted(() => ({
  mockTenantDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const APP_ID = '33333333-3333-4333-8333-333333333333';
const SUBMISSION_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION_RUN_ID = '55555555-5555-4555-8555-555555555555';
const WORKFLOW_DEFINITION_ID = '55555555-5555-4555-8555-555555555556';
const WORKFLOW_EXECUTION_ID = '55555555-5555-4555-8555-555555555557';
const WORKFLOW_VERSION_ID = '55555555-5555-4555-8555-555555555559';
const WORKFLOW_DEFINITION_V7_ID = '77777777-7777-7777-8777-777777777776';
const WORKFLOW_EXECUTION_V7_ID = '77777777-7777-7777-8777-777777777777';
const GENERATED_PRIVATE_PLUGIN_DB_ID = '77777777-7777-4777-8777-777777777770';
const GENERATED_PRIVATE_PLUGIN_ID =
  'com.agentloom.generated.app-33333333-3333-4333-8333-333333333333.tool-guided-intake-analysis';
const GATE_RUN_ID = '66666666-6666-4666-8666-666666666666';
const GATE_1_RUN_ID = '66666666-6666-4666-8666-666666666667';
const GATE_2_RUN_ID = '66666666-6666-4666-8666-666666666668';
const GATE_3_RUN_ID = '66666666-6666-4666-8666-666666666669';
const GATE_4_RUN_ID = '66666666-6666-4666-8666-666666666670';
const GATE_5_RUN_ID = '66666666-6666-4666-8666-666666666671';
const GATE_6_RUN_ID = '66666666-6666-4666-8666-666666666672';
const GATE_7_RUN_ID = '66666666-6666-4666-8666-666666666673';
const REPAIR_ATTEMPT_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-04-25T00:00:00.000Z');
type StartGenerationRunInput = {
  triggerSource: 'manual' | 'retry';
  maxRepairAttempts: number;
  maxRuntimeSeconds: number;
};
const DEFAULT_START_GENERATION_RUN_DTO: StartGenerationRunInput = {
  triggerSource: 'manual',
  maxRepairAttempts: 3,
  maxRuntimeSeconds: 1800,
};

function createConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: vi.fn((key: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }

      return key === 'APP_FRONTEND_URL'
        ? 'https://studio.example.test'
        : undefined;
    }),
  } as unknown as ConfigService;
}

function createGate3RunnerStub(
  configService: ConfigService,
  result: GeneratedAppGate3RunnerResult,
  repairResult?: GeneratedAppGate3RepairResult,
): GeneratedAppGate3WorkspaceRunner {
  const delegate = new GeneratedAppGate3WorkspaceRunner(configService);

  return {
    getExecutionLevel: vi.fn(() => result.executionLevel),
    getExecutorMode: vi.fn(() =>
      result.executionLevel === 'fixture-execution'
        ? 'fixture'
        : result.executionLevel === 'disabled-execution'
          ? 'disabled'
          : 'real',
    ),
    buildWorkspaceContract: vi.fn(
      delegate.buildWorkspaceContract.bind(delegate),
    ),
    buildCommandPlan: vi.fn(delegate.buildCommandPlan.bind(delegate)),
    materializeAndRun: vi.fn().mockResolvedValue(result),
    applyRepairPatchAndRun: vi.fn().mockResolvedValue(
      repairResult ??
        ({
          ...result,
          patchApplied: false,
          changeSummary: '测试替身未应用补丁。',
          verificationSummary: '测试替身未执行再验证。',
        } satisfies GeneratedAppGate3RepairResult),
    ),
  } as unknown as GeneratedAppGate3WorkspaceRunner;
}

function createGate4RunnerStub(
  configService: ConfigService,
  result: GeneratedAppGate4RunnerResult,
): GeneratedAppGate4IntegrationRunner {
  return {
    getExecutionLevel: vi.fn(() => result.executionLevel),
    getExecutorMode: vi.fn(() =>
      result.executionLevel === 'fixture-integration'
        ? 'fixture'
        : result.executionLevel === 'disabled-integration'
          ? 'disabled'
          : 'real',
    ),
    run: vi.fn().mockReturnValue(result),
  } as unknown as GeneratedAppGate4IntegrationRunner;
}

function createGate4RunnerResult(
  overrides: Partial<GeneratedAppGate4RunnerResult> = {},
): GeneratedAppGate4RunnerResult {
  return {
    status: 'passed',
    executionLevel: 'real-local-integration',
    summary:
      'Gate 4 通过：real-local integration runner 已执行受控 deterministic public runtime、creator query、Agent/Workflow trace fixture 和插件 smoke trace fixture。',
    evidence: [
      {
        id: 'gate-4-public-runtime-read',
        label: 'Gate 4 public runtime read',
        kind: 'test',
        url: null,
        summary:
          'GET /generated-apps/public/{token} status=200；mode=real_local_integration；executed=true；traceArtifacts=public-runtime-api-trace；requirements=req-1；scenarios=scenario-1；staticContracts=gate-2-public-runtime-contract',
        details: {
          runnerId: 'gate-4-real-integration-runner',
          executionMode: 'real_local_integration',
          executionLevel: 'real-local-integration',
          requestId: 'gate4-gate-4-public-runtime-read-1',
          method: 'GET',
          pathTemplate: '/generated-apps/public/{token}',
          responseStatus: 200,
          responseBodySummary:
            '{"appId":"synthetic-generated-app-id","title":"问诊助手"}',
          durationMs: 1,
          executed: true,
          traceArtifactRefs: ['public-runtime-api-trace'],
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
          staticContractIds: ['gate-2-public-runtime-contract'],
          productionSandboxExecuted: false,
          extismExecuted: false,
        },
      },
    ],
    failure: null,
    repairInstructions: null,
    traceResults: [
      {
        checkId: 'gate-4-public-runtime-read',
        requestId: 'gate4-gate-4-public-runtime-read-1',
        method: 'GET',
        pathTemplate: '/generated-apps/public/{token}',
        responseStatus: 200,
        responseBodySummary:
          '{"appId":"synthetic-generated-app-id","title":"问诊助手"}',
        durationMs: 1,
        executed: true,
        traceArtifactRefs: ['public-runtime-api-trace'],
        requirementIds: ['req-1'],
        scenarioIds: ['scenario-1'],
        staticContractIds: ['gate-2-public-runtime-contract'],
        passed: true,
        boundary: 'public-runtime-api',
      },
    ],
    ...overrides,
  };
}

function createGate3RunnerResult(
  overrides: Partial<GeneratedAppGate3RunnerResult> = {},
): GeneratedAppGate3RunnerResult {
  return {
    status: 'passed',
    executionLevel: 'real-local-command-plan',
    summary:
      'Gate 3 通过：real-local command plan 已执行受控 build/typecheck/unit/component-golden 命令并产出 evidence。',
    evidence: [
      {
        id: 'gate-3-generation-workspace-materialized',
        label: 'Generation Workspace materialization',
        kind: 'build',
        url: null,
        summary:
          '受控 react-vite-typescript workspace 已 materialize，未开放任意路径写入。',
        details: {
          runnerId: 'gate-3-real-build-unit-runner',
          executionMode: 'real_local_command_plan',
          executed: true,
          workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
        },
      },
      {
        id: 'gate-3-frontend-build-command',
        label: 'Gate 3 frontend build command',
        kind: 'build',
        url: null,
        summary:
          'node scripts/gate3-build.mjs exitCode=0；mode=real_local_command_plan；executed=true；artifacts=frontend-build-output；requirements=req-1；scenarios=scenario-1',
        details: {
          runnerId: 'gate-3-real-build-unit-runner',
          executionMode: 'real_local_command_plan',
          commandId: 'gate-3-frontend-build-command',
          command: 'node scripts/gate3-build.mjs',
          exitCode: 0,
          stdoutSummary: '{"command":"gate3-build"}',
          stderrSummary: '',
          durationMs: 1,
          executed: true,
          timedOut: false,
          artifactRefs: ['frontend-build-output'],
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
        },
      },
    ],
    failure: null,
    repairInstructions: null,
    commandResults: [
      {
        commandId: 'gate-3-frontend-build-command',
        command: 'node scripts/gate3-build.mjs',
        exitCode: 0,
        stdoutSummary: '{"command":"gate3-build"}',
        stderrSummary: '',
        durationMs: 1,
        executed: true,
        timedOut: false,
        artifactRefs: ['frontend-build-output'],
        requirementIds: ['req-1'],
        scenarioIds: ['scenario-1'],
      },
    ],
    ...overrides,
  };
}

function createGate3RepairResult(
  overrides: Partial<GeneratedAppGate3RepairResult> = {},
): GeneratedAppGate3RepairResult {
  return {
    ...createGate3RunnerResult({
      summary:
        'Gate 3 修复通过：受控 frontend workspace patch 已应用，build/typecheck/unit/component-golden 再验证命令全部通过。',
      evidence: [
        ...createGate3RunnerResult().evidence,
        {
          id: 'gate-3-controlled-repair-patch',
          label: 'Gate 3 controlled repair patch',
          kind: 'build',
          url: null,
          summary:
            '受控 frontend workspace patch 已应用；targetGate=gate-3；patchTargets=generationWorkspace.files；requiredCommands=gate-3-unit-test-command',
          details: {
            runnerId: 'gate-3-real-build-unit-runner',
            executionMode: 'real_local_command_plan',
            patchApplied: true,
            artifactRefs: [
              'src/generated-app/repair-traceability.ts',
              'artifacts/gate-3/repair-patch.json',
            ],
          },
        },
      ],
    }),
    patchApplied: true,
    changeSummary: 'Gate 3 自动修复循环已应用受控 frontend workspace patch。',
    verificationSummary:
      'Gate 3 再验证通过：build、typecheck、unit 和 component/golden 受控命令全部通过。',
    ...overrides,
  };
}

function createSelectChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function createSelectManyChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function createSelectPageChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
}

function createSelectLatestRunNumberChain(runNumber: number | null) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(runNumber === null ? [] : [{ runNumber }]),
  };
}

function createSelectOrderedLimitChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

type SelectOrderedLimitChain<T> = ReturnType<
  typeof createSelectOrderedLimitChain<T>
>;

function createCountChain(total: number) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: total }]),
  };
}

function createInsertReturningChain<T>(result: T[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

function createGeneratedWorkflowInsertReturningFromPayload(
  workflowId = WORKFLOW_DEFINITION_ID,
) {
  let payload: Record<string, unknown> = {};
  const chain = {
    values: vi.fn((nextPayload: Record<string, unknown>) => {
      payload = nextPayload;
      return chain;
    }),
    returning: vi.fn(async () => [{ id: workflowId }]),
    getPayload: () => payload,
  };

  return chain;
}

function createGeneratedAppSubmissionInsertReturningFromPayload(
  overrides: Partial<GeneratedAppSubmission> = {},
) {
  let payload: Partial<GeneratedAppSubmission> = {};
  const chain = {
    values: vi.fn((nextPayload: Partial<GeneratedAppSubmission>) => {
      payload = nextPayload;
      return chain;
    }),
    returning: vi.fn(async () => [
      createGeneratedAppSubmission({ ...payload, ...overrides }),
    ]),
  };

  return chain;
}

function createUpdateReturningChain<T>(result: T[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

function createSubmissionUpdateReturningFromPayload(
  baseSubmission: GeneratedAppSubmission,
  onPayload?: (payload: Partial<GeneratedAppSubmission>) => void,
) {
  let payload: Partial<GeneratedAppSubmission> = {};
  const chain = {
    set: vi.fn((nextPayload: Partial<GeneratedAppSubmission>) => {
      payload = nextPayload;
      onPayload?.(nextPayload);
      return chain;
    }),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [
      createGeneratedAppSubmission({ ...baseSubmission, ...payload }),
    ]),
  };

  return chain;
}

function createGeneratedAppUpdateReturningFromPayload(
  baseApp: GeneratedApp,
  onPayload?: (payload: Partial<GeneratedApp>) => void,
) {
  let payload: Partial<GeneratedApp> = {};
  const chain = {
    set: vi.fn((nextPayload: Partial<GeneratedApp>) => {
      payload = nextPayload;
      onPayload?.(nextPayload);
      return chain;
    }),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [
      createGeneratedApp({ ...baseApp, ...payload }),
    ]),
  };

  return chain;
}

function createUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function createGeneratedAppServiceWithExecution(
  executionService: Partial<ExecutionService>,
) {
  return new GeneratedAppService(
    mockTenantDb as unknown as DrizzleDB,
    createConfigService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    executionService as ExecutionService,
  );
}

function createPublishCandidateReadiness(): GeneratedAppReadiness {
  return createReadiness({
    state: 'publish_candidate',
    canCreatePublicShare: true,
    blockingIssueCount: 0,
    warningCount: 0,
    summary: '全部阻断门禁已通过且没有非阻断 warning。',
    blockers: [],
    warnings: [],
  });
}

function createReadiness(
  overrides: Partial<GeneratedAppReadiness> = {},
): GeneratedAppReadiness {
  return {
    state: 'preview',
    canCreatePublicShare: false,
    blockingIssueCount: 7,
    warningCount: 0,
    summary: '阻断门禁尚未全部通过，当前只能预览。',
    blockers: [
      {
        gateId: 'gate-1',
        name: '架构计划门禁',
        status: 'pending',
        summary: '等待实现计划。',
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function createGeneratedAppSubmission(
  overrides: Partial<GeneratedAppSubmission> = {},
): GeneratedAppSubmission {
  return {
    id: SUBMISSION_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    appSpecVersion: 1,
    publicShareToken: '1'.repeat(64),
    anonymousSessionId: 'anonymous-session-1',
    status: 'received',
    input: { chiefComplaint: '头痛' },
    result: null,
    report: null,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function createGeneratedPrivatePluginRecord(
  overrides: Partial<{
    id: string;
    pluginId: string;
    status: 'registered' | 'active' | 'disabled' | 'error';
    manifest: Record<string, unknown>;
    nodeDefinitions: Array<Record<string, unknown>>;
    storageKey: string | null;
    signature: string | null;
    contentHash: string | null;
    wasmBundleUrl: string | null;
    metadata: Record<string, unknown> | null;
    occVersion: number;
  }> = {},
) {
  const id = overrides.id ?? GENERATED_PRIVATE_PLUGIN_DB_ID;
  const pluginId = overrides.pluginId ?? GENERATED_PRIVATE_PLUGIN_ID;

  return {
    id,
    tenantId: TENANT_ID,
    orgId: '88888888-8888-4888-8888-888888888888',
    pluginId,
    name: 'Guided Intake Analysis',
    version: '1.0.0',
    author: 'AgentLoom Generated App',
    description: 'Generated private plugin',
    license: 'UNLICENSED',
    status: overrides.status ?? 'active',
    manifest: overrides.manifest ?? {},
    nodeDefinitions: overrides.nodeDefinitions ?? [],
    storageKey: overrides.storageKey ?? null,
    signature: overrides.signature ?? null,
    contentHash: overrides.contentHash ?? null,
    wasmBundleUrl: overrides.wasmBundleUrl ?? null,
    permissions: [],
    installedBy: USER_ID,
    metadata: overrides.metadata ?? null,
    occVersion: overrides.occVersion ?? 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createGeneratedPrivatePluginServiceMock(
  overrides: Partial<PluginService> = {},
): PluginService {
  const plugin = createGeneratedPrivatePluginRecord();

  return {
    findByPluginId: vi.fn().mockResolvedValue(plugin),
    register: vi.fn().mockResolvedValue(plugin),
    updateRegistrationArtifacts: vi.fn().mockResolvedValue({
      ...plugin,
      wasmBundleUrl: `generated-apps/${APP_ID}/plugins/tool-guided-intake-analysis.wasm`,
      metadata: {
        source: 'generated-app-private-plugin',
        generatedAppId: APP_ID,
        appSpecVersion: 1,
        toolId: 'tool-guided-intake-analysis',
        activationScope: 'tenant-private',
        wasmEntry: 'dist/plugin.wasm',
        wasmBundleUrl: `generated-apps/${APP_ID}/plugins/tool-guided-intake-analysis.wasm`,
        wasmRuntime: 'wasm-extism',
      },
      occVersion: plugin.occVersion + 1,
    }),
    updateStatus: vi.fn().mockResolvedValue({
      ...plugin,
      status: 'active',
      occVersion: plugin.occVersion + 1,
    }),
    ...overrides,
  } as unknown as PluginService;
}

function createStorageServiceMock(
  overrides: Partial<StorageService> = {},
): StorageService {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StorageService;
}
function createRuntimeBindingServiceForTest(
  pluginService?: PluginService,
  configService = createConfigService(),
  storageService = createStorageServiceMock(),
): GeneratedAppRuntimeBindingService {
  const repository = new GeneratedAppRepository(
    mockTenantDb as unknown as DrizzleDB,
    configService,
  );
  const artifactService = new GeneratedAppArtifactService(
    repository,
    configService,
    storageService,
  );
  return new GeneratedAppRuntimeBindingService(
    repository,
    artifactService,
    pluginService,
  );
}
function createRepairServiceForTest(): GeneratedAppGenerationRepairService {
  return new GeneratedAppGenerationRepairService(
    new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
    ),
  );
}

function createPublicRuntimeServiceForTest(
  executionService?: ExecutionService,
): GeneratedAppPublicRuntimeService {
  const configService = createConfigService();
  const repository = new GeneratedAppRepository(
    mockTenantDb as unknown as DrizzleDB,
    configService,
  );
  const artifactService = new GeneratedAppArtifactService(
    repository,
    configService,
  );
  const runtimeBindingService = new GeneratedAppRuntimeBindingService(
    repository,
    artifactService,
  );
  return new GeneratedAppPublicRuntimeService(
    repository,
    artifactService,
    runtimeBindingService,
    executionService,
  );
}


function createGeneratedAppGateRun(
  overrides: Partial<GeneratedAppGateRun> = {},
): GeneratedAppGateRun {
  return {
    id: GATE_RUN_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    generationRunId: null,
    repairAttemptId: null,
    gateId: 'gate-1',
    gateOrder: 1,
    gateName: '架构计划门禁',
    blocking: true,
    attemptNumber: 1,
    status: 'passed',
    summary: '实现计划覆盖 AppSpec、页面、编排、插件和测试计划。',
    evidence: [
      {
        id: 'plan-review-1',
        label: '计划审查',
        kind: 'plan',
        url: null,
        summary: '计划已覆盖核心需求。',
      },
    ],
    failure: null,
    repairInstructions: null,
    startedAt: NOW,
    completedAt: NOW,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createGeneratedAppGenerationRun(
  overrides: Partial<GeneratedAppGenerationRun> = {},
): GeneratedAppGenerationRun {
  return {
    id: GENERATION_RUN_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    runNumber: 1,
    status: 'running',
    triggerSource: 'manual',
    maxRepairAttempts: 3,
    maxRuntimeSeconds: 1800,
    summary: '开始自动开发测试循环。',
    failureReason: null,
    startedAt: NOW,
    completedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createGeneratedAppRepairAttempt(
  overrides: Partial<GeneratedAppRepairAttempt> = {},
): GeneratedAppRepairAttempt {
  return {
    id: REPAIR_ATTEMPT_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    attemptNumber: 1,
    targetGateId: 'gate-2',
    status: 'running',
    failureSummary: '静态合约检查失败。',
    changeSummary: null,
    verificationSummary: null,
    repairPlan: null,
    reverificationPlan: null,
    startedAt: NOW,
    completedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const planGate3Runner = new GeneratedAppGate3WorkspaceRunner(
  createConfigService(),
);
const planGate7Runner = new GeneratedAppGate7PublishCandidateRunner(
  createConfigService(),
);

function buildBuildUnitPlanForTest(
  appSpec: GeneratedApp['appSpec'],
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  generationWorkspace?: Parameters<typeof buildBuildUnitPlan>[3],
  commandPlan?: Parameters<typeof buildBuildUnitPlan>[4],
  executionLevel = planGate3Runner.getExecutionLevel(),
): GeneratedAppBuildUnitPlan {
  const workspace =
    generationWorkspace ??
    planGate3Runner.buildWorkspaceContract({
      tenantId: 'test-tenant',
      appId: 'test-app',
      generationRunId: 'test-run',
      appSpec,
      staticContracts,
    });
  const commands =
    commandPlan ??
    planGate3Runner.buildCommandPlan({
      workspace,
      requirementIds: appSpec.coreRequirements.map(
        (requirement) => requirement.id,
      ),
      scenarioIds: appSpec.acceptanceScenarios.map((scenario) => scenario.id),
    });

  return buildBuildUnitPlan(
    appSpec,
    generationPlan,
    staticContracts,
    workspace,
    commands,
    executionLevel,
  );
}

function createGeneratedApp(
  overrides: Partial<GeneratedApp> = {},
): GeneratedApp {
  return {
    id: APP_ID,
    tenantId: TENANT_ID,
    prompt: '自动化中医问诊系统',
    appName: '自动化中医问诊系统',
    description: '围绕需求生成的 AppSpec 初稿。',
    status: 'preview_ready',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '围绕需求生成的 AppSpec 初稿。',
      userGoal: '自动化中医问诊系统',
      actors: ['创建者', '终端用户'],
      coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
      pages: [
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '终端用户使用定制应用。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: ['不绕过 AgentLoom 租户隔离和发布门禁。'],
      acceptanceScenarios: [
        {
          id: 'scenario-1',
          title: '创建生成任务',
          requirementIds: ['req-1'],
          given: ['创建者已登录'],
          when: ['提交一句话需求'],
          then: ['系统生成 AppSpec 初稿'],
        },
      ],
      traceability: [
        {
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          evidenceIds: ['app-spec-draft'],
        },
      ],
    },
    generationPlan: null,
    gateResults: createInitialGeneratedAppGateResults(NOW.toISOString()),
    readiness: createReadiness(),
    preview: {
      previewUrl: null,
      sourceArtifactUrl: null,
      testReportUrl: null,
    },
    agentDefinitionId: null,
    workflowDefinitionId: null,
    pluginIds: [],
    publicShareToken: null,
    publicShareEnabled: false,
    publicShareCreatedAt: null,
    publicShareDisabledAt: null,
    publicViewCount: 0,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createWorkflowDefinitionReadinessRow(
  overrides: Partial<
    Pick<
      WorkflowDefinition,
      'id' | 'status' | 'publishedVersionId' | 'metadata' | 'updatedAt'
    >
  > = {},
) {
  return {
    id: WORKFLOW_DEFINITION_ID,
    status: 'draft',
    publishedVersionId: null,
    metadata: {},
    updatedAt: NOW,
    ...overrides,
  };
}

function createGeneratedAppWithGate3Workspace(
  overrides: Partial<GeneratedApp> = {},
): GeneratedApp & { generationPlan: GeneratedAppGenerationPlan } {
  const baseApp = createGeneratedApp();
  const gate3Runner = new GeneratedAppGate3WorkspaceRunner(
    createConfigService(),
  );
  const generationPlan = buildGenerationPlan(baseApp.appSpec);
  const staticContracts = buildStaticContracts(baseApp.appSpec, generationPlan);
  const workspace = gate3Runner.buildWorkspaceContract({
    tenantId: TENANT_ID,
    appId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    appSpec: baseApp.appSpec,
    staticContracts,
  });
  const commandPlan = gate3Runner.buildCommandPlan({
    workspace,
    requirementIds: baseApp.appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    ),
    scenarioIds: baseApp.appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    ),
  });
  const buildUnitPlan = buildBuildUnitPlanForTest(
    baseApp.appSpec,
    generationPlan,
    staticContracts,
    workspace,
    commandPlan,
    'real-local-command-plan',
  );

  return createGeneratedApp({
    ...overrides,
    generationPlan: {
      ...generationPlan,
      staticContracts,
      buildUnitPlan,
    },
  }) as GeneratedApp & { generationPlan: GeneratedAppGenerationPlan };
}


export {
  TENANT_ID,
  USER_ID,
  APP_ID,
  SUBMISSION_ID,
  GENERATION_RUN_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_EXECUTION_ID,
  WORKFLOW_VERSION_ID,
  WORKFLOW_DEFINITION_V7_ID,
  WORKFLOW_EXECUTION_V7_ID,
  GENERATED_PRIVATE_PLUGIN_DB_ID,
  GENERATED_PRIVATE_PLUGIN_ID,
  GATE_RUN_ID,
  GATE_1_RUN_ID,
  GATE_2_RUN_ID,
  GATE_3_RUN_ID,
  GATE_4_RUN_ID,
  GATE_5_RUN_ID,
  GATE_6_RUN_ID,
  GATE_7_RUN_ID,
  REPAIR_ATTEMPT_ID,
  NOW,
  DEFAULT_START_GENERATION_RUN_DTO,
  createConfigService,
  createGate3RunnerStub,
  createGate4RunnerStub,
  createGate4RunnerResult,
  createGate3RunnerResult,
  createGate3RepairResult,
  createSelectChain,
  createSelectManyChain,
  createSelectPageChain,
  createSelectLatestRunNumberChain,
  createSelectOrderedLimitChain,
  createCountChain,
  createInsertReturningChain,
  createGeneratedWorkflowInsertReturningFromPayload,
  createGeneratedAppSubmissionInsertReturningFromPayload,
  createUpdateReturningChain,
  createSubmissionUpdateReturningFromPayload,
  createGeneratedAppUpdateReturningFromPayload,
  createUpdateChain,
  createGeneratedAppServiceWithExecution,
  createPublishCandidateReadiness,
  createReadiness,
  createGeneratedAppSubmission,
  createGeneratedPrivatePluginRecord,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createRuntimeBindingServiceForTest,
  createRepairServiceForTest,
  createPublicRuntimeServiceForTest,
  createGeneratedAppGateRun,
  createGeneratedAppGenerationRun,
  createGeneratedAppRepairAttempt,
  planGate3Runner,
  planGate7Runner,
  buildBuildUnitPlanForTest,
  createGeneratedApp,
  createWorkflowDefinitionReadinessRow,
  createGeneratedAppWithGate3Workspace,
  mockTenantDb
};

export type { SelectOrderedLimitChain, StartGenerationRunInput };
