import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppGateRun,
  GeneratedAppReadiness,
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
const GATE_RUN_ID = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-04-25T00:00:00.000Z');

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
      nonGoals: [],
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

  it('记录单次门禁运行时应写入证据并同步当前 gateResults/readiness', async () => {
    const app = createGeneratedApp();
    const gateRun = createGeneratedAppGateRun();
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
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateRun(TENANT_ID, USER_ID, APP_ID, {
      gateId: 'gate-1',
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
