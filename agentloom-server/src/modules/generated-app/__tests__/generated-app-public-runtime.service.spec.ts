import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { GeneratedApp } from '../../../database/schema';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppPublicShareNotReadyException } from '../generated-app.exceptions';
import { computeAppSpecSha256 } from '../generated-app.gate-v2.util';
import { GATE_7_PUBLISH_CANDIDATE_GUARD_EVIDENCE_ID } from '../generated-app.gate7-publish-candidate';
import type { GeneratedAppGenerationPipelineService } from '../generated-app-generation-pipeline.service';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import { GeneratedAppService } from '../generated-app.service';
import type { GeneratedAppGenerationPlanV2 } from '../types/generation-plan-v2.types';
import {
  TENANT_ID,
  USER_ID,
  APP_ID,
  GENERATION_RUN_ID,
  NOW,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createAppSpecV2Fixture,
  createConfigService,
  createSelectChain,
  createUpdateReturningChain,
  createGeneratedAppUpdateReturningFromPayload,
  createPublishCandidateReadiness,
  createReadiness,
  createStorageServiceMock,
  createGeneratedApp,
  mockTenantDb,
} from './generated-app-test-support';

const APP_SPEC_SHA256 = computeAppSpecSha256(createAppSpecV2Fixture());

/** Gate 7 真实签收后的 v2 生成计划；覆盖项用于构造各类不可信计划 */
function createSignedGenerationPlan(
  manifestOverrides: Partial<
    NonNullable<
      GeneratedAppGenerationPlanV2['publishCandidatePlan']
    >['manifest']
  > = {},
  executionLevel: 'real' | 'fixture' = 'real',
): GeneratedAppGenerationPlanV2 {
  const binding = {
    kind: 'workflow' as const,
    workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    workflowVersionId: WORKFLOW_VERSION_ID,
  };
  return {
    planVersion: 2,
    generationRunId: GENERATION_RUN_ID,
    appSpecSha256: APP_SPEC_SHA256,
    binding,
    coverage: {
      requirements: [],
      unassertedSectionIds: [],
      untouchedFieldIds: [],
    },
    publishCandidatePlan: {
      executionLevel,
      manifest: {
        appSpecSha256: APP_SPEC_SHA256,
        generationRunId: GENERATION_RUN_ID,
        binding,
        runtimeWorkflow: {
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          workflowVersionId: WORKFLOW_VERSION_ID,
        },
        gateEvidenceIds: {},
        artifactKeys: [],
        ...manifestOverrides,
      },
    },
  };
}

/** 全部门禁 passed，Gate 7 带 manifest 证据 id（与真实 Gate 7 runner 相同） */
function createAllPassedGateResults() {
  return createInitialGeneratedAppGateResults(NOW.toISOString()).map(
    (gate) => ({
      ...gate,
      status: 'passed' as const,
      summary: `${gate.name} 已通过`,
      evidence: [
        {
          id:
            gate.gateId === 'gate-7'
              ? 'gate-7-release-manifest'
              : `${gate.gateId}-evidence`,
          label: `${gate.name} 证据`,
          kind: 'manual' as const,
          url: null,
          summary: `${gate.name} 证据`,
        },
      ],
    }),
  );
}

