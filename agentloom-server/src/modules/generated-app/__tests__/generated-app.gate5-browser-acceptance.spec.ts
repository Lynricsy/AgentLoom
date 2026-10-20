import { describe, expect, it, vi } from 'vitest';

import type { GeneratedAppBrowserAcceptanceOutcome } from '../generated-app-browser-acceptance.dispatcher';
import { GeneratedAppGate5BrowserAcceptance } from '../generated-app.gate5-browser-acceptance';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import type {
  GeneratedAppBrowserAcceptanceResult,
  GeneratedAppBrowserScenarioResult,
} from '../types/browser-acceptance-job.schema';
import type { GeneratedAppGateContextV2 } from '../types/generation-v2.ports';
import {
  QA_WORKFLOW_ID,
  QA_WORKFLOW_VERSION_ID,
  qaAppSpecV2,
  qaWorkflowCandidate,
} from './app-spec-v2.fixtures';

const TENANT_ID = '01a15800-0000-7000-8000-0000000000a1';
const APP_ID = '01a15800-0000-7000-8000-0000000000b2';
const RUN_ID = '01a15800-0000-7000-8000-0000000000c3';
const JOB_ID = `gate5-${RUN_ID}`;
const ARTIFACT_PREFIX = `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${RUN_ID}/gate-5`;

function createContext(
  appSpec: GeneratedAppSpecV2 = qaAppSpecV2(),
  signal: AbortSignal = new AbortController().signal,
): GeneratedAppGateContextV2 {
  if (appSpec.binding.kind !== 'workflow') {
    throw new Error('qaAppSpecV2 绑定的是工作流');
  }
  return {
    tenantId: TENANT_ID,
    userId: '01a15800-0000-7000-8000-0000000000e5',
    appId: APP_ID,
    generationRunId: RUN_ID,
    appSpec,
    resolvedBinding: {
      kind: 'workflow',
      binding: appSpec.binding,
      candidate: qaWorkflowCandidate(),
    },
    previousGates: [],
    generationPlan: {
      planVersion: 2,
      generationRunId: RUN_ID,
      appSpecSha256: '0'.repeat(64),
      binding: {
        kind: 'workflow',
        workflowDefinitionId: QA_WORKFLOW_ID,
        workflowVersionId: QA_WORKFLOW_VERSION_ID,
      },
      coverage: {
        requirements: [],
        unassertedSectionIds: [],
        untouchedFieldIds: [],
      },
    },
    signal,
  };
}

function scenarioResult(
  viewportId: 'desktop' | 'mobile',
  overrides: Partial<GeneratedAppBrowserScenarioResult> = {},
): GeneratedAppBrowserScenarioResult {
  return {
    scenarioId: 'scenario-ask',
    viewportId,
    status: 'passed',
    durationMs: 4200,
    failure: null,
    submissionId: '01a15800-0000-7000-8000-0000000000d4',
    consoleErrors: [],
    failedRequests: [],
    resultTexts: { answer: '最多 10 个', citations: '宣传册 第 3 页' },
    artifacts: {
      screenshotKey: `${ARTIFACT_PREFIX}/scenario-ask/${viewportId}/screenshot.png`,
      traceKey: `${ARTIFACT_PREFIX}/scenario-ask/${viewportId}/trace.zip`,
    },
    ...overrides,
  };
}

function runnerResult(
  overrides: Partial<GeneratedAppBrowserAcceptanceResult> = {},
): GeneratedAppBrowserAcceptanceResult {
  return {
    jobVersion: 1,
    status: 'passed',
    runnerError: null,
    browser: { name: 'chromium', version: '156.0.8078.4' },
    playwrightVersion: '1.64.1',
    startedAt: '2026-10-20T04:00:00.000Z',
    completedAt: '2026-10-20T04:00:09.000Z',
    scenarios: [scenarioResult('desktop'), scenarioResult('mobile')],
    ...overrides,
  };
}

