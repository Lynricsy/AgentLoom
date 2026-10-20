// 生成运行失败时的修复工单与再验证台账（ADR-0007）。
// v2 生成运行不自动打补丁：工单记录失败 Gate、证据与修复建议；创建者按建议调整需求或绑定目标后
// 重新运行生成（Gate 0 失败或场景与绑定不符时带 regenerateAppSpec 重新生成 AppSpec）。

import { Injectable } from '@nestjs/common';

import * as schema from '../../database/schema';
import type {
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
} from '../../database/schema';
import {
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
} from './dto';
import { getGeneratedAppGateDefinition } from './generated-app.gates';
import { limitRepairAttemptText } from './generated-app.public-sanitizer.util';
import { GeneratedAppRepository } from './generated-app.repository';

/** 各 Gate 失败时允许调整的范围与对应的 generation_plan / app 字段 */
const GATE_REPAIR_TARGETS: Record<
  string,
  {
    scopes: GeneratedAppRepairPlan['allowedChangeScopes'];
    patchTargets: string[];
  }
> = {
  'gate-0': {
    scopes: ['app-spec', 'binding-target'],
    patchTargets: [
      'generated_apps.app_spec',
      'generated_apps.binding_target',
      'generated_apps.generation_model_config_id',
    ],
  },
  'gate-1': {
    scopes: ['app-spec', 'generation-plan'],
    patchTargets: ['generated_apps.app_spec.acceptanceScenarios'],
  },
  'gate-2': {
    scopes: ['app-spec', 'static-contracts', 'binding-target'],
    patchTargets: [
      'generated_apps.app_spec.inputForm',
      'generated_apps.app_spec.resultView',
      'generated_apps.generation_plan.staticContracts',
    ],
  },
  'gate-3': {
    scopes: ['app-spec', 'test-contracts'],
    patchTargets: [
      'generated_apps.app_spec.acceptanceScenarios',
      'generated_apps.generation_plan.buildUnitPlan',
    ],
  },
  'gate-4': {
    scopes: ['binding-target'],
    patchTargets: [
      'generated_apps.app_spec.binding',
      'generated_apps.generation_plan.integrationPlan',
    ],
  },
  'gate-5': {
    scopes: ['app-spec', 'binding-target', 'test-contracts'],
    patchTargets: [
      'generated_apps.app_spec.acceptanceScenarios',
      'generated_apps.generation_plan.browserAcceptancePlan',
    ],
  },
  'gate-6': {
    scopes: ['app-spec', 'binding-target', 'test-contracts'],
    patchTargets: [
      'generated_apps.generation_plan.independentVerificationPlan',
    ],
  },
  'gate-7': {
    scopes: ['publish-contract'],
    patchTargets: ['generated_apps.generation_plan.publishCandidatePlan'],
  },
};

@Injectable()
export class GeneratedAppGenerationRepairService {
  constructor(private readonly repository: GeneratedAppRepository) {}

  public async recordAutomaticRepairAttemptForFailedRun(params: {
    tenantId: string;
    userId: string;
    appId: string;
    generationRunId: string;
    maxRepairAttempts: number;
    gateRuns: GeneratedAppGateRunResponseDto[];
  }): Promise<GeneratedAppRepairAttemptResponseDto | null> {
    if (params.maxRepairAttempts <= 0) {
      return null;
    }

    const failedGateRun = params.gateRuns.find(
      (gateRun) => gateRun.status === 'failed',
    );
    if (!failedGateRun) {
      return null;
    }

    const now = new Date();
    const failureMessage =
      failedGateRun.failure?.message ?? failedGateRun.summary;
    const [attempt] = await this.repository.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId: params.tenantId,
        generatedAppId: params.appId,
        generationRunId: params.generationRunId,
        attemptNumber: 1,
        targetGateId: failedGateRun.gateId,
        status: 'failed',
        failureSummary: limitRepairAttemptText(
          `${failedGateRun.gateId} ${failedGateRun.gateName} 失败：${failureMessage}`,
        ),
        changeSummary: limitRepairAttemptText(
          failedGateRun.repairInstructions
            ? `生成运行不自动修改规格或绑定；修复建议：${failedGateRun.repairInstructions}`
            : '生成运行不自动修改规格或绑定；按失败证据调整后重新运行生成。',
        ),
        verificationSummary: limitRepairAttemptText(
          `${failedGateRun.gateId} 仍为 failed；重新运行生成后由同一 Gate 复核。`,
        ),
        repairPlan: this.buildFailedGateRepairPlan(failedGateRun, now),
        reverificationPlan: this.buildFailedGateReverificationPlan(
          failedGateRun,
          now,
        ),
        startedAt: now,
        completedAt: now,
        createdBy: params.userId,
      })
      .returning();

    return this.repository.toRepairAttemptResponseDto(attempt);
  }

  public buildFailedGateRepairPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppRepairPlan {
    const gateDefinition = getGeneratedAppGateDefinition(failedGateRun.gateId);
    const targets = GATE_REPAIR_TARGETS[failedGateRun.gateId] ?? {
      scopes: ['generation-plan'],
      patchTargets: ['generated_apps.generation_plan'],
    };

    return {
      planVersion: 1,
      source: 'automatic-failed-gate-work-order',
      targetGateId: failedGateRun.gateId,
      targetGateName: gateDefinition?.name ?? failedGateRun.gateName,
      failureCode: failedGateRun.failure?.code ?? null,
      failureSummary: limitRepairAttemptText(
        failedGateRun.failure?.message ?? failedGateRun.summary,
      ),
      repairInstructions: failedGateRun.repairInstructions
        ? limitRepairAttemptText(failedGateRun.repairInstructions)
        : null,
      evidenceIds: failedGateRun.evidence.map((item) => item.id),
      evidenceSummaries: failedGateRun.evidence
        .map((item) => limitRepairAttemptText(item.summary))
        .filter((summary) => summary.length > 0)
        .slice(0, 12),
      allowedChangeScopes: [...targets.scopes],
      forbiddenChangeScopes: [
        'tenant-boundary',
        'public-share-token',
        'host-absolute-path',
        'production-credentials',
        'external-network-without-permission',
        'unrelated-gate-rewrite',
      ],
      patchTargets: [...targets.patchTargets],
      requiredTraceability: [
        'repair-plan-target-gate',
        'failed-evidence-citation',
        'post-rerun-gate-evidence',
      ],
      generatedAt: generatedAt.toISOString(),
    };
  }

  public buildFailedGateReverificationPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppReverificationPlan {
    const gateDefinition = getGeneratedAppGateDefinition(failedGateRun.gateId);
    return {
      planVersion: 1,
      targetGateId: failedGateRun.gateId,
      requiredGateIds: [
        gateDefinition ? `gate-${gateDefinition.order}` : failedGateRun.gateId,
      ],
      // v2 没有本地命令：再验证即重新运行生成，由同一 Gate 产出新证据
      requiredCommandIds: [],
      requiredEvidenceIds: failedGateRun.evidence.map((item) => item.id),
      successCriteria: [
        `${failedGateRun.gateId} 在新的生成运行中记录为 passed，后续 Gate 才会执行。`,
        '新证据由同一 Gate 在新运行中产出，不能沿用失败运行的证据。',
        '修复证据中不得出现宿主绝对路径、公开分享令牌、生产凭据或与目标 Gate 无关的改写。',
      ],
      blockedUntilPatchApplied: true,
      generatedAt: generatedAt.toISOString(),
    };
  }
}
