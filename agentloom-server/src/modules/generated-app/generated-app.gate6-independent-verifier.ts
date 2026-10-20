// Gate 6 独立审查（ADR-0007 §4）：不调用模型做主观评审，只对前序证据做确定性复核——
// Gate 3/4/5 必须是真实执行；每条 prompt 需求至少一个场景在桌面与移动视口都通过；
// 无 console error、无公开 API 失败请求；断言的结果分区非空；截图与 trace 确实在对象存储中。

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  disabledGate,
  failedGate,
  gateEvidence,
  resolveGateExecutionLevel,
} from './generated-app.gate-v2.util';
import {
  GENERATED_APP_BROWSER_VIEWPORTS,
  type GeneratedAppBrowserViewportId,
} from './types/browser-acceptance-job.schema';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
} from './types/generation-v2.ports';
import type {
  GeneratedAppGateExecutionLevel,
  GeneratedAppIndependentVerificationPlanV2,
  GeneratedAppVerificationFinding,
} from './types/generation-plan-v2.types';

const REQUIRED_VIEWPORTS = Object.keys(
  GENERATED_APP_BROWSER_VIEWPORTS,
) as GeneratedAppBrowserViewportId[];

/** 公开页调用的 API 前缀：只有这些请求失败才说明应用功能出错 */
const PUBLIC_API_PATH_PREFIX = '/api/';

/**
 * Chromium 为每个失败的资源请求写一条以此开头的 console error。它与 failedRequests 重复，
 * 由请求规则判定，不再按 console error 阻断——否则字体、图标等静态资源失败也会判应用不可用。
 */
const RESOURCE_LOAD_CONSOLE_PREFIX = 'Failed to load resource:';

