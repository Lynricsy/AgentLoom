import { ConfigService } from '@nestjs/config';
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
} from '../../../database/schema';
import {
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppSubmissionNotFoundException,
} from '../generated-app.exceptions';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppService } from '../generated-app.service';

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
const DEFAULT_START_GENERATION_RUN_DTO = {
  triggerSource: 'manual',
  maxRepairAttempts: 3,
  maxRuntimeSeconds: 1800,
} as const;

function createSelectChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
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

function createUpdateReturningChain<T>(result: T[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
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

describe('GeneratedAppService', () => {
  let service: GeneratedAppService;

  beforeEach(() => {
    vi.clearAllMocks();

    const configService = {
      get: vi.fn((key: string) =>
        key === 'APP_FRONTEND_URL' ? 'https://studio.example.test' : undefined,
      ),
    };

    service = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService as unknown as ConfigService,
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

  it('Gate 0/Gate 1/Gate 2/Gate 3/Gate 4/Gate 5/Gate 6 通过后应执行 Gate 7 guard、保留 publishCandidatePlan 且阻断公开分享', async () => {
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
      status: 'passed',
      summary:
        'Gate 6 通过：independentVerificationPlan 独立审查 skeleton 已完整覆盖 verifier 隔离策略、redacted evidence bundle、Gate 0-5 evidence ids、审查 rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖和失败捕获字段；本结果仅表示契约级 independent verifier skeleton 完整，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      evidence: [],
    });
    const gate7Run = createGeneratedAppGateRun({
      id: GATE_7_RUN_ID,
      gateId: 'gate-7',
      gateOrder: 7,
      gateName: '发布候选门禁',
      generationRunId: GENERATION_RUN_ID,
      status: 'failed',
      summary:
        'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留，但检测到 Gate 3-6 仍只有 skeleton/contract-level completeness evidence，缺少真实 build/test/integration/browser/verifier 证据，不能形成 publish candidate 或启用公开分享。',
      failure: {
        code: 'publish-candidate-guard-blocked',
        message:
          'Gate 7 publish-candidate guard skeleton 检测到 Gate 3-6 仍为 skeleton-only upstream evidence，不能形成 publish candidate。',
      },
      repairInstructions:
        '接入真实 Gate 3-6 执行 runner、真实 artifact 签收和真实独立 verifier verdict 后，再由 Gate 7 重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。',
      evidence: [],
    });
    const completedRun = createGeneratedAppGenerationRun({
      runNumber: 2,
      status: 'failed',
      maxRepairAttempts: 2,
      maxRuntimeSeconds: 600,
      completedAt: NOW,
      summary:
        '门禁运行器骨架完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 构建与单元 skeleton 完整性检查、Gate 4 integration skeleton 完整性检查、Gate 5 browser acceptance skeleton 完整性检查和 Gate 6 independent verifier skeleton 完整性检查；Gate 7 publish-candidate guard skeleton 检测到上游仍只有 skeleton/contract-level evidence，当前应用不能形成 publish candidate，保持不可发布。',
      failureReason:
        'Gate 7 publish-candidate guard skeleton 检测到 Gate 3-6 仍为 skeleton-only upstream evidence，不能形成 publish candidate。 阻断原因：Gate 3-6 当前只有 skeleton/contract-level completeness evidence。；缺少真实 build/test/integration/browser/verifier artifact 签收。；Gate 7 guard 失败期间 public share token 必须保持禁用并清空。',
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
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(1));
    mockTenantDb.insert
      .mockReturnValueOnce(insertRunChain)
      .mockReturnValueOnce(insertGateRunChain)
      .mockReturnValueOnce(insertGate1RunChain)
      .mockReturnValueOnce(insertGate2RunChain)
      .mockReturnValueOnce(insertGate3RunChain)
      .mockReturnValueOnce(insertGate4RunChain)
      .mockReturnValueOnce(insertGate5RunChain)
      .mockReturnValueOnce(insertGate6RunChain)
      .mockReturnValueOnce(insertGate7RunChain);
    mockTenantDb.update
      .mockReturnValueOnce(updateAppAfterGate0Chain)
      .mockReturnValueOnce(updateAppAfterGate1Chain)
      .mockReturnValueOnce(updateAppAfterGate2Chain)
      .mockReturnValueOnce(updateAppAfterGate3Chain)
      .mockReturnValueOnce(updateAppAfterGate4Chain)
      .mockReturnValueOnce(updateAppAfterGate5Chain)
      .mockReturnValueOnce(updateAppAfterGate6Chain)
      .mockReturnValueOnce(updateAppAfterGate7Chain)
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
        status: 'failed',
        summary: expect.stringContaining('Gate 7 失败：publishCandidatePlan'),
        failure: expect.objectContaining({
          code: 'publish-candidate-guard-blocked',
          message: expect.stringContaining('skeleton-only upstream evidence'),
        }),
        repairInstructions: expect.stringContaining('接入真实 Gate 3-6'),
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
          id: 'gate-3-frontend-build-command',
          kind: 'build',
          summary: expect.stringContaining(
            'contract-skeleton 完整性检查；未执行真实前端构建',
          ),
        }),
        expect.objectContaining({
          id: 'gate-3-unit-test-command',
          kind: 'test',
          summary: expect.stringContaining(
            '未执行真实前端构建、插件构建、单元测试、组件测试或 golden test',
          ),
        }),
        expect.objectContaining({
          id: 'gate-3-plugin-build-expectations',
          kind: 'build',
          summary: expect.stringContaining(
            '未执行真实前端构建、插件构建、单元测试、组件测试或 golden test',
          ),
        }),
      ]),
    );
    const gate4RunPayload = insertGate4RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate4RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-public-runtime-api-checks',
          kind: 'test',
          summary: expect.stringContaining(
            '未执行真实 API 调用、真实 Agent/Workflow dry-run',
          ),
        }),
        expect.objectContaining({
          id: 'gate-4-agent-workflow-dry-run-fixtures',
          kind: 'test',
          summary: expect.stringContaining(
            '真实插件 WASM/Extism smoke test 或真实 sandbox run',
          ),
        }),
        expect.objectContaining({
          id: 'gate-4-plugin-sandbox-smoke-expectations',
          kind: 'test',
          summary: expect.stringContaining('integration-skeleton 完整性检查'),
        }),
      ]),
    );
    const gate5RunPayload = insertGate5RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
    };
    expect(gate5RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-browser-tool-plan',
          kind: 'browser',
          summary: expect.stringContaining(
            '未执行真实 Playwright/browser test',
          ),
        }),
        expect.objectContaining({
          id: 'gate-5-public-runtime-journeys',
          kind: 'browser',
          summary: expect.stringContaining('真实公开链接访问或真实端到端交互'),
        }),
        expect.objectContaining({
          id: 'gate-5-artifact-expectations',
          kind: 'browser',
          summary: expect.stringContaining(
            '真实截图/视频/trace 捕获、真实 console/network 检查',
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
          id: 'gate-6-verifier-isolation-policy',
          kind: 'verifier',
          summary: expect.stringContaining(
            '未执行真实独立模型审查、真实独立代理审查、真实人工审查',
          ),
        }),
        expect.objectContaining({
          id: 'gate-6-redacted-evidence-bundle',
          kind: 'verifier',
          summary: expect.stringContaining('不含真实 token'),
        }),
        expect.objectContaining({
          id: 'gate-6-verdict-schema',
          kind: 'verifier',
          summary: expect.stringContaining(
            '未执行真实独立模型审查、真实独立代理审查',
          ),
        }),
      ]),
    );
    const gate7RunPayload = insertGate7RunChain.values.mock.calls[0]?.[0] as {
      evidence: GeneratedApp['gateResults'][number]['evidence'];
      failure: { details?: { blockers?: unknown[]; finalVerdict?: unknown } };
    };
    expect(gate7RunPayload.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-7-publish-readiness-inputs',
          kind: 'manual',
          summary: expect.stringContaining(
            '未生成真实发布候选、未签收真实 artifact',
          ),
        }),
        expect.objectContaining({
          id: 'gate-7-artifact-release-manifest',
          kind: 'manual',
          summary: expect.stringContaining('frontend artifact'),
        }),
        expect.objectContaining({
          id: 'gate-7-final-verdict',
          kind: 'manual',
          summary: expect.stringContaining('publishCandidateAllowed=false'),
        }),
      ]),
    );
    expect(gate7RunPayload.failure.details?.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'skeleton_only_upstream_gate',
        }),
        expect.objectContaining({
          category: 'missing_real_independent_verifier_verdict',
        }),
      ]),
    );
    expect(JSON.stringify(gate7RunPayload.failure)).not.toContain(
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
    ]);
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7')
        ?.status,
    ).toBe('failed');
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-7')
        ?.evidence,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-7-publication-blockers',
          kind: 'manual',
        }),
      ]),
    );
    expect(
      appUpdatePayload.gateResults
        .filter((gate) => ['gate-7'].includes(gate.gateId))
        .every((gate) => gate.status !== 'passed' && gate.evidence.length > 0),
    ).toBe(true);
    expect(appUpdatePayload.readiness.canCreatePublicShare).toBe(false);
    expect(appUpdatePayload.readiness.state).toBe('blocked');
    expect(appUpdatePayload.status).toBe('failed');
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
        executionLevel: 'contract-skeleton',
        frontendBuild: expect.objectContaining({
          command: 'agentloom generated-app gate-3 build-and-unit',
          routeIds: ['page-public-runtime'],
          expectedArtifacts: expect.arrayContaining([
            'dist/index.html',
            'dist/assets/manifest.json',
          ]),
        }),
        typecheck: expect.objectContaining({
          command: 'agentloom generated-app gate-3 typecheck',
          tsconfigPath: 'tsconfig.generated-app.json',
        }),
        unitTests: expect.objectContaining({
          command: 'agentloom generated-app gate-3 unit-tests',
          scenarioIds: ['scenario-1'],
        }),
        componentGoldenTests: expect.objectContaining({
          command: 'agentloom generated-app gate-3 component-golden',
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
        executionLevel: 'integration-skeleton',
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
          expectationLevel: 'dry-run-fixture-skeleton',
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
        executionLevel: 'browser-acceptance-skeleton',
        browserToolPlan: expect.objectContaining({
          runner: 'playwright',
          command: 'agentloom generated-app gate-5 browser-acceptance',
          testEntry: 'tests/generated-app/browser-acceptance.spec.ts',
          baseUrlShape:
            'http://localhost:{previewPort}/generated-apps/public/{publicShareAccess}',
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
        executionLevel: 'independent-verifier-skeleton',
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
              evidenceIds: expect.arrayContaining(['gate-5-browser-tool-plan']),
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
            evidenceIds: expect.arrayContaining(['gate-5-browser-tool-plan']),
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
        independenceChecks: expect.arrayContaining([
          expect.objectContaining({
            kind: 'reviewer_identity_context_isolation',
            required: true,
            gateIds: expect.arrayContaining(['gate-0', 'gate-5']),
          }),
          expect.objectContaining({
            kind: 'evidence_id_citation_required',
            evidenceIds: expect.arrayContaining(['gate-5-browser-tool-plan']),
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
            evidenceId: 'gate-5-browser-tool-plan',
            gateId: 'gate-5',
          }),
        ]),
        gateCoverage: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'gate-5',
            evidenceIds: expect.arrayContaining(['gate-5-browser-tool-plan']),
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
        executionLevel: 'publish-candidate-guard-skeleton',
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
                'gate-6-verifier-isolation-policy',
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
        publicationBlockers: expect.arrayContaining([
          expect.objectContaining({
            category: 'skeleton_only_upstream_gate',
            gateIds: ['gate-3', 'gate-4', 'gate-5', 'gate-6'],
          }),
          expect.objectContaining({
            category: 'stale_public_token_requirement',
            gateIds: ['gate-7'],
          }),
        ]),
        rollbackShareControls: expect.objectContaining({
          publicTokenCreation: 'disabled-while-guard-fails',
          publicShareEnabledWhileGuardFails: false,
          createdPublicShareToken: null,
          stalePublicTokenRequiredAction: 'clear-before-publish-candidate',
        }),
        finalVerdict: expect.objectContaining({
          publishCandidateAllowed: false,
          blockingReasons: expect.arrayContaining([
            expect.stringContaining('真实独立 verifier verdict'),
          ]),
          requiredRealGateRunnerIds: expect.arrayContaining([
            'gate-3-real-build-unit-runner',
            'gate-7-real-publish-candidate-runner',
          ]),
          repairSuggestions: expect.arrayContaining([
            expect.stringContaining('真实 Gate 5 browser runner'),
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
            gateId: 'gate-7',
            executionLevel: 'publish-candidate-guard-skeleton',
            skeletonOnly: true,
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
        status: 'failed',
        failureReason: expect.stringContaining(
          'Gate 7 publish-candidate guard skeleton',
        ),
        completedAt: expect.any(Date),
      }),
    );
    expect(response.generationRun).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'failed',
        failureReason: expect.stringContaining(
          'Gate 7 publish-candidate guard skeleton',
        ),
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
        summary: expect.stringContaining('仅表示契约级 skeleton 完整'),
      }),
      expect.objectContaining({
        gateId: 'gate-4',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('integration skeleton 完整'),
      }),
      expect.objectContaining({
        gateId: 'gate-5',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('browser acceptance skeleton 完整'),
      }),
      expect.objectContaining({
        gateId: 'gate-6',
        generationRunId: GENERATION_RUN_ID,
        status: 'passed',
        summary: expect.stringContaining('independent verifier skeleton 完整'),
      }),
      expect.objectContaining({
        gateId: 'gate-7',
        generationRunId: GENERATION_RUN_ID,
        status: 'failed',
        summary: expect.stringContaining('publishCandidatePlan guard skeleton'),
      }),
    ]);
    expect(response.app.generationPlan).toEqual(
      expect.objectContaining({
        appSpecVersion: 1,
        staticContracts: expect.objectContaining({
          contractVersion: 1,
        }),
        buildUnitPlan: expect.objectContaining({
          executionLevel: 'contract-skeleton',
        }),
        integrationPlan: expect.objectContaining({
          executionLevel: 'integration-skeleton',
        }),
        browserAcceptancePlan: expect.objectContaining({
          executionLevel: 'browser-acceptance-skeleton',
        }),
        independentVerificationPlan: expect.objectContaining({
          executionLevel: 'independent-verifier-skeleton',
        }),
        publishCandidatePlan: expect.objectContaining({
          executionLevel: 'publish-candidate-guard-skeleton',
        }),
      }),
    );
    expect(response.app.id).toBe(APP_ID);
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
      frontendBuild: {
        ...validBuildUnitPlan.frontendBuild,
        requirementIds: ['req-1', 'req-missing'],
        scenarioIds: ['scenario-1', 'scenario-missing'],
        expectedArtifacts: ['dist/index.html'],
      },
      typecheck: {
        ...validBuildUnitPlan.typecheck,
        command: '',
        requirementIds: ['req-1', 'req-missing'],
      },
      unitTests: {
        ...validBuildUnitPlan.unitTests,
        command: '',
        requirementIds: ['req-1', 'req-missing'],
        scenarioIds: ['scenario-1', 'scenario-missing'],
      },
      componentGoldenTests: {
        ...validBuildUnitPlan.componentGoldenTests,
        scenarioIds: ['scenario-1', 'scenario-missing'],
        goldenArtifactPath: '',
      },
      artifactExpectations: [
        ...validBuildUnitPlan.artifactExpectations.filter(
          (artifact) => artifact.artifactId !== 'coverage-report',
        ),
        {
          artifactId: 'ghost-artifact',
          kind: 'ghost_report' as GeneratedAppBuildUnitPlan['artifactExpectations'][number]['kind'],
          path: 'artifacts/gate-3/ghost.json',
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
        item.summary.includes('unitTests.command 缺失'),
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
        item.summary.includes(
          '未执行真实前端构建、插件构建、单元测试、组件测试或 golden test',
        ),
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
        item.summary.includes(
          '未执行真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run',
        ),
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
      DEFAULT_START_GENERATION_RUN_DTO,
    );

    expect(insertGate5RunChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-5',
        status: 'failed',
        summary: expect.stringContaining('不代表真实 Playwright/browser test'),
        failure: expect.objectContaining({
          code: 'browser-acceptance-plan-incomplete',
          message: expect.stringContaining(
            '不代表真实 Playwright/browser test',
          ),
        }),
        repairInstructions: expect.stringContaining(
          '修复 generationPlan.browserAcceptancePlan',
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
          containsSecrets: true,
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
        blockingReasons: [],
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
          '未生成真实发布候选、未签收真实 artifact、未证明真实质量门禁全量通过',
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
      DEFAULT_START_GENERATION_RUN_DTO,
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
        completedAt: NOW,
      }),
    );
    expect(created.generationRunId).toBe(GENERATION_RUN_ID);
    expect(updated.status).toBe('completed');
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
    expect(response.appSpec.pages).toEqual([
      expect.objectContaining({ id: 'page-public-runtime' }),
    ]);
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

  it('公开提交应写入创建者租户、快照当前 token、缺省生成匿名会话并保持 received 状态', async () => {
    const token = '3'.repeat(64);
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: token,
    });
    const submission = createGeneratedAppSubmission({
      publicShareToken: token,
    });
    const insertChain = createInsertReturningChain([submission]);
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
      result: null;
      report: null;
      errorMessage: null;
    };
    expect(insertPayload.tenantId).toBe(TENANT_ID);
    expect(insertPayload.generatedAppId).toBe(APP_ID);
    expect(insertPayload.publicShareToken).toBe(token);
    expect(insertPayload.anonymousSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(insertPayload.status).toBe('received');
    expect(insertPayload.input).toEqual({ chiefComplaint: '头痛' });
    expect(insertPayload.result).toBeNull();
    expect(insertPayload.report).toBeNull();
    expect(insertPayload.errorMessage).toBeNull();
    expect(response.status).toBe('received');
  });

  it('公开提交遇到过期或未满足 readiness 的公开应用时应拒绝', async () => {
    const staleToken = '4'.repeat(64);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([]));

    await expect(
      service.createPublicSubmission(staleToken, { input: {} }),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);

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
      createInsertReturningChain([
        createGeneratedAppSubmission({ publicShareToken: token }),
      ]),
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
  });

  it('创建者提交列表和详情只返回当前租户、应用且未删除的记录', async () => {
    const submission = createGeneratedAppSubmission();
    const listChain = createSelectPageChain([submission]);
    const countChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(listChain)
      .mockReturnValueOnce(countChain)
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
      }),
    );
  });

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

    await expect(
      service.getPublicSubmission(oldToken, SUBMISSION_ID),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);
  });
});
