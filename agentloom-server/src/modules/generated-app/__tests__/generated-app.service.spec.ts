import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppGateRun,
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

  it('Gate 0/Gate 1/Gate 2 通过后应写入 staticContracts、linked gate runs 且清理未执行门禁旧证据', async () => {
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
    const completedRun = createGeneratedAppGenerationRun({
      runNumber: 2,
      status: 'failed',
      maxRepairAttempts: 2,
      maxRuntimeSeconds: 600,
      completedAt: NOW,
      summary:
        '门禁运行器骨架完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁和 Gate 2 静态合约门禁；Gate 3-7 runner 尚未接入/未执行，当前应用不能形成 publish candidate，保持不可发布。',
      failureReason:
        'Gate 3-7 runner 尚未接入/未执行，不能形成 publish candidate。',
    });
    const insertRunChain = createInsertReturningChain([run]);
    const insertGateRunChain = createInsertReturningChain([gateRun]);
    const insertGate1RunChain = createInsertReturningChain([gate1Run]);
    const insertGate2RunChain = createInsertReturningChain([gate2Run]);
    let gate1UpdatePayload: Partial<GeneratedApp> = {};
    let gate2UpdatePayload: Partial<GeneratedApp> = {};
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
    const updateRunChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(createSelectLatestRunNumberChain(1));
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

    expect(gate1UpdatePayload.generationPlan).not.toHaveProperty(
      'staticContracts',
    );

    const appUpdatePayload = gate2UpdatePayload as {
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
    expect(passedGateIds).toEqual(['gate-0', 'gate-1', 'gate-2']);
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-3')
        ?.status,
    ).toBe('pending');
    expect(
      appUpdatePayload.gateResults.find((gate) => gate.gateId === 'gate-3')
        ?.evidence,
    ).toEqual([]);
    expect(
      appUpdatePayload.gateResults
        .filter((gate) =>
          ['gate-3', 'gate-4', 'gate-5', 'gate-6', 'gate-7'].includes(
            gate.gateId,
          ),
        )
        .every(
          (gate) => gate.status !== 'passed' && gate.evidence.length === 0,
        ),
    ).toBe(true);
    expect(appUpdatePayload.readiness.canCreatePublicShare).toBe(false);
    expect(appUpdatePayload.status).toBe('preview_ready');
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
    expect(updateRunChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason:
          'Gate 3-7 runner 尚未接入/未执行，不能形成 publish candidate。',
        completedAt: expect.any(Date),
      }),
    );
    expect(response.generationRun).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'failed',
        failureReason:
          'Gate 3-7 runner 尚未接入/未执行，不能形成 publish candidate。',
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
    ]);
    expect(response.app.generationPlan).toEqual(
      expect.objectContaining({
        appSpecVersion: 1,
        staticContracts: expect.objectContaining({
          contractVersion: 1,
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
