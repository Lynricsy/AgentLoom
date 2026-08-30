import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';

export type GeneratedAppGate5ExecutorMode =
  'real' | 'real-browser-e2e' | 'fixture' | 'disabled';

export type GeneratedAppBrowserAcceptanceExecutionLevel =
  GeneratedAppBrowserAcceptancePlan['executionLevel'];

export interface GeneratedAppGate5ArtifactRef {
  artifactId: string;
  kind: string;
  path: string;
  required: boolean;
  materialized: boolean;
}

export interface GeneratedAppGate5AssertionResult {
  assertionId: string;
  journeyId: string;
  viewportId: string;
  status: 'passed' | 'failed';
  durationMs: number;
  executed: boolean;
  artifactRefs: GeneratedAppGate5ArtifactRef[];
  consoleSummary: string;
  networkSummary: string;
  requirementIds: string[];
  scenarioIds: string[];
  staticContractIds: string[];
  integrationTraceArtifactRefs: string[];
  boundary: 'public-runtime' | 'creator-management';
}

export interface GeneratedAppGate5RunnerResult {
  status: 'passed' | 'failed';
  executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  assertionResults: GeneratedAppGate5AssertionResult[];
}

export interface GeneratedAppGate5RealBrowserAvailability {
  available: boolean;
  reason: string | null;
  packageName: string;
  runnerCommand: string;
}

interface Gate5RunParams {
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedAppGenerationPlan;
  staticContracts: GeneratedAppStaticContracts;
  buildUnitPlan: GeneratedAppBuildUnitPlan;
  integrationPlan: GeneratedAppIntegrationPlan;
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan;
}

type BrowserJourney =
  | (GeneratedAppBrowserAcceptancePlan['publicRuntimeJourneys'][number] & {
      boundary: 'public-runtime';
      apiCheckIds: string[];
    })
  | (GeneratedAppBrowserAcceptancePlan['creatorManagementJourneys'][number] & {
      boundary: 'creator-management';
      apiCheckIds: string[];
    });

type BrowserAssertion =
  | (GeneratedAppBrowserAcceptancePlan['consoleAssertions'][number] & {
      assertionGroup: 'console';
    })
  | (GeneratedAppBrowserAcceptancePlan['networkAssertions'][number] & {
      assertionGroup: 'network';
      viewportIds?: string[];
    })
  | (GeneratedAppBrowserAcceptancePlan['accessibilityInteractionAssertions'][number] & {
      assertionGroup: 'accessibility';
      apiCheckIds?: string[];
    })
  | (GeneratedAppBrowserAcceptancePlan['responsiveLayoutAssertions'][number] & {
      assertionGroup: 'responsive';
      apiCheckIds?: string[];
    });

const GATE_5_RUNNER_IDS = {
  real: 'gate-5-real-browser-acceptance-runner',
  realBrowserE2e: 'gate-5-real-browser-e2e-runner',
  fixture: 'gate-5-fixture-browser-acceptance-runner',
  disabled: 'gate-5-disabled-browser-acceptance-runner',
} as const;

const REAL_LOCAL_BROWSER_CONTRACT_NOTE =
  'real-local-browser-contract 使用服务端受控 deterministic DOM/accessibility/network/console contract runner；未启动 Playwright，未打开真实浏览器，未访问真实公开链接，也未捕获真实截图、视频或 Playwright trace。';

const REAL_BROWSER_E2E_NOTE =
  'real-browser-e2e 是服务端受控真实浏览器 E2E runner contract，只允许访问 public runtime/preview token surface；不得访问 creator APIs、内部 artifacts、真实 public token 以外的 secret、host absolute path、plugin ids、workflow snapshots、step/checkpoint/raw tool data。';

const REAL_BROWSER_E2E_COMMAND =
  'agentloom generated-app gate-5 real-browser-e2e';

@Injectable()
export class GeneratedAppGate5BrowserAcceptanceRunner {
  constructor(private readonly configService: ConfigService) {}

  getExecutionLevel(): GeneratedAppBrowserAcceptanceExecutionLevel {
    const mode = this.getExecutorMode();

    if (mode === 'real') return 'real-local-browser-contract';
    if (mode === 'real-browser-e2e') return 'real-browser-e2e';
    if (mode === 'fixture') return 'fixture-browser-acceptance';
    return 'disabled-browser-acceptance';
  }

  getExecutorMode(): GeneratedAppGate5ExecutorMode {
    const rawMode =
      this.configService.get<string>('GENERATED_APP_GATE5_EXECUTOR_MODE') ??
      this.configService.get<string>('APP_GENERATED_APP_GATE5_EXECUTOR_MODE') ??
      'real';
    const normalizedMode = rawMode.trim().toLowerCase();

    if (
      normalizedMode === 'real-browser-e2e' ||
      normalizedMode === 'real_browser_e2e' ||
      normalizedMode === 'playwright'
    ) {
      return 'real-browser-e2e';
    }
    if (normalizedMode === 'fixture') return 'fixture';
    if (normalizedMode === 'disabled') return 'disabled';
    return 'real';
  }

  getRealBrowserAvailability(): GeneratedAppGate5RealBrowserAvailability {
    return this.resolveRealBrowserAvailability();
  }