describe('公开分享与发布候选守卫', () => {
  let service: GeneratedAppService;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    const configService = createConfigService();
    const repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    const runtimeBindingService = new GeneratedAppRuntimeBindingService(
      repository,
    );
    service = new GeneratedAppService(
      repository,
      new GeneratedAppArtifactService(
        repository,
        configService,
        createStorageServiceMock(),
      ),
      runtimeBindingService,
      {
        enqueueRun: vi.fn(),
      } as unknown as GeneratedAppGenerationPipelineService,
      new GeneratedAppPublicRuntimeService(repository, runtimeBindingService),
      { archive: vi.fn() } as unknown as WorkflowVersionService,
    );
  });

  async function recordAllPassed(
    app: GeneratedApp,
    generationPlan?: GeneratedAppGenerationPlanV2 | Record<string, unknown>,
  ) {
    let updatePayload: Partial<GeneratedApp> = {};
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.update.mockReturnValueOnce(
      createGeneratedAppUpdateReturningFromPayload(app, (payload) => {
        updatePayload = payload;
      }),
    );
    const response = await service.recordGateResults(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        gateResults: createAllPassedGateResults(),
        // 与 HTTP 请求体一致：计划经 JSON 序列化后作为普通对象提交
        ...(generationPlan
          ? {
              generationPlan: JSON.parse(
                JSON.stringify(generationPlan),
              ) as Record<string, unknown>,
            }
          : {}),
      },
    );
    return { updatePayload, response };
  }

  it('非 publish_candidate 状态启用公开链接时应拒绝', async () => {
    mockTenantDb.select.mockReturnValueOnce(
      createSelectChain([createGeneratedApp()]),
    );

    await expect(
      service.enablePublicShare(TENANT_ID, USER_ID, APP_ID),
    ).rejects.toBeInstanceOf(GeneratedAppPublicShareNotReadyException);

    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('publish_candidate 状态启用公开链接时应创建不可猜测 token', async () => {
    const app = createGeneratedApp({
      status: 'publish_candidate',
      readiness: createPublishCandidateReadiness(),
    });
    const updatedApp = createGeneratedApp({
      ...app,
      status: 'published',
      publicShareEnabled: true,
      publicShareToken: 'b'.repeat(64),
      publicShareCreatedAt: NOW,
      publicShareDisabledAt: null,
    });
    const updateChain = createUpdateReturningChain([updatedApp]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
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

  it('关闭后再次启用、或重新生成公开链接时都换新 token', async () => {
    const oldToken = 'a'.repeat(64);
    const app = createGeneratedApp({
      status: 'publish_candidate',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: false,
      publicShareToken: oldToken,
      publicShareDisabledAt: NOW,
    });
    for (const action of [
      () => service.enablePublicShare(TENANT_ID, USER_ID, APP_ID),
      () => service.regeneratePublicShare(TENANT_ID, USER_ID, APP_ID),
    ]) {
      const updateChain = createUpdateReturningChain([
        createGeneratedApp({
          ...app,
          status: 'published',
          publicShareEnabled: true,
          publicShareToken: 'b'.repeat(64),
        }),
      ]);
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
      mockTenantDb.update.mockReturnValueOnce(updateChain);

      await action();

      const updatePayload = updateChain.set.mock.calls[0]?.[0] as {
        publicShareToken: string;
      };
      expect(updatePayload.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updatePayload.publicShareToken).not.toBe(oldToken);
    }
  });

  it('关闭公开链接时应清空 token 并回到 readiness 对应状态', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
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
      ...createAllPassedGateResults(),
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
          blockingIssueCount: 0,
          warningCount: 1,
          blockers: [],
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

  it('Gate 7 真实签收、manifest 与计划同一次运行且指纹对应当前 AppSpec 时进入发布候选', async () => {
    const { updatePayload } = await recordAllPassed(
      createGeneratedApp({ generationPlan: createSignedGenerationPlan() }),
    );

    expect(updatePayload.readiness?.state).toBe('publish_candidate');
    expect(updatePayload.status).toBe('publish_candidate');
    expect(
      updatePayload.gateResults?.find((gate) => gate.gateId === 'gate-7')
        ?.status,
    ).toBe('passed');
  });

  it.each([
    [
      '手工写入的非 v2 计划',
      { malformed: true },
      'generation_plan 中没有 Gate 7',
    ],
    [
      'fixture 执行的 Gate 7',
      createSignedGenerationPlan({}, 'fixture'),
      '执行级别为 fixture',
    ],
    [
      'AppSpec 在签收后被改过',
      createSignedGenerationPlan({ appSpecSha256: 'f'.repeat(64) }),
      '当前 AppSpec 与 Gate 7 manifest 的指纹不一致',
    ],
    [
      'manifest 来自另一次运行',
      createSignedGenerationPlan({
        generationRunId: '55555555-5555-4555-8555-000000000000',
      }),
      '不属于同一次生成运行',
    ],
    [
      '运行时工作流没有就绪',
      createSignedGenerationPlan({ runtimeWorkflow: null }),
      '没有就绪的运行时工作流',
    ],
  ])(
    '手动记录全 passed 但%s时守卫把 Gate 7 改为 failed 并关闭公开链接',
    async (_label, generationPlan, issue) => {
      const app = createGeneratedApp({
        status: 'published',
        readiness: createPublishCandidateReadiness(),
        publicShareEnabled: true,
        publicShareToken: 'a'.repeat(64),
        publicShareCreatedAt: NOW,
      });

      const { updatePayload, response } = await recordAllPassed(
        app,
        generationPlan,
      );

      expect(updatePayload.status).toBe('failed');
      expect(updatePayload.readiness?.state).toBe('blocked');
      expect(updatePayload.publicShareToken).toBeNull();
      expect(updatePayload.publicShareEnabled).toBe(false);
      expect(
        updatePayload.gateResults?.find((gate) => gate.gateId === 'gate-7'),
      ).toEqual(
        expect.objectContaining({
          status: 'failed',
          evidence: expect.arrayContaining([
            expect.objectContaining({
              id: GATE_7_PUBLISH_CANDIDATE_GUARD_EVIDENCE_ID,
              summary: expect.stringContaining(issue),
            }),
          ]),
        }),
      );
      expect(response.publicShareToken).toBeNull();
    },
  );
});
