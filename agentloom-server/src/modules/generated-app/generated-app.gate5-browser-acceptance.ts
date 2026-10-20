import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.schema';
import {
  buildGate5ArtifactPrefix,
  GeneratedAppBrowserAcceptanceDispatcher,
  type GeneratedAppBrowserAcceptanceOutcome,
} from './generated-app-browser-acceptance.dispatcher';
import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
} from './types/generated-app.types';
import { GENERATED_APP_SPEC_LIMITS } from './types/app-spec-v2.schema';
import type {
  GeneratedAppBrowserAcceptanceJob,
  GeneratedAppBrowserAcceptanceResult,
  GeneratedAppBrowserViewportId,
} from './types/browser-acceptance-job.schema';
import type {
  GeneratedAppBrowserAcceptancePlanV2,
  GeneratedAppGateExecutionLevel,
} from './types/generation-plan-v2.types';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
} from './types/generation-v2.ports';

/** ADR-0007 Gate 5 失败码 */
export const GENERATED_APP_GATE5_FAILURE_CODES = [
  'gate-5-browser-runner-unavailable',
  'gate-5-browser-runner-timeout',
  'gate-5-browser-launch-failed',
  'gate-5-scenario-failed',
] as const;

export type GeneratedAppGate5FailureCode =
  (typeof GENERATED_APP_GATE5_FAILURE_CODES)[number];

type Gate5Evaluation =
  GeneratedAppGateEvaluationV2<GeneratedAppBrowserAcceptancePlanV2>;

const GATE_5_VIEWPORTS: GeneratedAppBrowserViewportId[] = ['desktop', 'mobile'];

const REPAIR_INSTRUCTIONS: Record<GeneratedAppGate5FailureCode, string> = {
  'gate-5-browser-runner-unavailable':
    '启动 generated-app-browser-runner 服务（Compose 服务 generated-app-browser-runner / Helm browserRunner.enabled），确认它与 worker 连接同一个 Redis 后重新运行生成。',
  'gate-5-browser-runner-timeout':
    '检查 browser-runner 日志与被绑定工作流/Agent 的执行耗时；必要时调大 APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS / APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS 后重新运行生成。',
  'gate-5-browser-launch-failed':
    'browser-runner 无法启动 Chromium：确认使用 server 镜像的 browser-runner 构建目标、shm_size 不小于 1gb、/tmp 可写，然后重新运行生成。',
  'gate-5-scenario-failed':
    '查看失败场景的步骤序号、失败类型与截图/trace：字段或分区找不到说明 AppSpec 与公开页不一致；提交被拒或执行失败说明绑定的工作流/Agent 不接受该输入；断言失败说明结果不满足需求。修正后重新生成 AppSpec 或修复绑定目标。',
};

/**
 * v2 Gate 5 浏览器验收（ADR-0007 §4、§6）：从 AppSpec 的 requirement 场景取浏览器步骤，
 * 交给 browser-runner 在桌面与移动两个视口真实执行。任何模式都不会在未启动浏览器时判通过，
 * fixture 除外——它的计划 executionLevel 为 fixture，Gate 6 不把它当作真实证据。
 * 只在 worker 进程运行；调用方不得持有数据库事务。
 */
