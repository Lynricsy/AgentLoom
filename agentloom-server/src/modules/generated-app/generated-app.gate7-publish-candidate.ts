// Gate 7 发布候选（ADR-0007 §4）：确认 Gate 0–6 在本次运行全部通过且 AppSpec 未变，
// 准备运行时工作流（工作流绑定即被绑定工作流的固定版本；Agent 绑定创建并发布包装工作流），
// 写 manifest：AppSpec sha256、固定绑定版本、各 Gate 证据 id、artifact key。不创建公开链接。

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainException } from '../../common/exceptions/domain.exception';
import {
  computeAppSpecSha256,
  disabledGate,
  failedGate,
  gateEvidence,
  getGenerationPlanV2,
  resolveGateExecutionLevel,
  toPinnedBinding,
} from './generated-app.gate-v2.util';
import { GENERATED_APP_RUNTIME_BINDING_ADAPTER } from './generated-app.v2-tokens';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
  GeneratedAppRuntimeBindingAdapter,
} from './types/generation-v2.ports';
import type {
  GeneratedAppGateExecutionLevel,
  GeneratedAppPublishCandidatePlanV2,
} from './types/generation-plan-v2.types';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type { GeneratedAppGateResult } from './types/generated-app.types';
import { evaluateGeneratedAppReadiness } from './generated-app.gates';

export const GATE_7_REQUIRED_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
] as const;

export const GATE_7_PUBLISH_CANDIDATE_GUARD_EVIDENCE_ID =
  'gate-7-publish-candidate-evidence-guard';

/**
 * 写入门禁结果前的发布候选守卫：readiness 将变为 publish_candidate 时，只有 generation_plan 里有
 * real 执行的 Gate 7 manifest、manifest 与计划属于同一次运行、指纹与当前 AppSpec 一致且运行时工作流已就绪，
 * Gate 7 才算通过；否则把 Gate 7 改为 failed。手工记录的门禁结果同样经过这里。
 */
export function applyPublishCandidateGuard(
  gateResults: GeneratedAppGateResult[],
  generationPlan: unknown,
  appSpec: GeneratedAppSpecV2 | null,
): GeneratedAppGateResult[] {
  if (
    evaluateGeneratedAppReadiness(gateResults).state !== 'publish_candidate'
  ) {
    return gateResults;
  }

  const issues: string[] = [];
  const plan = getGenerationPlanV2(generationPlan);
  const candidate = plan?.publishCandidatePlan;
  if (!plan || !candidate) {
    issues.push('generation_plan 中没有 Gate 7 发布候选计划');
  } else {
    if (candidate.executionLevel !== 'real') {
      issues.push(`Gate 7 执行级别为 ${candidate.executionLevel}，不是 real`);
    }
    if (candidate.manifest.generationRunId !== plan.generationRunId) {
      issues.push('Gate 7 manifest 与生成计划不属于同一次生成运行');
    }
    if (candidate.manifest.appSpecSha256 !== plan.appSpecSha256) {
      issues.push('Gate 7 manifest 的 AppSpec 指纹与生成计划不一致');
    }
    if (
      !appSpec ||
      computeAppSpecSha256(appSpec) !== candidate.manifest.appSpecSha256
    ) {
      issues.push('当前 AppSpec 与 Gate 7 manifest 的指纹不一致');
    }
    if (!candidate.manifest.runtimeWorkflow) {
      issues.push('Gate 7 manifest 没有就绪的运行时工作流');
    }
  }
  const gate7 = gateResults.find((gate) => gate.gateId === 'gate-7');
  if (!gate7?.evidence.some((item) => item.id === 'gate-7-release-manifest')) {
    issues.push('Gate 7 结果缺少发布候选 manifest 证据');
  }
  if (issues.length === 0) {
    return gateResults;
  }

  return gateResults.map((gate) =>
    gate.gateId === 'gate-7'
      ? {
          ...gate,
          status: 'failed',
          summary:
            'Gate 7 失败：发布候选守卫拒绝了没有可信 manifest 的结果；fixture、disabled 或手工声明的证据不能放行发布候选。',
          evidence: [
            ...gate.evidence,
            gateEvidence({
              id: GATE_7_PUBLISH_CANDIDATE_GUARD_EVIDENCE_ID,
              label: 'Gate 7 发布候选守卫',
              kind: 'manual',
              summary: `服务端在同步 readiness 前阻断发布候选：${issues.join('；')}`,
              details: { issues },
            }),
          ],
          updatedAt: new Date().toISOString(),
        }
      : gate,
  );
}

@Injectable()
export class GeneratedAppGate7PublishCandidateRunner {
  constructor(
    private readonly configService: ConfigService,
    @Inject(GENERATED_APP_RUNTIME_BINDING_ADAPTER)
    private readonly bindingAdapter: Pick<
      GeneratedAppRuntimeBindingAdapter,
      'ensureRuntimeWorkflow'
    >,
  ) {}

  getExecutionLevel(): GeneratedAppGateExecutionLevel {
    return resolveGateExecutionLevel(
      this.configService,
      'GENERATED_APP_GATE7_EXECUTOR_MODE',
    );
  }

