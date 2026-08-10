import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type {
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import {
  buildBuildUnitPlan,
  buildGenerationPlan,
  buildStaticContracts,
} from '../plan-builders/generation-plan.builder';
import { buildIntegrationPlan } from '../plan-builders/integration-plan.builder';
import { GeneratedAppGate3WorkspaceRunner } from '../generated-app.workspace';
import {
  buildBrowserAcceptancePlan,
  evaluateGate5BrowserAcceptancePlan,
} from '../plan-builders/browser-acceptance-plan.builder';
import {
  GeneratedAppGate5BrowserAcceptanceRunner,
  type GeneratedAppBrowserAcceptanceExecutionLevel,
} from '../generated-app.browser-acceptance-runner';

function createConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: (key: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }

      return undefined;
    },
  } as unknown as ConfigService;
}

function createAppSpec(
  overrides: Partial<GeneratedAppSpec> = {},
): GeneratedAppSpec {
  return {
    version: 1,
    appName: '自动化中医问诊系统',
    summary: '围绕问诊需求生成的业务应用。',
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
        title: '提交问诊输入',
        requirementIds: ['req-1'],
        given: ['终端用户打开公开运行页'],
        when: ['提交问诊输入'],
        then: ['系统保存提交并返回处理状态'],
      },
    ],
    traceability: [
      {
        requirementId: 'req-1',
        scenarioIds: ['scenario-1'],
        evidenceIds: ['app-spec-draft'],
      },
    ],
    ...overrides,
  };
}

function buildBuildUnitPlanForTest(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  gate3Runner: GeneratedAppGate3WorkspaceRunner,
  executionLevel = gate3Runner.getExecutionLevel(),
): GeneratedAppBuildUnitPlan {
  const workspace = gate3Runner.buildWorkspaceContract({
    tenantId: 'test-tenant',
    appId: 'test-app',
    generationRunId: 'test-run',
    appSpec,
    staticContracts,
  });
  const commandPlan = gate3Runner.buildCommandPlan({
    workspace,
    requirementIds: appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    ),
    scenarioIds: appSpec.acceptanceScenarios.map((scenario) => scenario.id),
  });

  return buildBuildUnitPlan(
    appSpec,
    generationPlan,
    staticContracts,
    workspace,
    commandPlan,
    executionLevel,
  );
}

function buildGate5Plans(
  executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
  appSpec: GeneratedAppSpec = createAppSpec(),
) {
  const gate3Runner = new GeneratedAppGate3WorkspaceRunner(
    createConfigService(),
  );
  const generationPlan = buildGenerationPlan(appSpec);
  const staticContracts = buildStaticContracts(appSpec, generationPlan);
  const buildUnitPlan = {
    ...buildBuildUnitPlanForTest(
      appSpec,
      generationPlan,
      staticContracts,
      gate3Runner,
    ),
    executionLevel: 'real-local-command-plan' as const,
  };
  const integrationPlan = buildIntegrationPlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    'real-local-integration',
  );
  const browserAcceptancePlan = buildBrowserAcceptancePlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    executionLevel,
  );

  return {
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
  };
}

