import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneratedAppGateRun } from '../../../database/schema';
import type { GeneratedAppGateRunResponseDto } from '../dto';
import {
  APP_ID,
  GENERATION_RUN_ID,
  NOW,
  TENANT_ID,
  USER_ID,
  createGeneratedAppGateRun,
  createGeneratedAppRepairAttempt,
  createInsertReturningChain,
  createRepairServiceForTest,
  mockTenantDb,
} from './generated-app-test-support';

function failedGateRun(
  overrides: Partial<GeneratedAppGateRun> = {},
): GeneratedAppGateRunResponseDto {
  const { generatedAppId, ...run } = createGeneratedAppGateRun({
    status: 'failed',
    ...overrides,
  });
  return { ...run, appId: generatedAppId };
}

describe('GeneratedAppGenerationRepairService（v2 修复工单）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantDb.insert.mockReset();
  });

  it('Gate 5 失败的工单只给出 v2 可调整范围与重新运行的验收标准，并对敏感文本脱敏', () => {
    const gateRun = failedGateRun({
      gateId: 'gate-5',
      gateOrder: 5,
      gateName: '浏览器验收门禁',
      summary:
        'Gate 5 失败：publicShareToken=abc sk-sensitive /root/generated-app/private workflowSnapshots rawToolData',
      evidence: [
        {
          id: 'gate-5-browser-runner',
          label: 'browser-runner',
          kind: 'browser',
          url: null,
          summary:
            '场景失败 /root/.cache/ms-playwright sk-secret-token publicShareToken=abc checkpointData rawToolData',
        },
      ],
      failure: {
        code: 'gate-5-scenario-failed',
        message:
          'Gate 5 failed with Bearer secret-token and /root/preview public_share_token=abc workflowSnapshots',
      },
      repairInstructions:
        '修复 publicShareToken、workflowSnapshots、rawToolData、/root/preview 和 sk-secret 后重新运行。',
    });
    const service = createRepairServiceForTest();

    const repairPlan = service.buildFailedGateRepairPlan(gateRun, NOW);
    const reverificationPlan = service.buildFailedGateReverificationPlan(
      gateRun,
      NOW,
    );

    expect(repairPlan).toEqual({
      planVersion: 1,
      source: 'automatic-failed-gate-work-order',
      targetGateId: 'gate-5',
      targetGateName: expect.any(String),
      failureCode: 'gate-5-scenario-failed',
      failureSummary: expect.any(String),
      repairInstructions: expect.any(String),
      evidenceIds: ['gate-5-browser-runner'],
      evidenceSummaries: [expect.any(String)],
      allowedChangeScopes: ['app-spec', 'binding-target', 'test-contracts'],
      forbiddenChangeScopes: expect.arrayContaining([
        'tenant-boundary',
        'public-share-token',
        'host-absolute-path',
      ]),
      patchTargets: [
        'generated_apps.app_spec.acceptanceScenarios',
        'generated_apps.generation_plan.browserAcceptancePlan',
      ],
      requiredTraceability: [
        'repair-plan-target-gate',
        'failed-evidence-citation',
        'post-rerun-gate-evidence',
      ],
      generatedAt: NOW.toISOString(),
    });
    expect(reverificationPlan).toEqual(
      expect.objectContaining({
        targetGateId: 'gate-5',
        requiredGateIds: ['gate-5'],
        requiredCommandIds: [],
        requiredEvidenceIds: ['gate-5-browser-runner'],
        blockedUntilPatchApplied: true,
      }),
    );

    const serialized = JSON.stringify({ repairPlan, reverificationPlan });
    expect(serialized).not.toContain('/root/');
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('publicShareToken=abc');
    expect(serialized).not.toContain('public_share_token=abc');
    expect(serialized).not.toContain('e2eRunnerContract');
    expect(serialized).not.toContain('frontend-workspace');
  });

  it.each([
    ['gate-0', ['app-spec', 'binding-target'], 'generated_apps.app_spec'],
    [
      'gate-1',
      ['app-spec', 'generation-plan'],
      'generated_apps.app_spec.acceptanceScenarios',
    ],
    [
      'gate-2',
      ['app-spec', 'static-contracts', 'binding-target'],
      'generated_apps.generation_plan.staticContracts',
    ],
    [
      'gate-3',
      ['app-spec', 'test-contracts'],
      'generated_apps.generation_plan.buildUnitPlan',
    ],
    [
      'gate-4',
      ['binding-target'],
      'generated_apps.generation_plan.integrationPlan',
    ],
    [
      'gate-6',
      ['app-spec', 'binding-target', 'test-contracts'],
      'generated_apps.generation_plan.independentVerificationPlan',
    ],
    [
      'gate-7',
      ['publish-contract'],
      'generated_apps.generation_plan.publishCandidatePlan',
    ],
  ] as const)(
    '%s 失败时写入一条 failed 修复尝试，范围与补丁目标对应该 Gate',
    async (gateId, scopes, patchTarget) => {
      const insertChain = createInsertReturningChain([
        createGeneratedAppRepairAttempt({ targetGateId: gateId }),
      ]);
      mockTenantDb.insert.mockReturnValueOnce(insertChain);

      const attempt =
        await createRepairServiceForTest().recordAutomaticRepairAttemptForFailedRun(
          {
            tenantId: TENANT_ID,
            userId: USER_ID,
            appId: APP_ID,
            generationRunId: GENERATION_RUN_ID,
            maxRepairAttempts: 3,
            gateRuns: [
              failedGateRun({
                gateId,
                evidence: [
                  {
                    id: `${gateId}-evidence`,
                    label: '证据',
                    kind: 'manual',
                    url: null,
                    summary: '失败证据',
                  },
                ],
                repairInstructions: '按建议修复后重新运行。',
              }),
            ],
          },
        );

      expect(attempt?.targetGateId).toBe(gateId);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          targetGateId: gateId,
          status: 'failed',
          generationRunId: GENERATION_RUN_ID,
          changeSummary:
            expect.stringContaining('生成运行不自动修改规格或绑定'),
          repairPlan: expect.objectContaining({
            allowedChangeScopes: [...scopes],
            patchTargets: expect.arrayContaining([patchTarget]),
          }),
          reverificationPlan: expect.objectContaining({
            requiredGateIds: [gateId],
            requiredCommandIds: [],
            requiredEvidenceIds: [`${gateId}-evidence`],
          }),
          createdBy: USER_ID,
        }),
      );
    },
  );

  it('修复预算为 0 或运行里没有失败 Gate 时不写修复台账', async () => {
    const service = createRepairServiceForTest();
    const base = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
    };

    await expect(
      service.recordAutomaticRepairAttemptForFailedRun({
        ...base,
        maxRepairAttempts: 0,
        gateRuns: [failedGateRun()],
      }),
    ).resolves.toBeNull();
    await expect(
      service.recordAutomaticRepairAttemptForFailedRun({
        ...base,
        maxRepairAttempts: 3,
        gateRuns: [failedGateRun({ status: 'passed' })],
      }),
    ).resolves.toBeNull();
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
  });
});
