import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  GeneratedAppRepairAttempt,
  GeneratedAppStaticContracts,
  GeneratedAppSubmission,
  WorkflowDefinition,
} from '../../../database/schema';
import {
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppSubmissionNotFoundException,
} from '../generated-app.exceptions';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppService } from '../generated-app.service';
import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import type { ExecutionService } from '../../execution/execution.service';
import {
  GeneratedAppGate4IntegrationRunner,
  type GeneratedAppGate4RunnerResult,
} from '../generated-app.integration-runner';
import type { GeneratedAppResponseDto } from '../dto';
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
  const serviceInternals = serviceAccessForPlans();
  const generationPlan = serviceInternals.buildGenerationPlan(baseApp.appSpec);
  const staticContracts = serviceInternals.buildStaticContracts(
    baseApp.appSpec,
    generationPlan,
  );
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
  const buildUnitPlan = serviceInternals.buildBuildUnitPlan(
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

function serviceAccessForPlans() {
  return new GeneratedAppService(
    mockTenantDb as unknown as DrizzleDB,
    createConfigService(),
  ) as unknown as {
    buildGenerationPlan(
      appSpec: GeneratedApp['appSpec'],
    ): GeneratedAppGenerationPlan;
    buildStaticContracts(
      appSpec: GeneratedApp['appSpec'],
      generationPlan: GeneratedAppGenerationPlan,
    ): GeneratedAppStaticContracts;
    buildBuildUnitPlan(
      appSpec: GeneratedApp['appSpec'],
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      generationWorkspace?: GeneratedAppBuildUnitPlan['generationWorkspace'],
      commandPlan?: GeneratedAppBuildUnitPlan['commandPlan'],
      executionLevel?: GeneratedAppBuildUnitPlan['executionLevel'],
    ): GeneratedAppBuildUnitPlan;
  };
}

describe('GeneratedAppService', () => {
  let service: GeneratedAppService;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    const configService = createConfigService();

    service = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
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

  it('创建和更新生成运行台账时应保留预算、状态和失败原因', async () => {
    const app = createGeneratedApp();
    const run = createGeneratedAppGenerationRun();
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason: 'gate-2 多次修复后仍失败。',
      completedAt: NOW,
    });
    const insertChain = createInsertReturningChain([run]);
    const updateChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        runNumber: 1,
        status: 'running',
        triggerSource: 'manual',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
        summary: '开始自动开发测试循环。',
        startedAt: NOW.toISOString(),
      },
    );
    const updated = await service.updateGenerationRun(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
        completedAt: NOW.toISOString(),
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        runNumber: 1,
        status: 'running',
        triggerSource: 'manual',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
        completedAt: NOW,
        updatedAt: expect.any(Date),
      }),
    );
    expect(created).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'running',
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
      }),
    );
  });

  it('Gate 0/Gate 1/Gate 2/Gate 3/Gate 4/Gate 5/Gate 6 通过后应执行 Gate 7 real runner、进入 publish_candidate 且不创建公开 token', async () => {
    const previousGateResults = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) => ({
      ...gate,
      status: 'passed' as const,
      summary: `${gate.name} 曾经通过`,
      evidence: [
        {
          id: `${gate.gateId}-stale`,
          label: '旧证据',
          kind: 'manual' as const,
          url: null,
          summary: '上一轮生成残留的旧通过证据。',
        },
      ],
    }));
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      gateResults: previousGateResults,
      publicShareEnabled: true,
      publicShareToken: 'a'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const run = createGeneratedAppGenerationRun({
      runNumber: 2,
      maxRepairAttempts: 2,
      maxRuntimeSeconds: 600,
    });
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
        'Gate 3 通过：Generation Workspace 已 materialize，real-local command plan 已执行 build/typecheck/unit/component-golden 四类受控命令并产出构建、测试、golden 和 coverage artifact 证据；Gate 4-6 仍需真实集成、浏览器和独立 verifier runner。',
      evidence: [],
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 4 通过：real-local integration runner 已执行受控 deterministic public runtime read/submit/detail payload contract、creator query whitelist contract、Agent/Workflow local trace fixture 和插件 local smoke trace fixture；该结果不是生产 sandbox run，也不是真实 Extism WASM 执行。',
      evidence: [],
    });
    const gate5Run = createGeneratedAppGateRun({
      id: GATE_5_RUN_ID,
      gateId: 'gate-5',
      gateOrder: 5,
      gateName: '浏览器验收门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 5 通过：real-local browser-contract runner 已执行受控 deterministic DOM/accessibility/network/console contract，覆盖公开 runtime open/submit/detail、创建者 generation/gate/submission review、desktop/mobile viewport、console/network/accessibility/responsive assertions；未启动 Playwright，未打开真实浏览器，未捕获真实截图、视频或 Playwright trace。',
      evidence: [],
    });
    const gate6Run = createGeneratedAppGateRun({
      id: GATE_6_RUN_ID,
      gateId: 'gate-6',
      gateOrder: 6,
      gateName: '独立审查门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 6 通过：real-local independent verifier runner 已执行受控 deterministic 本地规则审查，输出 independent verifier verdict；不访问外部网络，不调用任意模型，也不代表外部模型或人工审查。',
      evidence: [],
    });
    const gate7Run = createGeneratedAppGateRun({
      id: GATE_7_RUN_ID,
      gateId: 'gate-7',
      gateOrder: 7,
      gateName: '发布候选门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 7 通过：real-local publish candidate contract runner 已签收 release manifest contract，未创建 public share token。',
      failure: null,
      repairInstructions: null,
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      runNumber: 2,
      status: 'passed',
      maxRepairAttempts: 2,
      maxRuntimeSeconds: 600,
      completedAt: NOW,
      summary:
        '门禁运行器完成 Gate 0-7；Gate 7 real-local publish candidate contract runner 已签收 release manifest contract、artifact checksum placeholders、Gate 0-6 evidence citations 和 deferred public-share controls，当前应用进入 publish_candidate，但不会自动发布或创建 public share token。',
      failureReason: null,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const insertGate4RunChain = createInsertReturningChain([gate4Run]);
    const insertGate5RunChain = createInsertReturningChain([gate5Run]);
    const insertGate6RunChain = createInsertReturningChain([gate6Run]);
    const insertGate7RunChain = createInsertReturningChain([gate7Run]);
    let gate1UpdatePayload: Partial<GeneratedApp> = {};
    let gate2UpdatePayload: Partial<GeneratedApp> = {};
    let gate3UpdatePayload: Partial<GeneratedApp> = {};
    let gate4UpdatePayload: Partial<GeneratedApp> = {};
    let gate5UpdatePayload: Partial<GeneratedApp> = {};
    let gate6UpdatePayload: Partial<GeneratedApp> = {};
    let gate7UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate1UpdatePayload = payload;
      });
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate2UpdatePayload = payload;
      });
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate3UpdatePayload = payload;
      });
    const updateAppAfterGate4Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate4UpdatePayload = payload;
      });
    const updateAppAfterGate5Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate5UpdatePayload = payload;
      });
    const updateAppAfterGate6Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate6UpdatePayload = payload;
      });
    const updateAppAfterGate7Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate7UpdatePayload = payload;
      });
    const findExistingWorkflowChain = createSelectChain([]);
    const insertWorkflowChain =
      createGeneratedWorkflowInsertReturningFromPayload();
    const insertWorkflowVersionChain = createInsertReturningChain([
      { id: WORKFLOW_VERSION_ID },
    ]);
    let workflowBindingUpdatePayload: Partial<GeneratedApp> = {};
    const updateAppWorkflowBindingChain = {
      set: vi.fn((payload: Partial<GeneratedApp>) => {
        workflowBindingUpdatePayload = payload;
        return updateAppWorkflowBindingChain;
      }),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn(async () => [
        createGeneratedApp({
          ...app,
          ...gate7UpdatePayload,
          ...workflowBindingUpdatePayload,
        }),
      ]),
    };
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(1))
      .mockReturnValueOnce(findExistingWorkflowChain);
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3RunChain)
      .mockReturnValueOnce(insertGate4RunChain)
      .mockReturnValueOnce(insertGate5RunChain)
      .mockReturnValueOnce(insertGate6RunChain)
      .mockReturnValueOnce(insertGate7RunChain)
      .mockReturnValueOnce(insertWorkflowChain)
      .mockReturnValueOnce(insertWorkflowVersionChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateAppAfterGate5Chain)
      .mockReturnValueOnce(updateAppAfterGate6Chain)
      .mockReturnValueOnce(updateAppAfterGate7Chain)
      .mockReturnValueOnce(
        createUpdateReturningChain([{ id: WORKFLOW_DEFINITION_ID }]),
      )
      .mockReturnValueOnce(updateAppWorkflowBindingChain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        triggerSource: 'manual',
        maxRepairAttempts: 2,
        maxRuntimeSeconds: 600,
      },
    );

    expect(insertRunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        runNumber: 2,
        status: 'running',
        triggerSource: 'manual',
        maxRepairAttempts: 2,
        maxRuntimeSeconds: 600,
        createdBy: USER_ID,
      }),
    );
    expect(insertGateRunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-0',
        gateOrder: 0,
        gateName: '需求规格门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate1RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-1',
        gateOrder: 1,
        gateName: '架构计划门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate2RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-2',
        gateOrder: 2,
        gateName: '静态合约门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate3RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-3',
        gateOrder: 3,
        gateName: '构建与单元门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate4RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-4',
        gateOrder: 4,
        gateName: '集成门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate5RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-5',
        gateOrder: 5,
        gateName: '浏览器验收门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate6RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-6',
        gateOrder: 6,
        gateName: '独立审查门禁',
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    expect(insertGate7RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        gateId: 'gate-7',
        gateOrder: 7,
        gateName: '发布候选门禁',
        status: 'passed',
        summary: expect.stringContaining(
          'real-local publish candidate contract',
        ),
        failure: null,
        repairInstructions: null,
      }),
    );
    const gate1RunPayload = insertGate1RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate1RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-1-frontend-plan',
          kind: 'plan',
        }),
        expect.objectContaining({
          id: 'gate-1-test-gate-plan',
          kind: 'plan',
        }),
      ]),
    );
    const gate2RunPayload = insertGate2RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate2RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-2-public-runtime-contract',
          kind: 'static_check',
        }),
        expect.objectContaining({
          id: 'gate-2-test-entry-contract',
          kind: 'static_check',
        }),
      ]),
    );
    const gate3RunPayload = insertGate3RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate3RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-3-generation-workspace-materialized',
          kind: 'build',
          summary: expect.stringContaining('未开放任意路径写入'),
          details: expect.objectContaining({
            storageKind: 'server-controlled-local-workspace',
            rootLabel: 'generated-app-workspaces',
            workspaceRef: expect.stringContaining(
              `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
            ),
            writePolicy: expect.objectContaining({
              arbitraryPathWriteAllowed: false,
              traversalGuard: 'resolve-inside-workspace-root',
              exposesAbsoluteHostPath: false,
            }),
            artifactPaths: expect.objectContaining({
              buildOutput: 'dist/index.html',
              unitReport: 'artifacts/gate-3/unit-test-report.json',
              componentGoldenReport:
                'artifacts/gate-3/component-golden-report.json',
            }),
          }),
        }),
        expect.objectContaining({
          id: 'gate-3-frontend-build-command',
          kind: 'build',
          summary: expect.stringContaining('exitCode=0'),
          details: expect.objectContaining({
            runnerId: 'gate-3-real-build-unit-runner',
            executionMode: 'real_local_command_plan',
            executed: true,
            exitCode: 0,
            artifactRefs: ['frontend-build-output'],
            requirementIds: ['req-1'],
            scenarioIds: ['scenario-1'],
            stdoutSummary: expect.stringContaining('gate3-build'),
          }),
        }),
        expect.objectContaining({
          id: 'gate-3-unit-test-command',
          kind: 'test',
          summary: expect.stringContaining('mode=real_local_command_plan'),
          details: expect.objectContaining({
            executed: true,
            exitCode: 0,
            artifactRefs: ['unit-test-report'],
            requirementIds: ['req-1'],
            scenarioIds: ['scenario-1'],
            stdoutSummary: expect.stringContaining('gate3-unit'),
          }),
        }),
        expect.objectContaining({
          id: 'gate-3-component-golden-test-entry',
          kind: 'test',
          details: expect.objectContaining({
            executed: true,
            exitCode: 0,
            artifactRefs: ['component-golden-report', 'coverage-report'],
            stdoutSummary: expect.stringContaining('gate3-component-golden'),
          }),
        }),
      ]),
    );
    const gate4RunPayload = insertGate4RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate4RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-public-runtime-read',
          kind: 'test',
          summary: expect.stringContaining('mode=real_local_integration'),
          details: expect.objectContaining({
            runnerId: 'gate-4-real-integration-runner',
            requestId: 'gate4-gate-4-public-runtime-read-1',
            method: 'GET',
            pathTemplate: '/generated-apps/public/{token}',
            responseStatus: 200,
            executed: true,
            productionSandboxExecuted: false,
            extismExecuted: false,
            traceArtifactRefs: ['public-runtime-api-trace'],
            staticContractIds: expect.arrayContaining([
              'gate-2-public-runtime-contract',
            ]),
          }),
        }),
      ]),
    );
    const gate5RunPayload = insertGate5RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate5RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
          kind: 'browser',
          summary: expect.stringContaining('real_local_browser_contract'),
        }),
        expect.objectContaining({
          id: 'gate-5-gate-5-public-runtime-submit-viewport-mobile-gate-5-network-public-forbids-creator-internal',
          kind: 'browser',
          summary: expect.stringContaining(
            'journeyId=gate-5-public-runtime-submit',
          ),
        }),
        expect.objectContaining({
          id: 'gate-5-gate-5-creator-submission-review-viewport-desktop-gate-5-responsive-content-not-occluded',
          kind: 'browser',
          summary: expect.stringContaining(
            '未启动 Playwright，未打开真实浏览器',
          ),
        }),
      ]),
    );
    const gate6RunPayload = insertGate6RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate6RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-6-independent-verifier-verdict',
          kind: 'verifier',
          summary: expect.stringContaining('real_local_independent_rules'),
          details: expect.objectContaining({
            runnerId: 'gate-6-real-independent-verifier-runner',
            executionMode: 'real_local_independent_rules',
            executionLevel: 'real-local-independent-verifier',
            executed: true,
            realLocalIndependentRulesVerdict: true,
            externalModelExecuted: false,
            humanReviewExecuted: false,
            networkAccessed: false,
            generationTranscriptRead: false,
            verdict: expect.objectContaining({
              blockingFindings: [],
              warnings: [],
              decision: 'pass',
              traceabilityCoverage: expect.objectContaining({
                requirementCoveragePassed: true,
                scenarioCoveragePassed: true,
                evidenceCoveragePassed: true,
                gateCoveragePassed: true,
                coveredRequirementIds: ['req-1'],
                coveredScenarioIds: ['scenario-1'],
              }),
            }),
          }),
        }),
      ]),
    );
    const gate7RunPayload = insertGate7RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: null;
    };
    expect(gate7RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-7-publish-readiness-inputs',
          kind: 'manual',
          summary: expect.stringContaining('publishCandidateAllowed=true'),
        }),
        expect.objectContaining({
          id: 'gate-7-artifact-release-manifest',
          kind: 'manual',
          summary: expect.stringContaining('release manifest contract'),
          details: expect.objectContaining({
            artifactArchiveCreated: false,
            artifactSignatureCreated: false,
            realArtifactUploaded: false,
          }),
        }),
        expect.objectContaining({
          id: 'gate-7-final-verdict',
          kind: 'manual',
          summary: expect.stringContaining('publishCandidateAllowed=true'),
        }),
      ]),
    );
    expect(gate7RunPayload.failure).toBeNull();
    expect(JSON.stringify(gate7RunPayload.evidence)).not.toContain(
      app.publicShareToken,
    );

    expect(gate1UpdatePayload.generationPlan).not.toHaveProperty(
      'staticContracts',
    );
    expect(gate2UpdatePayload.generationPlan).not.toHaveProperty(
      'buildUnitPlan',
    );
    expect(gate3UpdatePayload.generationPlan).not.toHaveProperty(
      'integrationPlan',
    );
    expect(gate4UpdatePayload.generationPlan).not.toHaveProperty(
      'browserAcceptancePlan',
    );
    expect(gate5UpdatePayload.generationPlan).not.toHaveProperty(
      'independentVerificationPlan',
    );
    expect(gate6UpdatePayload.generationPlan).not.toHaveProperty(
      'publishCandidatePlan',
    );

    const appUpdatePayload = gate7UpdatePayload as {
      gateResults: GeneratedApp['gateResults'];
      readiness: GeneratedApp['readiness'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
      generationPlan: GeneratedAppGenerationPlan;
    };
    const passedGateIds = appUpdatePayload.gateResults
      .filter((gate) => gate.status === 'passed')
      .map((gate) => gate.gateId);
    expect(passedGateIds).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
      'gate-4',
      'gate-5',
      'gate-6',
      'gate-7',
    ]);
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7')
        ?.status,
    ).toBe('passed');
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7')
        ?.evidence,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-7-artifact-release-manifest',
          kind: 'manual',
        }),
      ]),
    );
    expect(
      appUpdatePayload.gateResults
        .filter((gate) => ['gate-7'].includes(gate.gateId))
        .every((gate) => gate.status === 'passed' && gate.evidence.length > 0),
    ).toBe(true);
    expect(appUpdatePayload.readiness.canCreatePublicShare).toBe(true);
    expect(appUpdatePayload.readiness.state).toBe('publish_candidate');
    expect(appUpdatePayload.status).toBe('publish_candidate');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(appUpdatePayload.generationPlan.appSpecVersion).toBe(1);
    expect(appUpdatePayload.generationPlan.frontend.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'page-public-runtime',
          route: '/public-runtime',
        }),
      ]),
    );
    expect(appUpdatePayload.generationPlan.orchestration.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
        }),
      ]),
    );
    expect(appUpdatePayload.generationPlan.pluginTools.tools).toEqual([]);
    expect(appUpdatePayload.generationPlan.pluginTools.emptyReason).toContain(
      '当前 AppSpec 未声明',
    );
    expect(appUpdatePayload.generationPlan.dataPersistence).toEqual(
      expect.objectContaining({
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
        tenantScoped: true,
        tokenSnapshotRequired: true,
      }),
    );
    expect(appUpdatePayload.generationPlan.testGates.gatePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gateId: 'gate-2' }),
        expect.objectContaining({ gateId: 'gate-7' }),
      ]),
    );
    expect(appUpdatePayload.generationPlan.traceability).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          pageIds: expect.arrayContaining(['page-public-runtime']),
        }),
      ]),
    );
    expect(appUpdatePayload.generationPlan.staticContracts).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        appSpecVersion: 1,
        publicRuntime: expect.objectContaining({
          input: expect.objectContaining({
            source: 'public-runtime-submission',
            requiredFields: ['input'],
          }),
        }),
        frontendRoutes: expect.arrayContaining([
          expect.objectContaining({
            pageId: 'page-public-runtime',
            route: '/public-runtime',
          }),
        ]),
        orchestration: expect.objectContaining({
          target: 'workflow',
          nodes: expect.arrayContaining([
            expect.objectContaining({
              stepId: 'step-1-req-1',
              requirementIds: ['req-1'],
            }),
          ]),
        }),
        pluginToolPermissions: expect.objectContaining({
          emptyReason: expect.stringContaining('当前 AppSpec 未声明'),
          implicitPermissionsAllowed: false,
        }),
        submissionPersistence: expect.objectContaining({
          tenantScoped: true,
          tokenSnapshotRequired: true,
          softDeleteRequired: true,
          fields: expect.arrayContaining([
            'input',
            'anonymousSessionId',
            'publicShareToken',
          ]),
        }),
        testEntry: expect.objectContaining({
          blockingGateIds: ['gate-3', 'gate-4', 'gate-5', 'gate-6', 'gate-7'],
          acceptanceScenarioIds: ['scenario-1'],
          verifierGateCommand:
            'agentloom generated-app gate-6 independent-verifier',
          publishCandidateGateCommand:
            'agentloom generated-app gate-7 publish-candidate',
        }),
        traceability: expect.arrayContaining([
          expect.objectContaining({
            requirementId: 'req-1',
            staticContractIds: expect.arrayContaining([
              'gate-2-public-runtime-contract',
              'gate-2-traceability-contract',
            ]),
          }),
        ]),
      }),
    );
    expect(appUpdatePayload.generationPlan.buildUnitPlan).toEqual(
      expect.objectContaining({
        planVersion: 1,
        appSpecVersion: 1,
        generationPlanVersion: 1,
        staticContractsVersion: 1,
        executionLevel: 'real-local-command-plan',
        generationWorkspace: expect.objectContaining({
          contractVersion: 1,
          storageKind: 'server-controlled-local-workspace',
          rootLabel: 'generated-app-workspaces',
          relativePath: expect.stringContaining(
            `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
          ),
          scaffold: 'react-vite-typescript',
          writePolicy: expect.objectContaining({
            arbitraryPathWriteAllowed: false,
            traversalGuard: 'resolve-inside-workspace-root',
            exposesAbsoluteHostPath: false,
          }),
          files: expect.arrayContaining([
            expect.objectContaining({ path: 'package.json' }),
            expect.objectContaining({ path: 'src/App.tsx' }),
            expect.objectContaining({ path: 'scripts/gate3-build.mjs' }),
          ]),
          artifactPaths: expect.objectContaining({
            sourceManifest: 'artifacts/gate-3/source-manifest.json',
            buildOutput: 'dist/index.html',
            coverageSummary: 'coverage/generated-app/coverage-summary.json',
          }),
        }),
        commandPlan: expect.arrayContaining([
          expect.objectContaining({
            commandId: 'gate-3-frontend-build-command',
            command: 'node scripts/gate3-build.mjs',
            workingDirectory: expect.stringContaining(
              `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
            ),
            requirementIds: ['req-1'],
            scenarioIds: ['scenario-1'],
            producesArtifactIds: ['frontend-build-output'],
          }),
          expect.objectContaining({
            commandId: 'gate-3-unit-test-command',
            command: 'node scripts/gate3-unit.mjs',
            producesArtifactIds: ['unit-test-report'],
          }),
          expect.objectContaining({
            commandId: 'gate-3-component-golden-test-entry',
            command: 'node scripts/gate3-component-golden.mjs',
            producesArtifactIds: ['component-golden-report', 'coverage-report'],
          }),
        ]),
        frontendBuild: expect.objectContaining({
          command: 'node scripts/gate3-build.mjs',
          workingDirectory: expect.stringContaining(
            `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
          ),
          routeIds: ['page-public-runtime'],
          expectedArtifacts: expect.arrayContaining([
            'dist/index.html',
            'dist/assets/manifest.json',
          ]),
        }),
        typecheck: expect.objectContaining({
          command: 'node scripts/gate3-typecheck.mjs',
          tsconfigPath: 'tsconfig.generated-app.json',
        }),
        unitTests: expect.objectContaining({
          command: 'node scripts/gate3-unit.mjs',
          scenarioIds: ['scenario-1'],
        }),
        componentGoldenTests: expect.objectContaining({
          command: 'node scripts/gate3-component-golden.mjs',
          scenarioIds: ['scenario-1'],
        }),
        artifactExpectations: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'frontend-build-output',
            required: true,
          }),
          expect.objectContaining({
            artifactId: 'coverage-report',
            required: true,
          }),
        ]),
        staticContractsCoverage: expect.arrayContaining([
          expect.objectContaining({
            staticContractId: 'gate-2-public-runtime-contract',
          }),
          expect.objectContaining({
            staticContractId: 'gate-2-traceability-contract',
          }),
        ]),
        acceptanceScenarioCoverage: [
          expect.objectContaining({
            scenarioId: 'scenario-1',
            coveredBy: expect.arrayContaining([
              'gate-3-unit-test-command',
              'gate-3-component-golden-test-entry',
            ]),
          }),
        ],
        pluginBuildExpectations: expect.objectContaining({
          tools: [],
          emptyReason: expect.stringContaining(
            '当前 generationPlan.pluginTools',
          ),
        }),
        failureCaptureFields: expect.arrayContaining([
          'command',
          'exitCode',
          'stdout',
          'stderr',
          'durationMs',
          'artifactPath',
        ]),
      }),
    );
    expect(appUpdatePayload.generationPlan.integrationPlan).toEqual(
      expect.objectContaining({
        planVersion: 1,
        appSpecVersion: 1,
        generationPlanVersion: 1,
        staticContractsVersion: 1,
        buildUnitPlanVersion: 1,
        executionLevel: 'real-local-integration',
        testTenant: expect.objectContaining({
          tenantKind: 'synthetic',
          usesRealTokens: false,
          noProductionResources: true,
        }),
        testResources: expect.objectContaining({
          resourceIsolation: 'ephemeral-test-resources-only',
          usesRealTokens: false,
          requiredScenarioIds: ['scenario-1'],
        }),
        publicRuntimeApiChecks: expect.arrayContaining([
          expect.objectContaining({
            checkId: 'gate-4-public-runtime-read',
            kind: 'public_runtime_read',
            staticContractIds: expect.arrayContaining([
              'gate-2-public-runtime-contract',
            ]),
          }),
          expect.objectContaining({
            checkId: 'gate-4-public-runtime-submit-input',
            kind: 'public_runtime_submit',
            staticContractIds: expect.arrayContaining([
              'gate-2-submission-persistence-contract',
            ]),
          }),
          expect.objectContaining({
            checkId: 'gate-4-public-submission-detail',
            kind: 'public_submission_detail',
          }),
        ]),
        creatorManagementApiChecks: expect.arrayContaining([
          expect.objectContaining({
            checkId: 'gate-4-creator-generation-run-query',
          }),
          expect.objectContaining({
            checkId: 'gate-4-creator-gate-run-query',
          }),
          expect.objectContaining({
            checkId: 'gate-4-creator-submission-query',
          }),
        ]),
        agentWorkflowDryRunExpectations: expect.objectContaining({
          expectationLevel: 'controlled-local-trace-fixture',
          orchestrationNodeIds: expect.arrayContaining(['node-step-1-req-1']),
          fixtures: expect.arrayContaining([
            expect.objectContaining({
              scenarioId: 'scenario-1',
              inputMapping: expect.objectContaining({
                staticContractId: 'gate-2-public-runtime-contract',
              }),
              outputMapping: expect.objectContaining({
                staticContractId: 'gate-2-public-runtime-contract',
              }),
            }),
          ]),
        }),
        pluginSandboxSmokeExpectations: expect.objectContaining({
          tools: [],
          emptyReason: expect.stringContaining(
            '当前 generationPlan.pluginTools',
          ),
        }),
        dependencyArtifacts: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'frontend-build-output',
            sourceGateId: 'gate-3',
          }),
          expect.objectContaining({
            artifactId: 'coverage-report',
            sourceGateId: 'gate-3',
          }),
        ]),
        acceptanceScenarioCoverage: [
          expect.objectContaining({
            scenarioId: 'scenario-1',
            coveredByCheckIds: expect.arrayContaining([
              'gate-4-public-runtime-submit-input',
              'gate-4-agent-workflow-dry-run-fixture',
            ]),
          }),
        ],
        requirementCoverage: expect.arrayContaining([
          expect.objectContaining({
            requirementId: 'req-1',
            dependencyArtifactIds: expect.arrayContaining([
              'frontend-build-output',
              'unit-test-report',
              'component-golden-report',
              'coverage-report',
            ]),
          }),
        ]),
        traceArtifacts: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'public-runtime-api-trace',
            kind: 'public_runtime_api_trace',
          }),
          expect.objectContaining({
            artifactId: 'agent-workflow-dry-run-trace',
            kind: 'agent_workflow_dry_run_trace',
          }),
        ]),
        failureCaptureFields: expect.arrayContaining([
          'checkId',
          'requestId',
          'responseStatus',
          'traceArtifactPath',
          'durationMs',
        ]),
      }),
    );
    expect(appUpdatePayload.generationPlan.browserAcceptancePlan).toEqual(
      expect.objectContaining({
        planVersion: 1,
        appSpecVersion: 1,
        generationPlanVersion: 1,
        staticContractsVersion: 1,
        buildUnitPlanVersion: 1,
        integrationPlanVersion: 1,
        executionLevel: 'real-local-browser-contract',
        skeletonDisclaimer: expect.stringContaining('不启动 Playwright'),
        browserToolPlan: expect.objectContaining({
          runner: 'local-browser-contract',
          command: 'agentloom generated-app gate-5 local-browser-contract',
          testEntry: 'server-controlled-local-browser-contract',
          workingDirectory: 'generated-run',
          baseUrlShape:
            'local-contract://generated-app/public-runtime/{publicShareAccess}',
          usesRealTokens: false,
          scenarioIds: ['scenario-1'],
        }),
        viewportMatrix: expect.arrayContaining([
          expect.objectContaining({
            viewportId: 'viewport-desktop',
            category: 'desktop',
            width: 1440,
            height: 900,
          }),
          expect.objectContaining({
            viewportId: 'viewport-mobile',
            category: 'mobile',
            width: 390,
            height: 844,
          }),
        ]),
        publicRuntimeJourneys: expect.arrayContaining([
          expect.objectContaining({
            journeyId: 'gate-5-public-runtime-open',
            publicRuntimeApiCheckIds: ['gate-4-public-runtime-read'],
          }),
          expect.objectContaining({
            journeyId: 'gate-5-public-runtime-submit',
            publicRuntimeApiCheckIds: ['gate-4-public-runtime-submit-input'],
          }),
          expect.objectContaining({
            journeyId: 'gate-5-public-submission-detail',
            publicRuntimeApiCheckIds: ['gate-4-public-submission-detail'],
          }),
        ]),
        creatorManagementJourneys: expect.arrayContaining([
          expect.objectContaining({
            journeyId: 'gate-5-creator-generation-run-review',
            creatorManagementApiCheckIds: [
              'gate-4-creator-generation-run-query',
            ],
          }),
          expect.objectContaining({
            journeyId: 'gate-5-creator-gate-run-review',
            creatorManagementApiCheckIds: ['gate-4-creator-gate-run-query'],
          }),
          expect.objectContaining({
            journeyId: 'gate-5-creator-submission-review',
            creatorManagementApiCheckIds: ['gate-4-creator-submission-query'],
          }),
        ]),
        consoleAssertions: expect.arrayContaining([
          expect.objectContaining({
            assertionId: 'gate-5-console-no-unhandled-error',
            emptyAllowedWarningsReason: expect.stringContaining(
              '不允许 console warning',
            ),
          }),
        ]),
        networkAssertions: expect.arrayContaining([
          expect.objectContaining({
            assertionId: 'gate-5-network-core-requests-2xx',
            expectedStatusRange: '2xx',
          }),
          expect.objectContaining({
            assertionId: 'gate-5-network-public-forbids-creator-internal',
            forbiddenEndpointPatterns: expect.arrayContaining([
              '/generated-apps/{appId}/generation-runs',
            ]),
          }),
        ]),
        accessibilityInteractionAssertions: expect.arrayContaining([
          expect.objectContaining({
            assertionId: 'gate-5-accessibility-critical-buttons-clickable',
          }),
        ]),
        responsiveLayoutAssertions: expect.arrayContaining([
          expect.objectContaining({
            assertionId: 'gate-5-responsive-mobile-no-overflow',
            viewportIds: ['viewport-mobile'],
          }),
        ]),
        artifactExpectations: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'desktop-screenshot',
            kind: 'screenshot',
            referencesGate4TraceArtifactIds: expect.arrayContaining([
              'public-runtime-api-trace',
              'agent-workflow-dry-run-trace',
            ]),
          }),
          expect.objectContaining({
            artifactId: 'playwright-trace',
            kind: 'playwright_trace',
          }),
        ]),
        acceptanceScenarioCoverage: [
          expect.objectContaining({
            scenarioId: 'scenario-1',
            journeyIds: expect.arrayContaining([
              'gate-5-public-runtime-submit',
            ]),
            viewportIds: expect.arrayContaining([
              'viewport-desktop',
              'viewport-mobile',
            ]),
          }),
        ],
        requirementCoverage: expect.arrayContaining([
          expect.objectContaining({
            requirementId: 'req-1',
            gate4ApiCheckIds: expect.arrayContaining([
              'gate-4-public-runtime-submit-input',
              'gate-4-creator-submission-query',
            ]),
          }),
        ]),
        journeyCoverage: expect.arrayContaining([
          expect.objectContaining({
            journeyId: 'gate-5-public-runtime-submit',
            assertionIds: expect.arrayContaining([
              'gate-5-network-core-requests-2xx',
            ]),
          }),
        ]),
        failureCaptureFields: expect.arrayContaining([
          'journeyId',
          'viewportId',
          'assertionId',
          'tracePath',
          'durationMs',
        ]),
      }),
    );
    expect(appUpdatePayload.generationPlan.independentVerificationPlan).toEqual(
      expect.objectContaining({
        planVersion: 1,
        appSpecVersion: 1,
        generationPlanVersion: 1,
        staticContractsVersion: 1,
        buildUnitPlanVersion: 1,
        integrationPlanVersion: 1,
        browserAcceptancePlanVersion: 1,
        executionLevel: 'real-local-independent-verifier',
        verifierRunner: expect.objectContaining({
          runner: 'local-independent-rules-verifier',
          command: 'agentloom generated-app gate-6 local-independent-verifier',
          workingDirectory: 'generated-run',
          usesExternalNetwork: false,
          usesExternalModel: false,
          usesHumanReviewer: false,
          usesGenerationTranscript: false,
          inputBundleId: 'gate-6-redacted-evidence-bundle',
          verdictArtifactPath:
            'artifacts/gate-6/independent-verifier-verdict.json',
        }),
        verifierIsolationPolicy: expect.objectContaining({
          verifierContext: 'fresh-independent-context',
          reuseGenerationContext: false,
          acceptsGeneratorSelfAttestation: false,
          readsPublicShareToken: false,
          readsRealSecrets: false,
          inputMaterialPolicy: 'redacted-evidence-bundle-only',
          requiredControls: expect.arrayContaining([
            'fresh-reviewer-identity',
            'reject-generator-self-attestation',
            'evidence-id-citation-required',
          ]),
        }),
        evidenceBundle: expect.objectContaining({
          redactionLevel: 'redacted-no-public-token-or-secret',
          referencedGateIds: [
            'gate-0',
            'gate-1',
            'gate-2',
            'gate-3',
            'gate-4',
            'gate-5',
          ],
          gateEvidenceRefs: expect.arrayContaining([
            expect.objectContaining({
              gateId: 'gate-5',
              evidenceIds: expect.arrayContaining([
                'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
              ]),
            }),
          ]),
          staticContractIds: expect.arrayContaining([
            'gate-2-public-runtime-contract',
            'gate-2-traceability-contract',
          ]),
          buildUnitArtifactIds: expect.arrayContaining([
            'frontend-build-output',
            'coverage-report',
          ]),
          integrationTraceArtifactIds: expect.arrayContaining([
            'public-runtime-api-trace',
            'agent-workflow-dry-run-trace',
          ]),
          browserArtifactIds: expect.arrayContaining([
            'desktop-screenshot',
            'playwright-trace',
          ]),
          forbiddenSensitiveFields: expect.arrayContaining([
            'publicShareToken',
            'apiKey',
            'secret',
          ]),
        }),
        rubric: expect.arrayContaining([
          expect.objectContaining({
            category: 'requirement_coverage',
            requirementIds: ['req-1'],
            scenarioIds: ['scenario-1'],
            evidenceIds: expect.arrayContaining([
              'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
            ]),
          }),
          expect.objectContaining({
            category: 'publish_blockers',
            blocking: true,
          }),
        ]),
        verdictSchema: expect.objectContaining({
          requiredFields: expect.arrayContaining([
            'blockingFindings',
            'warnings',
            'decision',
            'traceabilityCoverage',
            'repairSuggestions',
            'residualRiskSummary',
          ]),
          findingSeverities: ['blocking', 'warning'],
          decisionValues: ['pass', 'fail'],
          requiresEvidenceIds: true,
          requiresRepairSuggestions: true,
          residualRiskSummaryRequired: true,
        }),
        verdictArtifact: expect.objectContaining({
          artifactId: 'independent-verifier-verdict',
          kind: 'verifier_report',
          path: 'artifacts/gate-6/independent-verifier-verdict.json',
          required: true,
          materialized: true,
          containsSecrets: false,
        }),
        independenceChecks: expect.arrayContaining([
          expect.objectContaining({
            kind: 'reviewer_identity_context_isolation',
            required: true,
            gateIds: expect.arrayContaining(['gate-0', 'gate-5']),
          }),
          expect.objectContaining({
            kind: 'evidence_id_citation_required',
            evidenceIds: expect.arrayContaining([
              'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
            ]),
          }),
        ]),
        requirementCoverage: [
          expect.objectContaining({
            requirementId: 'req-1',
            scenarioIds: ['scenario-1'],
            rubricCategories: expect.arrayContaining([
              'requirement_coverage',
              'publish_blockers',
            ]),
            gateIds: [
              'gate-0',
              'gate-1',
              'gate-2',
              'gate-3',
              'gate-4',
              'gate-5',
            ],
          }),
        ],
        scenarioCoverage: [
          expect.objectContaining({
            scenarioId: 'scenario-1',
            requirementIds: ['req-1'],
          }),
        ],
        evidenceCoverage: expect.arrayContaining([
          expect.objectContaining({
            evidenceId:
              'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
            gateId: 'gate-5',
          }),
        ]),
        gateCoverage: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'gate-5',
            evidenceIds: expect.arrayContaining([
              'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
            ]),
            required: true,
          }),
        ]),
        failureCaptureFields: expect.arrayContaining([
          'verifierRunId',
          'verifierIdentity',
          'inputBundleId',
          'blockingFindings',
          'residualRiskSummary',
          'durationMs',
        ]),
      }),
    );
    expect(appUpdatePayload.generationPlan.publishCandidatePlan).toEqual(
      expect.objectContaining({
        planVersion: 1,
        appSpecVersion: 1,
        generationPlanVersion: 1,
        staticContractsVersion: 1,
        buildUnitPlanVersion: 1,
        integrationPlanVersion: 1,
        browserAcceptancePlanVersion: 1,
        independentVerificationPlanVersion: 1,
        executionLevel: 'real-local-publish-candidate-contract',
        publishReadinessInputs: expect.objectContaining({
          requiredGateIds: [
            'gate-0',
            'gate-1',
            'gate-2',
            'gate-3',
            'gate-4',
            'gate-5',
            'gate-6',
            'gate-7',
          ],
          upstreamGateIds: [
            'gate-0',
            'gate-1',
            'gate-2',
            'gate-3',
            'gate-4',
            'gate-5',
            'gate-6',
          ],
          upstreamEvidenceRefs: expect.arrayContaining([
            expect.objectContaining({
              gateId: 'gate-6',
              evidenceIds: expect.arrayContaining([
                'gate-6-independent-verifier-verdict',
              ]),
            }),
          ]),
          requiredNonSkeletonEvidenceClasses: expect.arrayContaining([
            'real_frontend_build_artifact',
            'real_browser_artifact',
            'real_independent_verifier_report',
          ]),
        }),
        artifactReleaseManifest: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'frontend-build-output',
            kind: 'frontend_artifact',
            containsSecrets: false,
          }),
          expect.objectContaining({
            artifactId: 'no-plugin-bundle-artifacts-required',
            kind: 'plugin_bundle_artifact',
            required: false,
          }),
          expect.objectContaining({
            artifactId: 'playwright-trace',
            kind: 'browser_artifact',
          }),
          expect.objectContaining({
            artifactId: 'independent-verifier-report-placeholder',
            kind: 'verifier_report',
          }),
          expect.objectContaining({
            artifactId: 'source-artifact-placeholder',
            kind: 'source_artifact_placeholder',
          }),
        ]),
        publicationBlockers: [],
        rollbackShareControls: expect.objectContaining({
          publicTokenCreation: 'deferred-until-enable-public-share',
          publicShareEnabledWhileGuardFails: false,
          createdPublicShareToken: null,
          stalePublicTokenRequiredAction: 'clear-before-enable-public-share',
          enableShareControl: 'POST /generated-apps/:appId/public-share',
          publicShareSignoff: 'deferred-until-enable-public-share',
          createsPublicShareToken: false,
        }),
        finalVerdict: expect.objectContaining({
          publishCandidateAllowed: true,
          blockingReasons: [],
          warningReasons: [],
          requiredRealGateRunnerIds: expect.arrayContaining([
            'gate-3-real-build-unit-runner',
            'gate-7-real-publish-candidate-runner',
          ]),
          repairSuggestions: expect.arrayContaining([
            expect.stringContaining('enablePublicShare'),
            expect.stringContaining('artifact archive'),
          ]),
        }),
        requirementCoverage: [
          expect.objectContaining({
            requirementId: 'req-1',
            gateIds: expect.arrayContaining(['gate-0', 'gate-7']),
            artifactIds: expect.arrayContaining(['frontend-build-output']),
          }),
        ],
        gateCoverage: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'gate-3',
            executionLevel: 'real-local-command-plan',
            skeletonOnly: false,
            evidenceIds: expect.arrayContaining([
              'gate-3-generation-workspace-materialized',
              'gate-3-frontend-build-command',
            ]),
          }),
          expect.objectContaining({
            gateId: 'gate-4',
            executionLevel: 'real-local-integration',
            skeletonOnly: false,
            evidenceIds: expect.arrayContaining([
              'gate-4-public-runtime-read',
              'gate-4-public-runtime-submit-input',
              'gate-4-public-submission-detail',
            ]),
          }),
          expect.objectContaining({
            gateId: 'gate-5',
            executionLevel: 'real-local-browser-contract',
            skeletonOnly: false,
            evidenceIds: expect.arrayContaining([
              'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
            ]),
          }),
          expect.objectContaining({
            gateId: 'gate-6',
            executionLevel: 'real-local-independent-verifier',
            skeletonOnly: false,
            evidenceIds: expect.arrayContaining([
              'gate-6-independent-verifier-verdict',
            ]),
          }),
          expect.objectContaining({
            gateId: 'gate-7',
            executionLevel: 'real-local-publish-candidate-contract',
            skeletonOnly: false,
            evidenceIds: expect.arrayContaining(['gate-7-final-verdict']),
          }),
        ]),
        artifactCoverage: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'source-artifact-placeholder',
            kind: 'source_artifact_placeholder',
          }),
        ]),
        failureCaptureFields: expect.arrayContaining([
          'publishCandidateGuardRunId',
          'missingRealEvidenceClasses',
          'publicShareTokenAction',
        ]),
      }),
    );
    expect(
      JSON.stringify(appUpdatePayload.generationPlan.publishCandidatePlan),
    ).not.toContain(app.publicShareToken);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'passed',
        failureReason: null,
        completedAt: expect.any(Date),
      }),
    );
    expect(insertWorkflowChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        name: expect.stringContaining('生成应用运行时'),
        status: 'draft',
        createdBy: USER_ID,
        updatedBy: USER_ID,
        metadata: expect.objectContaining({
          source: 'generated-app-runtime-workflow',
          generatedAppId: APP_ID,
          generationRunId: GENERATION_RUN_ID,
          bindingKind: 'public-runtime-workflow',
          createdFromGate: 'gate-7',
          publicRuntimeBoundary: expect.stringContaining('execution handoff'),
        }),
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'generated-app-manual-trigger',
            data: expect.objectContaining({ nodeType: 'manual-trigger' }),
          }),
          expect.objectContaining({
            id: 'generated-app-runtime-note',
            data: expect.objectContaining({ nodeType: 'text' }),
          }),
          expect.objectContaining({
            id: 'generated-app-runtime-output',
            data: expect.objectContaining({ nodeType: 'text-output' }),
          }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({
            source: 'generated-app-manual-trigger',
            target: 'generated-app-runtime-output',
            sourceHandle: 'exec-out',
            targetHandle: 'exec-in',
          }),
          expect.objectContaining({
            source: 'generated-app-manual-trigger',
            target: 'generated-app-runtime-output',
            sourceHandle: 'payload-out',
            targetHandle: 'content-in',
          }),
        ]),
        inputSchema: null,
      }),
    );
    expect(insertWorkflowVersionChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        tenantId: TENANT_ID,
        versionNumber: 1,
        label: 'Generated App runtime v1',
        publishedAt: expect.any(Date),
        createdBy: USER_ID,
        snapshot: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 'generated-app-manual-trigger' }),
            expect.objectContaining({ id: 'generated-app-runtime-note' }),
            expect.objectContaining({ id: 'generated-app-runtime-output' }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              source: 'generated-app-manual-trigger',
              target: 'generated-app-runtime-output',
            }),
          ]),
          inputSchema: null,
          metadata: expect.objectContaining({
            nodeCount: 3,
            edgeCount: 2,
            createdFromVersion: 1,
            releaseNumber: 1,
          }),
        }),
      }),
    );
    expect(updateAppWorkflowBindingChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        updatedBy: USER_ID,
      }),
    );
    expect(response.generationRun).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'passed',
        failureReason: null,
      }),
    );
    expect(response.gateRuns).toEqual([
      expect.objectContaining({
        gateId: 'gate-0',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
      }),
      expect.objectContaining({
        gateId: 'gate-1',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
      }),
      expect.objectContaining({
        gateId: 'gate-2',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
      }),
      expect.objectContaining({
        gateId: 'gate-3',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('real-local command plan'),
      }),
      expect.objectContaining({
        gateId: 'gate-4',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('real-local integration runner'),
      }),
      expect.objectContaining({
        gateId: 'gate-5',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('real-local browser-contract runner'),
      }),
      expect.objectContaining({
        gateId: 'gate-6',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining(
          'real-local independent verifier runner',
        ),
      }),
      expect.objectContaining({
        gateId: 'gate-7',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('release manifest'),
      }),
    ]);
    expect(response.app.generationPlan).toEqual(
      expect.objectContaining({
        appSpecVersion: 1,
        staticContracts: expect.objectContaining({
          contractVersion: 1,
        }),
        buildUnitPlan: expect.objectContaining({
          executionLevel: 'real-local-command-plan',
        }),
        integrationPlan: expect.objectContaining({
          executionLevel: 'real-local-integration',
        }),
        browserAcceptancePlan: expect.objectContaining({
          executionLevel: 'real-local-browser-contract',
        }),
        independentVerificationPlan: expect.objectContaining({
          executionLevel: 'real-local-independent-verifier',
          verdictArtifact: expect.objectContaining({
            materialized: true,
          }),
        }),
        publishCandidatePlan: expect.objectContaining({
          executionLevel: 'real-local-publish-candidate-contract',
        }),
      }),
    );
    expect(response.app.id).toBe(APP_ID);
    expect(response.app.workflowDefinitionId).toBe(WORKFLOW_DEFINITION_ID);
  });

  it('retry 启动门禁运行器时应把最近 failed repair attempt 写入本轮 generationPlan 和 Gate 1 证据', async () => {
    const configService = createConfigService();
    const gate3Runner = createGate3RunnerStub(
      configService,
      createGate3RunnerResult({
        status: 'failed',
        executionLevel: 'fixture-execution',
        failure: {
          code: 'gate3-build-failed',
          message: 'Gate 3 构建命令失败。',
        },
        repairInstructions: '修复 Gate 3 构建脚本后重新运行。',
      }),
    );
    const serviceWithRunner = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      gate3Runner,
    );
    const app = createGeneratedApp();
    const run = createGeneratedAppGenerationRun({
      triggerSource: 'retry',
      runNumber: 2,
    });
    const previousRepairAttempt = createGeneratedAppRepairAttempt({
      id: REPAIR_ATTEMPT_ID,
      generationRunId: '99999999-9999-4999-8999-999999999999',
      targetGateId: 'gate-3',
      attemptNumber: 1,
      status: 'failed',
      failureSummary: 'Gate 3 构建命令失败。',
      changeSummary:
        '当前同步 runner 未应用源码、Workflow 或插件补丁，已将 Gate 3 标记为下一轮修复目标。',
      verificationSummary: 'Gate 3 仍为 failed。',
      repairPlan: {
        planVersion: 1,
        source: 'automatic-failed-gate-work-order',
        targetGateId: 'gate-3',
        targetGateName: '构建与单元门禁',
        failureCode: 'gate3-build-failed',
        failureSummary: 'Gate 3 构建命令失败。',
        repairInstructions: '修复 Gate 3 构建脚本后重新运行。',
        evidenceIds: ['gate-3-unit-test-command'],
        evidenceSummaries: ['gate-3-unit-test-command exitCode=1'],
        allowedChangeScopes: ['frontend-workspace', 'test-contracts'],
        forbiddenChangeScopes: ['tenant-boundary', 'public-share-token'],
        patchTargets: ['generationWorkspace.files'],
        requiredTraceability: ['failed-evidence-citation'],
        generatedAt: NOW.toISOString(),
      },
      reverificationPlan: {
        planVersion: 1,
        targetGateId: 'gate-3',
        requiredGateIds: ['gate-3'],
        requiredCommandIds: ['gate-3-unit-test-command'],
        requiredEvidenceIds: ['gate-3-unit-test-command'],
        successCriteria: ['gate-3 must pass'],
        blockedUntilPatchApplied: true,
        generatedAt: NOW.toISOString(),
      },
      completedAt: NOW,
    });
    const gate0Run = createGeneratedAppGateRun({
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
      status: 'failed',
      summary: 'Gate 3 构建命令失败。',
      failure: {
        code: 'gate3-build-failed',
        message: 'Gate 3 构建命令失败。',
      },
      repairInstructions: '修复 Gate 3 构建脚本后重新运行。',
    });
    const automaticRepairAttempt = createGeneratedAppRepairAttempt({
      targetGateId: 'gate-3',
      status: 'failed',
      failureSummary: 'Gate 3 构建命令失败。',
      changeSummary:
        '自动修复循环已读取失败证据和修复建议。当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。',
      verificationSummary: 'Gate 3 仍为 failed。',
      completedAt: NOW,
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      triggerSource: 'retry',
      failureReason: 'Gate 3 构建命令失败。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGate0RunChain = createInsertReturningChain([gate0Run]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const insertRepairAttemptChain = createInsertReturningChain([
      automaticRepairAttempt,
    ]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate1UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate1UpdatePayload = payload;
      });
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(1))
      .mockReturnValueOnce(
        createSelectOrderedLimitChain([previousRepairAttempt]),
      );
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGate0RunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3RunChain)
      .mockReturnValueOnce(insertRepairAttemptChain);
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
      {
        triggerSource: 'retry',
        maxRepairAttempts: 2,
        maxRuntimeSeconds: 600,
      },
    );

    expect(insertRunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerSource: 'retry',
        runNumber: 2,
      }),
    );
    const repairContextSelectChain = mockTenantDb.select.mock.results[2]
      ?.value as SelectOrderedLimitChain<GeneratedAppRepairAttempt>;
    expect(repairContextSelectChain.orderBy).toHaveBeenCalled();
    const gate1Plan =
      gate1UpdatePayload.generationPlan as GeneratedAppGenerationPlan;
    expect(gate1Plan.repairContext).toEqual(
      expect.objectContaining({
        source: 'previous-failed-repair-attempt',
        sourceGenerationRunId: previousRepairAttempt.generationRunId,
        sourceRepairAttemptId: previousRepairAttempt.id,
        targetGateId: 'gate-3',
        status: 'failed',
        failureSummary: 'Gate 3 构建命令失败。',
        changeSummary: previousRepairAttempt.changeSummary,
        verificationSummary: 'Gate 3 仍为 failed。',
        repairPlan: previousRepairAttempt.repairPlan,
        reverificationPlan: previousRepairAttempt.reverificationPlan,
      }),
    );
    expect(gate1Plan.traceability[0]?.planEvidenceIds).toContain(
      'gate-1-retry-repair-context',
    );
    const gate1Payload = insertGate1RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate1Payload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-1-retry-repair-context',
          kind: 'plan',
          summary: expect.stringContaining(
            '当前 retry 已携带 gate-3 的上一轮失败修复上下文',
          ),
        }),
      ]),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(insertRepairAttemptChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetGateId: 'gate-3',
        status: 'failed',
        repairPlan: expect.objectContaining({
          planVersion: 1,
          source: 'automatic-failed-gate-work-order',
          targetGateId: 'gate-3',
          patchTargets: expect.arrayContaining(['generationWorkspace.files']),
          forbiddenChangeScopes: expect.arrayContaining([
            'public-share-token',
            'host-absolute-path',
          ]),
        }),
        reverificationPlan: expect.objectContaining({
          targetGateId: 'gate-3',
          requiredGateIds: ['gate-3'],
          requiredCommandIds: expect.arrayContaining([
            'gate-3-frontend-build-command',
            'gate-3-typecheck-command',
            'gate-3-unit-test-command',
            'gate-3-component-golden-test-entry',
          ]),
          blockedUntilPatchApplied: true,
        }),
      }),
    );
  });

  it('Gate 7 通过后的 rerun 应复用已有 Generated App runtime workflow 而不重复创建', async () => {
    const app = createGeneratedApp();
    const existingWorkflowId = '55555555-5555-4555-8555-555555555557';
    const updatedApp = createGeneratedApp({
      workflowDefinitionId: existingWorkflowId,
    });
    const findExistingWorkflowChain = createSelectChain([
      { id: existingWorkflowId },
    ]);
    const updateAppWorkflowBindingChain = createUpdateReturningChain([
      updatedApp,
    ]);
    mockTenantDb.select.mockReturnValueOnce(findExistingWorkflowChain);
    mockTenantDb.update.mockReturnValueOnce(updateAppWorkflowBindingChain);

    const response = await (
      service as unknown as {
        ensureGeneratedWorkflowRuntimeBinding(
          tenantId: string,
          userId: string,
          app: GeneratedAppResponseDto,
          generationRunId: string,
        ): Promise<GeneratedAppResponseDto>;
      }
    ).ensureGeneratedWorkflowRuntimeBinding(
      TENANT_ID,
      USER_ID,
      app as unknown as GeneratedAppResponseDto,
      GENERATION_RUN_ID,
    );

    expect(mockTenantDb.insert).not.toHaveBeenCalled();
    expect(updateAppWorkflowBindingChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: existingWorkflowId,
        updatedBy: USER_ID,
      }),
    );
    expect(response.workflowDefinitionId).toBe(existingWorkflowId);
  });

  it('Gate 7 通过后即使已有 Agent 绑定也应补充已发布 Workflow runtime 绑定', async () => {
    const app = createGeneratedApp({
      agentDefinitionId: '77777777-7777-4777-8777-777777777777',
    });
    const updatedApp = createGeneratedApp({
      agentDefinitionId: app.agentDefinitionId,
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    });
    const findExistingWorkflowChain = createSelectChain([]);
    const insertWorkflowChain =
      createGeneratedWorkflowInsertReturningFromPayload();
    const insertWorkflowVersionChain = createInsertReturningChain([
      { id: WORKFLOW_VERSION_ID },
    ]);
    const updateAppWorkflowBindingChain = createUpdateReturningChain([
      updatedApp,
    ]);
    mockTenantDb.select.mockReturnValueOnce(findExistingWorkflowChain);
    mockTenantDb.insert
      .mockReturnValueOnce(insertWorkflowChain)
      .mockReturnValueOnce(insertWorkflowVersionChain);
    mockTenantDb.update
      .mockReturnValueOnce(
        createUpdateReturningChain([{ id: WORKFLOW_DEFINITION_ID }]),
      )
      .mockReturnValueOnce(updateAppWorkflowBindingChain);

    const response = await (
      service as unknown as {
        ensureGeneratedWorkflowRuntimeBinding(
          tenantId: string,
          userId: string,
          app: GeneratedAppResponseDto,
          generationRunId: string,
        ): Promise<GeneratedAppResponseDto>;
      }
    ).ensureGeneratedWorkflowRuntimeBinding(
      TENANT_ID,
      USER_ID,
      app as unknown as GeneratedAppResponseDto,
      GENERATION_RUN_ID,
    );

    expect(insertWorkflowChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'generated-app-runtime-workflow',
          generatedAppId: APP_ID,
          bindingKind: 'public-runtime-workflow',
        }),
        status: 'draft',
      }),
    );
    expect(insertWorkflowVersionChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        tenantId: TENANT_ID,
        versionNumber: 1,
        publishedAt: expect.any(Date),
      }),
    );
    expect(updateAppWorkflowBindingChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        updatedBy: USER_ID,
      }),
    );
    expect(response.agentDefinitionId).toBe(app.agentDefinitionId);
    expect(response.workflowDefinitionId).toBe(WORKFLOW_DEFINITION_ID);
  });

  it('Gate 7 runtime slug 冲突时应复查 metadata 绑定并复用并发创建出的 workflow', async () => {
    const app = createGeneratedApp();
    const concurrentWorkflowId = '55555555-5555-4555-8555-555555555558';
    const insertWorkflowChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(async () => {
        const error = new Error('duplicate slug');
        Object.assign(error, { code: '23505' });
        throw error;
      }),
    };
    mockTenantDb.insert.mockReturnValueOnce(insertWorkflowChain);
    mockTenantDb.select.mockReturnValueOnce(
      createSelectChain([{ id: concurrentWorkflowId }]),
    );

    const workflowId = await (
      service as unknown as {
        createGeneratedWorkflowRuntimeBinding(
          tenantId: string,
          userId: string,
          app: GeneratedAppResponseDto,
          generationRunId: string,
        ): Promise<string>;
      }
    ).createGeneratedWorkflowRuntimeBinding(
      TENANT_ID,
      USER_ID,
      app as unknown as GeneratedAppResponseDto,
      GENERATION_RUN_ID,
    );

    expect(workflowId).toBe(concurrentWorkflowId);
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(1);
    expect(mockTenantDb.select).toHaveBeenCalledTimes(1);
  });

  it('Gate 7 不应把 Gate 3 fixture evidence 误判为真实 Gate 4-7 已通过', () => {
    const app = createGeneratedApp();
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
      ): GeneratedAppBuildUnitPlan;
      buildIntegrationPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
      ): GeneratedAppIntegrationPlan;
      buildBrowserAcceptancePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
      ): GeneratedAppBrowserAcceptancePlan;
      buildIndependentVerificationPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        gateResults: GeneratedApp['gateResults'],
      ): GeneratedAppIndependentVerificationPlan;
      buildPublishCandidatePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
        gateResults: GeneratedApp['gateResults'],
      ): GeneratedAppPublishCandidatePlan;
      evaluateGate7PublishCandidatePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
        gateResults: GeneratedApp['gateResults'],
        publishCandidatePlan: GeneratedAppPublishCandidatePlan,
      ): {
        status: 'passed' | 'failed';
        failure: {
          details?: { skeletonOnlyUpstreamGateIds?: string[] };
        } | null;
      };
    };
    const generationPlan = internals.buildGenerationPlan(app.appSpec);
    const staticContracts = internals.buildStaticContracts(
      app.appSpec,
      generationPlan,
    );
    const fixtureBuildUnitPlan: GeneratedAppBuildUnitPlan = {
      ...internals.buildBuildUnitPlan(
        app.appSpec,
        generationPlan,
        staticContracts,
      ),
      executionLevel: 'fixture-execution',
    };
    const integrationPlan = internals.buildIntegrationPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      fixtureBuildUnitPlan,
    );
    const browserAcceptancePlan = internals.buildBrowserAcceptancePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      fixtureBuildUnitPlan,
      integrationPlan,
    );
    const gateResultsThroughGate5 = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) =>
      ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4', 'gate-5'].includes(
        gate.gateId,
      )
        ? {
            ...gate,
            status: 'passed' as const,
            summary: `${gate.name} fixture/skeleton evidence passed`,
            evidence: [
              {
                id:
                  gate.gateId === 'gate-3'
                    ? 'gate-3-fixture-command-plan'
                    : `${gate.gateId}-evidence`,
                label: `${gate.name} evidence`,
                kind:
                  gate.gateId === 'gate-3'
                    ? ('test' as const)
                    : (gate.evidence[0]?.kind ?? ('manual' as const)),
                url: null,
                summary:
                  gate.gateId === 'gate-3'
                    ? 'fixture executor: command shape validated, real command not executed'
                    : `${gate.name} skeleton evidence`,
                details:
                  gate.gateId === 'gate-3'
                    ? {
                        executionMode: 'fixture',
                        executed: false,
                        exitCode: null,
                      }
                    : undefined,
              },
            ],
          }
        : gate,
    );
    const independentVerificationPlan =
      internals.buildIndependentVerificationPlan(
        app.appSpec,
        generationPlan,
        staticContracts,
        fixtureBuildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        gateResultsThroughGate5,
      );
    const gateResultsThroughGate6 = gateResultsThroughGate5.map((gate) =>
      gate.gateId === 'gate-6'
        ? {
            ...gate,
            status: 'passed' as const,
            summary: 'Gate 6 independent verifier skeleton evidence passed',
            evidence: [
              {
                id: 'gate-6-verifier-skeleton',
                label: 'Gate 6 skeleton evidence',
                kind: 'verifier' as const,
                url: null,
                summary: 'independent verifier skeleton only',
              },
            ],
          }
        : gate,
    );

    const publishCandidatePlan = internals.buildPublishCandidatePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      fixtureBuildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      gateResultsThroughGate6,
    );
    const evaluation = internals.evaluateGate7PublishCandidatePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      fixtureBuildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      gateResultsThroughGate6,
      publishCandidatePlan,
    );

    expect(publishCandidatePlan.publicationBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'skeleton_only_upstream_gate',
          gateIds: ['gate-3', 'gate-4', 'gate-5', 'gate-6'],
        }),
      ]),
    );
    expect(publishCandidatePlan.gateCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'gate-3',
          executionLevel: 'fixture-execution',
          skeletonOnly: true,
          evidenceIds: expect.arrayContaining(['gate-3-fixture-command-plan']),
        }),
        expect.objectContaining({
          gateId: 'gate-4',
          skeletonOnly: true,
        }),
      ]),
    );
    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.details?.skeletonOnlyUpstreamGateIds).toEqual([
      'gate-3',
      'gate-4',
      'gate-5',
      'gate-6',
    ]);
  });

  it('Gate 7 不应把 Gate 4 fixture integration evidence 误判为真实集成通过', () => {
    const app = createGeneratedApp();
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
      ): GeneratedAppBuildUnitPlan;
      buildIntegrationPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        executionLevel: GeneratedAppIntegrationPlan['executionLevel'],
      ): GeneratedAppIntegrationPlan;
      buildBrowserAcceptancePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
      ): GeneratedAppBrowserAcceptancePlan;
      buildIndependentVerificationPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        gateResults: GeneratedApp['gateResults'],
      ): GeneratedAppIndependentVerificationPlan;
      buildPublishCandidatePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
        gateResults: GeneratedApp['gateResults'],
      ): GeneratedAppPublishCandidatePlan;
      evaluateGate7PublishCandidatePlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        buildUnitPlan: GeneratedAppBuildUnitPlan,
        integrationPlan: GeneratedAppIntegrationPlan,
        browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
        independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
        gateResults: GeneratedApp['gateResults'],
        publishCandidatePlan: GeneratedAppPublishCandidatePlan,
      ): {
        status: 'passed' | 'failed';
        failure: {
          details?: { skeletonOnlyUpstreamGateIds?: string[] };
        } | null;
      };
    };
    const generationPlan = internals.buildGenerationPlan(app.appSpec);
    const staticContracts = internals.buildStaticContracts(
      app.appSpec,
      generationPlan,
    );
    const buildUnitPlan = internals.buildBuildUnitPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
    );
    const integrationPlan = internals.buildIntegrationPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      'fixture-integration',
    );
    const browserAcceptancePlan = internals.buildBrowserAcceptancePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
    );
    const gateResultsThroughGate5 = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) =>
      ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4', 'gate-5'].includes(
        gate.gateId,
      )
        ? {
            ...gate,
            status: 'passed' as const,
            summary: `${gate.name} fixture/skeleton evidence passed`,
            evidence: [
              {
                id:
                  gate.gateId === 'gate-4'
                    ? 'gate-4-fixture-integration-runner'
                    : `${gate.gateId}-evidence`,
                label: `${gate.name} evidence`,
                kind:
                  gate.gateId === 'gate-4'
                    ? ('test' as const)
                    : (gate.evidence[0]?.kind ?? ('manual' as const)),
                url: null,
                summary:
                  gate.gateId === 'gate-4'
                    ? 'fixture integration runner validated trace shape; executed=false'
                    : `${gate.name} evidence`,
                details:
                  gate.gateId === 'gate-4'
                    ? {
                        executionMode: 'fixture',
                        executionLevel: 'fixture-integration',
                        executed: false,
                      }
                    : undefined,
              },
            ],
          }
        : gate,
    );
    const independentVerificationPlan =
      internals.buildIndependentVerificationPlan(
        app.appSpec,
        generationPlan,
        staticContracts,
        buildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        gateResultsThroughGate5,
      );
    const gateResultsThroughGate6 = gateResultsThroughGate5.map((gate) =>
      gate.gateId === 'gate-6'
        ? {
            ...gate,
            status: 'passed' as const,
            summary: 'Gate 6 independent verifier skeleton evidence passed',
            evidence: [
              {
                id: 'gate-6-verifier-skeleton',
                label: 'Gate 6 skeleton evidence',
                kind: 'verifier' as const,
                url: null,
                summary: 'independent verifier skeleton only',
              },
            ],
          }
        : gate,
    );

    const publishCandidatePlan = internals.buildPublishCandidatePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      gateResultsThroughGate6,
    );
    const evaluation = internals.evaluateGate7PublishCandidatePlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
      gateResultsThroughGate6,
      publishCandidatePlan,
    );

    expect(publishCandidatePlan.publicationBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'skeleton_only_upstream_gate',
          gateIds: ['gate-4', 'gate-5', 'gate-6'],
        }),
        expect.objectContaining({
          category: 'missing_real_execution_artifact',
          gateIds: expect.arrayContaining(['gate-4', 'gate-5']),
        }),
      ]),
    );
    expect(publishCandidatePlan.gateCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'gate-3',
          executionLevel: 'real-local-command-plan',
          skeletonOnly: false,
        }),
        expect.objectContaining({
          gateId: 'gate-4',
          executionLevel: 'fixture-integration',
          skeletonOnly: true,
          evidenceIds: ['gate-4-fixture-integration-runner'],
        }),
      ]),
    );
    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.details?.skeletonOnlyUpstreamGateIds).toEqual([
      'gate-4',
      'gate-5',
      'gate-6',
    ]);
  });

  it('Gate 1 失败时应写入失败证据、保留 generationPlan 并以 Gate 1 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'c'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const brokenPlan: GeneratedAppGenerationPlan = {
      ...validPlan,
      traceability: validPlan.traceability.map((entry) => ({
        ...entry,
        pageIds: ['missing-page'],
      })),
    };
    vi.spyOn(
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      },
      'buildGenerationPlan',
    ).mockReturnValue(brokenPlan);
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
      status: 'failed',
      summary:
        'Gate 1 失败：generationPlan 未完整覆盖 AppSpec 的页面、编排、插件/工具、数据、测试门禁或 traceability。',
      failure: {
        code: 'generation-plan-incomplete',
        message:
          'GenerationPlan 架构计划检查失败：需求到计划证据 traceability。',
      },
      repairInstructions:
        '修复 generationPlan，使其覆盖 AppSpec 版本、页面计划、Agent/Workflow 编排计划、插件/工具策略、数据持久化策略、Gate 2-7 测试计划和每条核心需求 traceability。',
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'GenerationPlan 架构计划检查失败：需求到计划证据 traceability。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate1UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate1UpdatePayload = payload;
      });
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate1RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-1',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'generation-plan-incomplete',
          message: expect.stringContaining('traceability'),
        }),
        repairInstructions: expect.stringContaining('修复 generationPlan'),
      }),
    );
    const gate1RunPayload = insertGate1RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate1RunPayload.evidence.some((item) =>
        item.summary.includes('missing-page'),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate1RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );
    expect(gate1UpdatePayload.generationPlan).toEqual(brokenPlan);
    expect(gate1UpdatePayload.generationPlan).not.toHaveProperty(
      'staticContracts',
    );
    expect(gate1UpdatePayload.status).toBe('failed');
    expect(gate1UpdatePayload.publicShareToken).toBeNull();
    expect(gate1UpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'GenerationPlan 架构计划检查失败',
        ),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(3);
    expect(response.gateRuns).toHaveLength(2);
    expect(response.gateRuns[1]).toEqual(
      expect.objectContaining({
        gateId: 'gate-1',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'generation-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan).toEqual(brokenPlan);
  });

  it('Gate 2 失败时应写入失败证据、保留 attempted staticContracts 并以 Gate 2 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'd'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validPlanWithTool: GeneratedAppGenerationPlan = {
      ...validPlan,
      pluginTools: {
        ...validPlan.pluginTools,
        tools: [
          {
            toolId: 'tool-symptom-score',
            purpose: '对问诊输入做结构化评分。',
            requirementIds: ['req-1'],
            permissionNotes: ['禁止隐式网络、存储、知识库或 LLM 权限。'],
          },
        ],
        emptyReason: null,
      },
    };
    vi.spyOn(
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      },
      'buildGenerationPlan',
    ).mockReturnValue(validPlanWithTool);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlanWithTool);
    const malformedContracts: GeneratedAppStaticContracts = {
      ...validContracts,
      frontendRoutes: validContracts.frontendRoutes.map((route) => ({
        ...route,
        scenarioIds: [],
      })),
      orchestration: {
        ...validContracts.orchestration,
        nodes: validContracts.orchestration.nodes.map((node, index) =>
          index === 0
            ? {
                ...node,
                scenarioIds: [],
                outputHandle: '',
              }
            : node,
        ),
      },
      pluginToolPermissions: {
        ...validContracts.pluginToolPermissions,
        tools: [],
      },
      submissionPersistence: {
        ...validContracts.submissionPersistence,
        fields: validContracts.submissionPersistence.fields.filter(
          (field) => field !== 'publicShareToken',
        ),
      },
      testEntry: {
        ...validContracts.testEntry,
        verifierGateCommand: '',
        publishCandidateGateCommand: '',
      },
      traceability: validContracts.traceability.map((entry) => ({
        ...entry,
        scenarioIds: [],
        staticContractIds: ['missing-contract'],
      })),
    };
    vi.spyOn(
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      },
      'buildStaticContracts',
    ).mockReturnValue(malformedContracts);
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
      status: 'failed',
      summary:
        'Gate 2 失败：staticContracts 未完整覆盖公开运行、前端路由、编排、插件权限、提交持久化、测试入口或 traceability。',
      failure: {
        code: 'static-contracts-incomplete',
        message: 'StaticContracts 静态合约检查失败：静态合约 traceability。',
      },
      repairInstructions:
        '修复 generationPlan.staticContracts，使其覆盖 public runtime 输入输出、frontend route/page、Workflow/Agent 编排、插件/工具权限、submission persistence、Gate 3-7 测试入口和每条核心需求 traceability。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'StaticContracts 静态合约检查失败：静态合约 traceability。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate2UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate2UpdatePayload = payload;
      });
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate2RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-2',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'static-contracts-incomplete',
          message: expect.stringContaining('StaticContracts 静态合约检查失败'),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.staticContracts',
        ),
      }),
    );
    const gate2RunPayload = insertGate2RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes('missing-contract'),
      ),
    ).toBe(true);
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes('frontendRoutes[0].scenarioIds 缺少 scenario-1'),
      ),
    ).toBe(true);
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes('orchestration.nodes[0].outputHandle 缺失'),
      ),
    ).toBe(true);
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes('tool-symptom-score 缺少权限合约'),
      ),
    ).toBe(true);
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes(
          'submissionPersistence.fields 缺少 publicShareToken',
        ),
      ),
    ).toBe(true);
    expect(
      gate2RunPayload.evidence.some((item) =>
        item.summary.includes('testEntry.verifierGateCommand 缺失'),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate2RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );

    const appUpdatePayload = gate2UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.staticContracts).toEqual(
      malformedContracts,
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty('buildUnitPlan');
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-2'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary:
          'Gate 2 失败：staticContracts 未完整覆盖公开运行、前端路由、编排、插件权限、提交持久化、测试入口或 traceability。',
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-3')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'StaticContracts 静态合约检查失败',
        ),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain(
      'StaticContracts 静态合约检查失败',
    );
    expect(response.gateRuns).toHaveLength(3);
    expect(
      response.gateRuns.some((gateRun) => gateRun.gateId === 'gate-3'),
    ).toBe(false);
    expect(response.gateRuns[2]).toEqual(
      expect.objectContaining({
        gateId: 'gate-2',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'static-contracts-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.staticContracts).toEqual(
      malformedContracts,
    );
    expect(response.app.generationPlan).not.toHaveProperty('buildUnitPlan');
  });

  it('Gate 3 失败时应写入失败证据、保留 attempted buildUnitPlan 并以 Gate 3 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'e'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlan);
    const validBuildUnitPlan = (
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      }
    ).buildBuildUnitPlan(app.appSpec, validPlan, validContracts);
    const malformedBuildUnitPlan: GeneratedAppBuildUnitPlan = {
      ...validBuildUnitPlan,
      generationWorkspace: validBuildUnitPlan.generationWorkspace
        ? {
            ...validBuildUnitPlan.generationWorkspace,
            relativePath: '/tmp/leaked-generated-app',
            files: [
              ...validBuildUnitPlan.generationWorkspace.files,
              {
                path: '../escape.ts',
                kind: 'source',
                derivedFrom: 'generated-app-scaffold',
                required: true,
              },
            ],
            artifactPaths: {
              ...validBuildUnitPlan.generationWorkspace.artifactPaths,
              buildOutput: '/tmp/dist/index.html',
            },
          }
        : undefined,
      commandPlan: validBuildUnitPlan.commandPlan?.map((command, index) =>
        index === 0
          ? {
              ...command,
              command: 'sh -c "echo unsafe"',
              workingDirectory: '../outside',
            }
          : command,
      ),
      frontendBuild: {
        ...validBuildUnitPlan.frontendBuild,
        command: 'sh -c "vite build"',
        workingDirectory: '/tmp/leaked-generated-app',
        requirementIds: ['req-1', 'req-missing'],
        scenarioIds: ['scenario-1', 'scenario-missing'],
        expectedArtifacts: ['dist/index.html'],
      },
      typecheck: {
        ...validBuildUnitPlan.typecheck,
        command: '',
        tsconfigPath: '../tsconfig.generated-app.json',
        requirementIds: ['req-1', 'req-missing'],
      },
      unitTests: {
        ...validBuildUnitPlan.unitTests,
        command: '',
        entry: '/tmp/runtime.contract.spec.ts',
        requirementIds: ['req-1', 'req-missing'],
        scenarioIds: ['scenario-1', 'scenario-missing'],
      },
      componentGoldenTests: {
        ...validBuildUnitPlan.componentGoldenTests,
        command: 'node /tmp/golden.mjs',
        entry: 'src//generated-app/__tests__/runtime.golden.spec.tsx',
        scenarioIds: ['scenario-1', 'scenario-missing'],
        goldenArtifactPath: '../golden.json',
      },
      artifactExpectations: [
        ...validBuildUnitPlan.artifactExpectations.filter(
          (artifact) => artifact.artifactId !== 'coverage-report',
        ),
        {
          artifactId: 'ghost-artifact',
          kind: 'ghost_report' as GeneratedAppBuildUnitPlan['artifactExpectations'][number]['kind'],
          path: '/tmp/gate-3/ghost.json',
          required: true,
        },
      ],
      staticContractsCoverage: validBuildUnitPlan.staticContractsCoverage
        .filter(
          (coverage) =>
            coverage.staticContractId !== 'gate-2-traceability-contract',
        )
        .map((coverage, index) =>
          index === 0
            ? { ...coverage, coveredBy: ['gate-3-ghost-check'] }
            : coverage,
        ),
      acceptanceScenarioCoverage: [
        {
          scenarioId: 'scenario-1',
          requirementIds: ['req-1', 'req-missing'],
          coveredBy: ['gate-3-unit-test-command', 'gate-3-ghost-check'],
        },
        {
          scenarioId: 'scenario-missing',
          requirementIds: ['req-1'],
          coveredBy: ['gate-3-unit-test-command'],
        },
      ],
      pluginBuildExpectations: {
        ...validBuildUnitPlan.pluginBuildExpectations,
        emptyReason: '',
      },
      failureCaptureFields: ['command', 'exitCode'],
    };
    vi.spyOn(
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      },
      'buildBuildUnitPlan',
    ).mockReturnValue(malformedBuildUnitPlan);
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
      status: 'failed',
      summary:
        'Gate 3 失败：buildUnitPlan 未完整覆盖构建命令、类型检查、单元/组件/golden 测试、artifact 期望、插件构建期望、合约覆盖、场景覆盖或失败捕获字段。',
      failure: {
        code: 'build-unit-plan-incomplete',
        message: 'BuildUnitPlan 构建与单元 skeleton 检查失败：类型检查命令。',
      },
      repairInstructions:
        '修复 generationPlan.buildUnitPlan，使其覆盖前端 build/typecheck/unit/component/golden 测试入口、artifact expectations、staticContracts coverage、acceptanceScenario coverage、插件构建期望和失败捕获字段；当前 Gate 3 仍只检查 contract-skeleton 合约，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'BuildUnitPlan 构建与单元 skeleton 检查失败：类型检查命令。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
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
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate3RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-3',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'build-unit-plan-incomplete',
          message: expect.stringContaining('BuildUnitPlan'),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.buildUnitPlan',
        ),
      }),
    );
    const gate3RunPayload = insertGate3RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'generationWorkspace.relativePath 必须是 workspace 相对路径',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some(
        (item) =>
          item.summary.includes('generationWorkspace.files[') &&
          item.summary.includes('.path 不能包含空路径段'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'generationWorkspace.artifactPaths.buildOutput 必须是 workspace 相对路径',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'commandPlan[0].command 必须为受控命令 node scripts/gate3-build.mjs',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'commandPlan[0].workingDirectory 不能包含空路径段',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'frontendBuild.command 必须为受控命令 node scripts/gate3-build.mjs',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'frontendBuild.workingDirectory 必须是 workspace 相对路径',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'frontendBuild.requirementIds 引用了未知对象 req-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'frontendBuild.scenarioIds 引用了未知对象 scenario-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('typecheck.command 缺失'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('typecheck.tsconfigPath 不能包含'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('unitTests.command 缺失'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('unitTests.entry 必须是 workspace 相对路径'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('componentGoldenTests.command 必须为受控命令'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('componentGoldenTests.entry 不能包含'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'componentGoldenTests.goldenArtifactPath 不能包含',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactExpectations.artifactId 缺少 coverage-report',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactExpectations.artifactId 引用了未知对象 ghost-artifact',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('artifactExpectations[3].kind 必须是'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactExpectations[3].path 必须是 workspace 相对路径',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'staticContractsCoverage 缺少 gate-2-traceability-contract',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'staticContractsCoverage[0].coveredBy 引用了未知对象 gate-3-ghost-check',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'acceptanceScenarioCoverage[1].scenarioId 引用了未知场景 scenario-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'acceptanceScenarioCoverage[scenario-1].requirementIds 引用了未知对象 req-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes(
          'acceptanceScenarioCoverage[scenario-1].coveredBy 引用了未知对象 gate-3-ghost-check',
        ),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.some((item) =>
        item.summary.includes('failureCaptureFields 缺少 stderr'),
      ),
    ).toBe(true);
    expect(
      gate3RunPayload.evidence.every((item) =>
        item.summary.includes('contract-skeleton 只检查计划完整性'),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate3RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );

    const appUpdatePayload = gate3UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.buildUnitPlan).toEqual(
      malformedBuildUnitPlan,
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-3'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary:
          'Gate 3 失败：buildUnitPlan 未完整覆盖构建命令、类型检查、单元/组件/golden 测试、artifact 期望、插件构建期望、合约覆盖、场景覆盖或失败捕获字段。',
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-4')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining('BuildUnitPlan'),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain('BuildUnitPlan');
    expect(response.gateRuns).toHaveLength(4);
    expect(response.gateRuns[3]).toEqual(
      expect.objectContaining({
        gateId: 'gate-3',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'build-unit-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.buildUnitPlan).toEqual(
      malformedBuildUnitPlan,
    );
    expect(
      response.gateRuns.some((gateRun) => gateRun.gateId === 'gate-4'),
    ).toBe(false);
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(5);
  });

  it('Gate 3 workspace materialization 失败时应停止 Gate 4-7 并保留 runner 证据', async () => {
    const runnerResult: GeneratedAppGate3RunnerResult = {
      status: 'failed',
      executionLevel: 'real-local-command-plan',
      summary:
        'Gate 3 失败：Generation Workspace materialization 未完成，已停止 Gate 4-7。',
      evidence: [
        {
          id: 'gate-3-generation-workspace-materialization',
          label: 'Generation Workspace materialization',
          kind: 'build',
          url: null,
          summary: '受控 workspace 写入失败：EACCES',
          details: {
            runnerId: 'gate-3-real-build-unit-runner',
            executionMode: 'real_local_command_plan',
            executed: false,
            workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
            errorMessage: 'EACCES',
          },
        },
      ],
      failure: {
        code: 'gate-3-workspace-materialization-failed',
        message:
          'Gate 3 Generation Workspace materialization 失败，不能继续执行 Gate 4-7。',
        details: {
          workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
          errorMessage: 'EACCES',
        },
      },
      repairInstructions:
        '检查服务端 GENERATED_APP_WORKSPACE_ROOT 可写性、受控 workspace 相对路径和 scaffold 文件写入规则；修复后重新运行 Gate 3。',
      commandResults: [],
    };

    const {
      app,
      gate3UpdatePayload,
      insertGate3RunChain,
      response,
      updateRunChain,
    } = await startGenerationRunWithGate3Result(runnerResult, {
      ...DEFAULT_START_GENERATION_RUN_DTO,
      maxRepairAttempts: 0,
    });

    expect(insertGate3RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-3',
        status: 'failed',
        summary: expect.stringContaining('Generation Workspace'),
        failure: expect.objectContaining({
          code: 'gate-3-workspace-materialization-failed',
          message: expect.stringContaining('不能继续执行 Gate 4-7'),
        }),
        repairInstructions: expect.stringContaining(
          'GENERATED_APP_WORKSPACE_ROOT',
        ),
      }),
    );
    const gate3RunPayload = insertGate3RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate3RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-3-generation-workspace-materialization',
          details: expect.objectContaining({
            executed: false,
            executionMode: 'real_local_command_plan',
            errorMessage: 'EACCES',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(gate3RunPayload.evidence)).not.toContain(
      app.publicShareToken,
    );

    const appUpdatePayload = gate3UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-3'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        evidence: expect.arrayContaining([
          expect.objectContaining({
            id: 'gate-3-generation-workspace-materialization',
          }),
        ]),
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-4')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.generationPlan.buildUnitPlan).toEqual(
      expect.objectContaining({
        executionLevel: 'real-local-command-plan',
        generationWorkspace: expect.objectContaining({
          storageKind: 'server-controlled-local-workspace',
        }),
      }),
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'integrationPlan',
    );
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(5);
    expect(response.gateRuns.map((gateRun) => gateRun.gateId)).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
    ]);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'Generation Workspace materialization 失败',
        ),
      }),
    );
  });

  it('Gate 3 命令失败时应停止 Gate 4-7 并保存命令输出摘要', async () => {
    const runnerResult: GeneratedAppGate3RunnerResult = {
      status: 'failed',
      executionLevel: 'real-local-command-plan',
      summary:
        'Gate 3 失败：命令 gate-3-unit-test-command 退出码为 1，已停止 Gate 4-7。',
      evidence: [
        {
          id: 'gate-3-generation-workspace-materialized',
          label: 'Generation Workspace materialization',
          kind: 'build',
          url: null,
          summary:
            '受控 react-vite-typescript workspace 已 materialize，未开放任意路径写入。',
          details: {
            workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
            storageKind: 'server-controlled-local-workspace',
          },
        },
        {
          id: 'gate-3-unit-test-command',
          label: 'Gate 3 gate-3-unit-test-command',
          kind: 'test',
          url: null,
          summary:
            'node scripts/gate3-unit.mjs exitCode=1；mode=real_local_command_plan；executed=true；artifacts=unit-test-report；requirements=req-1；scenarios=scenario-1',
          details: {
            runnerId: 'gate-3-real-build-unit-runner',
            executionMode: 'real_local_command_plan',
            workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
            commandId: 'gate-3-unit-test-command',
            command: 'node scripts/gate3-unit.mjs',
            exitCode: 1,
            stdoutSummary: '{"command":"gate3-unit"}',
            stderrSummary: 'expected scenario coverage to include scenario-1',
            durationMs: 42,
            executed: true,
            timedOut: false,
            artifactRefs: ['unit-test-report'],
            requirementIds: ['req-1'],
            scenarioIds: ['scenario-1'],
          },
        },
      ],
      failure: {
        code: 'gate-3-command-failed',
        message:
          'Gate 3 命令 gate-3-unit-test-command 执行失败，不能继续执行 Gate 4-7。',
        details: {
          workspaceRef: `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
          failedCommand: {
            commandId: 'gate-3-unit-test-command',
            command: 'node scripts/gate3-unit.mjs',
            exitCode: 1,
            stdoutSummary: '{"command":"gate3-unit"}',
            stderrSummary: 'expected scenario coverage to include scenario-1',
          },
        },
      },
      repairInstructions:
        '读取 Gate 3 命令 stdout/stderr 摘要和 artifact refs，修复生成应用源码、静态合约覆盖或测试入口后重新运行 Gate 3。',
      commandResults: [
        {
          commandId: 'gate-3-unit-test-command',
          command: 'node scripts/gate3-unit.mjs',
          exitCode: 1,
          stdoutSummary: '{"command":"gate3-unit"}',
          stderrSummary: 'expected scenario coverage to include scenario-1',
          durationMs: 42,
          executed: true,
          timedOut: false,
          artifactRefs: ['unit-test-report'],
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
        },
      ],
    };

    const { gate3UpdatePayload, insertGate3RunChain, response } =
      await startGenerationRunWithGate3Result(runnerResult, {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      });

    expect(insertGate3RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-3',
        status: 'failed',
        summary: expect.stringContaining('gate-3-unit-test-command'),
        failure: expect.objectContaining({
          code: 'gate-3-command-failed',
          details: expect.objectContaining({
            failedCommand: expect.objectContaining({
              exitCode: 1,
              stderrSummary: expect.stringContaining('scenario-1'),
            }),
          }),
        }),
        repairInstructions: expect.stringContaining('stdout/stderr 摘要'),
      }),
    );
    const gate3RunPayload = insertGate3RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate3RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-3-unit-test-command',
          details: expect.objectContaining({
            executed: true,
            exitCode: 1,
            stdoutSummary: expect.stringContaining('gate3-unit'),
            stderrSummary: expect.stringContaining('scenario-1'),
            artifactRefs: ['unit-test-report'],
          }),
        }),
      ]),
    );

    const appUpdatePayload = gate3UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-4')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'integrationPlan',
    );
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(response.gateRuns.map((gateRun) => gateRun.gateId)).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
    ]);
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(5);
  });

  it('Gate 3 首次失败后应应用受控补丁、完成修复尝试并继续 Gate 4', async () => {
    const configService = createConfigService();
    const initialGate3Failure = createGate3RunnerResult({
      status: 'failed',
      summary:
        'Gate 3 失败：命令 gate-3-unit-test-command 退出码为 1，已停止 Gate 4-7。',
      failure: {
        code: 'gate-3-command-failed',
        message:
          'Gate 3 命令 gate-3-unit-test-command 执行失败，不能继续执行 Gate 4-7。',
      },
      repairInstructions:
        '读取 Gate 3 命令 stdout/stderr 摘要和 artifact refs，修复生成应用源码、静态合约覆盖或测试入口后重新运行 Gate 3。',
    });
    const gate3RepairResult = createGate3RepairResult();
    const gate3Runner = createGate3RunnerStub(
      configService,
      initialGate3Failure,
      gate3RepairResult,
    );
    const gate4Runner = createGate4RunnerStub(
      configService,
      createGate4RunnerResult({
        status: 'failed',
        failure: {
          code: 'gate-4-integration-check-failed',
          message: 'Gate 4 集成检查失败。',
        },
      }),
    );
    const serviceWithRunner = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      gate3Runner,
      gate4Runner,
    );
    const app = createGeneratedApp();
    const run = createGeneratedAppGenerationRun();
    const gate0Run = createGeneratedAppGateRun({
      gateId: 'gate-0',
      gateOrder: 0,
      gateName: '需求规格门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary: 'Gate 0 通过。',
      evidence: [],
    });
    const gate1Run = createGeneratedAppGateRun({
      id: GATE_1_RUN_ID,
      gateId: 'gate-1',
      gateOrder: 1,
      gateName: '架构计划门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary: 'Gate 1 通过。',
      evidence: [],
    });
    const gate2Run = createGeneratedAppGateRun({
      id: GATE_2_RUN_ID,
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary: 'Gate 2 通过。',
      evidence: [],
    });
    const gate3FailedRun = createGeneratedAppGateRun({
      id: GATE_3_RUN_ID,
      gateId: 'gate-3',
      gateOrder: 3,
      gateName: '构建与单元门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary: initialGate3Failure.summary,
      evidence: initialGate3Failure.evidence,
      failure: initialGate3Failure.failure,
      repairInstructions: initialGate3Failure.repairInstructions,
    });
    const runningRepairAttempt = createGeneratedAppRepairAttempt({
      targetGateId: 'gate-3',
      status: 'running',
      failureSummary:
        'gate-3 构建与单元门禁 失败：Gate 3 命令 gate-3-unit-test-command 执行失败，不能继续执行 Gate 4-7。',
      repairPlan: {
        planVersion: 1,
        source: 'automatic-failed-gate-work-order',
        targetGateId: 'gate-3',
        targetGateName: '构建与单元门禁',
        failureCode: 'gate-3-command-failed',
        failureSummary:
          'Gate 3 命令 gate-3-unit-test-command 执行失败，不能继续执行 Gate 4-7。',
        repairInstructions:
          '读取 Gate 3 命令 stdout/stderr 摘要和 artifact refs，修复生成应用源码、静态合约覆盖或测试入口后重新运行 Gate 3。',
        evidenceIds: ['gate-3-frontend-build-command'],
        evidenceSummaries: ['exitCode=1'],
        allowedChangeScopes: ['frontend-workspace', 'test-contracts'],
        forbiddenChangeScopes: ['public-share-token'],
        patchTargets: ['generationWorkspace.files'],
        requiredTraceability: ['failed-evidence-citation'],
        generatedAt: NOW.toISOString(),
      },
      reverificationPlan: {
        planVersion: 1,
        targetGateId: 'gate-3',
        requiredGateIds: ['gate-3'],
        requiredCommandIds: ['gate-3-unit-test-command'],
        requiredEvidenceIds: ['gate-3-frontend-build-command'],
        successCriteria: ['gate-3 must pass'],
        blockedUntilPatchApplied: true,
        generatedAt: NOW.toISOString(),
      },
      completedAt: null,
    });
    const gate3RepairRun = createGeneratedAppGateRun({
      id: '66666666-6666-4666-8666-666666666674',
      gateId: 'gate-3',
      gateOrder: 3,
      gateName: '构建与单元门禁',
      generationRunId: GENERATION_RUN_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
      attemptNumber: 2,
      status: 'passed',
      summary: gate3RepairResult.summary,
      evidence: gate3RepairResult.evidence,
      failure: null,
      repairInstructions: null,
    });
    const completedRepairAttempt = createGeneratedAppRepairAttempt({
      ...runningRepairAttempt,
      status: 'completed',
      changeSummary: gate3RepairResult.changeSummary,
      verificationSummary: gate3RepairResult.verificationSummary,
      completedAt: NOW,
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary: 'Gate 4 集成检查失败。',
      failure: {
        code: 'gate-4-integration-check-failed',
        message: 'Gate 4 集成检查失败。',
      },
    });
    const automaticGate4RepairAttempt = createGeneratedAppRepairAttempt({
      id: '77777777-7777-4777-8777-777777777778',
      targetGateId: 'gate-4',
      status: 'failed',
      failureSummary: 'Gate 4 集成检查失败。',
      changeSummary: '自动修复循环已定位 Gate 4 失败。',
      verificationSummary: 'Gate 4 仍为 failed。',
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason: 'Gate 4 集成检查失败。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGate0RunChain = createInsertReturningChain([gate0Run]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3FailedRunChain = createInsertReturningChain([
      gate3FailedRun,
    ]);
    const insertRunningRepairAttemptChain = createInsertReturningChain([
      runningRepairAttempt,
    ]);
    const insertGate3RepairRunChain = createInsertReturningChain([
      gate3RepairRun,
    ]);
    const insertGate4RunChain = createInsertReturningChain([gate4Run]);
    const insertAutomaticGate4RepairAttemptChain = createInsertReturningChain([
      automaticGate4RepairAttempt,
    ]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3FailedChain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3RepairChain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateRepairAttemptChain = createUpdateReturningChain([
      completedRepairAttempt,
    ]);
    const updateAppAfterGate4Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateRunChain = createUpdateReturningChain([completedRun]);

    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGate0RunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3FailedRunChain)
      .mockReturnValueOnce(insertRunningRepairAttemptChain)
      .mockReturnValueOnce(insertGate3RepairRunChain)
      .mockReturnValueOnce(insertGate4RunChain)
      .mockReturnValueOnce(insertAutomaticGate4RepairAttemptChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3FailedChain)
      .mockReturnValueOnce(updateAppAfterGate3RepairChain)
      .mockReturnValueOnce(updateRepairAttemptChain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await serviceWithRunner.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      DEFAULT_START_GENERATION_RUN_DTO,
    );

    expect(gate3Runner.applyRepairPatchAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repairPlan: runningRepairAttempt.repairPlan,
        reverificationPlan: runningRepairAttempt.reverificationPlan,
      }),
    );
    expect(insertRunningRepairAttemptChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetGateId: 'gate-3',
        status: 'running',
        repairPlan: expect.objectContaining({
          targetGateId: 'gate-3',
          failureCode: 'gate-3-command-failed',
        }),
      }),
    );
    expect(insertGate3RepairRunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-3',
        repairAttemptId: REPAIR_ATTEMPT_ID,
        attemptNumber: 2,
        status: 'passed',
        evidence: expect.arrayContaining([
          expect.objectContaining({
            id: 'gate-3-controlled-repair-patch',
          }),
        ]),
      }),
    );
    expect(updateRepairAttemptChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        changeSummary: gate3RepairResult.changeSummary,
        verificationSummary: gate3RepairResult.verificationSummary,
        completedAt: expect.any(Date),
      }),
    );
    expect(insertGate4RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-4',
        status: 'failed',
      }),
    );
    expect(insertAutomaticGate4RepairAttemptChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetGateId: 'gate-4',
        status: 'failed',
      }),
    );
    expect(response.gateRuns.map((gateRun) => gateRun.gateId)).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
      'gate-3',
      'gate-4',
    ]);
  });

  it('Gate 3 real-local runner 应拒绝非 allowlist 命令且不执行任意 shell', async () => {
    const app = createGeneratedApp();
    const configService = createConfigService({
      GENERATED_APP_WORKSPACE_ROOT:
        '/tmp/agentloom-generated-app-gate3-runner-spec',
    });
    const runner = new GeneratedAppGate3WorkspaceRunner(configService);
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        generationWorkspace: NonNullable<
          GeneratedAppBuildUnitPlan['generationWorkspace']
        >,
        commandPlan: ReturnType<
          GeneratedAppGate3WorkspaceRunner['buildCommandPlan']
        >,
        executionLevel: GeneratedAppBuildUnitPlan['executionLevel'],
      ): GeneratedAppBuildUnitPlan;
    };
    const generationPlan = internals.buildGenerationPlan(app.appSpec);
    const staticContracts = internals.buildStaticContracts(
      app.appSpec,
      generationPlan,
    );
    const workspace = runner.buildWorkspaceContract({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec: app.appSpec,
      staticContracts,
    });
    const commandPlan = runner.buildCommandPlan({
      workspace,
      requirementIds: app.appSpec.coreRequirements.map(
        (requirement) => requirement.id,
      ),
      scenarioIds: app.appSpec.acceptanceScenarios.map(
        (scenario) => scenario.id,
      ),
    });
    const buildUnitPlan = internals.buildBuildUnitPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      workspace,
      commandPlan,
      'real-local-command-plan',
    );
    const result = await runner.materializeAndRun({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec: app.appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      workspace,
      commandPlan: [
        {
          ...commandPlan[0],
          command: 'sh -c "echo unsafe"',
          scriptPath: '/bin/sh',
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.commandResults[0]).toEqual(
      expect.objectContaining({
        commandId: 'gate-3-frontend-build-command',
        executed: false,
        exitCode: 1,
        stderrSummary: expect.stringContaining('allowlist'),
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-3-frontend-build-command',
          details: expect.objectContaining({
            executed: false,
            stderrSummary: expect.stringContaining('allowlist'),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(
      '/tmp/agentloom-generated-app-gate3-runner-spec',
    );
  });

  it('Gate 3 real-local runner 应生成包含业务内容的数据用途构建预览', async () => {
    const app = createGeneratedApp();
    const workspaceRoot = join(
      tmpdir(),
      'agentloom-generated-app-gate3-preview-spec',
    );
    const configService = createConfigService({
      GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
    });
    const runner = new GeneratedAppGate3WorkspaceRunner(configService);
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        generationWorkspace: NonNullable<
          GeneratedAppBuildUnitPlan['generationWorkspace']
        >,
        commandPlan: ReturnType<
          GeneratedAppGate3WorkspaceRunner['buildCommandPlan']
        >,
        executionLevel: GeneratedAppBuildUnitPlan['executionLevel'],
      ): GeneratedAppBuildUnitPlan;
    };
    const generationPlan = internals.buildGenerationPlan(app.appSpec);
    const staticContracts = internals.buildStaticContracts(
      app.appSpec,
      generationPlan,
    );
    const workspace = runner.buildWorkspaceContract({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec: app.appSpec,
      staticContracts,
    });
    const commandPlan = runner.buildCommandPlan({
      workspace,
      requirementIds: app.appSpec.coreRequirements.map(
        (requirement) => requirement.id,
      ),
      scenarioIds: app.appSpec.acceptanceScenarios.map(
        (scenario) => scenario.id,
      ),
    });
    const buildUnitPlan = internals.buildBuildUnitPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      workspace,
      commandPlan,
      'real-local-command-plan',
    );

    try {
      const result = await runner.materializeAndRun({
        tenantId: TENANT_ID,
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        appSpec: app.appSpec,
        generationPlan,
        staticContracts,
        buildUnitPlan,
        workspace,
        commandPlan,
      });

      const html = await readFile(
        join(workspaceRoot, workspace.relativePath, 'dist/index.html'),
        'utf8',
      );

      expect(result.status).toBe('passed');
      expect(html).toContain(
        '<h1 id="generated-app-title">自动化中医问诊系统</h1>',
      );
      expect(html).toContain('围绕需求生成的 AppSpec 初稿。');
      expect(html).toContain('提交内容会保存并提供给应用创建者查看');
      expect(html).toContain('自动化中医问诊系统问诊采集表');
      expect(html).toContain('id="generated-app-form"');
      expect(html).toContain('name="chiefComplaint"');
      expect(html).toContain('name="symptoms"');
      expect(html).toContain('id="report-questions"');
      expect(html).toContain('已生成问诊摘要');
      expect(html).toContain('核心需求');
      expect(html).toContain('<li>自动化中医问诊系统</li>');
      expect(html).toContain('验收场景');
      expect(html).toContain('系统生成 AppSpec 初稿');
      expect(html).not.toContain('<div id="root"></div>');
      expect(html).not.toContain(workspaceRoot);

      const runtimeFormSource = await readFile(
        join(
          workspaceRoot,
          workspace.relativePath,
          'src/generated-app/runtime-form.ts',
        ),
        'utf8',
      );
      const appSource = await readFile(
        join(workspaceRoot, workspace.relativePath, 'src/App.tsx'),
        'utf8',
      );
      const buildManifest = JSON.parse(
        await readFile(
          join(
            workspaceRoot,
            workspace.relativePath,
            'dist/assets/manifest.json',
          ),
          'utf8',
        ),
      ) as { runtimeFormFields: string[] };

      expect(runtimeFormSource).toContain('runtimeForm');
      expect(runtimeFormSource).toContain('chiefComplaint');
      expect(appSource).toContain('buildLocalReport');
      expect(appSource).toContain('runtimeForm.sections.map');
      expect(buildManifest.runtimeFormFields).toEqual(
        expect.arrayContaining(['chiefComplaint', 'symptoms', 'severity']),
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('Gate 3 real-local runner 应应用受控修复补丁并重新执行再验证命令', async () => {
    const app = createGeneratedApp();
    const workspaceRoot = join(
      tmpdir(),
      'agentloom-generated-app-gate3-repair-spec',
    );
    const configService = createConfigService({
      GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
    });
    const runner = new GeneratedAppGate3WorkspaceRunner(configService);
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        generationWorkspace: NonNullable<
          GeneratedAppBuildUnitPlan['generationWorkspace']
        >,
        commandPlan: ReturnType<
          GeneratedAppGate3WorkspaceRunner['buildCommandPlan']
        >,
        executionLevel: GeneratedAppBuildUnitPlan['executionLevel'],
      ): GeneratedAppBuildUnitPlan;
    };
    const generationPlan = internals.buildGenerationPlan(app.appSpec);
    const staticContracts = internals.buildStaticContracts(
      app.appSpec,
      generationPlan,
    );
    const workspace = runner.buildWorkspaceContract({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec: app.appSpec,
      staticContracts,
    });
    const commandPlan = runner.buildCommandPlan({
      workspace,
      requirementIds: app.appSpec.coreRequirements.map(
        (requirement) => requirement.id,
      ),
      scenarioIds: app.appSpec.acceptanceScenarios.map(
        (scenario) => scenario.id,
      ),
    });
    const buildUnitPlan = internals.buildBuildUnitPlan(
      app.appSpec,
      generationPlan,
      staticContracts,
      workspace,
      commandPlan,
      'real-local-command-plan',
    );

    try {
      const result = await runner.applyRepairPatchAndRun({
        tenantId: TENANT_ID,
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        appSpec: app.appSpec,
        generationPlan,
        staticContracts,
        buildUnitPlan,
        workspace,
        commandPlan,
        repairPlan: {
          planVersion: 1,
          source: 'automatic-failed-gate-work-order',
          targetGateId: 'gate-3',
          targetGateName: '构建与单元门禁',
          failureCode: 'gate-3-command-failed',
          failureSummary: 'Gate 3 命令失败。',
          repairInstructions: '应用受控 frontend workspace patch。',
          evidenceIds: ['gate-3-unit-test-command'],
          evidenceSummaries: ['exitCode=1'],
          allowedChangeScopes: ['frontend-workspace', 'test-contracts'],
          forbiddenChangeScopes: ['public-share-token'],
          patchTargets: ['generationWorkspace.files'],
          requiredTraceability: ['failed-evidence-citation'],
          generatedAt: NOW.toISOString(),
        },
        reverificationPlan: {
          planVersion: 1,
          targetGateId: 'gate-3',
          requiredGateIds: ['gate-3'],
          requiredCommandIds: [
            'gate-3-frontend-build-command',
            'gate-3-typecheck-command',
            'gate-3-unit-test-command',
            'gate-3-component-golden-test-entry',
          ],
          requiredEvidenceIds: ['gate-3-unit-test-command'],
          successCriteria: ['gate-3 must pass'],
          blockedUntilPatchApplied: true,
          generatedAt: NOW.toISOString(),
        },
      });
      const repairTraceabilitySource = await readFile(
        join(
          workspaceRoot,
          workspace.relativePath,
          'src/generated-app/repair-traceability.ts',
        ),
        'utf8',
      );
      const repairPatchArtifact = JSON.parse(
        await readFile(
          join(
            workspaceRoot,
            workspace.relativePath,
            'artifacts/gate-3/repair-patch.json',
          ),
          'utf8',
        ),
      ) as { patchKind: string; requiredCommandIds: string[] };

      expect(result.status).toBe('passed');
      expect(result.patchApplied).toBe(true);
      expect(result.changeSummary).toContain('受控 frontend workspace patch');
      expect(result.verificationSummary).toContain('再验证通过');
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'gate-3-controlled-repair-patch',
            details: expect.objectContaining({
              patchApplied: true,
              artifactRefs: expect.arrayContaining([
                'src/generated-app/repair-traceability.ts',
                'artifacts/gate-3/repair-patch.json',
              ]),
            }),
          }),
        ]),
      );
      expect(repairTraceabilitySource).toContain('repairTraceability');
      expect(repairPatchArtifact.patchKind).toBe(
        'controlled-gate3-frontend-workspace-repair',
      );
      expect(repairPatchArtifact.requiredCommandIds).toEqual(
        expect.arrayContaining(['gate-3-unit-test-command']),
      );
      expect(JSON.stringify(result)).not.toContain(workspaceRoot);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('Gate 3 runner 失败摘要不应泄露宿主机 workspace 绝对路径', async () => {
    const app = createGeneratedApp();
    const appSpec: GeneratedApp['appSpec'] = {
      ...app.appSpec,
      acceptanceScenarios: app.appSpec.acceptanceScenarios.map(
        (scenario, index) =>
          index === 0
            ? {
                ...scenario,
                requirementIds: ['req-missing'],
              }
            : scenario,
      ),
    };
    const workspaceRoot = '/tmp/agentloom-generated-app-gate3-redaction-spec';
    const configService = createConfigService({
      GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
    });
    const runner = new GeneratedAppGate3WorkspaceRunner(configService);
    const internals = service as unknown as {
      buildGenerationPlan(
        appSpec: GeneratedApp['appSpec'],
      ): GeneratedAppGenerationPlan;
      buildStaticContracts(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
      ): GeneratedAppStaticContracts;
      buildBuildUnitPlan(
        appSpec: GeneratedApp['appSpec'],
        generationPlan: GeneratedAppGenerationPlan,
        staticContracts: GeneratedAppStaticContracts,
        generationWorkspace: NonNullable<
          GeneratedAppBuildUnitPlan['generationWorkspace']
        >,
        commandPlan: ReturnType<
          GeneratedAppGate3WorkspaceRunner['buildCommandPlan']
        >,
        executionLevel: GeneratedAppBuildUnitPlan['executionLevel'],
      ): GeneratedAppBuildUnitPlan;
    };
    const generationPlan = internals.buildGenerationPlan(appSpec);
    const staticContracts = internals.buildStaticContracts(
      appSpec,
      generationPlan,
    );
    const workspace = runner.buildWorkspaceContract({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec,
      staticContracts,
    });
    const commandPlan = runner.buildCommandPlan({
      workspace,
      requirementIds: appSpec.coreRequirements.map(
        (requirement) => requirement.id,
      ),
      scenarioIds: appSpec.acceptanceScenarios.map((scenario) => scenario.id),
    });
    const buildUnitPlan = internals.buildBuildUnitPlan(
      appSpec,
      generationPlan,
      staticContracts,
      workspace,
      commandPlan,
      'real-local-command-plan',
    );
    const result = await runner.materializeAndRun({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      workspace,
      commandPlan,
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(serialized).not.toContain(workspaceRoot);
    expect(serialized).not.toContain('/tmp/agentloom-generated-app');
    expect(serialized).toContain('[generated-app-workspace]');
    expect(result.commandResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandId: 'gate-3-unit-test-command',
          executed: true,
          exitCode: 1,
          stderrSummary: expect.not.stringContaining(workspaceRoot),
        }),
      ]),
    );
  });

  it('Gate 4 失败时应写入失败证据、保留 attempted integrationPlan 并以 Gate 4 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'f'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validPlanWithTool: GeneratedAppGenerationPlan = {
      ...validPlan,
      pluginTools: {
        ...validPlan.pluginTools,
        tools: [
          {
            toolId: 'tool-symptom-score',
            purpose: '对问诊输入做结构化评分。',
            requirementIds: ['req-1'],
            permissionNotes: ['禁止隐式网络、存储、知识库或 LLM 权限。'],
          },
        ],
        emptyReason: null,
      },
    };
    vi.spyOn(
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      },
      'buildGenerationPlan',
    ).mockReturnValue(validPlanWithTool);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlanWithTool);
    const validBuildUnitPlan = (
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      }
    ).buildBuildUnitPlan(app.appSpec, validPlanWithTool, validContracts);
    const validIntegrationPlan = (
      service as unknown as {
        buildIntegrationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
        ): GeneratedAppIntegrationPlan;
      }
    ).buildIntegrationPlan(
      app.appSpec,
      validPlanWithTool,
      validContracts,
      validBuildUnitPlan,
    );
    const firstFixture =
      validIntegrationPlan.agentWorkflowDryRunExpectations.fixtures[0];
    const malformedIntegrationPlan: GeneratedAppIntegrationPlan = {
      ...validIntegrationPlan,
      testTenant: {
        ...validIntegrationPlan.testTenant,
        usesRealTokens: true,
        publicShareToken: app.publicShareToken,
        apiKey: 'sk-test-secret',
        githubAccessToken: 'ghp_test-secret',
      } as unknown as GeneratedAppIntegrationPlan['testTenant'],
      publicRuntimeApiChecks: validIntegrationPlan.publicRuntimeApiChecks.map(
        (check, index) =>
          index === 0
            ? {
                ...check,
                kind: 'ghost_runtime_check' as GeneratedAppIntegrationPlan['publicRuntimeApiChecks'][number]['kind'],
                staticContractIds: ['gate-2-missing'],
                scenarioIds: ['scenario-1', 'scenario-missing'],
                payloadContractRefs: ['staticContracts.ghost'],
              }
            : check,
      ),
      creatorManagementApiChecks:
        validIntegrationPlan.creatorManagementApiChecks.map((check, index) =>
          index === 0
            ? {
                ...check,
                checkId: 'gate-4-creator-ghost-query',
              }
            : check,
        ),
      agentWorkflowDryRunExpectations: {
        ...validIntegrationPlan.agentWorkflowDryRunExpectations,
        orchestrationNodeIds: ['missing-node'],
        orchestrationEdgeRefs: ['missing-node->node-step-1-req-1'],
        fixtures: firstFixture
          ? [
              {
                ...firstFixture,
                scenarioId: 'scenario-missing',
                requirementIds: ['req-missing'],
                orchestrationNodeIds: ['missing-node'],
                traceArtifactIds: ['missing-trace'],
                inputMapping: {
                  ...firstFixture.inputMapping,
                  staticContractId: 'gate-2-missing',
                  requiredFields: [],
                },
                outputMapping: {
                  ...firstFixture.outputMapping,
                  destinations: [],
                },
              },
            ]
          : [],
      },
      pluginSandboxSmokeExpectations: {
        tools:
          validIntegrationPlan.pluginSandboxSmokeExpectations.tools.flatMap(
            (tool) => [
              {
                ...tool,
                smokeCheckId: 'gate-4-plugin-smoke-wrong',
                artifactId: 'frontend-build-output',
                expectedTraceArtifactId: 'public-runtime-api-trace',
                sandboxRuntime:
                  'node' as GeneratedAppIntegrationPlan['pluginSandboxSmokeExpectations']['tools'][number]['sandboxRuntime'],
              },
              {
                ...tool,
                toolId: 'tool-missing',
                smokeCheckId: 'gate-4-plugin-smoke-tool-missing',
                artifactId: 'missing-artifact',
                expectedTraceArtifactId: 'missing-trace',
                requirementIds: ['req-missing'],
                sandboxRuntime:
                  'node' as GeneratedAppIntegrationPlan['pluginSandboxSmokeExpectations']['tools'][number]['sandboxRuntime'],
              },
            ],
          ),
        emptyReason: '有插件计划时不应有 emptyReason。',
      },
      dependencyArtifacts: [
        ...validIntegrationPlan.dependencyArtifacts
          .filter((artifact) => artifact.artifactId !== 'coverage-report')
          .map((artifact) =>
            artifact.artifactId === 'frontend-build-output'
              ? {
                  ...artifact,
                  kind: 'plugin_bundle' as GeneratedAppIntegrationPlan['dependencyArtifacts'][number]['kind'],
                }
              : artifact,
          ),
        {
          artifactId: 'ghost-artifact',
          kind: 'ghost_artifact' as GeneratedAppIntegrationPlan['dependencyArtifacts'][number]['kind'],
          sourceGateId:
            'gate-2' as GeneratedAppIntegrationPlan['dependencyArtifacts'][number]['sourceGateId'],
          path: '',
          required: false,
        },
      ],
      acceptanceScenarioCoverage: [
        {
          scenarioId: 'scenario-missing',
          requirementIds: ['req-missing'],
          coveredByCheckIds: ['gate-4-missing-check'],
          fixtureIds: ['missing-fixture'],
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'req-missing',
          scenarioIds: ['scenario-missing'],
          coveredByCheckIds: ['gate-4-missing-check'],
          dependencyArtifactIds: ['missing-artifact'],
        },
      ],
      orchestrationCoverage: [
        {
          nodeId: 'missing-node',
          edgeRefs: ['missing-edge'],
          coveredByFixtureIds: ['missing-fixture'],
          coveredByCheckIds: ['gate-4-missing-check'],
        },
      ],
      traceArtifacts: [
        {
          artifactId: 'public-runtime-api-trace',
          kind: 'creator_management_api_trace',
          path: 'artifacts/gate-4/public-runtime-api-trace.json',
          producedByCheckIds: ['gate-4-missing-check'],
        },
        {
          artifactId: 'creator-management-api-trace',
          kind: 'ghost_trace' as GeneratedAppIntegrationPlan['traceArtifacts'][number]['kind'],
          path: '',
          producedByCheckIds: ['gate-4-missing-check'],
        },
      ],
      failureCaptureFields: ['checkId'],
    };
    vi.spyOn(
      service as unknown as {
        buildIntegrationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
        ): GeneratedAppIntegrationPlan;
      },
      'buildIntegrationPlan',
    ).mockReturnValue(malformedIntegrationPlan);
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
        'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      evidence: [],
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary:
        'Gate 4 失败：integrationPlan 未完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 或失败捕获字段；本结果仅表示契约级 integration skeleton 检查失败，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      failure: {
        code: 'integration-plan-incomplete',
        message:
          'IntegrationPlan 集成 skeleton 检查失败：public runtime API checks；本失败只来自 integration-skeleton 合约完整性检查，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      },
      repairInstructions:
        '修复 generationPlan.integrationPlan，使其覆盖测试租户/资源、public runtime API checks、creator management API checks、Agent/Workflow dry-run fixture、plugin sandbox smoke expectations、Gate 3 dependency artifacts、需求/场景/编排覆盖、trace artifacts 和 failure capture fields；当前 Gate 4 仍只检查 integration-skeleton 合约，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'IntegrationPlan 集成 skeleton 检查失败：public runtime API checks；本失败只来自 integration-skeleton 合约完整性检查，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
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

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate4RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-4',
        status: 'failed',
        summary: expect.stringContaining('不代表真实 API 调用'),
        failure: expect.objectContaining({
          code: 'integration-plan-incomplete',
          message: expect.stringContaining('不代表真实 API 调用'),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.integrationPlan',
        ),
      }),
    );
    const gate4RunPayload = insertGate4RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publicRuntimeApiChecks[0].kind 必须是 public_runtime_read',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publicRuntimeApiChecks[0].staticContractIds 引用了未知对象 gate-2-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publicRuntimeApiChecks[0].payloadContractRefs 引用了未知对象 staticContracts.ghost',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes('scenario-missing'),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes('tool-missing'),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'pluginSandboxSmokeExpectations.tools[0].smokeCheckId 必须为 gate-4-plugin-smoke-tool-symptom-score',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'pluginSandboxSmokeExpectations.tools[0].artifactId 必须引用 plugin-bundle-tool-symptom-score',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'pluginSandboxSmokeExpectations.tools[0].expectedTraceArtifactId 必须引用 plugin-smoke-trace-tool-symptom-score',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'dependencyArtifacts.artifactId 缺少 coverage-report',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes('dependencyArtifacts[4].kind 必须是'),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'dependencyArtifacts[0].kind 与 Gate 3 artifact frontend-build-output 不一致',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'traceArtifacts[0].kind 与 trace artifact public-runtime-api-trace 不一致',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes(
          'traceArtifacts[1].kind 必须是 public_runtime_api_trace',
        ),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.some((item) =>
        item.summary.includes('failureCaptureFields 缺少 requestId'),
      ),
    ).toBe(true);
    expect(
      gate4RunPayload.evidence.every((item) =>
        item.summary.includes('integration-skeleton 只做合约完整性检查'),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate4RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );
    expect(JSON.stringify(gate4RunPayload.failure)).not.toContain(
      'sk-test-secret',
    );
    expect(JSON.stringify(gate4RunPayload.failure)).not.toContain(
      'ghp_test-secret',
    );

    const appUpdatePayload = gate4UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.integrationPlan).toEqual(
      malformedIntegrationPlan,
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'browserAcceptancePlan',
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-4'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining('不代表真实 API 调用'),
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-5')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining('IntegrationPlan 集成 skeleton'),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain(
      'IntegrationPlan 集成 skeleton',
    );
    expect(response.gateRuns).toHaveLength(5);
    expect(response.gateRuns[4]).toEqual(
      expect.objectContaining({
        gateId: 'gate-4',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'integration-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.integrationPlan).toEqual(
      malformedIntegrationPlan,
    );
    expect(response.app.generationPlan).not.toHaveProperty(
      'browserAcceptancePlan',
    );
    expect(
      response.gateRuns.some((gateRun) => gateRun.gateId === 'gate-5'),
    ).toBe(false);
  });

  it('Gate 4 runner check 失败时应停止 Gate 5-7 并保留 trace evidence', async () => {
    const failedTrace: GeneratedAppGate4RunnerResult['traceResults'][number] = {
      checkId: 'gate-4-public-runtime-read',
      requestId: 'gate4-gate-4-public-runtime-read-1',
      method: 'GET',
      pathTemplate: '/generated-apps/public/{token}',
      responseStatus: 500,
      responseBodySummary: '{"error":"contract mismatch"}',
      durationMs: 1,
      executed: true,
      traceArtifactRefs: ['public-runtime-api-trace'],
      requirementIds: ['req-1'],
      scenarioIds: ['scenario-1'],
      staticContractIds: ['gate-2-public-runtime-contract'],
      passed: false,
      boundary: 'public-runtime-api',
    };
    const runnerResult = createGate4RunnerResult({
      status: 'failed',
      executionLevel: 'real-local-integration',
      summary:
        'Gate 4 失败：受控本地 integration contract execution 中至少一个 API/trace check 未通过，已停止 Gate 5-7。',
      evidence: [
        {
          id: 'gate-4-public-runtime-read',
          label: 'Gate 4 public runtime read',
          kind: 'test',
          url: null,
          summary:
            'GET /generated-apps/public/{token} status=500；mode=real_local_integration；executed=true；traceArtifacts=public-runtime-api-trace；requirements=req-1；scenarios=scenario-1；staticContracts=gate-2-public-runtime-contract',
          details: {
            runnerId: 'gate-4-real-integration-runner',
            executionMode: 'real_local_integration',
            executionLevel: 'real-local-integration',
            requestId: failedTrace.requestId,
            method: failedTrace.method,
            pathTemplate: failedTrace.pathTemplate,
            responseStatus: failedTrace.responseStatus,
            responseBodySummary: failedTrace.responseBodySummary,
            durationMs: failedTrace.durationMs,
            executed: true,
            traceArtifactRefs: failedTrace.traceArtifactRefs,
            requirementIds: failedTrace.requirementIds,
            scenarioIds: failedTrace.scenarioIds,
            staticContractIds: failedTrace.staticContractIds,
            productionSandboxExecuted: false,
            extismExecuted: false,
          },
        },
      ],
      failure: {
        code: 'gate-4-integration-check-failed',
        message:
          'Gate 4 受控本地 integration check 失败，不能继续执行 Gate 5-7。',
        details: {
          failedCheckIds: ['gate-4-public-runtime-read'],
          traceResults: [failedTrace],
        },
      },
      repairInstructions:
        '读取 Gate 4 trace evidence 中的 requestId、pathTemplate、responseStatus、responseBodySummary 和 coverage refs，修复 public/creator API contract、staticContracts 或 local trace fixture 后重新运行 Gate 4。',
      traceResults: [failedTrace],
    });

    const {
      app,
      gate4Runner,
      gate4UpdatePayload,
      insertGate4RunChain,
      response,
      updateRunChain,
    } = await startGenerationRunWithGate4Result(runnerResult);

    expect(gate4Runner.run).toHaveBeenCalledOnce();
    expect(insertGate4RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-4',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'gate-4-integration-check-failed',
          message: expect.stringContaining('不能继续执行 Gate 5-7'),
        }),
        repairInstructions: expect.stringContaining(
          '读取 Gate 4 trace evidence',
        ),
      }),
    );
    const gate4RunPayload = insertGate4RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { failedCheckIds?: string[] } };
    };
    expect(gate4RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-public-runtime-read',
          details: expect.objectContaining({
            runnerId: 'gate-4-real-integration-runner',
            executed: true,
            responseStatus: 500,
            traceArtifactRefs: ['public-runtime-api-trace'],
          }),
        }),
      ]),
    );
    expect(gate4RunPayload.failure.details?.failedCheckIds).toEqual([
      'gate-4-public-runtime-read',
    ]);
    expect(JSON.stringify(gate4RunPayload.evidence)).not.toContain(
      app.publicShareToken,
    );

    const appUpdatePayload = gate4UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.integrationPlan).toEqual(
      expect.objectContaining({
        executionLevel: 'real-local-integration',
      }),
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'browserAcceptancePlan',
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-4'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        evidence: expect.arrayContaining([
          expect.objectContaining({ id: 'gate-4-public-runtime-read' }),
        ]),
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-5')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(response.gateRuns.map((gateRun) => gateRun.gateId)).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
      'gate-4',
    ]);
    expect(
      response.gateRuns.some((gateRun) => gateRun.gateId === 'gate-5'),
    ).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'Gate 4 受控本地 integration check 失败',
        ),
      }),
    );
  });

  it('Gate 4 disabled executor 不应被误判为真实集成通过', async () => {
    const runnerResult = createGate4RunnerResult({
      status: 'failed',
      executionLevel: 'disabled-integration',
      summary:
        'Gate 4 失败：集成执行器被配置为 disabled，未执行 public/creator API contract、Agent/Workflow dry-run 或插件 smoke，本次运行停止 Gate 5-7。',
      evidence: [
        {
          id: 'gate-4-executor-disabled',
          label: 'Gate 4 执行器禁用状态',
          kind: 'test',
          url: null,
          summary:
            'Gate 4 executor mode=disabled；该状态不能被当作真实集成执行通过。',
          details: {
            runnerId: 'gate-4-disabled-integration-runner',
            executionMode: 'disabled',
            executionLevel: 'disabled-integration',
            executed: false,
          },
        },
      ],
      failure: {
        code: 'gate-4-executor-disabled',
        message: 'Gate 4 集成执行器被禁用，不能继续执行 Gate 5-7。',
        details: {
          runnerId: 'gate-4-disabled-integration-runner',
          executionMode: 'disabled',
          executionLevel: 'disabled-integration',
        },
      },
      repairInstructions:
        '启用 GENERATED_APP_GATE4_EXECUTOR_MODE=real，或在明确标注 fixture 的测试环境中重新运行；disabled 状态不得进入后续门禁。',
      traceResults: [],
    });

    const { gate4UpdatePayload, insertGate4RunChain, response } =
      await startGenerationRunWithGate4Result(runnerResult);

    expect(insertGate4RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-4',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'gate-4-executor-disabled',
        }),
      }),
    );
    const gate4RunPayload = insertGate4RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate4RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-executor-disabled',
          details: expect.objectContaining({
            executionLevel: 'disabled-integration',
            executed: false,
          }),
        }),
      ]),
    );
    const appUpdatePayload = gate4UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.integrationPlan).toEqual(
      expect.objectContaining({
        executionLevel: 'disabled-integration',
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-5')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(response.gateRuns.map((gateRun) => gateRun.gateId)).toEqual([
      'gate-0',
      'gate-1',
      'gate-2',
      'gate-3',
      'gate-4',
    ]);
  });

  it('Gate 5 失败时应写入失败证据、保留 attempted browserAcceptancePlan 并以 Gate 5 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'f'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlan);
    const validBuildUnitPlan = (
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      }
    ).buildBuildUnitPlan(app.appSpec, validPlan, validContracts);
    const validIntegrationPlan = (
      service as unknown as {
        buildIntegrationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
        ): GeneratedAppIntegrationPlan;
      }
    ).buildIntegrationPlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
    );
    const validBrowserAcceptancePlan = (
      service as unknown as {
        buildBrowserAcceptancePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
        ): GeneratedAppBrowserAcceptancePlan;
      }
    ).buildBrowserAcceptancePlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
    );
    const malformedBrowserAcceptancePlan: GeneratedAppBrowserAcceptancePlan = {
      ...validBrowserAcceptancePlan,
      browserToolPlan: {
        ...validBrowserAcceptancePlan.browserToolPlan,
        baseUrlShape: app.publicShareToken ?? 'f'.repeat(64),
        publicShareAccessPlaceholder: app.publicShareToken ?? 'f'.repeat(64),
        usesRealTokens: true,
        scenarioIds: ['scenario-1', 'scenario-missing'],
      } as unknown as GeneratedAppBrowserAcceptancePlan['browserToolPlan'],
      viewportMatrix: [
        {
          ...validBrowserAcceptancePlan.viewportMatrix[0],
          scenarioIds: ['scenario-missing'],
          requirementIds: ['req-missing'],
        },
      ],
      publicRuntimeJourneys:
        validBrowserAcceptancePlan.publicRuntimeJourneys.map(
          (journey, index) =>
            index === 0
              ? {
                  ...journey,
                  kind: 'public_runtime_hack' as GeneratedAppBrowserAcceptancePlan['publicRuntimeJourneys'][number]['kind'],
                  publicRuntimeApiCheckIds: ['gate-4-public-missing'],
                  staticContractIds: ['gate-2-missing'],
                  scenarioIds: ['scenario-missing'],
                }
              : journey,
        ),
      creatorManagementJourneys:
        validBrowserAcceptancePlan.creatorManagementJourneys.map(
          (journey, index) =>
            index === 0
              ? {
                  ...journey,
                  journeyId: 'gate-5-creator-ghost-review',
                  creatorManagementApiCheckIds: [
                    'gate-4-creator-missing-query',
                  ],
                }
              : journey,
        ),
      consoleAssertions: [
        {
          assertionId: 'gate-5-console-allowed-warning-policy',
          kind: 'allowed_warning_policy',
          journeyIds: ['gate-5-public-runtime-open'],
          viewportIds: ['viewport-desktop'],
          allowedWarnings: [],
          emptyAllowedWarningsReason: null,
        },
      ],
      networkAssertions: [
        {
          ...validBrowserAcceptancePlan.networkAssertions[0],
          apiCheckIds: ['gate-4-missing-check'],
          staticContractIds: ['gate-2-missing'],
          expectedStatusRange:
            '3xx' as GeneratedAppBrowserAcceptancePlan['networkAssertions'][number]['expectedStatusRange'],
        },
        {
          ...validBrowserAcceptancePlan.networkAssertions[1],
          journeyIds: [
            'gate-5-public-runtime-open',
            'gate-5-creator-gate-run-review',
          ],
          apiCheckIds: [
            'gate-4-public-runtime-read',
            'gate-4-creator-gate-run-query',
          ],
          forbiddenEndpointPatterns: [],
        },
        {
          ...validBrowserAcceptancePlan.networkAssertions[2],
          forbiddenEndpointPatterns: ['authorization'],
        },
      ],
      accessibilityInteractionAssertions: [
        {
          ...validBrowserAcceptancePlan.accessibilityInteractionAssertions[0],
          assertionId: 'gate-5-accessibility-ghost',
          journeyIds: ['gate-5-journey-missing'],
          viewportIds: ['viewport-missing'],
        },
      ],
      responsiveLayoutAssertions: [],
      artifactExpectations: [
        {
          artifactId: 'desktop-screenshot',
          kind: 'ghost_artifact' as GeneratedAppBrowserAcceptancePlan['artifactExpectations'][number]['kind'],
          path: '',
          required: false,
          producedByJourneyIds: ['gate-5-journey-missing'],
          producedByAssertionIds: ['gate-5-assertion-missing'],
          referencesGate4TraceArtifactIds: ['gate-4-trace-missing'],
        },
      ],
      acceptanceScenarioCoverage: [
        {
          scenarioId: 'scenario-missing',
          requirementIds: ['req-missing'],
          journeyIds: ['gate-5-journey-missing'],
          viewportIds: ['viewport-missing'],
          assertionIds: ['gate-5-assertion-missing'],
          artifactIds: ['artifact-missing'],
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'req-missing',
          scenarioIds: ['scenario-missing'],
          journeyIds: ['gate-5-journey-missing'],
          assertionIds: ['gate-5-assertion-missing'],
          artifactIds: ['artifact-missing'],
          staticContractIds: ['gate-2-missing'],
          gate4ApiCheckIds: ['gate-4-missing-check'],
        },
      ],
      journeyCoverage: [
        {
          journeyId: 'gate-5-journey-missing',
          kind: 'illegal_journey_kind',
          scenarioIds: ['scenario-missing'],
          requirementIds: ['req-missing'],
          viewportIds: ['viewport-missing'],
          assertionIds: ['gate-5-assertion-missing'],
          artifactIds: ['artifact-missing'],
        },
      ],
      failureCaptureFields: ['journeyId'],
    };
    vi.spyOn(
      service as unknown as {
        buildBrowserAcceptancePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
        ): GeneratedAppBrowserAcceptancePlan;
      },
      'buildBrowserAcceptancePlan',
    ).mockReturnValue(malformedBrowserAcceptancePlan);
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
        'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      evidence: [],
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 4 通过：integrationPlan 集成 skeleton 已完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 和失败捕获字段；本结果仅表示契约级 integration skeleton 完整，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      evidence: [],
    });
    const gate5Run = createGeneratedAppGateRun({
      id: GATE_5_RUN_ID,
      gateId: 'gate-5',
      gateOrder: 5,
      gateName: '浏览器验收门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary:
        'Gate 5 失败：browserAcceptancePlan 未完整覆盖浏览器 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、截图/视频/trace artifacts、覆盖矩阵或失败捕获字段；本结果仅表示契约级 browser acceptance skeleton 检查失败，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      failure: {
        code: 'browser-acceptance-plan-incomplete',
        message:
          'BrowserAcceptancePlan 浏览器验收 skeleton 检查失败：浏览器 runner 计划；本失败只来自 browser-acceptance-skeleton 合约完整性检查，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      },
      repairInstructions:
        '修复 generationPlan.browserAcceptancePlan，使其覆盖 Playwright 或等价浏览器 runner、desktop/mobile viewport matrix、公开 runtime 与创建者管理 journeys、console/network/accessibility/responsive assertions、引用 Gate 4 trace artifacts 的截图/视频/trace 产物期望、需求/场景/旅程覆盖和 failure capture fields；当前 Gate 5 仍只检查 browser-acceptance-skeleton 合约，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'BrowserAcceptancePlan 浏览器验收 skeleton 检查失败：浏览器 runner 计划；本失败只来自 browser-acceptance-skeleton 合约完整性检查，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const insertGate4RunChain = createInsertReturningChain([gate4Run]);
    const insertGate5RunChain = createInsertReturningChain([gate5Run]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate4Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate5UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate5Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate5UpdatePayload = payload;
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
      .mockReturnValueOnce(insertGate4RunChain)
      .mockReturnValueOnce(insertGate5RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateAppAfterGate5Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate5RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-5',
        status: 'failed',
        summary: expect.stringContaining('计划不完整时不会执行 Gate 5 runner'),
        failure: expect.objectContaining({
          code: 'browser-acceptance-plan-incomplete',
          message: expect.stringContaining('Gate 5 runner 不会在计划不完整'),
        }),
        repairInstructions: expect.stringContaining(
          'generated-run relative artifact refs',
        ),
      }),
    );
    const gate5RunPayload = insertGate5RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('browserToolPlan.usesRealTokens 必须为 false'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('browserToolPlan.scenarioIds 引用了未知对象'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('viewportMatrix.viewportId 缺少 viewport-mobile'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('publicRuntimeJourneys[0].kind 必须是'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publicRuntimeJourneys[0].publicRuntimeApiCheckIds 引用了未知对象 gate-4-public-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'creatorManagementJourneys[0].journeyId 引用了未知 journey gate-5-creator-ghost-review',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('emptyAllowedWarningsReason 缺失'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('expectedStatusRange 必须为 2xx'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'journeyIds 只能引用公开 runtime journey，收到 gate-5-creator-gate-run-review',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'apiCheckIds 只能引用 Gate 4 public runtime API check，收到 gate-4-creator-gate-run-query',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'forbiddenEndpointPatterns 缺少 /generated-apps/{appId}',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'forbiddenEndpointPatterns 缺少 public_share_token',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('responsiveLayoutAssertions 不能为空'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactExpectations.artifactId 缺少 mobile-screenshot',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('artifactExpectations[0].kind 必须是'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'referencesGate4TraceArtifactIds 引用了未知对象 gate-4-trace-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes(
          'journeyCoverage[0].kind 是非法 journey kind illegal_journey_kind',
        ),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.some((item) =>
        item.summary.includes('failureCaptureFields 缺少 viewportId'),
      ),
    ).toBe(true);
    expect(
      gate5RunPayload.evidence.every((item) =>
        item.summary.includes(
          '未执行真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互',
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate5RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );

    const appUpdatePayload = gate5UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.browserAcceptancePlan).toEqual(
      malformedBrowserAcceptancePlan,
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'independentVerificationPlan',
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-5'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining('Gate 5 失败：browserAcceptancePlan'),
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-6')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'BrowserAcceptancePlan 浏览器验收 skeleton',
        ),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain(
      'BrowserAcceptancePlan 浏览器验收 skeleton',
    );
    expect(response.gateRuns).toHaveLength(6);
    expect(response.gateRuns[5]).toEqual(
      expect.objectContaining({
        gateId: 'gate-5',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'browser-acceptance-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.browserAcceptancePlan).toEqual(
      malformedBrowserAcceptancePlan,
    );
  });

  it('Gate 6 失败时应写入失败证据、保留 attempted independentVerificationPlan 并以 Gate 6 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'a'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlan);
    const validBuildUnitPlan = (
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      }
    ).buildBuildUnitPlan(app.appSpec, validPlan, validContracts);
    const validIntegrationPlan = (
      service as unknown as {
        buildIntegrationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
        ): GeneratedAppIntegrationPlan;
      }
    ).buildIntegrationPlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
    );
    const validBrowserAcceptancePlan = (
      service as unknown as {
        buildBrowserAcceptancePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
        ): GeneratedAppBrowserAcceptancePlan;
      }
    ).buildBrowserAcceptancePlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
    );
    const syntheticGateResults = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) => ({
      ...gate,
      status: 'passed' as const,
      evidence: [
        {
          id: `${gate.gateId}-synthetic-evidence`,
          label: `${gate.name} synthetic evidence`,
          kind: 'verifier' as const,
          url: null,
          summary: '仅用于构造 malformed Gate 6 plan 的测试 evidence。',
        },
      ],
    }));
    const validIndependentVerificationPlan = (
      service as unknown as {
        buildIndependentVerificationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
          browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
          gateResults: GeneratedApp['gateResults'],
        ): GeneratedAppIndependentVerificationPlan;
      }
    ).buildIndependentVerificationPlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
      validBrowserAcceptancePlan,
      syntheticGateResults,
    );
    const malformedIndependentVerificationPlan = {
      ...validIndependentVerificationPlan,
      verifierIsolationPolicy: {
        ...validIndependentVerificationPlan.verifierIsolationPolicy,
        reuseGenerationContext: true,
        acceptsGeneratorSelfAttestation: true,
        readsPublicShareToken: true,
        readsRealSecrets: true,
        requiredControls: ['fresh-reviewer-identity'],
      },
      evidenceBundle: {
        ...validIndependentVerificationPlan.evidenceBundle,
        redactionLevel: 'unredacted',
        referencedGateIds: ['gate-0', 'gate-missing'],
        gateEvidenceRefs: [
          {
            gateId: 'gate-5',
            evidenceIds: [
              'gate-4-public-runtime-api-checks',
              'gate-6-missing-evidence',
            ],
          },
        ],
        staticContractIds: ['gate-2-missing'],
        buildUnitArtifactIds: [],
        integrationTraceArtifactIds: ['gate-4-trace-missing'],
        browserArtifactIds: ['artifact-missing'],
        coverageMatrixRefs: [
          {
            matrixId: 'illegalMatrix',
            sourcePlan: 'rawGenerationTranscript',
            requirementIds: ['req-missing'],
            scenarioIds: [],
            gateIds: ['gate-missing', 'Bearer real-secret-token'],
          },
        ],
        forbiddenSensitiveFields: ['authorization'],
        rawPublicShareToken: app.publicShareToken,
      },
      rubric: [
        {
          category: 'illegal_category',
          label: '非法 rubric',
          requirementIds: ['req-missing'],
          scenarioIds: [],
          evidenceIds: ['gate-6-missing-evidence'],
          blocking: true,
        },
      ],
      verdictSchema: {
        requiredFields: ['decision', 'illegalField'],
        findingSeverities: ['critical'],
        decisionValues: ['maybe'],
        requiresEvidenceIds: false,
        requiresRepairSuggestions: false,
        residualRiskSummaryRequired: false,
      },
      independenceChecks: [
        {
          checkId: 'gate-6-broken-self-review',
          kind: 'same_context_self_review',
          required: false,
          gateIds: ['gate-missing'],
          evidenceIds: [],
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'req-missing',
          scenarioIds: ['scenario-missing'],
          rubricCategories: ['illegal_category'],
          evidenceIds: ['gate-6-missing-evidence'],
          gateIds: ['gate-missing'],
          staticContractIds: ['gate-2-missing'],
          browserArtifactIds: ['artifact-missing'],
        },
      ],
      scenarioCoverage: [],
      evidenceCoverage: [
        {
          evidenceId: 'gate-6-missing-evidence',
          gateId: 'gate-missing',
          usedByRubricCategories: ['illegal_category'],
          requirementIds: [],
          scenarioIds: ['scenario-missing'],
        },
      ],
      gateCoverage: [
        {
          gateId: 'gate-5',
          evidenceIds: ['gate-6-missing-evidence'],
          required: false,
          coveredByRubricCategories: ['illegal_category'],
        },
      ],
      failureCaptureFields: ['verifierRunId'],
    } as unknown as GeneratedAppIndependentVerificationPlan;
    vi.spyOn(
      service as unknown as {
        buildIndependentVerificationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
          browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
          gateResults: GeneratedApp['gateResults'],
        ): GeneratedAppIndependentVerificationPlan;
      },
      'buildIndependentVerificationPlan',
    ).mockReturnValue(malformedIndependentVerificationPlan);
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
        'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      evidence: [],
    });
    const gate4Run = createGeneratedAppGateRun({
      id: GATE_4_RUN_ID,
      gateId: 'gate-4',
      gateOrder: 4,
      gateName: '集成门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 4 通过：integrationPlan 集成 skeleton 已完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 和失败捕获字段；本结果仅表示契约级 integration skeleton 完整，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      evidence: [],
    });
    const gate5Run = createGeneratedAppGateRun({
      id: GATE_5_RUN_ID,
      gateId: 'gate-5',
      gateOrder: 5,
      gateName: '浏览器验收门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'passed',
      summary:
        'Gate 5 通过：browserAcceptancePlan 浏览器验收 skeleton 已完整覆盖浏览器 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、截图/视频/trace artifact 期望、覆盖矩阵和失败捕获字段；本结果仅表示契约级 browser acceptance skeleton 完整，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      evidence: [],
    });
    const gate6Run = createGeneratedAppGateRun({
      id: GATE_6_RUN_ID,
      gateId: 'gate-6',
      gateOrder: 6,
      gateName: '独立审查门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary:
        'Gate 6 失败：independentVerificationPlan 未完整覆盖 verifier 隔离策略、redacted evidence bundle、审查 rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖或失败捕获字段；本结果仅表示契约级 independent verifier skeleton 检查失败，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      failure: {
        code: 'independent-verifier-plan-incomplete',
        message:
          'IndependentVerificationPlan 独立审查 skeleton 检查失败：redacted evidence bundle；本失败只来自 independent-verifier-skeleton 合约完整性检查，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      },
      repairInstructions:
        '修复 generationPlan.independentVerificationPlan，使其覆盖 AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan 版本绑定、verifier 隔离策略、只含 redacted evidence 的 bundle、Gate 0-5 evidence ids、rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖和 failure capture fields；当前 Gate 6 仍只检查 independent-verifier-skeleton 合约，不代表真实独立模型/代理/人工审查或真实需求满足判定已经执行。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'IndependentVerificationPlan 独立审查 skeleton 检查失败：redacted evidence bundle；本失败只来自 independent-verifier-skeleton 合约完整性检查，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    const insertGate3RunChain = createInsertReturningChain([gate3Run]);
    const insertGate4RunChain = createInsertReturningChain([gate4Run]);
    const insertGate5RunChain = createInsertReturningChain([gate5Run]);
    const insertGate6RunChain = createInsertReturningChain([gate6Run]);
    const updateAppAfterGate0Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate1Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate2Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate3Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate4Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    const updateAppAfterGate5Chain =
      createGeneratedAppUpdateReturningFromPayload(app);
    let gate6UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppAfterGate6Chain =
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate6UpdatePayload = payload;
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
      .mockReturnValueOnce(insertGate4RunChain)
      .mockReturnValueOnce(insertGate5RunChain)
      .mockReturnValueOnce(insertGate6RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateAppAfterGate5Chain)
      .mockReturnValueOnce(updateAppAfterGate6Chain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGate6RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-6',
        status: 'failed',
        summary: expect.stringContaining('不代表真实独立模型审查'),
        failure: expect.objectContaining({
          code: 'independent-verifier-plan-incomplete',
          message: expect.stringContaining('independent-verifier-skeleton'),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.independentVerificationPlan',
        ),
      }),
    );
    const gate6RunPayload = insertGate6RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'independentVerificationPlan.evidenceBundle.rawPublicShareToken 不能包含真实 token/secret 字段',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'verifierIsolationPolicy.reuseGenerationContext 必须为 false',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'evidenceBundle.referencedGateIds 引用了未知对象 gate-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes('evidenceBundle.buildUnitArtifactIds 不能为空'),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'evidenceBundle.integrationTraceArtifactIds 引用了未知对象 gate-4-trace-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'coverageMatrixRefs[0].matrixId 是非法 coverage matrix illegalMatrix',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'evidenceBundle.coverageMatrixRefs.matrixId 缺少 requirementCoverage',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'rubric[0].category 是非法 rubric category illegal_category',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'verdictSchema.requiredFields 包含非法字段 illegalField',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'verdictSchema.findingSeverities 包含非法 severity critical',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes('scenarioCoverage 不能为空'),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes(
          'evidenceCoverage[0].evidenceId 引用了未知 evidence gate-6-missing-evidence',
        ),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes('gateCoverage[0].required 必须为 true'),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.some((item) =>
        item.summary.includes('failureCaptureFields 缺少 verifierIdentity'),
      ),
    ).toBe(true);
    expect(
      gate6RunPayload.evidence.every((item) =>
        item.summary.includes(
          '未执行真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定',
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate6RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );
    expect(JSON.stringify(gate6RunPayload.failure)).not.toContain(
      'real-secret-token',
    );
    expect(JSON.stringify(gate6RunPayload.evidence)).not.toContain(
      'real-secret-token',
    );
    expect(JSON.stringify(gate6RunPayload.failure)).toContain(
      '[REDACTED_SECRET]',
    );

    const appUpdatePayload = gate6UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.independentVerificationPlan).toEqual(
      malformedIndependentVerificationPlan,
    );
    expect(appUpdatePayload.generationPlan).not.toHaveProperty(
      'publishCandidatePlan',
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-6'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining(
          'Gate 6 失败：independentVerificationPlan',
        ),
      }),
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7')
        ?.status,
    ).toBe('pending');
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'IndependentVerificationPlan 独立审查 skeleton',
        ),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain(
      'IndependentVerificationPlan 独立审查 skeleton',
    );
    expect(response.gateRuns).toHaveLength(7);
    expect(response.gateRuns.some((gate) => gate.gateId === 'gate-7')).toBe(
      false,
    );
    expect(response.gateRuns[6]).toEqual(
      expect.objectContaining({
        gateId: 'gate-6',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'independent-verifier-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.independentVerificationPlan).toEqual(
      malformedIndependentVerificationPlan,
    );
  });

  it('Gate 7 malformed publishCandidatePlan 应写入失败证据、保留 attempted plan 并以 Gate 7 failure reason 结束', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: 'a'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const validPlan = (
      service as unknown as {
        buildGenerationPlan(
          appSpec: GeneratedApp['appSpec'],
        ): GeneratedAppGenerationPlan;
      }
    ).buildGenerationPlan(app.appSpec);
    const validContracts = (
      service as unknown as {
        buildStaticContracts(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
        ): GeneratedAppStaticContracts;
      }
    ).buildStaticContracts(app.appSpec, validPlan);
    const validBuildUnitPlan = (
      service as unknown as {
        buildBuildUnitPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
        ): GeneratedAppBuildUnitPlan;
      }
    ).buildBuildUnitPlan(app.appSpec, validPlan, validContracts);
    const validIntegrationPlan = (
      service as unknown as {
        buildIntegrationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
        ): GeneratedAppIntegrationPlan;
      }
    ).buildIntegrationPlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
    );
    const validBrowserAcceptancePlan = (
      service as unknown as {
        buildBrowserAcceptancePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
        ): GeneratedAppBrowserAcceptancePlan;
      }
    ).buildBrowserAcceptancePlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
    );
    const syntheticGateResults = createInitialGeneratedAppGateResults(
      NOW.toISOString(),
    ).map((gate) => ({
      ...gate,
      status:
        gate.gateId === 'gate-7' ? ('pending' as const) : ('passed' as const),
      evidence:
        gate.gateId === 'gate-7'
          ? []
          : [
              {
                id: `${gate.gateId}-synthetic-evidence`,
                label: `${gate.name} synthetic evidence`,
                kind: 'manual' as const,
                url: null,
                summary: '用于构造 malformed Gate 7 plan 的测试 evidence。',
              },
            ],
    }));
    const validIndependentVerificationPlan = (
      service as unknown as {
        buildIndependentVerificationPlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
          browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
          gateResults: GeneratedApp['gateResults'],
        ): GeneratedAppIndependentVerificationPlan;
      }
    ).buildIndependentVerificationPlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
      validBrowserAcceptancePlan,
      syntheticGateResults,
    );
    const validPublishCandidatePlan = (
      service as unknown as {
        buildPublishCandidatePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
          browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
          independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
          gateResults: GeneratedApp['gateResults'],
        ): GeneratedAppPublishCandidatePlan;
      }
    ).buildPublishCandidatePlan(
      app.appSpec,
      validPlan,
      validContracts,
      validBuildUnitPlan,
      validIntegrationPlan,
      validBrowserAcceptancePlan,
      validIndependentVerificationPlan,
      syntheticGateResults,
    );
    const malformedPublishCandidatePlan = {
      ...validPublishCandidatePlan,
      publishReadinessInputs: {
        ...validPublishCandidatePlan.publishReadinessInputs,
        requiredGateIds: ['gate-0', 'gate-missing'],
        upstreamEvidenceRefs: [
          {
            gateId: 'gate-6',
            evidenceIds: [
              'gate-5-browser-tool-plan',
              'gate-7-missing-evidence',
            ],
          },
        ],
        requiredNonSkeletonEvidenceClasses: [],
      },
      artifactReleaseManifest: [
        {
          ...validPublishCandidatePlan.artifactReleaseManifest[0],
          kind: 'deployable_binary',
          sourceGateId: 'gate-missing',
          path: '/root/AgentLoom/internal-config',
          placeholder: false,
          containsSecrets: true,
          checksum: {
            algorithm: 'sha256',
            value: 'sha256:real-materialized-checksum',
            placeholder: false,
            materialized: true,
          },
          archiveMaterialized: true,
          signature: {
            status: 'signed',
            signatureArtifactId: 'real-signature-artifact',
            reason: '真实签名不允许由 Gate 7 local contract runner 创建。',
          },
          signoffStatus: 'not-executed',
          evidenceIds: ['gate-7-missing-evidence'],
          publicShareToken: app.publicShareToken,
        },
      ],
      publicationBlockers: [
        {
          blockerId: 'broken-blocker',
          category: 'unknown_blocker',
          gateIds: ['gate-missing'],
          evidenceIds: ['Bearer real-secret-token'],
          artifactIds: ['artifact-missing'],
          message: '',
          blocking: false,
        },
      ],
      rollbackShareControls: {
        ...validPublishCandidatePlan.rollbackShareControls,
        publicShareEnabledWhileGuardFails: true,
        createdPublicShareToken: app.publicShareToken,
      },
      finalVerdict: {
        ...validPublishCandidatePlan.finalVerdict,
        publishCandidateAllowed: true,
        blockingReasons: ['仍存在未解决发布阻断。'],
        requiredRealGateRunnerIds: ['gate-unknown-real-runner'],
        evidenceIds: ['gate-7-missing-evidence'],
        illegalVerdictField: 'should-fail',
      },
      requirementCoverage: [
        {
          requirementId: 'req-missing',
          scenarioIds: [],
          gateIds: ['gate-missing'],
          evidenceIds: ['gate-7-missing-evidence'],
          artifactIds: ['artifact-missing'],
          blockerIds: ['blocker-missing'],
        },
      ],
      gateCoverage: [],
      artifactCoverage: [
        {
          artifactId: 'artifact-missing',
          kind: 'deployable_binary',
          sourceGateId: 'gate-missing',
          evidenceIds: [],
          requirementIds: [],
          scenarioIds: [],
          required: 'yes',
        },
      ],
      failureCaptureFields: ['publishCandidateGuardRunId'],
      rawBearer: 'Bearer real-secret-token',
    } as unknown as GeneratedAppPublishCandidatePlan;
    vi.spyOn(
      service as unknown as {
        buildPublishCandidatePlan(
          appSpec: GeneratedApp['appSpec'],
          generationPlan: GeneratedAppGenerationPlan,
          staticContracts: GeneratedAppStaticContracts,
          buildUnitPlan: GeneratedAppBuildUnitPlan,
          integrationPlan: GeneratedAppIntegrationPlan,
          browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
          independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
          gateResults: GeneratedApp['gateResults'],
        ): GeneratedAppPublishCandidatePlan;
      },
      'buildPublishCandidatePlan',
    ).mockReturnValue(malformedPublishCandidatePlan);
    const run = createGeneratedAppGenerationRun();
    const runnerGateRuns = [
      createGeneratedAppGateRun({
        gateId: 'gate-0',
        gateOrder: 0,
        gateName: '需求规格门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
      }),
      createGeneratedAppGateRun({
        id: GATE_1_RUN_ID,
        gateId: 'gate-1',
        gateOrder: 1,
        gateName: '架构计划门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
      }),
      createGeneratedAppGateRun({
        id: GATE_2_RUN_ID,
        gateId: 'gate-2',
        gateOrder: 2,
        gateName: '静态合约门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 2 通过：staticContracts 已覆盖公开运行输入输出、前端路由、Workflow/Agent 编排、插件权限、提交持久化、测试入口和需求 traceability。',
      }),
      createGeneratedAppGateRun({
        id: GATE_3_RUN_ID,
        gateId: 'gate-3',
        gateOrder: 3,
        gateName: '构建与单元门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      }),
      createGeneratedAppGateRun({
        id: GATE_4_RUN_ID,
        gateId: 'gate-4',
        gateOrder: 4,
        gateName: '集成门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 4 通过：integrationPlan 集成 skeleton 已完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 和失败捕获字段；本结果仅表示契约级 integration skeleton 完整，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      }),
      createGeneratedAppGateRun({
        id: GATE_5_RUN_ID,
        gateId: 'gate-5',
        gateOrder: 5,
        gateName: '浏览器验收门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 5 通过：browserAcceptancePlan 浏览器验收 skeleton 已完整覆盖浏览器 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、截图/视频/trace artifact 期望、覆盖矩阵和失败捕获字段；本结果仅表示契约级 browser acceptance skeleton 完整，不代表真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互已经执行。',
      }),
      createGeneratedAppGateRun({
        id: GATE_6_RUN_ID,
        gateId: 'gate-6',
        gateOrder: 6,
        gateName: '独立审查门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary:
          'Gate 6 通过：independentVerificationPlan 独立审查 skeleton 已完整覆盖 verifier 隔离策略、redacted evidence bundle、Gate 0-5 evidence ids、审查 rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖和失败捕获字段；本结果仅表示契约级 independent verifier skeleton 完整，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      }),
      createGeneratedAppGateRun({
        id: GATE_7_RUN_ID,
        gateId: 'gate-7',
        gateOrder: 7,
        gateName: '发布候选门禁',
        generationRunId: GENERATION_RUN_ID,
        status: 'failed',
        summary:
          'Gate 7 失败：publishCandidatePlan 未完整覆盖发布 readiness 输入、artifact release manifest、publication blockers、rollback/share controls、final verdict、覆盖矩阵或失败捕获字段；本结果仅表示 publish-candidate guard skeleton 检查失败，不代表真实发布候选已生成、真实 artifact 已签收、真实质量门禁全量通过或可以公开分享。',
        failure: {
          code: 'publish-candidate-plan-incomplete',
          message:
            'PublishCandidatePlan publish-candidate guard skeleton 检查失败：publish readiness 输入。',
        },
        repairInstructions:
          '修复 generationPlan.publishCandidatePlan，使其绑定 AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan/independentVerificationPlan 版本，覆盖 Gate 0-7 readiness 输入、Gate 0-6 evidence ids、真实非 skeleton 证据要求、artifact release manifest、publication blockers、public share 禁用控制、final verdict 和覆盖矩阵；当前 Gate 7 仍只检查 publish-candidate-guard-skeleton，不能启用公开分享。',
      }),
    ];
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'PublishCandidatePlan publish-candidate guard skeleton 检查失败：publish readiness 输入；本失败只来自 publish-candidate-guard-skeleton 合约完整性检查，不代表真实发布候选已生成、真实 artifact 已签收、真实质量门禁全量通过或可以公开分享。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChains = runnerGateRuns.map((gateRun) =>
      createInsertReturningChain([gateRun]),
    );
    let gate7UpdatePayload: Partial<GeneratedApp> = {};
    const updateAppChains = [
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app),
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        gate7UpdatePayload = payload;
      }),
    ];
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert.mockReturnValueOnce(insertRunChain);
    for (const chain of insertGateRunChains) {
      mockTenantDb.insert.mockReturnValueOnce(chain);
    }
    for (const chain of updateAppChains) {
      mockTenantDb.update.mockReturnValueOnce(chain);
    }
    mockTenantDb.update.mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    const insertGate7RunChain = insertGateRunChains[7];
    expect(insertGate7RunChain?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-7',
        status: 'failed',
        summary: expect.stringContaining('publishCandidatePlan 未完整覆盖'),
        failure: expect.objectContaining({
          code: 'publish-candidate-plan-incomplete',
          message: expect.stringContaining('publish-candidate-guard-skeleton'),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.publishCandidatePlan',
        ),
      }),
    );
    const gate7RunPayload = insertGate7RunChain?.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { checks?: Array<{ issues: string[] }> } };
    };
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publishReadinessInputs.requiredGateIds 引用了未知对象 gate-missing',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactReleaseManifest[0].kind 是非法 artifact kind deployable_binary',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactReleaseManifest[0].path 必须是 workspace 相对路径且不能是绝对路径',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactReleaseManifest[0].placeholder 必须为 true',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactReleaseManifest[0].archiveMaterialized 必须为 false',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'artifactReleaseManifest[0].signature.status 必须为 not-signed',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'publicationBlockers[0].category 是非法 blocker category unknown_blocker',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'finalVerdict 包含非法 verdict field illegalVerdictField',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes('finalVerdict.blockingReasons 通过时必须为空'),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes(
          'finalVerdict.requiredRealGateRunnerIds 引用了未知对象 gate-unknown-real-runner',
        ),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes('gateCoverage 不能为空'),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.some((item) =>
        item.summary.includes('failureCaptureFields 缺少 upstreamGateIds'),
      ),
    ).toBe(true);
    expect(
      gate7RunPayload.evidence.every((item) =>
        item.summary.includes(
          '不会创建生产发布、真实 artifact archive、真实签名或 public share token',
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(gate7RunPayload.failure)).not.toContain(
      app.publicShareToken,
    );
    expect(JSON.stringify(gate7RunPayload.failure)).not.toContain(
      'real-secret-token',
    );
    expect(JSON.stringify(gate7RunPayload.evidence)).not.toContain(
      'real-secret-token',
    );
    expect(JSON.stringify(gate7RunPayload.failure)).toContain(
      '[REDACTED_SECRET]',
    );

    const appUpdatePayload = gate7UpdatePayload as {
      generationPlan: GeneratedAppGenerationPlan;
      gateResults: GeneratedApp['gateResults'];
      status: GeneratedApp['status'];
      publicShareToken: string | null;
      publicShareEnabled: boolean;
    };
    expect(appUpdatePayload.generationPlan.publishCandidatePlan).toEqual(
      malformedPublishCandidatePlan,
    );
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7'),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining('Gate 7 失败：publishCandidatePlan'),
      }),
    );
    expect(appUpdatePayload.status).toBe('failed');
    expect(appUpdatePayload.publicShareToken).toBeNull();
    expect(appUpdatePayload.publicShareEnabled).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining(
          'PublishCandidatePlan publish-candidate guard skeleton',
        ),
      }),
    );
    expect(response.generationRun.status).toBe('failed');
    expect(response.generationRun.failureReason).toContain(
      'PublishCandidatePlan publish-candidate guard skeleton',
    );
    expect(response.gateRuns).toHaveLength(8);
    expect(response.gateRuns[7]).toEqual(
      expect.objectContaining({
        gateId: 'gate-7',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'publish-candidate-plan-incomplete',
        }),
      }),
    );
    expect(response.app.generationPlan?.publishCandidatePlan).toEqual(
      malformedPublishCandidatePlan,
    );
    expect(response.app.workflowDefinitionId).toBeNull();
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(
      1 + runnerGateRuns.length,
    );
  });

  it('Gate 0 失败时应写入失败证据、降级 readiness 并关闭公开链接', async () => {
    const invalidAppSpec = {
      ...createGeneratedApp().appSpec,
      acceptanceScenarios: [],
      traceability: [],
    } as GeneratedApp['appSpec'];
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      appSpec: invalidAppSpec,
      generationPlan: { stale: true },
      publicShareEnabled: true,
      publicShareToken: 'b'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const run = createGeneratedAppGenerationRun();
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-0',
      gateOrder: 0,
      gateName: '需求规格门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary:
        'Gate 0 失败：AppSpec 缺少可验证生成所需的结构化字段或需求覆盖证据。',
      failure: {
        code: 'app-spec-incomplete',
        message:
          'AppSpec 完整性检查失败：验收场景结构、需求到验收场景覆盖、需求证据 traceability。',
      },
      repairInstructions:
        '补齐 AppSpec 的核心需求、页面/流程、数据策略、acceptance scenarios 与 traceability 后重新启动门禁运行器。',
    });
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason:
        'AppSpec 完整性检查失败：验收场景结构、需求到验收场景覆盖、需求证据 traceability。',
      completedAt: NOW,
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const updateAppChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'failed',
        publicShareEnabled: false,
        publicShareToken: null,
      }),
    ]);
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(null));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppChain)
      .mockReturnValueOnce(updateRunChain);

    const response = await service.startGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        ...DEFAULT_START_GENERATION_RUN_DTO,
        maxRepairAttempts: 0,
      },
    );

    expect(insertGateRunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-0',
        status: 'failed',
        failure: expect.objectContaining({
          code: 'app-spec-incomplete',
        }),
        repairInstructions:
          '补齐 AppSpec 的核心需求、页面/流程、数据策略、acceptance scenarios 与 traceability 后重新启动门禁运行器。',
      }),
    );
    const gateRunPayload = insertGateRunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gateRunPayload.evidence.length).toBeGreaterThan(0);
    expect(
      gateRunPayload.evidence.some((item) =>
        item.summary.includes('acceptanceScenarios 不能为空'),
      ),
    ).toBe(true);
    expect(updateAppChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: expect.any(Date),
      }),
    );
    const appUpdatePayload = updateAppChain.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(
      Object.prototype.hasOwnProperty.call(appUpdatePayload, 'generationPlan'),
    ).toBe(false);
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: expect.stringContaining('AppSpec 完整性检查失败'),
      }),
    );
    expect(mockTenantDb.insert).toHaveBeenCalledTimes(2);
    expect(response.generationRun.status).toBe('failed');
    expect(response.app.generationPlan).toEqual({ stale: true });
    expect(response.app.workflowDefinitionId).toBeNull();
    expect(response.gateRuns).toHaveLength(1);
    expect(response.gateRuns[0]?.status).toBe('failed');
  });

  it('启动门禁运行器遇到不存在或跨租户应用时应沿用 not found 且不写入台账', async () => {
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([]));

    await expect(
      service.startGenerationRun(
        TENANT_ID,
        USER_ID,
        APP_ID,
        DEFAULT_START_GENERATION_RUN_DTO,
      ),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);

    expect(mockTenantDb.insert).not.toHaveBeenCalled();
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('创建和更新修复尝试台账时应绑定生成运行', async () => {
    const generationRun = createGeneratedAppGenerationRun();
    const repairAttempt = createGeneratedAppRepairAttempt();
    const completedAttempt = createGeneratedAppRepairAttempt({
      status: 'completed',
      changeSummary: '修复 TypeScript 类型错误。',
      verificationSummary: 'gate-2 重新运行通过。',
      repairPlan: {
        planVersion: 1,
        source: 'manual-repair-work-order',
        targetGateId: 'gate-2',
        targetGateName: '静态合约门禁',
        failureCode: 'static-contract-incomplete',
        failureSummary: '静态合约检查失败。',
        repairInstructions: '补齐 staticContracts。',
        evidenceIds: ['gate-2-static-contracts'],
        evidenceSummaries: ['staticContracts 缺失。'],
        allowedChangeScopes: ['static-contracts', 'test-contracts'],
        forbiddenChangeScopes: ['public-share-token'],
        patchTargets: ['generated_apps.generation_plan.staticContracts'],
        requiredTraceability: ['failed-evidence-citation'],
        generatedAt: NOW.toISOString(),
      },
      reverificationPlan: {
        planVersion: 1,
        targetGateId: 'gate-2',
        requiredGateIds: ['gate-2'],
        requiredCommandIds: [],
        requiredEvidenceIds: ['gate-2-static-contracts'],
        successCriteria: ['gate-2 重新运行通过。'],
        blockedUntilPatchApplied: true,
        generatedAt: NOW.toISOString(),
      },
      completedAt: NOW,
    });
    const insertChain = createInsertReturningChain([repairAttempt]);
    const updateChain = createUpdateReturningChain([completedAttempt]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([generationRun]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createRepairAttempt(
      TENANT_ID,
      USER_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        attemptNumber: 1,
        targetGateId: 'gate-2',
        status: 'running',
        failureSummary: '静态合约检查失败。',
        startedAt: NOW.toISOString(),
      },
    );
    const updated = await service.updateRepairAttempt(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      REPAIR_ATTEMPT_ID,
      {
        status: 'completed',
        changeSummary: '修复 TypeScript 类型错误。',
        verificationSummary: 'gate-2 重新运行通过。',
        repairPlan: {
          planVersion: 1,
          source: 'manual-repair-work-order',
          targetGateId: 'gate-2',
          targetGateName: '静态合约门禁',
          failureCode: 'static-contract-incomplete',
          failureSummary: '静态合约检查失败。',
          repairInstructions: '补齐 staticContracts。',
          evidenceIds: ['gate-2-static-contracts'],
          evidenceSummaries: ['staticContracts 缺失。'],
          allowedChangeScopes: ['static-contracts', 'test-contracts'],
          forbiddenChangeScopes: ['public-share-token'],
          patchTargets: ['generated_apps.generation_plan.staticContracts'],
          requiredTraceability: ['failed-evidence-citation'],
          generatedAt: NOW.toISOString(),
        },
        reverificationPlan: {
          planVersion: 1,
          targetGateId: 'gate-2',
          requiredGateIds: ['gate-2'],
          requiredCommandIds: [],
          requiredEvidenceIds: ['gate-2-static-contracts'],
          successCriteria: ['gate-2 重新运行通过。'],
          blockedUntilPatchApplied: true,
          generatedAt: NOW.toISOString(),
        },
        completedAt: NOW.toISOString(),
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        attemptNumber: 1,
        targetGateId: 'gate-2',
        status: 'running',
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        changeSummary: '修复 TypeScript 类型错误。',
        verificationSummary: 'gate-2 重新运行通过。',
        repairPlan: expect.objectContaining({
          targetGateId: 'gate-2',
          patchTargets: ['generated_apps.generation_plan.staticContracts'],
        }),
        reverificationPlan: expect.objectContaining({
          targetGateId: 'gate-2',
          requiredGateIds: ['gate-2'],
        }),
        completedAt: NOW,
      }),
    );
    expect(created.generationRunId).toBe(GENERATION_RUN_ID);
    expect(updated.status).toBe('completed');
    expect(updated.repairPlan).toEqual(completedAttempt.repairPlan);
    expect(updated.reverificationPlan).toEqual(
      completedAttempt.reverificationPlan,
    );
  });

  it('创建者可以分页筛选生成运行和修复尝试台账', async () => {
    const generationRun = createGeneratedAppGenerationRun();
    const repairAttempt = createGeneratedAppRepairAttempt({
      status: 'failed',
      targetGateId: 'gate-2',
    });
    const runListChain = createSelectPageChain([generationRun]);
    const runCountChain = createCountChain(1);
    const repairListChain = createSelectPageChain([repairAttempt]);
    const repairCountChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(runListChain)
      .mockReturnValueOnce(runCountChain)
      .mockReturnValueOnce(repairListChain)
      .mockReturnValueOnce(repairCountChain);

    const runs = await service.listGenerationRuns(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
      status: 'running',
    });
    const repairs = await service.listRepairAttempts(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        page: 1,
        pageSize: 20,
        status: 'failed',
        targetGateId: 'gate-2',
      },
    );

    expect(runListChain.where).toHaveBeenCalledTimes(1);
    expect(repairListChain.where).toHaveBeenCalledTimes(1);
    expect(runs.data).toEqual([
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        appId: APP_ID,
        status: 'running',
      }),
    ]);
    expect(repairs.data).toEqual([
      expect.objectContaining({
        id: REPAIR_ATTEMPT_ID,
        generationRunId: GENERATION_RUN_ID,
        targetGateId: 'gate-2',
      }),
    ]);
  });

  it('记录单次门禁运行时应写入证据并同步当前 gateResults/readiness', async () => {
    const app = createGeneratedApp();
    const gateRun = createGeneratedAppGateRun({
      generationRunId: GENERATION_RUN_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
    });
    const insertChain = createInsertReturningChain([gateRun]);
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        gateResults: app.gateResults.map((gate) =>
          gate.gateId === 'gate-1'
            ? {
                ...gate,
                status: 'passed',
                summary: gateRun.summary,
                evidence: gateRun.evidence,
                updatedAt: NOW.toISOString(),
              }
            : gate,
        ),
      }),
    ]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([createGeneratedAppGenerationRun()]),
      )
      .mockReturnValueOnce(
        createSelectChain([createGeneratedAppRepairAttempt()]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateRun(TENANT_ID, USER_ID, APP_ID, {
      gateId: 'gate-1',
      generationRunId: GENERATION_RUN_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
      attemptNumber: 1,
      status: 'passed',
      summary: gateRun.summary,
      evidence: gateRun.evidence,
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        repairAttemptId: REPAIR_ATTEMPT_ID,
        gateId: 'gate-1',
        gateOrder: 1,
        gateName: '架构计划门禁',
        blocking: true,
        attemptNumber: 1,
        status: 'passed',
        evidence: gateRun.evidence,
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'preview_ready',
        publicShareToken: null,
        publicShareEnabled: false,
        gateResults: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'gate-1',
            status: 'passed',
            evidence: gateRun.evidence,
          }),
        ]),
      }),
    );
    const updatePayload = updateChain.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(
      Object.prototype.hasOwnProperty.call(updatePayload, 'generationPlan'),
    ).toBe(false);
    expect(response.gateRun).toEqual(
      expect.objectContaining({
        id: GATE_RUN_ID,
        gateId: 'gate-1',
        status: 'passed',
      }),
    );
    expect(response.app.id).toBe(APP_ID);
  });

  it('记录失败门禁运行时应关闭已启用的公开链接并写入修复建议', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: '9'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      status: 'failed',
      summary: 'TypeScript 类型检查失败。',
      failure: {
        code: 'tsc-failed',
        message: '存在类型错误。',
      },
      repairInstructions: '修复类型错误后重新运行 gate-2。',
    });
    const insertChain = createInsertReturningChain([gateRun]);
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'failed',
        publicShareEnabled: false,
        publicShareToken: null,
        publicShareDisabledAt: NOW,
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateRun(TENANT_ID, USER_ID, APP_ID, {
      gateId: 'gate-2',
      attemptNumber: 2,
      status: 'failed',
      summary: 'TypeScript 类型检查失败。',
      evidence: [],
      failure: {
        code: 'tsc-failed',
        message: '存在类型错误。',
      },
      repairInstructions: '修复类型错误后重新运行 gate-2。',
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-2',
        attemptNumber: 2,
        status: 'failed',
        failure: {
          code: 'tsc-failed',
          message: '存在类型错误。',
        },
        repairInstructions: '修复类型错误后重新运行 gate-2。',
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: expect.any(Date),
      }),
    );
    expect(response.gateRun.failure).toEqual({
      code: 'tsc-failed',
      message: '存在类型错误。',
    });
    expect(response.gateRun.repairInstructions).toBe(
      '修复类型错误后重新运行 gate-2。',
    );
  });

  it('创建者可以分页筛选门禁运行证据记录', async () => {
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      status: 'failed',
      failure: {
        message: '类型检查失败。',
      },
    });
    const listChain = createSelectPageChain([gateRun]);
    const countChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(listChain)
      .mockReturnValueOnce(countChain);

    const response = await service.listGateRuns(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
      gateId: 'gate-2',
      status: 'failed',
    });

    expect(listChain.where).toHaveBeenCalledTimes(1);
    expect(countChain.where).toHaveBeenCalledTimes(1);
    expect(response.data).toEqual([
      expect.objectContaining({
        id: GATE_RUN_ID,
        tenantId: TENANT_ID,
        appId: APP_ID,
        gateId: 'gate-2',
        status: 'failed',
        failure: {
          message: '类型检查失败。',
        },
      }),
    ]);
    expect(response.meta).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
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
            status: 'completed',
            completedAt: NOW,
            result: { sourceArtifactUrl: 'https://internal/source.zip' },
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
            'Workflow execution 已完成。出于公开链接安全边界，仅展示步骤计数摘要，不展开节点输出或内部执行快照。',
          completedSteps: 2,
          failedSteps: 0,
          cancelledSteps: 0,
          totalSteps: 2,
          latestStepCompletedAt: NOW.toISOString(),
        },
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
});