@Injectable()
export class GeneratedAppGate5BrowserAcceptance {
  constructor(
    private readonly dispatcher: GeneratedAppBrowserAcceptanceDispatcher,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /** 取自 GENERATED_APP_GATE5_EXECUTOR_MODE：未设置为 real，无法识别的值按 disabled 处理（失败关闭） */
  getExecutionLevel(): GeneratedAppGateExecutionLevel {
    const raw = this.configService.get('GENERATED_APP_GATE5_EXECUTOR_MODE', {
      infer: true,
    });
    if (raw === undefined) {
      return 'real';
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === 'real' || normalized === 'fixture'
      ? normalized
      : 'disabled';
  }

  async run(context: GeneratedAppGateContextV2): Promise<Gate5Evaluation> {
    const executionLevel = this.getExecutionLevel();
    const scenarios: GeneratedAppBrowserAcceptanceJob['scenarios'] =
      context.appSpec.acceptanceScenarios
        .filter(
          (scenario) =>
            scenario.scope === 'requirement' &&
            scenario.browserSteps.length >= 2,
        )
        .slice(0, GENERATED_APP_SPEC_LIMITS.browserScenariosMax)
        .map((scenario) => ({
          scenarioId: scenario.id,
          steps: scenario.browserSteps,
        }));
    const plan: GeneratedAppBrowserAcceptancePlanV2 = {
      planVersion: 2,
      executionLevel,
      scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
      viewports: GATE_5_VIEWPORTS,
      artifactPrefix: buildGate5ArtifactPrefix(
        context.tenantId,
        context.appId,
        context.generationRunId,
      ),
      jobId: null,
      result: null,
    };

    if (executionLevel === 'disabled') {
      return this.fail(plan, 'gate-5-browser-runner-unavailable', {
        summary:
          'Gate 5 失败：浏览器验收执行器被配置为 disabled（GENERATED_APP_GATE5_EXECUTOR_MODE），未打开浏览器。',
        message: '浏览器验收执行器被禁用，Gate 5 未执行。',
        details: { executionLevel },
      });
    }
    if (scenarios.length === 0) {
      return this.fail(plan, 'gate-5-scenario-failed', {
        summary:
          'Gate 5 失败：AppSpec 没有带浏览器步骤的 requirement 验收场景，无从执行浏览器验收。',
        message: 'AppSpec 没有可执行的浏览器验收场景。',
        details: { executionLevel },
      });
    }
    if (executionLevel === 'fixture') {
      return {
        status: 'passed',
        summary: `Gate 5 通过（fixture）：未打开浏览器，仅按计划登记 ${scenarios.length} 个场景 × ${GATE_5_VIEWPORTS.length} 个视口；不是真实浏览器验收证据。`,
        evidence: [
          this.evidence(
            'gate-5-browser-acceptance',
            'Gate 5 浏览器验收（fixture）',
            {
              summary:
                'executionLevel=fixture：未启动 Playwright，未打开公开页，没有截图与 trace。',
              details: { executionLevel, executed: false, plan },
            },
          ),
        ],
        failure: null,
        repairInstructions: null,
        plan,
      };
    }

    const outcome = await this.dispatcher.dispatch(
      {
        tenantId: context.tenantId,
        appId: context.appId,
        generationRunId: context.generationRunId,
        viewports: GATE_5_VIEWPORTS,
        scenarios,
      },
      context.signal,
    );
    return this.evaluateOutcome(plan, outcome);
  }

  private evaluateOutcome(
    basePlan: GeneratedAppBrowserAcceptancePlanV2,
    outcome: GeneratedAppBrowserAcceptanceOutcome,
  ): Gate5Evaluation {
    if (outcome.kind === 'runner-unavailable') {
      return this.fail(basePlan, 'gate-5-browser-runner-unavailable', {
        summary: `Gate 5 失败：${outcome.message}`,
        message: outcome.message,
        details: {
          executionLevel: basePlan.executionLevel,
          reason: outcome.kind,
        },
      });
    }
    const plan = { ...basePlan, jobId: outcome.jobId };
    switch (outcome.kind) {
      case 'runner-failed':
        return this.fail(plan, 'gate-5-browser-runner-unavailable', {
          summary: `Gate 5 失败：${outcome.message}`,
          message: outcome.message,
          details: {
            executionLevel: plan.executionLevel,
            reason: outcome.kind,
            jobId: outcome.jobId,
          },
        });
      case 'runner-timeout':
        return this.fail(plan, 'gate-5-browser-runner-timeout', {
          summary: `Gate 5 失败：${outcome.message}`,
          message: outcome.message,
          details: {
            executionLevel: plan.executionLevel,
            jobId: outcome.jobId,
            waitedMs: outcome.waitedMs,
          },
        });
      case 'completed':
        return this.evaluateResult(
          { ...plan, result: outcome.result },
          outcome.result,
        );
    }
  }

  private evaluateResult(
    plan: GeneratedAppBrowserAcceptancePlanV2,
    result: GeneratedAppBrowserAcceptanceResult,
  ): Gate5Evaluation {
    const scenarioEvidence = result.scenarios.map((scenario) =>
      this.evidence(
        `gate-5-${scenario.scenarioId}-${scenario.viewportId}`,
        `${scenario.scenarioId} · ${scenario.viewportId}`,
        {
          summary:
            scenario.status === 'passed'
              ? `通过，用时 ${scenario.durationMs}ms。`
              : `失败于第 ${scenario.failure?.stepIndex ?? 0} 步（${scenario.failure?.kind ?? 'unknown'}）：${scenario.failure?.message ?? ''}`,
          details: scenario,
        },
      ),
    );
    const summaryEvidence = this.evidence(
      'gate-5-browser-acceptance',
      'Gate 5 浏览器验收',
      {
        summary: `Playwright ${result.playwrightVersion} / Chromium ${result.browser.version}：${result.scenarios.filter((scenario) => scenario.status === 'passed').length}/${plan.scenarioIds.length * plan.viewports.length} 个场景 × 视口通过。`,
        details: {
          executionLevel: plan.executionLevel,
          executed: true,
          status: result.status,
          runnerError: result.runnerError,
          browser: result.browser,
          playwrightVersion: result.playwrightVersion,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          artifactPrefix: plan.artifactPrefix,
        },
      },
    );
    const evidence = [summaryEvidence, ...scenarioEvidence];

    if (result.runnerError?.code === 'browser-launch-failed') {
      return this.fail(plan, 'gate-5-browser-launch-failed', {
        summary: `Gate 5 失败：${result.runnerError.message}`,
        message: result.runnerError.message,
        details: { runnerError: result.runnerError },
        evidence,
      });
    }
    if (result.runnerError?.code === 'total-timeout') {
      return this.fail(plan, 'gate-5-browser-runner-timeout', {
        summary: `Gate 5 失败：${result.runnerError.message}`,
        message: result.runnerError.message,
        details: { runnerError: result.runnerError },
        evidence,
      });
    }

    // runner 是另一个进程：逐个核对请求的场景 × 视口都有结果，缺一个都不能判通过
    const missing = plan.scenarioIds.flatMap((scenarioId) =>
      plan.viewports
        .filter(
          (viewportId) =>
            !result.scenarios.some(
              (scenario) =>
                scenario.scenarioId === scenarioId &&
                scenario.viewportId === viewportId,
            ),
        )
        .map((viewportId) => ({ scenarioId, viewportId })),
    );
    const failed = result.scenarios
      .filter((scenario) => scenario.status === 'failed')
      .map((scenario) => ({
        scenarioId: scenario.scenarioId,
        viewportId: scenario.viewportId,
        failure: scenario.failure,
      }));

    if (
      result.status !== 'passed' ||
      result.runnerError !== null ||
      missing.length > 0 ||
      failed.length > 0
    ) {
      const reasons = [
        ...failed.map(
          (item) =>
            `${item.scenarioId}@${item.viewportId} 第 ${item.failure?.stepIndex ?? 0} 步 ${item.failure?.kind ?? 'unknown'}`,
        ),
        ...missing.map(
          (item) => `${item.scenarioId}@${item.viewportId} 没有执行结果`,
        ),
        ...(result.runnerError ? [result.runnerError.message] : []),
      ];
      return this.fail(plan, 'gate-5-scenario-failed', {
        summary: `Gate 5 失败：${reasons.slice(0, 5).join('；')}${reasons.length > 5 ? ` 等 ${reasons.length} 项` : ''}。`,
        message: '浏览器验收场景未全部通过。',
        details: { failed, missing, runnerError: result.runnerError },
        evidence,
      });
    }

    return {
      status: 'passed',
      summary: `Gate 5 通过：${plan.scenarioIds.length} 个场景在桌面与移动视口中真实执行全部通过（Playwright ${result.playwrightVersion} / Chromium ${result.browser.version}）。`,
      evidence,
      failure: null,
      repairInstructions: null,
      plan,
    };
  }

  private fail(
    plan: GeneratedAppBrowserAcceptancePlanV2,
    code: GeneratedAppGate5FailureCode,
    params: {
      summary: string;
      message: string;
      details: Record<string, unknown>;
      evidence?: GeneratedAppGateEvidence[];
    },
  ): Gate5Evaluation {
    const failure: GeneratedAppGateRunFailure = {
      code,
      message: params.message,
      details: params.details,
    };
    return {
      status: 'failed',
      summary: params.summary,
      evidence: params.evidence ?? [
        this.evidence('gate-5-browser-acceptance', 'Gate 5 浏览器验收', {
          summary: params.summary,
          details: {
            ...params.details,
            executionLevel: plan.executionLevel,
            executed: false,
          },
        }),
      ],
      failure,
      repairInstructions: REPAIR_INSTRUCTIONS[code],
      plan,
    };
  }

  private evidence(
    id: string,
    label: string,
    params: { summary: string; details: unknown },
  ): GeneratedAppGateEvidence {
    return {
      id,
      label,
      kind: 'browser',
      url: null,
      summary: params.summary,
      details: params.details,
    };
  }
}
