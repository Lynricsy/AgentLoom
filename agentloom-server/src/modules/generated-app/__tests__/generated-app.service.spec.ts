import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppReadiness,
} from '../../../database/schema';
import { GeneratedAppPublicShareNotReadyException } from '../generated-app.exceptions';
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
const NOW = new Date('2026-04-25T00:00:00.000Z');

function createSelectChain(result: GeneratedApp[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function createUpdateReturningChain(result: GeneratedApp[]) {
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
});