  async run(
    context: GeneratedAppGateContextV2,
  ): Promise<GeneratedAppGateEvaluationV2<GeneratedAppPublishCandidatePlanV2>> {
    const executionLevel = this.getExecutionLevel();
    const plan = context.generationPlan;
    const gateEvidenceIds = Object.fromEntries(
      context.previousGates.map((gate) => [
        gate.gateId,
        gate.evidence.map((item) => item.id),
      ]),
    );
    const manifest: GeneratedAppPublishCandidatePlanV2['manifest'] = {
      appSpecSha256: computeAppSpecSha256(context.appSpec),
      generationRunId: context.generationRunId,
      binding: toPinnedBinding(context.appSpec),
      runtimeWorkflow: null,
      gateEvidenceIds,
      artifactKeys:
        plan.independentVerificationPlan?.verifiedArtifactKeys ?? [],
    };

    if (executionLevel === 'disabled') {
      return disabledGate({
        gateId: 'gate-7',
        gateLabel: 'Gate 7 发布候选',
        envKey: 'GENERATED_APP_GATE7_EXECUTOR_MODE',
        plan: { executionLevel, manifest },
      });
    }
    if (executionLevel === 'fixture') {
      return failedGate({
        summary: 'Gate 7 失败：fixture 执行器不能签收发布候选。',
        code: 'gate-7-fixture-not-publish-candidate',
        message: 'Gate 7 fixture 只用于单测，不能产生发布候选。',
        evidence: [
          gateEvidence({
            id: 'gate-7-fixture',
            label: 'Gate 7 fixture',
            kind: 'manual',
            summary: 'executionLevel=fixture；未准备运行时工作流。',
            details: { executionLevel, executed: false },
          }),
        ],
        repairInstructions:
          '把 GENERATED_APP_GATE7_EXECUTOR_MODE 设为 real 后重新运行。',
        plan: { executionLevel, manifest },
      });
    }

    const blockers: string[] = [];
    for (const gateId of GATE_7_REQUIRED_GATE_IDS) {
      const gate = context.previousGates.find((item) => item.gateId === gateId);
      if (gate?.status !== 'passed') {
        blockers.push(
          `${gateId} 在本次运行未通过（${gate?.status ?? '未执行'}）`,
        );
      }
    }
    if (manifest.appSpecSha256 !== plan.appSpecSha256) {
      blockers.push('AppSpec 在 Gate 0 之后被修改，证据不再对应当前规格');
    }
    const verification = plan.independentVerificationPlan;
    if (
      verification?.executionLevel !== 'real' ||
      verification.findings.length > 0
    ) {
      blockers.push('Gate 6 没有真实执行的无阻断复核结论');
    }

    if (blockers.length > 0) {
      return failedGate({
        summary: `Gate 7 失败：发布候选前置条件 ${blockers.length} 项不满足。`,
        code: 'gate-7-publish-candidate-contract-blocked',
        message: blockers.join('；'),
        details: { blockers },
        evidence: [
          gateEvidence({
            id: 'gate-7-preconditions',
            label: '发布候选前置条件',
            kind: 'manual',
            summary: blockers.join('；'),
            details: { blockers },
          }),
        ],
        repairInstructions:
          '重新运行生成，让 Gate 0–6 在同一次运行中全部通过。',
        plan: { executionLevel, manifest },
      });
    }

    try {
      manifest.runtimeWorkflow =
        await this.bindingAdapter.ensureRuntimeWorkflow({
          tenantId: context.tenantId,
          userId: context.userId,
          appId: context.appId,
          appSpec: context.appSpec,
          generationRunId: context.generationRunId,
        });
    } catch (error) {
      if (!(error instanceof DomainException)) throw error;
      return failedGate({
        summary: 'Gate 7 失败：运行时工作流准备失败。',
        code: 'gate-7-publish-candidate-contract-blocked',
        message: `运行时工作流准备失败：${error.detail}`,
        details: { errorType: error.type },
        evidence: [
          gateEvidence({
            id: 'gate-7-runtime-workflow',
            label: '运行时工作流',
            kind: 'manual',
            summary: error.detail,
            details: { errorType: error.type },
          }),
        ],
        repairInstructions:
          '检查绑定目标是否仍可发布（Agent 绑定会创建包装工作流），修复后重新运行。',
        plan: { executionLevel, manifest },
      });
    }

    return {
      status: 'passed',
      summary: `Gate 7 通过：发布候选 manifest 已签收，运行时工作流 ${manifest.runtimeWorkflow.workflowDefinitionId} 固定版本 ${manifest.runtimeWorkflow.workflowVersionId}；公开链接需创建者手动开启。`,
      evidence: [
        gateEvidence({
          id: 'gate-7-release-manifest',
          label: '发布候选 manifest',
          kind: 'manual',
          summary: `AppSpec sha256 ${manifest.appSpecSha256.slice(0, 12)}…；${manifest.artifactKeys.length} 个 artifact；运行时工作流已就绪。`,
          details: manifest,
        }),
      ],
      failure: null,
      repairInstructions: null,
      plan: { executionLevel, manifest },
    };
  }
}