function createGate5(
  mode: string | undefined,
  outcome: GeneratedAppBrowserAcceptanceOutcome = {
    kind: 'completed',
    jobId: JOB_ID,
    result: runnerResult(),
  },
) {
  const dispatcher = { dispatch: vi.fn().mockResolvedValue(outcome) };
  const configService = {
    get: vi.fn((key: string) =>
      key === 'GENERATED_APP_GATE5_EXECUTOR_MODE' ? mode : undefined,
    ),
  };
  return {
    dispatcher,
    gate5: new GeneratedAppGate5BrowserAcceptance(
      dispatcher as never,
      configService as never,
    ),
  };
}

describe('GeneratedAppGate5BrowserAcceptance', () => {
  it.each([
    [undefined, 'real'],
    ['real', 'real'],
    [' Fixture ', 'fixture'],
    ['disabled', 'disabled'],
    // 旧别名不再识别，按 disabled 失败关闭
    ['real-browser-e2e', 'disabled'],
    ['playwright', 'disabled'],
  ])('GENERATED_APP_GATE5_EXECUTOR_MODE=%s → %s', (mode, level) => {
    expect(createGate5(mode).gate5.getExecutionLevel()).toBe(level);
  });

  it('real 模式把 requirement 场景的浏览器步骤按两个视口交给 runner，并透传运行截止信号', async () => {
    const { gate5, dispatcher } = createGate5(undefined);
    const controller = new AbortController();
    const context = createContext(qaAppSpecV2(), controller.signal);

    await gate5.run(context);

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        appId: APP_ID,
        generationRunId: RUN_ID,
        viewports: ['desktop', 'mobile'],
        // platform 场景没有浏览器步骤，不投递
        scenarios: [
          {
            scenarioId: 'scenario-ask',
            steps: context.appSpec.acceptanceScenarios[0].browserSteps,
          },
        ],
      },
      controller.signal,
    );
  });

  it('runner 全部场景 × 视口通过时 Gate 5 通过，计划带回原样结果与 jobId', async () => {
    const { gate5 } = createGate5('real');

    const evaluation = await gate5.run(createContext());

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failure).toBeNull();
    expect(evaluation.plan).toEqual({
      planVersion: 2,
      executionLevel: 'real',
      scenarioIds: ['scenario-ask'],
      viewports: ['desktop', 'mobile'],
      artifactPrefix: ARTIFACT_PREFIX,
      jobId: JOB_ID,
      result: runnerResult(),
    });
    expect(evaluation.evidence.map((item) => item.id)).toEqual([
      'gate-5-browser-acceptance',
      'gate-5-scenario-ask-desktop',
      'gate-5-scenario-ask-mobile',
    ]);
    expect(evaluation.evidence.every((item) => item.kind === 'browser')).toBe(
      true,
    );
  });

  it('没有在线 runner 时以 gate-5-browser-runner-unavailable 失败', async () => {
    const { gate5 } = createGate5('real', {
      kind: 'runner-unavailable',
      message: '队列没有在线的 browser-runner',
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('gate-5-browser-runner-unavailable');
    expect(evaluation.plan).toMatchObject({ jobId: null, result: null });
    expect(evaluation.repairInstructions).toContain(
      'generated-app-browser-runner',
    );
  });

  it('runner 处理失败也按 runner 不可用失败，并记下 jobId', async () => {
    const { gate5 } = createGate5('real', {
      kind: 'runner-failed',
      jobId: JOB_ID,
      message: 'browser-runner 处理 Gate 5 任务失败',
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.failure).toMatchObject({
      code: 'gate-5-browser-runner-unavailable',
      details: { reason: 'runner-failed', jobId: JOB_ID },
    });
    expect(evaluation.plan?.jobId).toBe(JOB_ID);
  });

  it('等待超时或运行截止时以 gate-5-browser-runner-timeout 失败', async () => {
    const { gate5 } = createGate5('real', {
      kind: 'runner-timeout',
      jobId: JOB_ID,
      message: '生成运行已到截止时间，Gate 5 等待被取消。',
      waitedMs: 1234,
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.failure).toMatchObject({
      code: 'gate-5-browser-runner-timeout',
      details: { waitedMs: 1234 },
    });
  });

  it.each([
    ['browser-launch-failed', 'gate-5-browser-launch-failed'],
    ['total-timeout', 'gate-5-browser-runner-timeout'],
    ['artifact-upload-failed', 'gate-5-scenario-failed'],
  ] as const)('runnerError=%s → %s', async (runnerErrorCode, failureCode) => {
    const { gate5 } = createGate5('real', {
      kind: 'completed',
      jobId: JOB_ID,
      result: runnerResult({
        status: 'failed',
        runnerError: { code: runnerErrorCode, message: 'runner 失败' },
        scenarios:
          runnerErrorCode === 'browser-launch-failed'
            ? []
            : runnerResult().scenarios,
      }),
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe(failureCode);
    // 失败时计划仍保存 runner 原样结果，供排查与 Gate 6
    expect(evaluation.plan?.result?.runnerError?.code).toBe(runnerErrorCode);
  });

  it('任一视口场景失败时以 gate-5-scenario-failed 失败，摘要指出场景、视口与步骤', async () => {
    const { gate5 } = createGate5('real', {
      kind: 'completed',
      jobId: JOB_ID,
      result: runnerResult({
        status: 'failed',
        scenarios: [
          scenarioResult('desktop'),
          scenarioResult('mobile', {
            status: 'failed',
            failure: {
              stepIndex: 2,
              kind: 'assertion-failed',
              message: '结果分区 answer 不包含「10」。',
            },
          }),
        ],
      }),
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.failure).toMatchObject({
      code: 'gate-5-scenario-failed',
      details: {
        failed: [
          {
            scenarioId: 'scenario-ask',
            viewportId: 'mobile',
            failure: { stepIndex: 2, kind: 'assertion-failed' },
          },
        ],
        missing: [],
      },
    });
    expect(evaluation.summary).toContain(
      'scenario-ask@mobile 第 2 步 assertion-failed',
    );
  });

  it('runner 声称通过但缺少某个场景 × 视口的结果时不能判通过', async () => {
    const { gate5 } = createGate5('real', {
      kind: 'completed',
      jobId: JOB_ID,
      result: runnerResult({ scenarios: [scenarioResult('desktop')] }),
    });

    const evaluation = await gate5.run(createContext());

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure).toMatchObject({
      code: 'gate-5-scenario-failed',
      details: {
        missing: [{ scenarioId: 'scenario-ask', viewportId: 'mobile' }],
      },
    });
  });

  it('disabled 模式不投递，以 runner 不可用失败', async () => {
    const { gate5, dispatcher } = createGate5('disabled');

    const evaluation = await gate5.run(createContext());

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure).toMatchObject({
      code: 'gate-5-browser-runner-unavailable',
      details: { executionLevel: 'disabled' },
    });
  });

  it('fixture 模式不投递、不产出 runner 结果，计划标 fixture 供 Gate 6 识别为非真实执行', async () => {
    const { gate5, dispatcher } = createGate5('fixture');

    const evaluation = await gate5.run(createContext());

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan).toMatchObject({
      executionLevel: 'fixture',
      jobId: null,
      result: null,
    });
    expect(evaluation.evidence[0].details).toMatchObject({ executed: false });
  });

  it('AppSpec 没有带浏览器步骤的 requirement 场景时不投递并失败', async () => {
    const { gate5, dispatcher } = createGate5('real');
    const appSpec = qaAppSpecV2();
    const withoutSteps: GeneratedAppSpecV2 = {
      ...appSpec,
      acceptanceScenarios: appSpec.acceptanceScenarios.map((scenario) => ({
        ...scenario,
        browserSteps: [],
      })),
    };

    const evaluation = await gate5.run(createContext(withoutSteps));

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(evaluation.failure?.code).toBe('gate-5-scenario-failed');
  });
});