@Injectable()
export class GeneratedAppGate6IndependentVerifierRunner {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly storageService?: StorageService,
  ) {}

  getExecutionLevel(): GeneratedAppGateExecutionLevel {
    return resolveGateExecutionLevel(
      this.configService,
      'GENERATED_APP_GATE6_EXECUTOR_MODE',
    );
  }

  async run(
    context: GeneratedAppGateContextV2,
  ): Promise<
    GeneratedAppGateEvaluationV2<GeneratedAppIndependentVerificationPlanV2>
  > {
    const executionLevel = this.getExecutionLevel();
    const emptyPlan: GeneratedAppIndependentVerificationPlanV2 = {
      executionLevel,
      verifiedRequirementIds: [],
      verifiedArtifactKeys: [],
      findings: [],
    };
    if (executionLevel === 'disabled') {
      return disabledGate({
        gateId: 'gate-6',
        gateLabel: 'Gate 6 独立审查',
        envKey: 'GENERATED_APP_GATE6_EXECUTOR_MODE',
        plan: emptyPlan,
      });
    }
    if (executionLevel === 'fixture') {
      return {
        status: 'passed',
        summary: 'Gate 6 fixture：未复核证据，只能用于单测，Gate 7 不会签收。',
        evidence: [
          gateEvidence({
            id: 'gate-6-fixture',
            label: 'Gate 6 fixture',
            kind: 'verifier',
            summary: 'executionLevel=fixture；executed=false。',
            details: { executionLevel, executed: false },
          }),
        ],
        failure: null,
        repairInstructions: null,
        plan: emptyPlan,
      };
    }

    const findings: GeneratedAppVerificationFinding[] = [];
    const finding = (
      findingId: string,
      message: string,
      scenarioId: string | null = null,
      viewportId: GeneratedAppBrowserViewportId | null = null,
    ) => {
      findings.push({
        findingId,
        severity: 'blocking',
        message,
        scenarioId,
        viewportId,
      });
    };

    const plan = context.generationPlan;
    const levels: Array<[string, GeneratedAppGateExecutionLevel | undefined]> =
      [
        ['gate-3', plan.buildUnitPlan?.executionLevel],
        ['gate-4', plan.integrationPlan?.executionLevel],
        ['gate-5', plan.browserAcceptancePlan?.executionLevel],
      ];
    for (const [gateId, level] of levels) {
      if (level !== 'real') {
        finding(
          `${gateId}-not-real`,
          `${gateId} 执行级别为 ${level ?? '缺失'}，不是真实执行的证据`,
        );
      }
    }

    const browser = plan.browserAcceptancePlan;
    const result = browser?.result ?? null;
    const verifiedRequirementIds: string[] = [];
    const verifiedArtifactKeys: string[] = [];

    if (!browser || !result) {
      finding('gate-5-result-missing', 'Gate 5 没有浏览器执行结果');
    } else {
      if (result.status !== 'passed' || result.runnerError) {
        finding(
          'gate-5-not-passed',
          `Gate 5 浏览器结果为 ${result.status}${result.runnerError ? `（${result.runnerError.code}）` : ''}`,
        );
      }

      const scenarios = new Map(
        context.appSpec.acceptanceScenarios.map((scenario) => [
          scenario.id,
          scenario,
        ]),
      );
      const passedInAllViewports = new Set<string>();
      for (const scenarioId of browser.scenarioIds) {
        const rows = result.scenarios.filter(
          (row) => row.scenarioId === scenarioId,
        );
        const allPassed = REQUIRED_VIEWPORTS.every((viewportId) =>
          rows.some(
            (row) => row.viewportId === viewportId && row.status === 'passed',
          ),
        );
        if (allPassed) passedInAllViewports.add(scenarioId);
      }

      for (const row of result.scenarios) {
        const where = `${row.scenarioId}@${row.viewportId}`;
        const consoleErrors = row.consoleErrors.filter(
          (message) => !message.startsWith(RESOURCE_LOAD_CONSOLE_PREFIX),
        );
        if (consoleErrors.length > 0) {
          finding(
            'console-error',
            `${where} 有 ${consoleErrors.length} 条 console error：${consoleErrors[0]}`,
            row.scenarioId,
            row.viewportId,
          );
        }
        // 静态资源（字体、图片等）失败只影响外观；页面能否完成提交与展示结果已由 Gate 5 的步骤验证
        const failedApiRequests = row.failedRequests.filter((request) =>
          request.path.startsWith(PUBLIC_API_PATH_PREFIX),
        );
        if (failedApiRequests.length > 0) {
          const first = failedApiRequests[0];
          finding(
            'failed-request',
            `${where} 有 ${failedApiRequests.length} 个失败的公开 API 请求：${first.method} ${first.path} ${first.status ?? 'network-error'}`,
            row.scenarioId,
            row.viewportId,
          );
        }
        if (row.status !== 'passed') continue;

        const asserted = (
          scenarios.get(row.scenarioId)?.browserSteps ?? []
        ).flatMap((step) =>
          step.action === 'expectResult' ? [step.sectionId] : [],
        );
        for (const sectionId of asserted) {
          if (!row.resultTexts[sectionId]?.trim()) {
            finding(
              'result-section-empty',
              `${where} 的结果分区 ${sectionId} 为空`,
              row.scenarioId,
              row.viewportId,
            );
          }
        }

        for (const key of [
          row.artifacts.screenshotKey,
          row.artifacts.traceKey,
        ]) {
          if (!key) {
            finding(
              'artifact-missing',
              `${where} 缺少截图或 trace`,
              row.scenarioId,
              row.viewportId,
            );
            continue;
          }
          if (!key.startsWith(`${browser.artifactPrefix}/`)) {
            finding(
              'artifact-outside-prefix',
              `${where} 的 artifact 不在本次运行前缀下`,
              row.scenarioId,
              row.viewportId,
            );
            continue;
          }
          const exists = this.storageService
            ? await this.storageService.exists(key)
            : false;
          if (!exists) {
            finding(
              'artifact-not-stored',
              `${where} 的 artifact ${key.slice(browser.artifactPrefix.length + 1)} 不在对象存储中`,
              row.scenarioId,
              row.viewportId,
            );
          } else {
            verifiedArtifactKeys.push(key);
          }
        }
      }

      for (const requirement of context.appSpec.coreRequirements) {
        if (requirement.source !== 'prompt') continue;
        const covered = context.appSpec.acceptanceScenarios.some(
          (scenario) =>
            scenario.scope === 'requirement' &&
            scenario.requirementIds.includes(requirement.id) &&
            passedInAllViewports.has(scenario.id),
        );
        if (covered) {
          verifiedRequirementIds.push(requirement.id);
        } else {
          finding(
            'requirement-not-verified',
            `需求 ${requirement.id} 没有在桌面与移动视口都通过的场景`,
          );
        }
      }
    }

    const verificationPlan: GeneratedAppIndependentVerificationPlanV2 = {
      executionLevel,
      verifiedRequirementIds,
      verifiedArtifactKeys,
      findings,
    };
    const evidence = [
      gateEvidence({
        id: 'gate-6-evidence-review',
        label: '证据复核',
        kind: 'verifier',
        summary: `已验证 ${verifiedRequirementIds.length} 条需求、${verifiedArtifactKeys.length} 个 artifact；阻断问题 ${findings.length} 个。`,
        details: { executed: true, ...verificationPlan },
      }),
    ];

    if (findings.length > 0) {
      return failedGate({
        summary: `Gate 6 失败：复核发现 ${findings.length} 个阻断问题。`,
        code: 'verifier-blocking-finding',
        message: findings.map((item) => item.message).join('；'),
        details: { findings },
        evidence,
        repairInstructions:
          '按 findings 修复页面或绑定的工作流（console error、失败请求、空结果、缺失 artifact），再重新运行生成。',
        plan: verificationPlan,
      });
    }

    return {
      status: 'passed',
      summary: `Gate 6 通过：${verifiedRequirementIds.length} 条需求在两个视口均通过，${verifiedArtifactKeys.length} 个 artifact 已在对象存储中确认。`,
      evidence,
      failure: null,
      repairInstructions: null,
      plan: verificationPlan,
    };
  }
}