describe('GeneratedAppGate5BrowserAcceptanceRunner', () => {
  it('real 模式应执行受控本地 browser contract 并保留断言、artifact、console/network 与覆盖引用', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans('real-local-browser-contract');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('real');
    expect(runner.getExecutionLevel()).toBe('real-local-browser-contract');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('real-local-browser-contract');
    expect(result.summary).toContain('real-local browser-contract runner');
    expect(result.summary).toContain('public build preview submit');
    expect(result.summary).toContain('未启动 Playwright');
    expect(result.summary).toContain('未打开真实浏览器');
    expect(result.summary).toContain('未捕获真实截图、视频或 Playwright trace');
    expect(result.assertionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assertionId: 'gate-5-console-no-unhandled-error',
          journeyId: 'gate-5-public-runtime-open',
          viewportId: 'viewport-desktop',
          status: 'passed',
          executed: true,
          artifactRefs: expect.arrayContaining([
            expect.objectContaining({
              artifactId: 'desktop-screenshot',
              path: 'artifacts/gate-5/screenshots/desktop.png',
              materialized: false,
            }),
            expect.objectContaining({
              artifactId: 'console-log',
              path: 'artifacts/gate-5/console.json',
              materialized: true,
            }),
          ]),
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
          staticContractIds: expect.arrayContaining([
            'gate-2-public-runtime-contract',
          ]),
          integrationTraceArtifactRefs: expect.arrayContaining([
            'public-runtime-api-trace',
            'creator-management-api-trace',
          ]),
        }),
        expect.objectContaining({
          assertionId: 'gate-5-network-public-forbids-creator-internal',
          journeyId: 'gate-5-public-runtime-submit',
          viewportId: 'viewport-mobile',
          status: 'passed',
          networkSummary: expect.stringContaining('"publicBoundarySafe":true'),
          boundary: 'public-runtime',
        }),
        expect.objectContaining({
          assertionId: 'gate-5-network-public-forbids-creator-internal',
          journeyId: 'gate-5-public-build-preview-submit',
          viewportId: 'viewport-mobile',
          status: 'passed',
          networkSummary: expect.stringContaining(
            'gate-4-public-runtime-submit-input',
          ),
          boundary: 'public-runtime',
        }),
        expect.objectContaining({
          assertionId: 'gate-5-responsive-content-not-occluded',
          journeyId: 'gate-5-creator-submission-review',
          viewportId: 'viewport-desktop',
          status: 'passed',
          boundary: 'creator-management',
        }),
      ]),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-browser-runner-contract',
          kind: 'browser',
          summary: expect.stringContaining('public build preview submit'),
          details: expect.objectContaining({
            runnerId: 'gate-5-real-browser-acceptance-runner',
            executionMode: 'real_local_browser_contract',
            serverControlled: true,
            allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
            forbiddenEndpointPatterns: expect.arrayContaining([
              '/generated-apps/{appId}',
              '/plugins',
              '/executions',
            ]),
            playwrightExecuted: false,
            realBrowserExecuted: false,
          }),
        }),
        expect.objectContaining({
          id: 'gate-5-gate-5-public-runtime-open-viewport-desktop-gate-5-console-no-unhandled-error',
          kind: 'browser',
          summary: expect.stringContaining('mode=real_local_browser_contract'),
          details: expect.objectContaining({
            runnerId: 'gate-5-real-browser-acceptance-runner',
            executionMode: 'real_local_browser_contract',
            executionLevel: 'real-local-browser-contract',
            assertionId: 'gate-5-console-no-unhandled-error',
            journeyId: 'gate-5-public-runtime-open',
            viewportId: 'viewport-desktop',
            status: 'passed',
            executed: true,
            playwrightExecuted: false,
            realBrowserExecuted: false,
            realScreenshotCaptured: false,
            realVideoCaptured: false,
            realTraceCaptured: false,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('/root/');
    expect(JSON.stringify(result)).not.toContain('publicShareToken');
  });

  it('real-browser-e2e 模式在 Playwright 不可用时应 fail-closed 并产出真实 E2E runner contract evidence', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService({
        GENERATED_APP_GATE5_EXECUTOR_MODE: 'real-browser-e2e',
        GENERATED_APP_GATE5_REAL_BROWSER_UNAVAILABLE_REASON:
          'Playwright browsers missing at /root/.cache/ms-playwright with sk-secret and publicShareToken=abc',
      }),
    );
    const plans = buildGate5Plans('real-browser-e2e');

    const result = runner.run(plans);
    const serialized = JSON.stringify(result);

    expect(runner.getExecutorMode()).toBe('real-browser-e2e');
    expect(runner.getExecutionLevel()).toBe('real-browser-e2e');
    expect(runner.getRealBrowserAvailability()).toEqual(
      expect.objectContaining({
        available: false,
        packageName: 'playwright',
        runnerCommand: 'agentloom generated-app gate-5 real-browser-e2e',
      }),
    );
    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-5-real-browser-e2e-unavailable',
        message: expect.stringContaining('不能用 fixture'),
      }),
    );
    expect(result.summary).toContain('未启动 Playwright/真实浏览器');
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-real-browser-e2e-unavailable',
          details: expect.objectContaining({
            runnerId: 'gate-5-real-browser-e2e-runner',
            executionMode: 'real_browser_e2e',
            executionLevel: 'real-browser-e2e',
            executed: false,
            playwrightExecuted: false,
            realBrowserExecuted: false,
            runnerContract: expect.objectContaining({
              requiredPublicJourneyKinds: expect.arrayContaining([
                'public_runtime_open',
                'public_runtime_interaction_submit',
                'public_build_preview_submit',
                'public_submission_result_detail',
              ]),
              allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
              forbiddenEndpointPatterns: expect.arrayContaining([
                '/generated-apps/{appId}',
                '/artifacts',
                '/plugins',
                '/workflow-definitions',
              ]),
              artifactPolicy: expect.objectContaining({
                root: 'generated-run',
                allowHostAbsolutePaths: false,
                allowCreatorApis: false,
                allowInternalArtifacts: false,
                redactSensitiveValues: true,
              }),
            }),
          }),
        }),
      ]),
    );
    expect(serialized).toContain('[redacted-host-path]');
    expect(serialized).toContain('[redacted-token]');
    expect(serialized).not.toContain('/root/.cache');
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('publicShareToken=abc');
  });

  it('real-browser-e2e 模式在 Playwright package 可用但适配层未实现时仍应 fail-closed', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService({
        GENERATED_APP_GATE5_EXECUTOR_MODE: 'real-browser-e2e',
      }),
    );
    const runnerWithInternals = runner as unknown as {
      resolveRealBrowserAvailability(): {
        available: boolean;
        reason: string | null;
        packageName: string;
        runnerCommand: string;
      };
    };
    const availabilitySpy = vi
      .spyOn(runnerWithInternals, 'resolveRealBrowserAvailability')
      .mockReturnValue({
        available: true,
        reason: null,
        packageName: 'playwright',
        runnerCommand: 'agentloom generated-app gate-5 real-browser-e2e',
      });

    const result = runner.run(buildGate5Plans('real-browser-e2e'));

    expect(availabilitySpy).toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-5-real-browser-e2e-not-implemented',
        details: expect.objectContaining({
          runnerId: 'gate-5-real-browser-e2e-runner',
          executionMode: 'real_browser_e2e',
          executionLevel: 'real-browser-e2e',
          executed: false,
          playwrightExecuted: false,
          realBrowserExecuted: false,
        }),
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-real-browser-e2e-not-implemented',
          details: expect.objectContaining({
            runnerId: 'gate-5-real-browser-e2e-runner',
            executed: false,
            playwrightExecuted: false,
            realBrowserExecuted: false,
            runnerContract: expect.objectContaining({
              allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
              forbiddenEndpointPatterns: expect.arrayContaining([
                '/generated-apps/{appId}',
                '/plugins',
                '/workflow-definitions',
              ]),
            }),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(
      'gate-5-real-browser-acceptance-runner',
    );
  });

  it('real-browser-e2e 模式应拒绝缺失服务端受控边界的计划且不退回 fixture/local evidence', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService({
        GENERATED_APP_GATE5_EXECUTOR_MODE: 'real-browser-e2e',
      }),
    );
    const plans = buildGate5Plans('real-browser-e2e');
    const unsafePlan: GeneratedAppBrowserAcceptancePlan = {
      ...plans.browserAcceptancePlan,
      browserToolPlan: {
        ...plans.browserAcceptancePlan.browserToolPlan,
        runner: 'local-browser-contract',
        command: 'agentloom generated-app gate-5 local-browser-contract',
        runnerMode: 'fixture',
        serverControlled: false,
        requiredEnvironment: [],
        allowedPublicEndpoints: ['/generated-apps/{appId}/submissions'],
        forbiddenEndpointPatterns: ['/internal'],
        artifactPolicy: {
          root: 'generated-run',
          allowHostAbsolutePaths: true,
          allowCreatorApis: true,
          allowInternalArtifacts: true,
          redactSensitiveValues: false,
        } as unknown as GeneratedAppBrowserAcceptancePlan['browserToolPlan']['artifactPolicy'],
      },
    };

    const result = runner.run({
      ...plans,
      browserAcceptancePlan: unsafePlan,
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('gate-5-browser-acceptance-plan-unsafe');
    expect(result.assertionResults).toEqual([]);
    expect(serialized).toContain('runner 必须声明 playwright');
    expect(serialized).toContain('runnerMode 必须为 real-browser-e2e');
    expect(serialized).toContain('serverControlled 必须为 true');
    expect(serialized).toContain(
      'requiredEnvironment 必须声明 GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
    );
    expect(serialized).toContain(
      'allowedPublicEndpoints 只能显式开放 /generated-apps/public/{token}',
    );
    expect(serialized).toContain(
      'artifactPolicy.allowCreatorApis 必须为 false',
    );
    expect(serialized).not.toContain(
      'gate-5-fixture-browser-acceptance-runner',
    );
    expect(serialized).not.toContain('gate-5-real-browser-acceptance-runner');
  });

  it('fixture 模式只能验证 evidence 形状，不能伪装为真实浏览器执行', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService({
        GENERATED_APP_GATE5_EXECUTOR_MODE: 'fixture',
      }),
    );
    const plans = buildGate5Plans('fixture-browser-acceptance');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('fixture');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('fixture-browser-acceptance');
    expect(result.summary).toContain('executed=false');
    expect(result.summary).toContain('未执行真实浏览器');
    expect(
      result.assertionResults.every((assertion) => !assertion.executed),
    ).toBe(true);
    expect(
      result.assertionResults.every((assertion) =>
        assertion.artifactRefs.every((artifact) => !artifact.materialized),
      ),
    ).toBe(true);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            runnerId: 'gate-5-fixture-browser-acceptance-runner',
            executionMode: 'fixture',
            executionLevel: 'fixture-browser-acceptance',
            executed: false,
            realBrowserExecuted: false,
          }),
        }),
      ]),
    );
  });

  it('disabled 模式应失败并明确停止 Gate 6-7', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService({
        APP_GENERATED_APP_GATE5_EXECUTOR_MODE: 'disabled',
      }),
    );
    const plans = buildGate5Plans('disabled-browser-acceptance');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('disabled');
    expect(result.status).toBe('failed');
    expect(result.executionLevel).toBe('disabled-browser-acceptance');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-5-executor-disabled',
        message: expect.stringContaining('不能继续执行 Gate 6-7'),
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-5-executor-disabled',
          details: expect.objectContaining({
            runnerId: 'gate-5-disabled-browser-acceptance-runner',
            executed: false,
            realBrowserExecuted: false,
          }),
        }),
      ]),
    );
  });

  it('real 模式应拒绝 host absolute、Windows drive 与 traversal artifact path', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans('real-local-browser-contract');
    const unsafePlan: GeneratedAppBrowserAcceptancePlan = {
      ...plans.browserAcceptancePlan,
      artifactExpectations:
        plans.browserAcceptancePlan.artifactExpectations.map(
          (artifact, index) =>
            index === 0
              ? { ...artifact, path: '/root/generated-app/desktop.png' }
              : index === 1
                ? { ...artifact, path: 'C:\\temp\\mobile.png' }
                : index === 2
                  ? { ...artifact, path: 'artifacts/gate-5/../trace.zip' }
                  : artifact,
        ),
    };

    const result = runner.run({
      ...plans,
      browserAcceptancePlan: unsafePlan,
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('gate-5-browser-acceptance-plan-unsafe');
    expect(serialized).toContain('[redacted-host-absolute-path]');
    expect(serialized).toContain('[redacted-unsafe-relative-path]');
    expect(serialized).not.toContain('/root/generated-app');
    expect(serialized).not.toContain('C:\\temp');
  });

  it('real 模式应拒绝 public journey 串入 creator/internal endpoint boundary', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans('real-local-browser-contract');
    const unsafeIntegrationPlan: GeneratedAppIntegrationPlan = {
      ...plans.integrationPlan,
      publicRuntimeApiChecks: plans.integrationPlan.publicRuntimeApiChecks.map(
        (check, index) =>
          index === 0
            ? {
                ...check,
                pathTemplate: '/generated-apps/{appId}/generation-runs',
              }
            : check,
      ),
    };

    const result = runner.run({
      ...plans,
      integrationPlan: unsafeIntegrationPlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('gate-5-browser-acceptance-plan-unsafe');
    expect(result.failure?.details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining('public token runtime surface'),
          expect.stringContaining('creator/internal endpoint boundary'),
        ]),
      }),
    );
  });

  it('real 模式不应把截图、视频或 Playwright trace artifact 伪造成已物化产物', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans('real-local-browser-contract');

    const result = runner.run(plans);

    expect(result.status).toBe('passed');
    expect(
      result.assertionResults.flatMap((assertion) =>
        assertion.artifactRefs.filter((artifact) =>
          ['screenshot', 'video', 'playwright_trace'].includes(artifact.kind),
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ materialized: false }),
      ]),
    );
    expect(
      result.assertionResults
        .flatMap((assertion) => assertion.artifactRefs)
        .filter((artifact) =>
          ['screenshot', 'video', 'playwright_trace'].includes(artifact.kind),
        )
        .every((artifact) => !artifact.materialized),
    ).toBe(true);
    expect(JSON.stringify(result)).toContain('"realScreenshotCaptured":false');
    expect(JSON.stringify(result)).toContain('"realVideoCaptured":false');
    expect(JSON.stringify(result)).toContain('"realTraceCaptured":false');
  });

  it('real 模式应拒绝藏在 plan 字符串中间的 token、宿主路径和 traversal 片段', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans('real-local-browser-contract');
    const unsafePlan: GeneratedAppBrowserAcceptancePlan = {
      ...plans.browserAcceptancePlan,
      browserToolPlan: {
        ...plans.browserAcceptancePlan.browserToolPlan,
        publicShareAccessPlaceholder:
          'fixture placeholder Bearer secret-token /home/generated-app/secret ../private',
      },
    };

    const result = runner.run({
      ...plans,
      browserAcceptancePlan: unsafePlan,
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('gate-5-browser-acceptance-plan-unsafe');
    expect(serialized).toContain(
      'browserToolPlan.publicShareAccessPlaceholder',
    );
    expect(serialized).not.toContain('Bearer secret-token');
    expect(serialized).not.toContain('/home/generated-app/secret');
    expect(serialized).not.toContain('../private');
  });

  it('real 模式写入 console/network summary 前应脱敏 token 与宿主路径', () => {
    const runner = new GeneratedAppGate5BrowserAcceptanceRunner(
      createConfigService(),
    );
    const plans = buildGate5Plans(
      'real-local-browser-contract',
      createAppSpec({
        appName:
          '自动化问诊 sk-testtoken /root/generated-app/private /home/generated-app/private',
      }),
    );

    const result = runner.run(plans);
    const serialized = JSON.stringify(result);

    expect(result.status).toBe('passed');
    expect(serialized).toContain('[redacted-token]');
    expect(serialized).toContain('[redacted-host-path]');
    expect(serialized).not.toContain('sk-testtoken');
    expect(serialized).not.toContain('/root/generated-app/private');
    expect(serialized).not.toContain('/home/generated-app/private');
  });
  it.each([
    'browser-acceptance-skeleton',
    'fixture-browser-acceptance',
    'real-local-browser-contract',
    'real-browser-e2e',
  ] as const)('builder 应接受 %s execution level 的完整计划', (level) => {
    const plans = buildGate5Plans(level);
    const evaluation = evaluateGate5BrowserAcceptancePlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      plans.browserAcceptancePlan,
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failure).toBeNull();
    expect(evaluation.summary).toContain(
      level === 'real-browser-e2e'
        ? 'real-browser-e2e'
        : level === 'real-local-browser-contract'
          ? 'real-local'
          : 'skeleton/fixture',
    );
  });
  it.each([
    {
      name: '非对象计划',
      mutate: () => 'malformed',
      issue: 'browserAcceptancePlan 不是对象',
    },
    {
      name: '重复 viewport id',
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        viewportMatrix: [...plan.viewportMatrix, plan.viewportMatrix[0]],
      }),
      issue: '重复',
    },
    {
      name: '未知 public journey id',
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        publicRuntimeJourneys: plan.publicRuntimeJourneys.map(
          (journey, index) =>
            index === 0
              ? { ...journey, journeyId: 'gate-5-unknown-journey' }
              : journey,
        ),
      }),
      issue: 'gate-5-unknown-journey',
    },
    {
      name: '缺少 artifacts',
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        artifactExpectations: [],
      }),
      issue: 'artifactExpectations',
    },
    {
      name: '缺少 runner contract',
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        browserToolPlan: null,
      }),
      issue: 'browserToolPlan',
    },
    {
      name: '非法 execution level',
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        executionLevel: 'production-browser',
      }),
      issue: 'executionLevel',
    },
  ])('builder 应聚合$name缺口并阻止 runner', ({ mutate, issue }) => {
    const plans = buildGate5Plans('real-local-browser-contract');
    const evaluation = evaluateGate5BrowserAcceptancePlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      mutate(plans.browserAcceptancePlan),
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('browser-acceptance-plan-incomplete');
    expect(
      evaluation.evidence.some((item) => item.summary.includes(issue)),
    ).toBe(true);
    expect(evaluation.summary).toContain('不会执行 Gate 5 runner');
  });
  it.each([
    {
      name: '版本和免责声明字段',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        planVersion: 2,
        appSpecVersion: 2,
        generationPlanVersion: 2,
        staticContractsVersion: 2,
        buildUnitPlanVersion: 2,
        integrationPlanVersion: 2,
        skeletonDisclaimer: '',
      }),
      issues: [
        'planVersion 必须为 1',
        'appSpecVersion=2',
        'generationPlanVersion=2',
        'staticContractsVersion=2',
        'buildUnitPlanVersion=2',
        'integrationPlanVersion=2',
        'skeletonDisclaimer 缺失',
      ],
    },
    {
      name: '真实浏览器环境和 artifact policy',
      level: 'real-browser-e2e' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        browserToolPlan: {
          ...plan.browserToolPlan,
          serverControlled: false,
          requiredEnvironment: [],
          allowedPublicEndpoints: [],
          forbiddenEndpointPatterns: [],
          artifactPolicy: {
            root: 'host-output',
            allowHostAbsolutePaths: true,
            allowCreatorApis: true,
            allowInternalArtifacts: true,
            redactSensitiveValues: false,
          },
        },
      }),
      issues: [
        'serverControlled 必须为 true',
        'requiredEnvironment 缺少 GENERATED_APP_GATE5_EXECUTOR_MODE',
        'allowedPublicEndpoints 必须只开放',
        'forbiddenEndpointPatterns 缺少 /internal',
        'artifactPolicy.root 必须为 generated-run',
        'allowHostAbsolutePaths 必须为 false',
        'allowCreatorApis 必须为 false',
        'allowInternalArtifacts 必须为 false',
        'redactSensitiveValues 必须为 true',
      ],
    },
    {
      name: 'viewport 可选字段和尺寸',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        viewportMatrix: [
          {
            viewportId: '',
            category: 'watch',
            deviceLabel: '',
            width: 0,
            height: -1,
            scenarioIds: [],
            requirementIds: [],
          },
        ],
      }),
      issues: [
        'viewportId 缺失',
        'category 必须为 desktop 或 mobile',
        'deviceLabel 缺失',
        'width 必须为正数',
        'height 必须为正数',
        'scenarioIds 缺少 scenario-1',
        'requirementIds 缺少 req-1',
      ],
    },
    {
      name: '公开和创建者 journey 可选字段',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        publicRuntimeJourneys: [
          {
            ...plan.publicRuntimeJourneys[0],
            journeyId: '',
            kind: '',
            title: '',
            steps: [],
            publicRuntimeApiCheckIds: [],
            staticContractIds: [],
          },
        ],
        creatorManagementJourneys: [
          {
            ...plan.creatorManagementJourneys[0],
            journeyId: '',
            kind: '',
            title: '',
            steps: [],
            viewportIds: [],
            creatorManagementApiCheckIds: [],
            staticContractIds: [],
          },
        ],
      }),
      issues: [
        'publicRuntimeJourneys[0].journeyId 缺失',
        'publicRuntimeJourneys[0].kind 缺失',
        'publicRuntimeJourneys[0].title 缺失',
        'publicRuntimeJourneys[0].steps 不能为空',
        'publicRuntimeJourneys[0].publicRuntimeApiCheckIds 不能为空',
        'publicRuntimeJourneys[0].staticContractIds 不能为空',
        'creatorManagementJourneys[0].journeyId 缺失',
        'creatorManagementJourneys[0].kind 缺失',
        'creatorManagementJourneys[0].title 缺失',
        'creatorManagementJourneys[0].steps 不能为空',
        'creatorManagementJourneys[0].viewportIds 不能为空',
        'creatorManagementJourneys[0].creatorManagementApiCheckIds 不能为空',
        'creatorManagementJourneys[0].staticContractIds 不能为空',
      ],
    },
    {
      name: 'assertion selector 和 fallback policy',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        consoleAssertions: plan.consoleAssertions.map((assertion) =>
          assertion.assertionId === 'gate-5-console-allowed-warning-policy'
            ? {
                ...assertion,
                journeyIds: [],
                viewportIds: [],
                emptyAllowedWarningsReason: '',
              }
            : assertion,
        ),
        networkAssertions: plan.networkAssertions.map((assertion) =>
          assertion.assertionId === 'gate-5-network-core-requests-2xx'
            ? {
                ...assertion,
                expectedStatusRange: '5xx',
                apiCheckIds: [],
                staticContractIds: [],
              }
            : assertion.assertionId ===
                'gate-5-network-public-forbids-creator-internal'
              ? {
                  ...assertion,
                  journeyIds: ['gate-5-creator-gate-run-review'],
                  apiCheckIds: ['gate-4-creator-gate-run-query'],
                  forbiddenEndpointPatterns: [],
                }
              : assertion,
        ),
        responsiveLayoutAssertions: plan.responsiveLayoutAssertions.map(
          (assertion) =>
            assertion.assertionId === 'gate-5-responsive-desktop-no-overflow'
              ? { ...assertion, viewportIds: [] }
              : assertion.assertionId === 'gate-5-responsive-mobile-no-overflow'
                ? { ...assertion, viewportIds: [] }
                : assertion.assertionId ===
                    'gate-5-responsive-content-not-occluded'
                  ? { ...assertion, viewportIds: ['viewport-desktop'] }
                  : assertion,
        ),
      }),
      issues: [
        'journeyIds 不能为空',
        'viewportIds 不能为空',
        'emptyAllowedWarningsReason 缺失',
        'expectedStatusRange 必须为 2xx',
        'apiCheckIds 不能为空',
        'staticContractIds 不能为空',
        '只能引用公开 runtime journey',
        '只能引用 Gate 4 public runtime API check',
        'forbiddenEndpointPatterns 不能为空',
        'viewportIds 必须包含 viewport-desktop',
        'viewportIds 必须包含 viewport-mobile',
        'viewportIds 缺少 viewport-mobile',
      ],
    },
    {
      name: 'artifact evidence 可选引用',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        artifactExpectations: [
          {
            ...plan.artifactExpectations[0],
            artifactId: '',
            kind: '',
            path: '',
            required: false,
            producedByJourneyIds: [],
            producedByAssertionIds: [],
            referencesGate4TraceArtifactIds: [],
          },
        ],
      }),
      issues: [
        'artifactId 缺失',
        'kind 缺失',
        'path 缺失',
        'path 必须位于 artifacts/gate-5/',
        'required 必须为 true',
        'producedByJourneyIds 不能为空',
        'producedByAssertionIds 不能为空',
        'referencesGate4TraceArtifactIds 不能为空',
      ],
    },
    {
      name: 'scenario requirement journey evidence coverage fallback',
      level: 'real-local-browser-contract' as const,
      mutate: (plan: GeneratedAppBrowserAcceptancePlan) => ({
        ...plan,
        acceptanceScenarioCoverage: [
          {
            scenarioId: '',
            requirementIds: [],
            journeyIds: [],
            viewportIds: [],
            assertionIds: [],
            artifactIds: [],
          },
        ],
        requirementCoverage: [
          {
            requirementId: '',
            scenarioIds: [],
            journeyIds: [],
            assertionIds: [],
            artifactIds: [],
            staticContractIds: [],
            gate4ApiCheckIds: [],
          },
        ],
        journeyCoverage: [
          {
            journeyId: '',
            kind: '',
            scenarioIds: [],
            requirementIds: [],
            viewportIds: [],
            assertionIds: [],
            artifactIds: [],
          },
        ],
        failureCaptureFields: [],
      }),
      issues: [
        'scenarioId 缺失',
        '场景 scenario-1 缺少 Gate 5 覆盖声明',
        'requirementId 缺失',
        '需求 req-1 缺少 Gate 5 覆盖声明',
        'journeyId 缺失',
        'kind 缺失',
        '缺少 Gate 5 覆盖声明',
        'failureCaptureFields 缺少 journeyId',
      ],
    },
  ])('builder 应报告 $name 的真实合约缺口', ({ level, mutate, issues }) => {
    const plans = buildGate5Plans(level);
    const evaluation = evaluateGate5BrowserAcceptancePlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      mutate(plans.browserAcceptancePlan),
    );
    const summaries = evaluation.evidence
      .map((item) => item.summary)
      .join('\n');

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('browser-acceptance-plan-incomplete');
    for (const issue of issues) {
      expect(summaries).toContain(issue);
    }
  });
});