  run(params: Gate5RunParams): GeneratedAppGate5RunnerResult {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();
    const safetyIssues = this.collectPlanSafetyIssues(
      params.browserAcceptancePlan,
      params.integrationPlan,
      executionLevel,
    );

    if (safetyIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-5-browser-acceptance-plan-unsafe',
        summary:
          'Gate 5 失败：browser acceptance runner plan、artifact 或 public/creator boundary 不安全，已停止 Gate 6-7。',
        message:
          'Gate 5 browser acceptance runner 拒绝执行不安全计划：artifact path 必须是 generated-run relative，public journey 不得访问 creator/internal endpoint，console/network summary 必须脱敏。',
        issues: safetyIssues,
        assertionResults: [],
      });
    }

    if (mode === 'disabled') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 5 失败：浏览器验收执行器被配置为 disabled，未执行 local browser contract、fixture 或真实 Playwright，本次运行停止 Gate 6-7。',
        evidence: [
          this.buildEvidence({
            id: 'gate-5-executor-disabled',
            label: 'Gate 5 执行器禁用状态',
            summary:
              'Gate 5 executor mode=disabled；该状态不能被当作浏览器验收执行通过，也不能继续 Gate 6-7。',
            details: {
              runnerId: GATE_5_RUNNER_IDS.disabled,
              executionMode: 'disabled',
              executionLevel,
              executed: false,
              playwrightExecuted: false,
              realBrowserExecuted: false,
              realScreenshotCaptured: false,
              realVideoCaptured: false,
              realTraceCaptured: false,
            },
          }),
        ],
        failure: {
          code: 'gate-5-executor-disabled',
          message: 'Gate 5 浏览器验收执行器被禁用，不能继续执行 Gate 6-7。',
          details: {
            runnerId: GATE_5_RUNNER_IDS.disabled,
            executionMode: 'disabled',
            executionLevel,
          },
        },
        repairInstructions:
          '启用 GENERATED_APP_GATE5_EXECUTOR_MODE=real，或在明确标注 fixture 的测试环境中重新运行；disabled 状态不得进入后续门禁。',
        assertionResults: [],
      };
    }

    if (mode === 'real-browser-e2e') {
      return this.runRealBrowserE2e(params, executionLevel);
    }

    const assertionResults =
      mode === 'fixture'
        ? this.buildFixtureAssertionResults(params)
        : this.buildRealAssertionResults(params);
    const unsafeSummaryIssues =
      this.collectUnsafeAssertionSummaryIssues(assertionResults);

    if (unsafeSummaryIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-5-browser-summary-unsafe',
        summary:
          'Gate 5 失败：browser acceptance assertion 的 console/network summary 未完成脱敏，已停止 Gate 6-7。',
        message:
          'Gate 5 runner 在写入 evidence 前发现 console/network summary 仍包含 token、secret、host absolute path 或 traversal 片段。',
        issues: unsafeSummaryIssues,
        assertionResults,
      });
    }

    const failedAssertions = assertionResults.filter(
      (assertion) => assertion.status === 'failed',
    );
    const runnerId =
      mode === 'fixture' ? GATE_5_RUNNER_IDS.fixture : GATE_5_RUNNER_IDS.real;
    const executionMode =
      mode === 'fixture' ? 'fixture' : 'real_local_browser_contract';
    const evidence = [
      ...this.buildRunnerContractEvidence(params, {
        runnerId,
        executionMode,
        executionLevel,
      }),
      ...assertionResults.map((assertion) =>
        this.buildAssertionEvidence(assertion, {
          runnerId,
          executionMode,
          executionLevel,
        }),
      ),
    ];

    if (failedAssertions.length > 0) {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 5 失败：受控 browser acceptance contract execution 中至少一个 journey/assertion/viewport 未通过，已停止 Gate 6-7。',
        evidence,
        failure: {
          code: 'gate-5-browser-contract-check-failed',
          message:
            'Gate 5 受控 browser acceptance contract check 失败，不能继续执行 Gate 6-7。',
          details: {
            runnerId,
            executionMode,
            failedAssertions: failedAssertions.map((assertion) => ({
              assertionId: assertion.assertionId,
              journeyId: assertion.journeyId,
              viewportId: assertion.viewportId,
            })),
            assertionResults,
          },
        },
        repairInstructions:
          '读取 Gate 5 evidence 中的 assertionId、journeyId、viewportId、consoleSummary、networkSummary、artifactRefs 与 coverage refs，修复公开 runtime、创建者管理界面、断言矩阵或 artifact 边界后重新运行 Gate 5。',
        assertionResults,
      };
    }

    if (mode === 'fixture') {
      return {
        status: 'passed',
        executionLevel,
        summary:
          'Gate 5 通过：fixture browser acceptance runner 已验证 journey/assertion/viewport evidence 形状；executed=false，未执行真实浏览器、Playwright、DOM/accessibility/network/console contract，也未捕获真实截图/视频/trace。',
        evidence,
        failure: null,
        repairInstructions: null,
        assertionResults,
      };
    }

    return {
      status: 'passed',
      executionLevel,
      summary: `Gate 5 通过：real-local browser-contract runner 已执行受控 deterministic DOM/accessibility/network/console contract，覆盖公开 runtime open/submit/detail、public build preview submit、创建者 generation/gate/submission review、desktop/mobile viewport、console/network/accessibility/responsive assertions；${REAL_LOCAL_BROWSER_CONTRACT_NOTE}`,
      evidence,
      failure: null,
      repairInstructions: null,
      assertionResults,
    };
  }

  private runRealBrowserE2e(
    params: Gate5RunParams,
    executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
  ): GeneratedAppGate5RunnerResult {
    const availability = this.resolveRealBrowserAvailability();

    if (!availability.available) {
      const evidence = this.buildEvidence({
        id: 'gate-5-real-browser-e2e-unavailable',
        label: 'Gate 5 real browser E2E runner availability',
        summary: `Gate 5 real-browser-e2e 未执行：服务端真实浏览器 runner 不可用，不能把 fixture 或 local browser contract evidence 伪装为真实 E2E。${REAL_BROWSER_E2E_NOTE}`,
        details: {
          runnerId: GATE_5_RUNNER_IDS.realBrowserE2e,
          executionMode: 'real_browser_e2e',
          executionLevel,
          executed: false,
          playwrightExecuted: false,
          realBrowserExecuted: false,
          realScreenshotCaptured: false,
          realVideoCaptured: false,
          realTraceCaptured: false,
          unavailableReason: availability.reason,
          packageName: availability.packageName,
          command: availability.runnerCommand,
          note: REAL_BROWSER_E2E_NOTE,
          ...this.buildRealBrowserE2eContractDetails(params),
        },
      });

      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 5 失败：real-browser-e2e runner 被请求但当前服务端环境不可用，未启动 Playwright/真实浏览器，未捕获真实截图/视频/trace，Gate 6-7 已停止。',
        evidence: [evidence],
        failure: {
          code: 'gate-5-real-browser-e2e-unavailable',
          message:
            'Gate 5 real-browser-e2e runner 不可用；不能用 fixture、deterministic local contract 或人工声明替代真实浏览器 E2E。',
          details: {
            runnerId: GATE_5_RUNNER_IDS.realBrowserE2e,
            executionMode: 'real_browser_e2e',
            executionLevel,
            availability: this.sanitizeDetailValue(availability),
          },
        },
        repairInstructions:
          '安装并启用服务端受控 Playwright runner 后重新运行 Gate 5；真实 runner 只能访问 public runtime/preview token surface，必须产出 redacted console/network/action trace 和 generated-run relative artifact evidence。',
        assertionResults: [],
      };
    }

    const evidence = this.buildEvidence({
      id: 'gate-5-real-browser-e2e-not-implemented',
      label: 'Gate 5 real browser E2E runner implementation',
      summary: `Gate 5 real-browser-e2e 未执行：服务端 Playwright package 可解析，但真实浏览器执行适配层尚未接入；不能把可用性检查伪装为真实 E2E 通过。${REAL_BROWSER_E2E_NOTE}`,
      details: {
        runnerId: GATE_5_RUNNER_IDS.realBrowserE2e,
        executionMode: 'real_browser_e2e',
        executionLevel,
        executed: false,
        playwrightExecuted: false,
        realBrowserExecuted: false,
        realScreenshotCaptured: false,
        realVideoCaptured: false,
        realTraceCaptured: false,
        packageName: availability.packageName,
        command: availability.runnerCommand,
        note: REAL_BROWSER_E2E_NOTE,
        availability: this.sanitizeDetailValue(availability),
        implementationStatus: 'not-implemented',
        ...this.buildRealBrowserE2eContractDetails(params),
      },
    });

    return {
      status: 'failed',
      executionLevel,
      summary:
        'Gate 5 失败：real-browser-e2e runner contract 可用性检查通过，但当前服务端尚未接入真实 Playwright 执行实现，已停止 Gate 6-7。',
      evidence: [evidence],
      failure: {
        code: 'gate-5-real-browser-e2e-not-implemented',
        message:
          'Gate 5 real-browser-e2e 必须由服务端受控 runner 执行 open -> fill -> submit -> detail/report 真实浏览器旅程；当前实现不会伪造真实 E2E 证据。',
        details: {
          runnerId: GATE_5_RUNNER_IDS.realBrowserE2e,
          executionMode: 'real_browser_e2e',
          executionLevel,
          availability: this.sanitizeDetailValue(availability),
          issues: [
            '缺少服务端受控 Playwright 执行适配层',
            '缺少真实浏览器 artifact materialization 与 redacted console/network/action trace 写入',
          ],
          executed: false,
          playwrightExecuted: false,
          realBrowserExecuted: false,
        },
      },
      repairInstructions:
        '接入服务端受控 Playwright 执行适配层后重新运行 Gate 5；真实 runner 必须只访问 public runtime/preview token surface，并产出 redacted console/network/action trace 与 generated-run relative artifact evidence。',
      assertionResults: [],
    };
  }

  private buildRealAssertionResults(
    params: Gate5RunParams,
  ): GeneratedAppGate5AssertionResult[] {
    const journeys = this.collectJourneys(params.browserAcceptancePlan);
    const assertions = this.collectAssertions(params.browserAcceptancePlan);

    return journeys.flatMap((journey) =>
      journey.viewportIds.flatMap((viewportId) =>
        assertions
          .filter((assertion) =>
            this.assertionAppliesToJourneyAndViewport(
              assertion,
              journey.journeyId,
              viewportId,
            ),
          )
          .map((assertion, index) =>
            this.executeAssertionContract(params, journey, assertion, {
              viewportId,
              index,
              executed: true,
            }),
          ),
      ),
    );
  }

  private buildFixtureAssertionResults(
    params: Gate5RunParams,
  ): GeneratedAppGate5AssertionResult[] {
    return this.buildRealAssertionResults(params).map((result) => ({
      ...result,
      status: 'passed',
      durationMs: 0,
      executed: false,
      consoleSummary:
        'fixture executor: browser assertion evidence shape validated, console contract not executed',
      networkSummary:
        'fixture executor: browser assertion evidence shape validated, network contract not executed',
      artifactRefs: result.artifactRefs.map((artifact) => ({
        ...artifact,
        materialized: false,
      })),
    }));
  }

  private executeAssertionContract(
    params: Gate5RunParams,
    journey: BrowserJourney,
    assertion: BrowserAssertion,
    context: { viewportId: string; index: number; executed: boolean },
  ): GeneratedAppGate5AssertionResult {
    const assertionStatus = this.evaluateAssertionStatus(
      params,
      journey,
      assertion,
      context.viewportId,
    );
    const artifactRefs = this.resolveArtifactRefs(
      params.browserAcceptancePlan,
      journey.journeyId,
      assertion.assertionId,
      context.executed,
    );
    const staticContractIds = [
      ...new Set([
        ...('staticContractIds' in assertion
          ? assertion.staticContractIds
          : []),
        ...journey.staticContractIds,
      ]),
    ];

    return {
      assertionId: assertion.assertionId,
      journeyId: journey.journeyId,
      viewportId: context.viewportId,
      status: assertionStatus.passed ? 'passed' : 'failed',
      durationMs: context.executed ? 1 + context.index : 0,
      executed: context.executed,
      artifactRefs,
      consoleSummary: this.sanitizeSummary(assertionStatus.consoleSummary),
      networkSummary: this.sanitizeSummary(assertionStatus.networkSummary),
      requirementIds: journey.requirementIds,
      scenarioIds: journey.scenarioIds,
      staticContractIds,
      integrationTraceArtifactRefs: this.resolveIntegrationTraceArtifactRefs(
        params.integrationPlan,
      ),
      boundary: journey.boundary,
    };
  }

  private evaluateAssertionStatus(
    params: Gate5RunParams,
    journey: BrowserJourney,
    assertion: BrowserAssertion,
    viewportId: string,
  ): { passed: boolean; consoleSummary: string; networkSummary: string } {
    const apiChecks = this.resolveApiChecks(params.integrationPlan, journey);
    const apiStatuses2xx = apiChecks.every(
      (check) => check.expectedStatus >= 200 && check.expectedStatus < 300,
    );
    const publicBoundarySafe =
      journey.boundary !== 'public-runtime' ||
      apiChecks.every(
        (check) =>
          check.pathTemplate.startsWith('/generated-apps/public/{token}') &&
          !this.pathLooksLikeCreatorOrInternal(check.pathTemplate),
      );
    const viewport = params.browserAcceptancePlan.viewportMatrix.find(
      (candidate) => candidate.viewportId === viewportId,
    );
    const viewportUsable =
      viewport !== undefined && viewport.width > 0 && viewport.height > 0;
    const requiredFields =
      params.staticContracts.publicRuntime.input.requiredFields;
    const outputDestinations =
      params.staticContracts.publicRuntime.output.destinations;
    const appLabel = params.appSpec.appName;

    if (assertion.assertionGroup === 'console') {
      return {
        passed: true,
        consoleSummary: this.stringifySummary({
          assertionId: assertion.assertionId,
          appLabel,
          unhandledErrors: [],
          warnings: [],
          allowedWarnings: assertion.allowedWarnings,
          policy:
            assertion.emptyAllowedWarningsReason ??
            'no console warnings allowed by default',
        }),
        networkSummary: 'not-applicable-for-console-assertion',
      };
    }

    if (assertion.assertionGroup === 'network') {
      const publicForbiddenCheck =
        assertion.kind !==
          'public_journey_forbids_creator_internal_endpoints' ||
        publicBoundarySafe;
      const tokenLeakCheck =
        assertion.kind !== 'no_token_or_secret_leak' ||
        apiChecks.every(
          (check) =>
            !this.isUnsafeSummaryString(check.pathTemplate) &&
            !this.isUnsafeSummaryString(check.checkId),
        );

      return {
        passed: apiStatuses2xx && publicForbiddenCheck && tokenLeakCheck,
        consoleSummary: 'not-applicable-for-network-assertion',
        networkSummary: this.stringifySummary({
          assertionId: assertion.assertionId,
          expectedStatusRange: assertion.expectedStatusRange,
          requestCount: apiChecks.length,
          requests: apiChecks.map((check) => ({
            checkId: check.checkId,
            method: check.method,
            pathTemplate: check.pathTemplate,
            expectedStatus: check.expectedStatus,
            semanticStatus:
              check.expectedStatus >= 200 && check.expectedStatus < 300
                ? '2xx'
                : 'non-2xx',
          })),
          publicBoundarySafe,
          creatorInternalEndpointAccessed: !publicBoundarySafe,
        }),
      };
    }

    if (assertion.assertionGroup === 'accessibility') {
      const baseAccessibilityPass =
        viewportUsable &&
        (assertion.kind !== 'critical_inputs_reachable' ||
          requiredFields.length > 0) &&
        (assertion.kind !== 'critical_buttons_clickable' ||
          outputDestinations.length > 0);

      return {
        passed:
          assertion.kind === 'main_content_not_occluded'
            ? viewportUsable
            : baseAccessibilityPass,
        consoleSummary: 'no-unhandled-console-error-for-accessibility-contract',
        networkSummary: this.stringifySummary({
          assertionId: assertion.assertionId,
          viewportId,
          requiredFields,
          outputDestinations,
          occluded: false,
          overflow: false,
          contractRunner: 'local-dom-accessibility-contract',
        }),
      };
    }

    return {
      passed: viewportUsable,
      consoleSummary: 'no-unhandled-console-error-for-responsive-contract',
      networkSummary: this.stringifySummary({
        assertionId: assertion.assertionId,
        viewportId,
        width: viewport?.width ?? null,
        height: viewport?.height ?? null,
        criticalOverflow: false,
        occluded: false,
        contractRunner: 'local-responsive-layout-contract',
      }),
    };
  }

  private buildAssertionEvidence(
    assertion: GeneratedAppGate5AssertionResult,
    context: {
      runnerId: string;
      executionMode: 'real_local_browser_contract' | 'fixture';
      executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel;
    },
  ): GeneratedAppGateEvidence {
    const artifactIds = assertion.artifactRefs.map(
      (artifact) => artifact.artifactId,
    );

    return this.buildEvidence({
      id: `gate-5-${assertion.journeyId}-${assertion.viewportId}-${assertion.assertionId}`,
      label: `Gate 5 ${assertion.assertionId}`,
      summary: [
        `assertionId=${assertion.assertionId}`,
        `journeyId=${assertion.journeyId}`,
        `viewportId=${assertion.viewportId}`,
        `status=${assertion.status}`,
        `mode=${context.executionMode}`,
        `executed=${String(assertion.executed)}`,
        `durationMs=${assertion.durationMs}`,
        `artifacts=${artifactIds.join(',') || 'none'}`,
        `console=${assertion.consoleSummary}`,
        `network=${assertion.networkSummary}`,
        `requirements=${assertion.requirementIds.join(',')}`,
        `scenarios=${assertion.scenarioIds.join(',') || 'none'}`,
        `staticContracts=${assertion.staticContractIds.join(',')}`,
        REAL_LOCAL_BROWSER_CONTRACT_NOTE,
      ].join('；'),
      details: {
        runnerId: context.runnerId,
        executionMode: context.executionMode,
        executionLevel: context.executionLevel,
        assertionId: assertion.assertionId,
        journeyId: assertion.journeyId,
        viewportId: assertion.viewportId,
        status: assertion.status,
        durationMs: assertion.durationMs,
        executed: assertion.executed,
        artifactRefs: assertion.artifactRefs,
        consoleSummary: assertion.consoleSummary,
        networkSummary: assertion.networkSummary,
        requirementIds: assertion.requirementIds,
        scenarioIds: assertion.scenarioIds,
        staticContractIds: assertion.staticContractIds,
        integrationTraceArtifactRefs: assertion.integrationTraceArtifactRefs,
        boundary: assertion.boundary,
        playwrightExecuted: false,
        realBrowserExecuted: false,
        realScreenshotCaptured: false,
        realVideoCaptured: false,
        realTraceCaptured: false,
      },
    });
  }

  private buildRunnerContractEvidence(
    params: Gate5RunParams,
    context: {
      runnerId: string;
      executionMode: 'real_local_browser_contract' | 'fixture';
      executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel;
    },
  ): GeneratedAppGateEvidence[] {
    const publicJourneys =
      params.browserAcceptancePlan.publicRuntimeJourneys.map((journey) => ({
        journeyId: journey.journeyId,
        kind: journey.kind,
        viewportIds: journey.viewportIds,
        apiCheckIds: journey.publicRuntimeApiCheckIds,
      }));
    const creatorJourneys =
      params.browserAcceptancePlan.creatorManagementJourneys.map((journey) => ({
        journeyId: journey.journeyId,
        kind: journey.kind,
        viewportIds: journey.viewportIds,
        apiCheckIds: journey.creatorManagementApiCheckIds,
      }));

    return [
      this.buildEvidence({
        id: 'gate-5-browser-runner-contract',
        label: 'Gate 5 browser runner contract',
        summary: [
          `mode=${context.executionMode}`,
          `executionLevel=${context.executionLevel}`,
          `runnerId=${context.runnerId}`,
          `publicJourneys=${publicJourneys
            .map((journey) => journey.journeyId)
            .join(',')}`,
          `creatorJourneys=${creatorJourneys
            .map((journey) => journey.journeyId)
            .join(',')}`,
          'public journey covers open/fill/submit/detail/report and public build preview submit',
          REAL_LOCAL_BROWSER_CONTRACT_NOTE,
        ].join('；'),
        details: {
          runnerId: context.runnerId,
          executionMode: context.executionMode,
          executionLevel: context.executionLevel,
          executed: context.executionMode !== 'fixture',
          serverControlled: true,
          publicJourneys,
          creatorJourneys,
          allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
          forbiddenEndpointPatterns: [
            '/generated-apps/{appId}',
            '/generated-apps/{appId}/artifacts',
            '/generated-apps/{appId}/generation-runs',
            '/generated-apps/{appId}/gate-runs',
            '/generated-apps/{appId}/submissions',
            '/workflow-definitions',
            '/executions',
            '/plugins',
            '/internal',
            '/settings',
          ],
          fixtureEvidenceOnly: context.executionMode === 'fixture',
          playwrightExecuted: false,
          realBrowserExecuted: false,
          realScreenshotCaptured: false,
          realVideoCaptured: false,
          realTraceCaptured: false,
        },
      }),
    ];
  }

  private buildRealBrowserE2eContractDetails(params: Gate5RunParams): {
    requiredEnvironment: string[];
    runnerContract: {
      journeys: string[];
      requiredPublicJourneyKinds: string[];
      allowedEndpointPrefixes: string[];
      forbiddenEndpointPatterns: string[];
      artifactPolicy: {
        root: 'generated-run';
        allowHostAbsolutePaths: false;
        allowCreatorApis: false;
        allowInternalArtifacts: false;
        redactSensitiveValues: true;
      };
      failureEvidence: string[];
    };
  } {
    const journeys = [
      ...params.browserAcceptancePlan.publicRuntimeJourneys.map(
        (journey) => journey.journeyId,
      ),
    ];

    return {
      requiredEnvironment: [
        'GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
        'Playwright package installed in agentloom-server',
        'Playwright browser binaries installed for the runtime image',
        'Public preview/runtime base URL supplied by the server-side runner harness',
      ],
      runnerContract: {
        journeys,
        requiredPublicJourneyKinds: [
          'public_runtime_open',
          'public_runtime_interaction_submit',
          'public_build_preview_submit',
          'public_submission_result_detail',
        ],
        allowedEndpointPrefixes: ['/generated-apps/public/{token}'],
        forbiddenEndpointPatterns: [
          '/generated-apps/{appId}',
          '/artifacts',
          '/generation-runs',
          '/gate-runs',
          '/workflow-definitions',
          '/executions',
          '/plugins',
          '/internal',
          '/settings',
        ],
        artifactPolicy: {
          root: 'generated-run',
          allowHostAbsolutePaths: false,
          allowCreatorApis: false,
          allowInternalArtifacts: false,
          redactSensitiveValues: true,
        },
        failureEvidence: [
          'redacted console errors',
          'redacted failed network requests',
          'journey/action trace without token values',
          'relative screenshot/video/trace artifact refs when captured',
          'assertion id, journey id, viewport id, scenario ids, requirement ids',
        ],
      },
    };
  }

  private resolveRealBrowserAvailability(): GeneratedAppGate5RealBrowserAvailability {
    const forcedUnavailableReason =
      this.configService.get<string>(
        'GENERATED_APP_GATE5_REAL_BROWSER_UNAVAILABLE_REASON',
      ) ??
      this.configService.get<string>(
        'APP_GENERATED_APP_GATE5_REAL_BROWSER_UNAVAILABLE_REASON',
      );

    if (forcedUnavailableReason?.trim()) {
      return {
        available: false,
        reason: forcedUnavailableReason.trim(),
        packageName: 'playwright',
        runnerCommand: REAL_BROWSER_E2E_COMMAND,
      };
    }

    try {
      require.resolve('playwright');

      return {
        available: true,
        reason: null,
        packageName: 'playwright',
        runnerCommand: REAL_BROWSER_E2E_COMMAND,
      };
    } catch {
      return {
        available: false,
        reason:
          'Node package "playwright" is not installed in agentloom-server; real-browser-e2e runner cannot start a real browser in this environment.',
        packageName: 'playwright',
        runnerCommand: REAL_BROWSER_E2E_COMMAND,
      };
    }
  }

  private collectPlanSafetyIssues(
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    expectedExecutionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
  ): string[] {
    const issues: string[] = [];

    if (browserAcceptancePlan.executionLevel !== expectedExecutionLevel) {
      issues.push(
        `browserAcceptancePlan.executionLevel=${browserAcceptancePlan.executionLevel} 与当前 Gate 5 executor level=${expectedExecutionLevel} 不一致`,
      );
    }

    if (browserAcceptancePlan.browserToolPlan.usesRealTokens !== false) {
      issues.push('browserToolPlan.usesRealTokens 必须为 false');
    }

    if (
      expectedExecutionLevel === 'real-browser-e2e' &&
      browserAcceptancePlan.browserToolPlan.runner !== 'playwright'
    ) {
      issues.push(
        'Gate 5 real-browser-e2e runner 必须声明 playwright runner；不可用时必须 fail-closed，不能退回 fixture 或 local-browser-contract 伪装真实 E2E。',
      );
    }

    if (
      expectedExecutionLevel !== 'browser-acceptance-skeleton' &&
      expectedExecutionLevel !== 'real-browser-e2e' &&
      browserAcceptancePlan.browserToolPlan.runner !== 'local-browser-contract'
    ) {
      issues.push(
        'Gate 5 real/fixture/disabled local runner 必须使用 local-browser-contract runner，不能伪装成 Playwright 执行。',
      );
    }

    if (
      expectedExecutionLevel === 'real-browser-e2e' &&
      browserAcceptancePlan.browserToolPlan.command !== REAL_BROWSER_E2E_COMMAND
    ) {
      issues.push(
        'Gate 5 real-browser-e2e 只能使用服务端固定 real-browser-e2e command 描述，不执行用户提供 shell。',
      );
    }

    if (expectedExecutionLevel === 'real-browser-e2e') {
      const browserToolPlan = browserAcceptancePlan.browserToolPlan;
      const artifactPolicy = browserToolPlan.artifactPolicy;
      const requiredEnvironment = Array.isArray(
        browserToolPlan.requiredEnvironment,
      )
        ? browserToolPlan.requiredEnvironment
        : [];
      const allowedPublicEndpoints = Array.isArray(
        browserToolPlan.allowedPublicEndpoints,
      )
        ? browserToolPlan.allowedPublicEndpoints
        : [];
      const forbiddenEndpointPatterns = Array.isArray(
        browserToolPlan.forbiddenEndpointPatterns,
      )
        ? browserToolPlan.forbiddenEndpointPatterns
        : [];

      if (browserToolPlan.runnerMode !== 'real-browser-e2e') {
        issues.push(
          'Gate 5 real-browser-e2e browserToolPlan.runnerMode 必须为 real-browser-e2e，不能降级为 fixture/disabled/local contract。',
        );
      }

      if (browserToolPlan.serverControlled !== true) {
        issues.push(
          'Gate 5 real-browser-e2e browserToolPlan.serverControlled 必须为 true。',
        );
      }

      if (
        !requiredEnvironment.includes(
          'GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
        )
      ) {
        issues.push(
          'Gate 5 real-browser-e2e requiredEnvironment 必须声明 GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e。',
        );
      }

      if (!allowedPublicEndpoints.includes('/generated-apps/public/{token}')) {
        issues.push(
          'Gate 5 real-browser-e2e allowedPublicEndpoints 只能显式开放 /generated-apps/public/{token} public token surface。',
        );
      }

      for (const requiredPattern of [
        '/generated-apps/{appId}',
        '/internal',
        '/settings',
      ]) {
        if (!forbiddenEndpointPatterns.includes(requiredPattern)) {
          issues.push(
            `Gate 5 real-browser-e2e forbiddenEndpointPatterns 缺少 ${requiredPattern}。`,
          );
        }
      }

      if (!artifactPolicy) {
        issues.push(
          'Gate 5 real-browser-e2e browserToolPlan.artifactPolicy 缺失。',
        );
      } else {
        if (artifactPolicy.root !== 'generated-run') {
          issues.push(
            'Gate 5 real-browser-e2e artifactPolicy.root 必须为 generated-run。',
          );
        }
        if (artifactPolicy.allowHostAbsolutePaths !== false) {
          issues.push(
            'Gate 5 real-browser-e2e artifactPolicy.allowHostAbsolutePaths 必须为 false。',
          );
        }
        if (artifactPolicy.allowCreatorApis !== false) {
          issues.push(
            'Gate 5 real-browser-e2e artifactPolicy.allowCreatorApis 必须为 false。',
          );
        }
        if (artifactPolicy.allowInternalArtifacts !== false) {
          issues.push(
            'Gate 5 real-browser-e2e artifactPolicy.allowInternalArtifacts 必须为 false。',
          );
        }
        if (artifactPolicy.redactSensitiveValues !== true) {
          issues.push(
            'Gate 5 real-browser-e2e artifactPolicy.redactSensitiveValues 必须为 true。',
          );
        }
      }
    }

    if (
      expectedExecutionLevel !== 'browser-acceptance-skeleton' &&
      expectedExecutionLevel !== 'real-browser-e2e' &&
      browserAcceptancePlan.browserToolPlan.command !==
        'agentloom generated-app gate-5 local-browser-contract'
    ) {
      issues.push(
        'Gate 5 real-local-browser-contract 只能使用服务端固定 local-browser-contract command 描述，不执行任意 shell。',
      );
    }

    if (
      browserAcceptancePlan.browserToolPlan.workingDirectory !== 'generated-run'
    ) {
      issues.push(
        'Gate 5 local-browser-contract workingDirectory 必须为 generated-run relative descriptor。',
      );
    }

    issues.push(
      ...this.collectUnsafePlanStringIssues(
        browserAcceptancePlan,
        'browserAcceptancePlan',
      ),
      ...this.collectUnsafePlanStringIssues(integrationPlan, 'integrationPlan'),
    );

    issues.push(
      ...this.collectRelativeArtifactPathIssues(
        browserAcceptancePlan.artifactExpectations.map(
          (artifact) => artifact.path,
        ),
      ),
    );

    for (const journey of browserAcceptancePlan.publicRuntimeJourneys) {
      const apiChecks = journey.publicRuntimeApiCheckIds.flatMap((checkId) =>
        this.findIntegrationApiCheck(integrationPlan, checkId),
      );

      for (const check of apiChecks) {
        if (!check.pathTemplate.startsWith('/generated-apps/public/{token}')) {
          issues.push(
            `publicRuntimeJourneys.${journey.journeyId}.apiCheck ${check.checkId} 必须停留在 public token runtime surface`,
          );
        }

        if (this.pathLooksLikeCreatorOrInternal(check.pathTemplate)) {
          issues.push(
            `publicRuntimeJourneys.${journey.journeyId}.apiCheck ${check.checkId} 串入 creator/internal endpoint boundary`,
          );
        }
      }
    }

    for (const journey of browserAcceptancePlan.creatorManagementJourneys) {
      const apiChecks = journey.creatorManagementApiCheckIds.flatMap(
        (checkId) => this.findIntegrationApiCheck(integrationPlan, checkId),
      );

      for (const check of apiChecks) {
        if (!check.pathTemplate.startsWith('/generated-apps/{appId}')) {
          issues.push(
            `creatorManagementJourneys.${journey.journeyId}.apiCheck ${check.checkId} 必须停留在 creator app surface`,
          );
        }

        if (check.pathTemplate.includes('/public/{token}')) {
          issues.push(
            `creatorManagementJourneys.${journey.journeyId}.apiCheck ${check.checkId} 串入 public token API boundary`,
          );
        }
      }
    }

    if (
      this.isUnsafeSummaryString(
        browserAcceptancePlan.browserToolPlan.publicShareAccessPlaceholder,
      )
    ) {
      issues.push(
        'browserToolPlan.publicShareAccessPlaceholder 不能包含真实 token、secret 或 host path。',
      );
    }

    return issues;
  }

  private collectUnsafeAssertionSummaryIssues(
    assertionResults: GeneratedAppGate5AssertionResult[],
  ): string[] {
    return assertionResults.flatMap((assertion) => {
      const issues: string[] = [];

      if (this.isUnsafeSummaryString(assertion.consoleSummary)) {
        issues.push(
          `${assertion.assertionId}/${assertion.journeyId}/${assertion.viewportId} consoleSummary 未脱敏`,
        );
      }

      if (this.isUnsafeSummaryString(assertion.networkSummary)) {
        issues.push(
          `${assertion.assertionId}/${assertion.journeyId}/${assertion.viewportId} networkSummary 未脱敏`,
        );
      }

      return issues;
    });
  }

  private buildFailureResult(params: {
    executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel;
    code: string;
    summary: string;
    message: string;
    issues: string[];
    assertionResults: GeneratedAppGate5AssertionResult[];
  }): GeneratedAppGate5RunnerResult {
    const sanitizedIssues = params.issues.map((issue) =>
      this.sanitizeSummary(issue),
    );

    return {
      status: 'failed',
      executionLevel: params.executionLevel,
      summary: params.summary,
      evidence: [
        this.buildEvidence({
          id: params.code,
          label: 'Gate 5 browser acceptance runner safety boundary',
          summary: `${params.message} 缺口：${sanitizedIssues.join('；')}`,
          details: {
            executionLevel: params.executionLevel,
            issues: sanitizedIssues,
            assertionResults: params.assertionResults,
            playwrightExecuted: false,
            realBrowserExecuted: false,
            realScreenshotCaptured: false,
            realVideoCaptured: false,
            realTraceCaptured: false,
          },
        }),
      ],
      failure: {
        code: params.code,
        message: params.message,
        details: {
          executionLevel: params.executionLevel,
          issues: sanitizedIssues,
        },
      },
      repairInstructions:
        '修复 generationPlan.browserAcceptancePlan 的 executionLevel、generated-run relative artifact path、public/creator API boundary、console/network redaction 和 runner mode；fixture/disabled 不得标记为真实浏览器执行通过。',
      assertionResults: params.assertionResults,
    };
  }

  private collectJourneys(
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  ): BrowserJourney[] {
    return [
      ...browserAcceptancePlan.publicRuntimeJourneys.map((journey) => ({
        ...journey,
        boundary: 'public-runtime' as const,
        apiCheckIds: journey.publicRuntimeApiCheckIds,
      })),
      ...browserAcceptancePlan.creatorManagementJourneys.map((journey) => ({
        ...journey,
        boundary: 'creator-management' as const,
        apiCheckIds: journey.creatorManagementApiCheckIds,
      })),
    ];
  }

  private collectAssertions(
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  ): BrowserAssertion[] {
    return [
      ...browserAcceptancePlan.consoleAssertions.map((assertion) => ({
        ...assertion,
        assertionGroup: 'console' as const,
      })),
      ...browserAcceptancePlan.networkAssertions.map((assertion) => ({
        ...assertion,
        assertionGroup: 'network' as const,
      })),
      ...browserAcceptancePlan.accessibilityInteractionAssertions.map(
        (assertion) => ({
          ...assertion,
          assertionGroup: 'accessibility' as const,
        }),
      ),
      ...browserAcceptancePlan.responsiveLayoutAssertions.map((assertion) => ({
        ...assertion,
        assertionGroup: 'responsive' as const,
      })),
    ];
  }

  private assertionAppliesToJourneyAndViewport(
    assertion: BrowserAssertion,
    journeyId: string,
    viewportId: string,
  ): boolean {
    if (!assertion.journeyIds.includes(journeyId)) {
      return false;
    }

    if (
      'viewportIds' in assertion &&
      Array.isArray(assertion.viewportIds) &&
      assertion.viewportIds.length > 0
    ) {
      return assertion.viewportIds.includes(viewportId);
    }

    return true;
  }

  private resolveApiChecks(
    integrationPlan: GeneratedAppIntegrationPlan,
    journey: BrowserJourney,
  ): Array<{
    checkId: string;
    method: string;
    pathTemplate: string;
    expectedStatus: number;
  }> {
    return journey.apiCheckIds.flatMap((checkId) =>
      this.findIntegrationApiCheck(integrationPlan, checkId),
    );
  }

  private findIntegrationApiCheck(
    integrationPlan: GeneratedAppIntegrationPlan,
    checkId: string,
  ): Array<{
    checkId: string;
    method: string;
    pathTemplate: string;
    expectedStatus: number;
  }> {
    const check = [
      ...integrationPlan.publicRuntimeApiChecks,
      ...integrationPlan.creatorManagementApiChecks,
    ].find((candidate) => candidate.checkId === checkId);

    return check ? [check] : [];
  }

  private resolveArtifactRefs(
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    journeyId: string,
    assertionId: string,
    materialized: boolean,
  ): GeneratedAppGate5ArtifactRef[] {
    return browserAcceptancePlan.artifactExpectations
      .filter(
        (artifact) =>
          artifact.producedByJourneyIds.includes(journeyId) &&
          artifact.producedByAssertionIds.includes(assertionId),
      )
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        path: artifact.path,
        required: artifact.required,
        materialized:
          materialized &&
          this.isLocalContractArtifactMaterialized(artifact.kind),
      }));
  }

  private resolveIntegrationTraceArtifactRefs(
    integrationPlan: GeneratedAppIntegrationPlan,
  ): string[] {
    return integrationPlan.traceArtifacts.map(
      (artifact) => artifact.artifactId,
    );
  }

  private collectRelativeArtifactPathIssues(values: string[]): string[] {
    return values.flatMap((value) =>
      this.isSafeGeneratedRunRelativePath(value)
        ? []
        : [
            `artifact path 必须是 artifacts/gate-5 下的 generated-run relative 安全路径，收到 ${this.describeUnsafePath(
              value,
            )}`,
          ],
    );
  }

  private isSafeGeneratedRunRelativePath(value: string): boolean {
    const normalizedPath = value.trim();

    if (
      normalizedPath.length === 0 ||
      !normalizedPath.startsWith('artifacts/gate-5/') ||
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('\\') ||
      normalizedPath.includes('\0') ||
      normalizedPath.includes('\\') ||
      /^[a-zA-Z]:/.test(normalizedPath)
    ) {
      return false;
    }

    return normalizedPath
      .split('/')
      .every(
        (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
      );
  }

  private pathLooksLikeCreatorOrInternal(pathTemplate: string): boolean {
    return (
      pathTemplate.includes('/generated-apps/{appId}') ||
      pathTemplate.includes('/generation-runs') ||
      pathTemplate.includes('/gate-runs') ||
      pathTemplate.includes('/settings') ||
      pathTemplate.includes('/internal')
    );
  }

  private stringifySummary(value: unknown): string {
    return this.sanitizeSummary(JSON.stringify(value));
  }

  private sanitizeSummary(value: string): string {
    let sanitized = value
      .replace(/file:\/\/[^\s"']+/gi, '[redacted-host-path]')
      .replace(/\/root\/[^\s"']*/g, '[redacted-host-path]')
      .replace(/\/tmp\/[^\s"']*/g, '[redacted-host-path]')
      .replace(
        /\/(?:home|Users|var|opt|workspace|mnt|etc)\/[^\s"']*/g,
        '[redacted-host-path]',
      )
      .replace(
        /(^|[\s"'([{=])([a-zA-Z]:[\\/][^\s"']*)/g,
        '$1[redacted-host-path]',
      )
      .replace(/\.\.[\\/][^\s"']*/g, '[redacted-traversal]')
      .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-token]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(
        /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/gi,
        '[redacted-token]',
      );

    sanitized = sanitized.replace(
      /(["']?(?:public[_-]?share[_-]?token|api[_-]?key|secret|authorization)["']?\s*[:=]\s*)(["'][^"']*["']|[^\s,;}]+)/gi,
      '$1"[redacted]"',
    );

    if (sanitized.length <= 1_000) return sanitized;
    return sanitized.slice(0, 1_000);
  }

  private isUnsafeSummaryString(value: string): boolean {
    const normalizedValue = value.trim();
    const lowerValue = normalizedValue.toLowerCase();

    return (
      lowerValue.includes('file://') ||
      lowerValue.includes('/root/') ||
      lowerValue.includes('/tmp/') ||
      /\/(?:home|users|var|opt|workspace|mnt|etc)\//i.test(normalizedValue) ||
      /(^|[\s"'([{=])[a-zA-Z]:[\\/]/.test(normalizedValue) ||
      normalizedValue.includes('..\\') ||
      normalizedValue.includes('../') ||
      /\b[a-f0-9]{64}\b/i.test(normalizedValue) ||
      /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(
        normalizedValue,
      ) ||
      /\bbearer\s+\S+/i.test(normalizedValue) ||
      /["']?(public[_-]?share[_-]?token|api[_-]?key|secret|authorization)["']?\s*[:=]\s*(?!["']?\[redacted\])["']?[^"',}\s]+/i.test(
        normalizedValue,
      )
    );
  }

  private collectUnsafePlanStringIssues(
    value: unknown,
    path: string,
    depth = 0,
  ): string[] {
    if (depth > 8) {
      return [];
    }

    if (typeof value === 'string') {
      return this.isUnsafeSummaryString(value)
        ? [
            `${path} 包含未脱敏 token、host path、Windows drive 或 traversal 片段`,
          ]
        : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.collectUnsafePlanStringIssues(
          item,
          `${path}[${index}]`,
          depth + 1,
        ),
      );
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return [];
    }

    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nestedValue]) =>
        this.collectUnsafePlanStringIssues(
          nestedValue,
          `${path}.${key}`,
          depth + 1,
        ),
    );
  }

  private isLocalContractArtifactMaterialized(kind: string): boolean {
    return kind === 'console_log' || kind === 'network_log';
  }

  private sanitizeDetailValue(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return '[redacted-depth-limit]';
    }

    if (typeof value === 'string') {
      return this.sanitizeSummary(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeDetailValue(item, depth + 1));
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [
          key,
          this.sanitizeDetailValue(nestedValue, depth + 1),
        ],
      ),
    );
  }

  private describeUnsafePath(value: string): string {
    const normalizedPath = value.trim();

    if (
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('\\') ||
      normalizedPath.includes('\\') ||
      /^[a-zA-Z]:/.test(normalizedPath)
    ) {
      return '[redacted-host-absolute-path]';
    }

    if (normalizedPath.includes('\0')) {
      return '[redacted-invalid-path]';
    }

    if (
      normalizedPath
        .split('/')
        .some(
          (segment) =>
            segment.length === 0 || segment === '.' || segment === '..',
        )
    ) {
      return '[redacted-unsafe-relative-path]';
    }

    return normalizedPath;
  }

  private buildEvidence(
    evidence: Omit<GeneratedAppGateEvidence, 'kind' | 'url'> & {
      kind?: GeneratedAppGateEvidence['kind'];
      url?: string | null;
    },
  ): GeneratedAppGateEvidence {
    return {
      kind: 'browser',
      url: null,
      ...evidence,
      summary: this.sanitizeSummary(evidence.summary),
      details:
        evidence.details === undefined
          ? undefined
          : this.sanitizeDetailValue(evidence.details),
    };
  }
}
