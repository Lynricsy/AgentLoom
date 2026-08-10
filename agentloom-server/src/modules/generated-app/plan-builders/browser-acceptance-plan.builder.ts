import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateResult,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRepairContext,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
  GeneratedAppReadiness,
  GeneratedAppStatus,
} from '../../../database/schema';
import type { GeneratedAppBrowserAcceptanceExecutionLevel } from '../generated-app.browser-acceptance-runner';
import { GATE_2_STATIC_CONTRACT_IDS } from './generation-plan.builder';

import {
  isRecord,
  getRecord,
  getRecordArray,
  getStringArray,
  getNonEmptyString,
  requireRecord,
  buildMissingItemsIssues,
  buildUnknownReferenceIssues,
  buildDuplicateItemIssues,
  buildSafeRelativePathIssues,
  buildControlledCommandIssues,
  buildPluginActivationPolicyIssues,
  collectSensitiveTokenIssues,
  isSensitiveTokenLike,
  formatIssueValue,
  buildBooleanMirrorIssue,
  isAcyclicGraph,
  isNonEmptyString,
  GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES,
} from '../generated-app.plan-validation.util';

export interface Gate5Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate5Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export const GATE_5_SKELETON_EVIDENCE_NOTE =
  'Gate 5 当前只做 browser-acceptance-skeleton 完整性检查；未执行真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互。';

export const GATE_5_REAL_LOCAL_BROWSER_CONTRACT_NOTE =
  'Gate 5 real-local-browser-contract 执行受控 deterministic 本地 DOM/accessibility/network/console contract；不执行任意 shell/用户路径，不启动 Playwright 或真实浏览器，不访问真实公开链接，也不捕获真实截图、视频或 Playwright trace。';

export const GATE_5_REAL_BROWSER_E2E_NOTE =
  'Gate 5 real-browser-e2e 是服务端受控真实浏览器 E2E runner contract；只允许访问 public runtime/preview token surface，必须覆盖公开 runtime open/fill/submit/detail/report 旅程并产出脱敏 evidence，不得访问 creator APIs、内部 artifacts、host absolute path、plugin ids、workflow snapshots、step/checkpoint/raw tool data 或真实 public token 以外的 secret。';

export const GATE_5_ALLOWED_EXECUTION_LEVELS = [
  'browser-acceptance-skeleton',
  'real-local-browser-contract',
  'real-browser-e2e',
  'fixture-browser-acceptance',
  'disabled-browser-acceptance',
] as const;

export const GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND =
  'agentloom generated-app gate-5 local-browser-contract';

export const GATE_5_REAL_BROWSER_E2E_COMMAND =
  'agentloom generated-app gate-5 real-browser-e2e';

export const GATE_5_VIEWPORT_IDS = [
  'viewport-desktop',
  'viewport-mobile',
] as const;

export const GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS = [
  'gate-5-public-runtime-open',
  'gate-5-public-runtime-submit',
  'gate-5-public-build-preview-submit',
  'gate-5-public-submission-detail',
] as const;

export const GATE_5_CREATOR_MANAGEMENT_JOURNEY_IDS = [
  'gate-5-creator-generation-run-review',
  'gate-5-creator-gate-run-review',
  'gate-5-creator-submission-review',
] as const;

export const GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS = [
  'public_runtime_open',
  'public_runtime_interaction_submit',
  'public_build_preview_submit',
  'public_submission_result_detail',
] as const;

export const GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS = [
  'creator_generation_run_review',
  'creator_gate_run_review',
  'creator_submission_review',
] as const;

export const GATE_5_ALLOWED_ASSERTION_KINDS = [
  'no_unhandled_console_error',
  'allowed_warning_policy',
  'core_requests_2xx',
  'public_journey_forbids_creator_internal_endpoints',
  'no_token_or_secret_leak',
  'critical_inputs_reachable',
  'critical_buttons_clickable',
  'main_content_not_occluded',
  'desktop_no_critical_overflow',
  'mobile_no_critical_overflow',
  'viewport_content_not_occluded',
] as const;

export const GATE_5_REQUIRED_ASSERTION_IDS = [
  'gate-5-console-no-unhandled-error',
  'gate-5-console-allowed-warning-policy',
  'gate-5-network-core-requests-2xx',
  'gate-5-network-public-forbids-creator-internal',
  'gate-5-network-no-token-secret-leak',
  'gate-5-accessibility-critical-inputs-reachable',
  'gate-5-accessibility-critical-buttons-clickable',
  'gate-5-accessibility-main-content-not-occluded',
  'gate-5-responsive-desktop-no-overflow',
  'gate-5-responsive-mobile-no-overflow',
  'gate-5-responsive-content-not-occluded',
] as const;

export const GATE_5_ALLOWED_ARTIFACT_KINDS = [
  'screenshot',
  'video',
  'playwright_trace',
  'console_log',
  'network_log',
  'failure_summary',
] as const;

export const GATE_5_REQUIRED_ARTIFACT_IDS = [
  'desktop-screenshot',
  'mobile-screenshot',
  'browser-video',
  'playwright-trace',
  'console-log',
  'network-log',
  'failure-summary',
] as const;

export const GATE_5_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'journeyId',
  'viewportId',
  'assertionId',
  'artifactPath',
  'consoleErrors',
  'networkFailures',
  'screenshotPath',
  'tracePath',
  'durationMs',
] as const;

export const GATE_5_REQUIRED_PUBLIC_FORBIDDEN_ENDPOINT_PATTERNS = [
  '/generated-apps/{appId}',
  '/generated-apps/{appId}/generation-runs',
  '/generated-apps/{appId}/gate-runs',
  '/generated-apps/{appId}/submissions',
  '/settings',
  '/internal',
] as const;

export const GATE_5_REQUIRED_SECRET_LEAK_PATTERNS = [
  'authorization',
  'public_share_token',
  'api_key',
  'secret',
] as const;

export function buildBrowserAcceptancePlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel = 'browser-acceptance-skeleton',
): GeneratedAppBrowserAcceptancePlan {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const gate4PublicCheckIds = integrationPlan.publicRuntimeApiChecks.map(
    (check) => check.checkId,
  );
  const gate4CreatorCheckIds = integrationPlan.creatorManagementApiChecks.map(
    (check) => check.checkId,
  );
  const gate4ApiCheckIds = [...gate4PublicCheckIds, ...gate4CreatorCheckIds];
  const gate4TraceArtifactIds = integrationPlan.traceArtifacts.map(
    (artifact) => artifact.artifactId,
  );
  const allJourneyIds = [
    ...GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS,
    ...GATE_5_CREATOR_MANAGEMENT_JOURNEY_IDS,
  ];
  const publicViewportIds = [...GATE_5_VIEWPORT_IDS];
  const allAssertionIds = [...GATE_5_REQUIRED_ASSERTION_IDS];

  const publicRuntimeJourneys: GeneratedAppBrowserAcceptancePlan['publicRuntimeJourneys'] =
    [
      {
        journeyId: 'gate-5-public-runtime-open',
        kind: 'public_runtime_open',
        title: '打开公开 runtime 页面并校验可访问面',
        steps: [
          '打开公开 runtime URL，占位访问标识由测试 fixture 提供。',
          '确认只展示 end-user runtime surface 和数据用途提示。',
          '确认页面不展示 Studio 管理接口、源码、测试报告或内部配置。',
        ],
        viewportIds: publicViewportIds,
        scenarioIds,
        requirementIds,
        publicRuntimeApiCheckIds: ['gate-4-public-runtime-read'],
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-frontend-route-contract',
        ],
      },
      {
        journeyId: 'gate-5-public-runtime-submit',
        kind: 'public_runtime_interaction_submit',
        title: '填写公开 runtime 表单/交互并提交',
        steps: [
          '按 acceptance scenario fixture 填写或交互关键输入。',
          '提交公开应用输入并等待运行状态进入可读结果态或错误态。',
          '确认公开端请求只命中 public runtime surface。',
        ],
        viewportIds: publicViewportIds,
        scenarioIds,
        requirementIds,
        publicRuntimeApiCheckIds: ['gate-4-public-runtime-submit-input'],
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-submission-persistence-contract',
        ],
      },
      {
        journeyId: 'gate-5-public-build-preview-submit',
        kind: 'public_build_preview_submit',
        title: '打开公开 build preview HTML 并提交',
        steps: [
          '打开 runtimeSurface.previewUrl 指向的 Gate 3 build output HTML。',
          '确认 HTML 只从公开预览路径解析访问标识，不渲染真实 token 值。',
          '提交动态表单，确认只调用同源 public submission create/detail API；API 不可用时保留本地 deterministic fallback。',
        ],
        viewportIds: publicViewportIds,
        scenarioIds,
        requirementIds,
        publicRuntimeApiCheckIds: [
          'gate-4-public-runtime-read',
          'gate-4-public-runtime-submit-input',
          'gate-4-public-submission-detail',
        ],
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-frontend-route-contract',
          'gate-2-submission-persistence-contract',
        ],
      },
      {
        journeyId: 'gate-5-public-submission-detail',
        kind: 'public_submission_result_detail',
        title: '读取公开 submission detail',
        steps: [
          '使用提交响应中的 submission id 读取结果详情。',
          '确认结果/报告/错误态字段符合 public runtime output contract。',
          '确认旧访问标识或非当前应用 submission 不可被读取。',
        ],
        viewportIds: publicViewportIds,
        scenarioIds,
        requirementIds,
        publicRuntimeApiCheckIds: ['gate-4-public-submission-detail'],
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-submission-persistence-contract',
        ],
      },
    ];
  const creatorManagementJourneys: GeneratedAppBrowserAcceptancePlan['creatorManagementJourneys'] =
    [
      {
        journeyId: 'gate-5-creator-generation-run-review',
        kind: 'creator_generation_run_review',
        title: '创建者查看 generation run',
        steps: [
          '创建者在登录态打开生成应用工作台。',
          '读取 generation run 列表并定位当前 run。',
          '确认状态、summary、failure reason 和预算字段可供诊断。',
        ],
        viewportIds: ['viewport-desktop'],
        scenarioIds,
        requirementIds,
        creatorManagementApiCheckIds: ['gate-4-creator-generation-run-query'],
        staticContractIds: [
          'gate-2-test-entry-contract',
          'gate-2-traceability-contract',
        ],
      },
      {
        journeyId: 'gate-5-creator-gate-run-review',
        kind: 'creator_gate_run_review',
        title: '创建者查看 linked gate runs',
        steps: [
          '创建者选择当前 generation run。',
          '读取 gate run 列表并按 generationRunId 过滤。',
          '确认 Gate 0-5 evidence summary 可读且未展示 public share access value。',
        ],
        viewportIds: ['viewport-desktop'],
        scenarioIds,
        requirementIds,
        creatorManagementApiCheckIds: ['gate-4-creator-gate-run-query'],
        staticContractIds: [
          'gate-2-test-entry-contract',
          'gate-2-traceability-contract',
        ],
      },
      {
        journeyId: 'gate-5-creator-submission-review',
        kind: 'creator_submission_review',
        title: '创建者查看 submission 列表与详情',
        steps: [
          '创建者打开 submission 列表。',
          '读取单条 submission detail。',
          '确认 input/result/report/error 字段可读且遵守软删除边界。',
        ],
        viewportIds: ['viewport-desktop'],
        scenarioIds,
        requirementIds,
        creatorManagementApiCheckIds: ['gate-4-creator-submission-query'],
        staticContractIds: [
          'gate-2-submission-persistence-contract',
          'gate-2-traceability-contract',
        ],
      },
    ];

  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    staticContractsVersion: staticContracts.contractVersion,
    buildUnitPlanVersion: buildUnitPlan.planVersion,
    integrationPlanVersion: integrationPlan.planVersion,
    executionLevel,
    skeletonDisclaimer:
      executionLevel === 'real-browser-e2e'
        ? GATE_5_REAL_BROWSER_E2E_NOTE
        : executionLevel === 'real-local-browser-contract'
          ? GATE_5_REAL_LOCAL_BROWSER_CONTRACT_NOTE
          : GATE_5_SKELETON_EVIDENCE_NOTE,
    browserToolPlan: {
      runner:
        executionLevel === 'browser-acceptance-skeleton' ||
        executionLevel === 'real-browser-e2e'
          ? 'playwright'
          : 'local-browser-contract',
      command:
        executionLevel === 'browser-acceptance-skeleton'
          ? staticContracts.testEntry.browserGateCommand
          : executionLevel === 'real-browser-e2e'
            ? GATE_5_REAL_BROWSER_E2E_COMMAND
            : GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND,
      testEntry:
        executionLevel === 'browser-acceptance-skeleton'
          ? 'tests/generated-app/browser-acceptance.spec.ts'
          : executionLevel === 'real-browser-e2e'
            ? 'server-controlled-playwright-e2e'
            : 'server-controlled-local-browser-contract',
      workingDirectory: 'generated-run',
      baseUrlShape:
        executionLevel === 'browser-acceptance-skeleton'
          ? 'http://localhost:{previewPort}/generated-apps/public/{publicShareAccess}'
          : executionLevel === 'real-browser-e2e'
            ? 'server-controlled-public-preview://generated-apps/public/{publicShareAccess}'
            : 'local-contract://generated-app/public-runtime/{publicShareAccess}',
      publicShareAccessPlaceholder: '{publicShareAccessFromTestFixture}',
      usesRealTokens: false,
      scenarioIds,
      runnerMode:
        executionLevel === 'real-browser-e2e'
          ? 'real-browser-e2e'
          : executionLevel === 'real-local-browser-contract'
            ? 'real'
            : executionLevel === 'fixture-browser-acceptance'
              ? 'fixture'
              : executionLevel === 'disabled-browser-acceptance'
                ? 'disabled'
                : undefined,
      serverControlled: executionLevel !== 'browser-acceptance-skeleton',
      requiredEnvironment:
        executionLevel === 'real-browser-e2e'
          ? [
              'GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
              'playwright package installed in agentloom-server',
              'playwright browser binaries installed in runtime image',
              'server-provided public preview/runtime base URL',
            ]
          : undefined,
      allowedPublicEndpoints:
        executionLevel === 'real-browser-e2e'
          ? ['/generated-apps/public/{token}']
          : undefined,
      forbiddenEndpointPatterns:
        executionLevel === 'real-browser-e2e'
          ? [
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
            ]
          : undefined,
      artifactPolicy:
        executionLevel === 'real-browser-e2e'
          ? {
              root: 'generated-run',
              allowHostAbsolutePaths: false,
              allowCreatorApis: false,
              allowInternalArtifacts: false,
              redactSensitiveValues: true,
            }
          : undefined,
    },
    viewportMatrix: [
      {
        viewportId: 'viewport-desktop',
        category: 'desktop',
        deviceLabel: 'Desktop 1440x900',
        width: 1440,
        height: 900,
        scenarioIds,
        requirementIds,
      },
      {
        viewportId: 'viewport-mobile',
        category: 'mobile',
        deviceLabel: 'Mobile 390x844',
        width: 390,
        height: 844,
        scenarioIds,
        requirementIds,
      },
    ],
    publicRuntimeJourneys,
    creatorManagementJourneys,
    consoleAssertions: [
      {
        assertionId: 'gate-5-console-no-unhandled-error',
        kind: 'no_unhandled_console_error',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        allowedWarnings: [],
        emptyAllowedWarningsReason:
          'Gate 5 skeleton 默认不允许 console warning；如真实 runner 后续需要允许列表，必须显式列出原因和匹配规则。',
      },
      {
        assertionId: 'gate-5-console-allowed-warning-policy',
        kind: 'allowed_warning_policy',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        allowedWarnings: [],
        emptyAllowedWarningsReason:
          '当前 browser acceptance skeleton 没有已知允许 warning。',
      },
    ],
    networkAssertions: [
      {
        assertionId: 'gate-5-network-core-requests-2xx',
        kind: 'core_requests_2xx',
        journeyIds: allJourneyIds,
        apiCheckIds: gate4ApiCheckIds,
        staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
        forbiddenEndpointPatterns: [],
        expectedStatusRange: '2xx',
      },
      {
        assertionId: 'gate-5-network-public-forbids-creator-internal',
        kind: 'public_journey_forbids_creator_internal_endpoints',
        journeyIds: [...GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS],
        apiCheckIds: gate4PublicCheckIds,
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-submission-persistence-contract',
        ],
        forbiddenEndpointPatterns: [
          '/generated-apps/{appId}',
          '/generated-apps/{appId}/generation-runs',
          '/generated-apps/{appId}/gate-runs',
          '/generated-apps/{appId}/submissions',
          '/settings',
          '/internal',
        ],
        expectedStatusRange: '2xx',
      },
      {
        assertionId: 'gate-5-network-no-token-secret-leak',
        kind: 'no_token_or_secret_leak',
        journeyIds: allJourneyIds,
        apiCheckIds: gate4ApiCheckIds,
        staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
        forbiddenEndpointPatterns: [
          'authorization',
          'public_share_token',
          'api_key',
          'secret',
        ],
        expectedStatusRange: '2xx',
      },
    ],
    accessibilityInteractionAssertions: [
      {
        assertionId: 'gate-5-accessibility-critical-inputs-reachable',
        kind: 'critical_inputs_reachable',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-frontend-route-contract',
        ],
      },
      {
        assertionId: 'gate-5-accessibility-critical-buttons-clickable',
        kind: 'critical_buttons_clickable',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-frontend-route-contract',
        ],
      },
      {
        assertionId: 'gate-5-accessibility-main-content-not-occluded',
        kind: 'main_content_not_occluded',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        staticContractIds: ['gate-2-frontend-route-contract'],
      },
    ],
    responsiveLayoutAssertions: [
      {
        assertionId: 'gate-5-responsive-desktop-no-overflow',
        kind: 'desktop_no_critical_overflow',
        journeyIds: allJourneyIds,
        viewportIds: ['viewport-desktop'],
        staticContractIds: ['gate-2-frontend-route-contract'],
      },
      {
        assertionId: 'gate-5-responsive-mobile-no-overflow',
        kind: 'mobile_no_critical_overflow',
        journeyIds: allJourneyIds,
        viewportIds: ['viewport-mobile'],
        staticContractIds: ['gate-2-frontend-route-contract'],
      },
      {
        assertionId: 'gate-5-responsive-content-not-occluded',
        kind: 'viewport_content_not_occluded',
        journeyIds: allJourneyIds,
        viewportIds: publicViewportIds,
        staticContractIds: ['gate-2-frontend-route-contract'],
      },
    ],
    artifactExpectations: [
      {
        artifactId: 'desktop-screenshot',
        kind: 'screenshot',
        path: 'artifacts/gate-5/screenshots/desktop.png',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: allAssertionIds,
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'mobile-screenshot',
        kind: 'screenshot',
        path: 'artifacts/gate-5/screenshots/mobile.png',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: allAssertionIds,
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'browser-video',
        kind: 'video',
        path: 'artifacts/gate-5/browser-video.webm',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: allAssertionIds,
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'playwright-trace',
        kind: 'playwright_trace',
        path: 'artifacts/gate-5/playwright-trace.zip',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: allAssertionIds,
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'console-log',
        kind: 'console_log',
        path: 'artifacts/gate-5/console.json',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: [
          'gate-5-console-no-unhandled-error',
          'gate-5-console-allowed-warning-policy',
        ],
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'network-log',
        kind: 'network_log',
        path: 'artifacts/gate-5/network.json',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: [
          'gate-5-network-core-requests-2xx',
          'gate-5-network-public-forbids-creator-internal',
          'gate-5-network-no-token-secret-leak',
        ],
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
      {
        artifactId: 'failure-summary',
        kind: 'failure_summary',
        path: 'artifacts/gate-5/failure-summary.json',
        required: true,
        producedByJourneyIds: allJourneyIds,
        producedByAssertionIds: allAssertionIds,
        referencesGate4TraceArtifactIds: gate4TraceArtifactIds,
      },
    ],
    acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map((scenario) => ({
      scenarioId: scenario.id,
      requirementIds: scenario.requirementIds,
      journeyIds: allJourneyIds,
      viewportIds: publicViewportIds,
      assertionIds: allAssertionIds,
      artifactIds: [...GATE_5_REQUIRED_ARTIFACT_IDS],
    })),
    requirementCoverage: appSpec.coreRequirements.map((requirement) => ({
      requirementId: requirement.id,
      scenarioIds:
        appSpec.traceability.find(
          (entry) => entry.requirementId === requirement.id,
        )?.scenarioIds ?? [],
      journeyIds: allJourneyIds,
      assertionIds: allAssertionIds,
      artifactIds: [...GATE_5_REQUIRED_ARTIFACT_IDS],
      staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
      gate4ApiCheckIds,
    })),
    journeyCoverage: [
      ...publicRuntimeJourneys.map((journey) => ({
        journeyId: journey.journeyId,
        kind: journey.kind,
        scenarioIds: journey.scenarioIds,
        requirementIds: journey.requirementIds,
        viewportIds: journey.viewportIds,
        assertionIds: allAssertionIds,
        artifactIds: [...GATE_5_REQUIRED_ARTIFACT_IDS],
      })),
      ...creatorManagementJourneys.map((journey) => ({
        journeyId: journey.journeyId,
        kind: journey.kind,
        scenarioIds: journey.scenarioIds,
        requirementIds: journey.requirementIds,
        viewportIds: journey.viewportIds,
        assertionIds: allAssertionIds,
        artifactIds: [...GATE_5_REQUIRED_ARTIFACT_IDS],
      })),
    ],
    failureCaptureFields: [
      ...GATE_5_REQUIRED_FAILURE_CAPTURE_FIELDS,
      'redactedConsoleSample',
      'redactedNetworkSample',
    ],
  };
}

export function evaluateGate5BrowserAcceptancePlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: unknown,
): Gate5Evaluation {
  const checks = buildGate5Checks(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
  );
  const browserPlanRecord = isRecord(browserAcceptancePlan)
    ? browserAcceptancePlan
    : null;
  const gate5EvidenceNote =
    browserPlanRecord?.executionLevel === 'real-browser-e2e'
      ? GATE_5_REAL_BROWSER_E2E_NOTE
      : browserPlanRecord?.executionLevel === 'real-local-browser-contract'
        ? GATE_5_REAL_LOCAL_BROWSER_CONTRACT_NOTE
        : GATE_5_SKELETON_EVIDENCE_NOTE;
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-5-${check.id}`,
    label: check.label,
    kind: 'browser' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? `${check.summary} ${gate5EvidenceNote}`
        : `${check.summary} 缺口：${check.issues.join(
            '；',
          )} ${gate5EvidenceNote}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'browser-acceptance-plan-incomplete',
      message: `BrowserAcceptancePlan 浏览器验收 skeleton 检查失败：${failedChecks
        .map((check) => check.label)
        .join(
          '、',
        )}；本失败来自 browser acceptance plan 合约完整性检查，Gate 5 runner 不会在计划不完整或边界不安全时继续执行。`,
      details: {
        checks: checks.map((check) => ({
          id: check.id,
          label: check.label,
          passed: check.passed,
          issues: check.issues,
        })),
      },
    };

    return {
      status: 'failed',
      summary:
        'Gate 5 失败：browserAcceptancePlan 未完整覆盖浏览器 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、artifact refs、覆盖矩阵、失败捕获字段或安全边界；计划不完整时不会执行 Gate 5 runner，也不会继续 Gate 6-7。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.browserAcceptancePlan，使其覆盖 Gate 5 executionLevel、受控 runner、desktop/mobile viewport matrix、公开 runtime 与创建者管理 journeys、console/network/accessibility/responsive assertions、generated-run relative artifact refs、需求/场景/旅程覆盖和 failure capture fields；fixture/disabled 不得标记为真实执行通过。',
    };
  }

  return {
    status: 'passed',
    summary:
      browserPlanRecord?.executionLevel === 'real-browser-e2e'
        ? 'Gate 5 计划通过：browserAcceptancePlan 已完整覆盖服务端受控 real-browser-e2e runner contract、桌面/移动视口、公开 runtime open/fill/submit/detail/report journeys、public preview submission handoff、console/network/accessibility/responsive assertions、generated-run relative artifact refs、覆盖矩阵、失败捕获字段和安全边界；将继续执行真实浏览器 runner 可用性/执行检查。'
        : browserPlanRecord?.executionLevel === 'real-local-browser-contract'
          ? 'Gate 5 计划通过：browserAcceptancePlan 已完整覆盖 real-local browser-contract runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、artifact refs、覆盖矩阵、失败捕获字段和安全边界；将继续执行受控本地 browser contract runner。'
          : 'Gate 5 通过：browserAcceptancePlan 浏览器验收 skeleton/fixture 计划已完整覆盖 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、artifact refs、覆盖矩阵和失败捕获字段；fixture/skeleton 不代表真实 browser acceptance 执行。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function buildGate5Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: unknown,
): Gate5Check[] {
  if (!isRecord(browserAcceptancePlan)) {
    return [
      {
        id: 'browser-acceptance-plan-object',
        label: 'BrowserAcceptancePlan JSON 对象',
        passed: false,
        summary:
          '检查 generationPlan.browserAcceptancePlan 是否为结构化 JSON 对象。',
        issues: ['browserAcceptancePlan 不是对象'],
      },
    ];
  }

  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const knownRequirementIds = new Set(requirementIds);
  const knownScenarioIds = new Set(scenarioIds);
  const knownStaticContractIds = new Set<string>([
    ...GATE_2_STATIC_CONTRACT_IDS,
  ]);
  const gate4PublicApiCheckIds = integrationPlan.publicRuntimeApiChecks.map(
    (check) => check.checkId,
  );
  const gate4CreatorApiCheckIds =
    integrationPlan.creatorManagementApiChecks.map((check) => check.checkId);
  const gate4ApiCheckIds = [
    ...gate4PublicApiCheckIds,
    ...gate4CreatorApiCheckIds,
  ];
  const knownGate4PublicApiCheckIds = new Set(gate4PublicApiCheckIds);
  const knownGate4CreatorApiCheckIds = new Set(gate4CreatorApiCheckIds);
  const knownGate4ApiCheckIds = new Set(gate4ApiCheckIds);
  const gate4TraceArtifactIds = integrationPlan.traceArtifacts.map(
    (artifact) => artifact.artifactId,
  );
  const knownGate4TraceArtifactIds = new Set(gate4TraceArtifactIds);

  const browserToolPlan = getRecord(browserAcceptancePlan.browserToolPlan);
  const viewportMatrix = getRecordArray(browserAcceptancePlan.viewportMatrix);
  const publicRuntimeJourneys = getRecordArray(
    browserAcceptancePlan.publicRuntimeJourneys,
  );
  const creatorManagementJourneys = getRecordArray(
    browserAcceptancePlan.creatorManagementJourneys,
  );
  const consoleAssertions = getRecordArray(
    browserAcceptancePlan.consoleAssertions,
  );
  const networkAssertions = getRecordArray(
    browserAcceptancePlan.networkAssertions,
  );
  const accessibilityAssertions = getRecordArray(
    browserAcceptancePlan.accessibilityInteractionAssertions,
  );
  const responsiveAssertions = getRecordArray(
    browserAcceptancePlan.responsiveLayoutAssertions,
  );
  const allAssertions = [
    ...consoleAssertions,
    ...networkAssertions,
    ...accessibilityAssertions,
    ...responsiveAssertions,
  ];
  const artifactExpectations = getRecordArray(
    browserAcceptancePlan.artifactExpectations,
  );
  const acceptanceScenarioCoverage = getRecordArray(
    browserAcceptancePlan.acceptanceScenarioCoverage,
  );
  const requirementCoverage = getRecordArray(
    browserAcceptancePlan.requirementCoverage,
  );
  const journeyCoverage = getRecordArray(browserAcceptancePlan.journeyCoverage);

  const viewportIds = viewportMatrix
    .map((viewport) => getNonEmptyString(viewport.viewportId))
    .filter((viewportId): viewportId is string => viewportId !== null);
  const knownViewportIds = new Set(viewportIds);
  const publicJourneyIds = publicRuntimeJourneys
    .map((journey) => getNonEmptyString(journey.journeyId))
    .filter((journeyId): journeyId is string => journeyId !== null);
  const creatorJourneyIds = creatorManagementJourneys
    .map((journey) => getNonEmptyString(journey.journeyId))
    .filter((journeyId): journeyId is string => journeyId !== null);
  const journeyIds = [...publicJourneyIds, ...creatorJourneyIds];
  const knownJourneyIds = new Set(journeyIds);
  const assertionIds = allAssertions
    .map((assertion) => getNonEmptyString(assertion.assertionId))
    .filter((assertionId): assertionId is string => assertionId !== null);
  const knownAssertionIds = new Set(assertionIds);
  const artifactIds = artifactExpectations
    .map((artifact) => getNonEmptyString(artifact.artifactId))
    .filter((artifactId): artifactId is string => artifactId !== null);
  const knownArtifactIds = new Set(artifactIds);
  const expectedPublicJourneyKinds = new Map<string, string>([
    ['gate-5-public-runtime-open', 'public_runtime_open'],
    ['gate-5-public-runtime-submit', 'public_runtime_interaction_submit'],
    ['gate-5-public-build-preview-submit', 'public_build_preview_submit'],
    ['gate-5-public-submission-detail', 'public_submission_result_detail'],
  ]);
  const expectedCreatorJourneyKinds = new Map<string, string>([
    ['gate-5-creator-generation-run-review', 'creator_generation_run_review'],
    ['gate-5-creator-gate-run-review', 'creator_gate_run_review'],
    ['gate-5-creator-submission-review', 'creator_submission_review'],
  ]);
  const expectedAssertionKinds = new Map<string, string>([
    ['gate-5-console-no-unhandled-error', 'no_unhandled_console_error'],
    ['gate-5-console-allowed-warning-policy', 'allowed_warning_policy'],
    ['gate-5-network-core-requests-2xx', 'core_requests_2xx'],
    [
      'gate-5-network-public-forbids-creator-internal',
      'public_journey_forbids_creator_internal_endpoints',
    ],
    ['gate-5-network-no-token-secret-leak', 'no_token_or_secret_leak'],
    [
      'gate-5-accessibility-critical-inputs-reachable',
      'critical_inputs_reachable',
    ],
    [
      'gate-5-accessibility-critical-buttons-clickable',
      'critical_buttons_clickable',
    ],
    [
      'gate-5-accessibility-main-content-not-occluded',
      'main_content_not_occluded',
    ],
    ['gate-5-responsive-desktop-no-overflow', 'desktop_no_critical_overflow'],
    ['gate-5-responsive-mobile-no-overflow', 'mobile_no_critical_overflow'],
    ['gate-5-responsive-content-not-occluded', 'viewport_content_not_occluded'],
  ]);

  const versionIssues = [
    ...(browserAcceptancePlan.planVersion === 1
      ? []
      : ['planVersion 必须为 1']),
    ...(browserAcceptancePlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            browserAcceptancePlan.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(browserAcceptancePlan.generationPlanVersion ===
    generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            browserAcceptancePlan.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
    ...(browserAcceptancePlan.staticContractsVersion ===
    staticContracts.contractVersion
      ? []
      : [
          `staticContractsVersion=${String(
            browserAcceptancePlan.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...(browserAcceptancePlan.buildUnitPlanVersion === buildUnitPlan.planVersion
      ? []
      : [
          `buildUnitPlanVersion=${String(
            browserAcceptancePlan.buildUnitPlanVersion,
          )} 与 buildUnitPlan.planVersion=${buildUnitPlan.planVersion} 不一致`,
        ]),
    ...(browserAcceptancePlan.integrationPlanVersion ===
    integrationPlan.planVersion
      ? []
      : [
          `integrationPlanVersion=${String(
            browserAcceptancePlan.integrationPlanVersion,
          )} 与 integrationPlan.planVersion=${integrationPlan.planVersion} 不一致`,
        ]),
    ...(typeof browserAcceptancePlan.executionLevel === 'string' &&
    GATE_5_ALLOWED_EXECUTION_LEVELS.includes(
      browserAcceptancePlan.executionLevel as (typeof GATE_5_ALLOWED_EXECUTION_LEVELS)[number],
    )
      ? []
      : [
          `executionLevel 必须为 ${GATE_5_ALLOWED_EXECUTION_LEVELS.join(
            ' | ',
          )}`,
        ]),
    ...(!getNonEmptyString(browserAcceptancePlan.skeletonDisclaimer)
      ? ['skeletonDisclaimer 缺失']
      : []),
  ];
  const expectedBrowserRunner =
    browserAcceptancePlan.executionLevel === 'browser-acceptance-skeleton' ||
    browserAcceptancePlan.executionLevel === 'real-browser-e2e'
      ? 'playwright'
      : 'local-browser-contract';
  const expectedBrowserCommand =
    browserAcceptancePlan.executionLevel === 'browser-acceptance-skeleton'
      ? staticContracts.testEntry.browserGateCommand
      : browserAcceptancePlan.executionLevel === 'real-browser-e2e'
        ? GATE_5_REAL_BROWSER_E2E_COMMAND
        : GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND;
  const browserToolIssues = [
    ...requireRecord(browserToolPlan, 'browserToolPlan'),
    ...(browserToolPlan?.runner === expectedBrowserRunner
      ? []
      : [
          `browserToolPlan.runner 必须为 ${expectedBrowserRunner}，与 executionLevel=${String(
            browserAcceptancePlan.executionLevel,
          )} 匹配`,
        ]),
    ...(!getNonEmptyString(browserToolPlan?.command)
      ? ['browserToolPlan.command 缺失']
      : []),
    ...(getNonEmptyString(browserToolPlan?.command) === expectedBrowserCommand
      ? []
      : [
          `browserToolPlan.command 必须为受控命令描述 ${expectedBrowserCommand}`,
        ]),
    ...(!getNonEmptyString(browserToolPlan?.testEntry)
      ? ['browserToolPlan.testEntry 缺失']
      : []),
    ...(!getNonEmptyString(browserToolPlan?.workingDirectory)
      ? ['browserToolPlan.workingDirectory 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'browserToolPlan.workingDirectory',
      getNonEmptyString(browserToolPlan?.workingDirectory),
    ),
    ...(browserAcceptancePlan.executionLevel !==
      'browser-acceptance-skeleton' &&
    getNonEmptyString(browserToolPlan?.workingDirectory) !== 'generated-run'
      ? ['browserToolPlan.workingDirectory 必须为 generated-run']
      : []),
    ...(!getNonEmptyString(browserToolPlan?.baseUrlShape)
      ? ['browserToolPlan.baseUrlShape 缺失']
      : []),
    ...(getNonEmptyString(browserToolPlan?.baseUrlShape)?.includes(
      '{publicShareAccess}',
    )
      ? []
      : ['browserToolPlan.baseUrlShape 必须使用占位访问标识']),
    ...(!getNonEmptyString(browserToolPlan?.publicShareAccessPlaceholder)
      ? ['browserToolPlan.publicShareAccessPlaceholder 缺失']
      : []),
    ...(browserToolPlan?.usesRealTokens === false
      ? []
      : ['browserToolPlan.usesRealTokens 必须为 false']),
    ...buildMissingItemsIssues(
      'browserToolPlan.scenarioIds',
      getStringArray(browserToolPlan?.scenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'browserToolPlan.scenarioIds',
      getStringArray(browserToolPlan?.scenarioIds),
      knownScenarioIds,
    ),
    ...collectSensitiveTokenIssues(
      browserAcceptancePlan,
      'browserAcceptancePlan',
    ),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.serverControlled !== true
      ? ['browserToolPlan.serverControlled 必须为 true']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    !Array.isArray(browserToolPlan?.requiredEnvironment)
      ? ['browserToolPlan.requiredEnvironment 必须声明真实 E2E 环境要求']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    !getStringArray(browserToolPlan?.requiredEnvironment).includes(
      'GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
    )
      ? [
          'browserToolPlan.requiredEnvironment 缺少 GENERATED_APP_GATE5_EXECUTOR_MODE=real-browser-e2e',
        ]
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    !getStringArray(browserToolPlan?.allowedPublicEndpoints).includes(
      '/generated-apps/public/{token}',
    )
      ? [
          'browserToolPlan.allowedPublicEndpoints 必须只开放 /generated-apps/public/{token}',
        ]
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e'
      ? ['/generated-apps/{appId}', '/internal', '/settings'].flatMap(
          (requiredPattern) =>
            getStringArray(browserToolPlan?.forbiddenEndpointPatterns).includes(
              requiredPattern,
            )
              ? []
              : [
                  `browserToolPlan.forbiddenEndpointPatterns 缺少 ${requiredPattern}`,
                ],
        )
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    !browserToolPlan?.artifactPolicy
      ? ['browserToolPlan.artifactPolicy 缺失']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.artifactPolicy &&
    getRecord(browserToolPlan.artifactPolicy)?.root !== 'generated-run'
      ? ['browserToolPlan.artifactPolicy.root 必须为 generated-run']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.artifactPolicy &&
    getRecord(browserToolPlan.artifactPolicy)?.allowHostAbsolutePaths !== false
      ? ['browserToolPlan.artifactPolicy.allowHostAbsolutePaths 必须为 false']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.artifactPolicy &&
    getRecord(browserToolPlan.artifactPolicy)?.allowCreatorApis !== false
      ? ['browserToolPlan.artifactPolicy.allowCreatorApis 必须为 false']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.artifactPolicy &&
    getRecord(browserToolPlan.artifactPolicy)?.allowInternalArtifacts !== false
      ? ['browserToolPlan.artifactPolicy.allowInternalArtifacts 必须为 false']
      : []),
    ...(browserAcceptancePlan.executionLevel === 'real-browser-e2e' &&
    browserToolPlan?.artifactPolicy &&
    getRecord(browserToolPlan.artifactPolicy)?.redactSensitiveValues !== true
      ? ['browserToolPlan.artifactPolicy.redactSensitiveValues 必须为 true']
      : []),
  ];
  const viewportIssues = [
    ...(viewportMatrix.length === 0 ? ['viewportMatrix 不能为空'] : []),
    ...buildMissingItemsIssues('viewportMatrix.viewportId', viewportIds, [
      ...GATE_5_VIEWPORT_IDS,
    ]),
    ...buildDuplicateItemIssues('viewportMatrix.viewportId', viewportIds),
    ...(viewportMatrix.some((viewport) => viewport.category === 'desktop')
      ? []
      : ['viewportMatrix 必须包含 desktop 视口']),
    ...(viewportMatrix.some((viewport) => viewport.category === 'mobile')
      ? []
      : ['viewportMatrix 必须包含 mobile 视口']),
    ...viewportMatrix.flatMap((viewport, index) => [
      ...(!getNonEmptyString(viewport.viewportId)
        ? [`viewportMatrix[${index}].viewportId 缺失`]
        : []),
      ...(!['desktop', 'mobile'].includes(String(viewport.category))
        ? [`viewportMatrix[${index}].category 必须为 desktop 或 mobile`]
        : []),
      ...(!getNonEmptyString(viewport.deviceLabel)
        ? [`viewportMatrix[${index}].deviceLabel 缺失`]
        : []),
      ...(typeof viewport.width === 'number' && viewport.width > 0
        ? []
        : [`viewportMatrix[${index}].width 必须为正数`]),
      ...(typeof viewport.height === 'number' && viewport.height > 0
        ? []
        : [`viewportMatrix[${index}].height 必须为正数`]),
      ...buildMissingItemsIssues(
        `viewportMatrix[${index}].scenarioIds`,
        getStringArray(viewport.scenarioIds),
        scenarioIds,
      ),
      ...buildUnknownReferenceIssues(
        `viewportMatrix[${index}].scenarioIds`,
        getStringArray(viewport.scenarioIds),
        knownScenarioIds,
      ),
      ...buildMissingItemsIssues(
        `viewportMatrix[${index}].requirementIds`,
        getStringArray(viewport.requirementIds),
        requirementIds,
      ),
      ...buildUnknownReferenceIssues(
        `viewportMatrix[${index}].requirementIds`,
        getStringArray(viewport.requirementIds),
        knownRequirementIds,
      ),
    ]),
  ];
  const publicJourneyIssues = [
    ...(publicRuntimeJourneys.length === 0
      ? ['publicRuntimeJourneys 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publicRuntimeJourneys.journeyId',
      publicJourneyIds,
      [...GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS],
    ),
    ...buildDuplicateItemIssues(
      'publicRuntimeJourneys.journeyId',
      publicJourneyIds,
    ),
    ...publicRuntimeJourneys.flatMap((journey, index) => {
      const journeyId = getNonEmptyString(journey.journeyId);
      const kind = getNonEmptyString(journey.kind);
      const expectedKind = journeyId
        ? expectedPublicJourneyKinds.get(journeyId)
        : undefined;

      return [
        ...(!journeyId
          ? [`publicRuntimeJourneys[${index}].journeyId 缺失`]
          : []),
        ...(journeyId && !expectedPublicJourneyKinds.has(journeyId)
          ? [
              `publicRuntimeJourneys[${index}].journeyId 引用了未知 journey ${formatIssueValue(
                journeyId,
              )}`,
            ]
          : []),
        ...(!kind ? [`publicRuntimeJourneys[${index}].kind 缺失`] : []),
        ...(kind &&
        !GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS.includes(
          kind as (typeof GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS)[number],
        )
          ? [
              `publicRuntimeJourneys[${index}].kind 必须是 ${GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(expectedKind && kind !== expectedKind
          ? [
              `publicRuntimeJourneys[${index}].kind 与 journeyId ${journeyId} 不一致`,
            ]
          : []),
        ...(!getNonEmptyString(journey.title)
          ? [`publicRuntimeJourneys[${index}].title 缺失`]
          : []),
        ...(getStringArray(journey.steps).length === 0
          ? [`publicRuntimeJourneys[${index}].steps 不能为空`]
          : []),
        ...buildMissingItemsIssues(
          `publicRuntimeJourneys[${index}].viewportIds`,
          getStringArray(journey.viewportIds),
          [...GATE_5_VIEWPORT_IDS],
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeJourneys[${index}].viewportIds`,
          getStringArray(journey.viewportIds),
          knownViewportIds,
        ),
        ...buildMissingItemsIssues(
          `publicRuntimeJourneys[${index}].scenarioIds`,
          getStringArray(journey.scenarioIds),
          scenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeJourneys[${index}].scenarioIds`,
          getStringArray(journey.scenarioIds),
          knownScenarioIds,
        ),
        ...buildMissingItemsIssues(
          `publicRuntimeJourneys[${index}].requirementIds`,
          getStringArray(journey.requirementIds),
          requirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeJourneys[${index}].requirementIds`,
          getStringArray(journey.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(journey.publicRuntimeApiCheckIds).length === 0
          ? [
              `publicRuntimeJourneys[${index}].publicRuntimeApiCheckIds 不能为空`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `publicRuntimeJourneys[${index}].publicRuntimeApiCheckIds`,
          getStringArray(journey.publicRuntimeApiCheckIds),
          knownGate4PublicApiCheckIds,
        ),
        ...(getStringArray(journey.staticContractIds).length === 0
          ? [`publicRuntimeJourneys[${index}].staticContractIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `publicRuntimeJourneys[${index}].staticContractIds`,
          getStringArray(journey.staticContractIds),
          knownStaticContractIds,
        ),
      ];
    }),
  ];
  const creatorJourneyIssues = [
    ...(creatorManagementJourneys.length === 0
      ? ['creatorManagementJourneys 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'creatorManagementJourneys.journeyId',
      creatorJourneyIds,
      [...GATE_5_CREATOR_MANAGEMENT_JOURNEY_IDS],
    ),
    ...buildDuplicateItemIssues(
      'creatorManagementJourneys.journeyId',
      creatorJourneyIds,
    ),
    ...creatorManagementJourneys.flatMap((journey, index) => {
      const journeyId = getNonEmptyString(journey.journeyId);
      const kind = getNonEmptyString(journey.kind);
      const expectedKind = journeyId
        ? expectedCreatorJourneyKinds.get(journeyId)
        : undefined;

      return [
        ...(!journeyId
          ? [`creatorManagementJourneys[${index}].journeyId 缺失`]
          : []),
        ...(journeyId && !expectedCreatorJourneyKinds.has(journeyId)
          ? [
              `creatorManagementJourneys[${index}].journeyId 引用了未知 journey ${formatIssueValue(
                journeyId,
              )}`,
            ]
          : []),
        ...(!kind ? [`creatorManagementJourneys[${index}].kind 缺失`] : []),
        ...(kind &&
        !GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS.includes(
          kind as (typeof GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS)[number],
        )
          ? [
              `creatorManagementJourneys[${index}].kind 必须是 ${GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(expectedKind && kind !== expectedKind
          ? [
              `creatorManagementJourneys[${index}].kind 与 journeyId ${journeyId} 不一致`,
            ]
          : []),
        ...(!getNonEmptyString(journey.title)
          ? [`creatorManagementJourneys[${index}].title 缺失`]
          : []),
        ...(getStringArray(journey.steps).length === 0
          ? [`creatorManagementJourneys[${index}].steps 不能为空`]
          : []),
        ...(getStringArray(journey.viewportIds).length === 0
          ? [`creatorManagementJourneys[${index}].viewportIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `creatorManagementJourneys[${index}].viewportIds`,
          getStringArray(journey.viewportIds),
          knownViewportIds,
        ),
        ...buildMissingItemsIssues(
          `creatorManagementJourneys[${index}].scenarioIds`,
          getStringArray(journey.scenarioIds),
          scenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `creatorManagementJourneys[${index}].scenarioIds`,
          getStringArray(journey.scenarioIds),
          knownScenarioIds,
        ),
        ...buildMissingItemsIssues(
          `creatorManagementJourneys[${index}].requirementIds`,
          getStringArray(journey.requirementIds),
          requirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `creatorManagementJourneys[${index}].requirementIds`,
          getStringArray(journey.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(journey.creatorManagementApiCheckIds).length === 0
          ? [
              `creatorManagementJourneys[${index}].creatorManagementApiCheckIds 不能为空`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `creatorManagementJourneys[${index}].creatorManagementApiCheckIds`,
          getStringArray(journey.creatorManagementApiCheckIds),
          knownGate4CreatorApiCheckIds,
        ),
        ...(getStringArray(journey.staticContractIds).length === 0
          ? [`creatorManagementJourneys[${index}].staticContractIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `creatorManagementJourneys[${index}].staticContractIds`,
          getStringArray(journey.staticContractIds),
          knownStaticContractIds,
        ),
      ];
    }),
  ];
  const assertionIssues = [
    ...(consoleAssertions.length === 0 ? ['consoleAssertions 不能为空'] : []),
    ...(networkAssertions.length === 0 ? ['networkAssertions 不能为空'] : []),
    ...(accessibilityAssertions.length === 0
      ? ['accessibilityInteractionAssertions 不能为空']
      : []),
    ...(responsiveAssertions.length === 0
      ? ['responsiveLayoutAssertions 不能为空']
      : []),
    ...buildMissingItemsIssues('assertions.assertionId', assertionIds, [
      ...GATE_5_REQUIRED_ASSERTION_IDS,
    ]),
    ...buildDuplicateItemIssues('assertions.assertionId', assertionIds),
    ...allAssertions.flatMap((assertion, index) => {
      const assertionId = getNonEmptyString(assertion.assertionId);
      const kind = getNonEmptyString(assertion.kind);
      const expectedKind = assertionId
        ? expectedAssertionKinds.get(assertionId)
        : undefined;
      const assertionJourneyIds = getStringArray(assertion.journeyIds);
      const assertionViewportIds = getStringArray(assertion.viewportIds);
      const assertionApiCheckIds = getStringArray(assertion.apiCheckIds);
      const forbiddenEndpointPatterns = getStringArray(
        assertion.forbiddenEndpointPatterns,
      );

      return [
        ...(!assertionId ? [`assertions[${index}].assertionId 缺失`] : []),
        ...(assertionId &&
        !GATE_5_REQUIRED_ASSERTION_IDS.includes(
          assertionId as (typeof GATE_5_REQUIRED_ASSERTION_IDS)[number],
        )
          ? [
              `assertions[${index}].assertionId 引用了未知 assertion ${formatIssueValue(
                assertionId,
              )}`,
            ]
          : []),
        ...(!kind ? [`assertions[${index}].kind 缺失`] : []),
        ...(kind &&
        !GATE_5_ALLOWED_ASSERTION_KINDS.includes(
          kind as (typeof GATE_5_ALLOWED_ASSERTION_KINDS)[number],
        )
          ? [
              `assertions[${index}].kind 必须是 ${GATE_5_ALLOWED_ASSERTION_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(expectedKind && kind !== expectedKind
          ? [`assertions[${index}].kind 与 assertionId ${assertionId} 不一致`]
          : []),
        ...(assertionJourneyIds.length === 0
          ? [`assertions[${index}].journeyIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `assertions[${index}].journeyIds`,
          assertionJourneyIds,
          knownJourneyIds,
        ),
        ...('viewportIds' in assertion && assertionViewportIds.length === 0
          ? [`assertions[${index}].viewportIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `assertions[${index}].viewportIds`,
          assertionViewportIds,
          knownViewportIds,
        ),
        ...(kind === 'allowed_warning_policy' &&
        getStringArray(assertion.allowedWarnings).length === 0 &&
        !getNonEmptyString(assertion.emptyAllowedWarningsReason)
          ? [
              `assertions[${index}].emptyAllowedWarningsReason 缺失；allowed warning 为空时必须说明原因`,
            ]
          : []),
        ...(kind === 'core_requests_2xx' &&
        assertion.expectedStatusRange !== '2xx'
          ? [`assertions[${index}].expectedStatusRange 必须为 2xx`]
          : []),
        ...('apiCheckIds' in assertion && assertionApiCheckIds.length === 0
          ? [`assertions[${index}].apiCheckIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `assertions[${index}].apiCheckIds`,
          assertionApiCheckIds,
          knownGate4ApiCheckIds,
        ),
        ...('staticContractIds' in assertion &&
        getStringArray(assertion.staticContractIds).length === 0
          ? [`assertions[${index}].staticContractIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `assertions[${index}].staticContractIds`,
          getStringArray(assertion.staticContractIds),
          knownStaticContractIds,
        ),
        ...(kind === 'public_journey_forbids_creator_internal_endpoints'
          ? [
              ...assertionJourneyIds
                .filter((journeyId) => !publicJourneyIds.includes(journeyId))
                .map(
                  (journeyId) =>
                    `assertions[${index}].journeyIds 只能引用公开 runtime journey，收到 ${formatIssueValue(
                      journeyId,
                    )}`,
                ),
              ...assertionApiCheckIds
                .filter(
                  (apiCheckId) => !knownGate4PublicApiCheckIds.has(apiCheckId),
                )
                .map(
                  (apiCheckId) =>
                    `assertions[${index}].apiCheckIds 只能引用 Gate 4 public runtime API check，收到 ${formatIssueValue(
                      apiCheckId,
                    )}`,
                ),
              ...(forbiddenEndpointPatterns.length === 0
                ? [`assertions[${index}].forbiddenEndpointPatterns 不能为空`]
                : []),
              ...buildMissingItemsIssues(
                `assertions[${index}].forbiddenEndpointPatterns`,
                forbiddenEndpointPatterns,
                [...GATE_5_REQUIRED_PUBLIC_FORBIDDEN_ENDPOINT_PATTERNS],
              ),
            ]
          : []),
        ...(kind === 'no_token_or_secret_leak'
          ? [
              ...(forbiddenEndpointPatterns.length === 0
                ? [`assertions[${index}].forbiddenEndpointPatterns 不能为空`]
                : []),
              ...buildMissingItemsIssues(
                `assertions[${index}].forbiddenEndpointPatterns`,
                forbiddenEndpointPatterns,
                [...GATE_5_REQUIRED_SECRET_LEAK_PATTERNS],
              ),
            ]
          : []),
        ...(kind === 'desktop_no_critical_overflow' &&
        !assertionViewportIds.includes('viewport-desktop')
          ? [`assertions[${index}].viewportIds 必须包含 viewport-desktop`]
          : []),
        ...(kind === 'mobile_no_critical_overflow' &&
        !assertionViewportIds.includes('viewport-mobile')
          ? [`assertions[${index}].viewportIds 必须包含 viewport-mobile`]
          : []),
        ...(kind === 'viewport_content_not_occluded'
          ? buildMissingItemsIssues(
              `assertions[${index}].viewportIds`,
              assertionViewportIds,
              [...GATE_5_VIEWPORT_IDS],
            )
          : []),
      ];
    }),
  ];
  const artifactIssues = [
    ...(artifactExpectations.length === 0
      ? ['artifactExpectations 不能为空']
      : []),
    ...buildMissingItemsIssues('artifactExpectations.artifactId', artifactIds, [
      ...GATE_5_REQUIRED_ARTIFACT_IDS,
    ]),
    ...buildDuplicateItemIssues('artifactExpectations.artifactId', artifactIds),
    ...artifactExpectations.flatMap((artifact, index) => [
      ...(!getNonEmptyString(artifact.artifactId)
        ? [`artifactExpectations[${index}].artifactId 缺失`]
        : []),
      ...(getNonEmptyString(artifact.artifactId) &&
      !GATE_5_REQUIRED_ARTIFACT_IDS.includes(
        getNonEmptyString(
          artifact.artifactId,
        ) as (typeof GATE_5_REQUIRED_ARTIFACT_IDS)[number],
      )
        ? [
            `artifactExpectations[${index}].artifactId 引用了未知 artifact ${formatIssueValue(
              getNonEmptyString(artifact.artifactId) ?? '',
            )}`,
          ]
        : []),
      ...(!getNonEmptyString(artifact.kind)
        ? [`artifactExpectations[${index}].kind 缺失`]
        : []),
      ...(getNonEmptyString(artifact.kind) &&
      !GATE_5_ALLOWED_ARTIFACT_KINDS.includes(
        getNonEmptyString(
          artifact.kind,
        ) as (typeof GATE_5_ALLOWED_ARTIFACT_KINDS)[number],
      )
        ? [
            `artifactExpectations[${index}].kind 必须是 ${GATE_5_ALLOWED_ARTIFACT_KINDS.join(
              ' | ',
            )} 之一`,
          ]
        : []),
      ...(!getNonEmptyString(artifact.path)
        ? [`artifactExpectations[${index}].path 缺失`]
        : []),
      ...(getNonEmptyString(artifact.path)?.startsWith('artifacts/gate-5/')
        ? []
        : [
            `artifactExpectations[${index}].path 必须位于 artifacts/gate-5/ generated-run relative 路径下`,
          ]),
      ...buildSafeRelativePathIssues(
        `artifactExpectations[${index}].path`,
        getNonEmptyString(artifact.path),
      ),
      ...(artifact.required === true
        ? []
        : [`artifactExpectations[${index}].required 必须为 true`]),
      ...(getStringArray(artifact.producedByJourneyIds).length === 0
        ? [`artifactExpectations[${index}].producedByJourneyIds 不能为空`]
        : []),
      ...buildUnknownReferenceIssues(
        `artifactExpectations[${index}].producedByJourneyIds`,
        getStringArray(artifact.producedByJourneyIds),
        knownJourneyIds,
      ),
      ...(getStringArray(artifact.producedByAssertionIds).length === 0
        ? [`artifactExpectations[${index}].producedByAssertionIds 不能为空`]
        : []),
      ...buildUnknownReferenceIssues(
        `artifactExpectations[${index}].producedByAssertionIds`,
        getStringArray(artifact.producedByAssertionIds),
        knownAssertionIds,
      ),
      ...(getStringArray(artifact.referencesGate4TraceArtifactIds).length === 0
        ? [
            `artifactExpectations[${index}].referencesGate4TraceArtifactIds 不能为空`,
          ]
        : []),
      ...buildUnknownReferenceIssues(
        `artifactExpectations[${index}].referencesGate4TraceArtifactIds`,
        getStringArray(artifact.referencesGate4TraceArtifactIds),
        knownGate4TraceArtifactIds,
      ),
    ]),
  ];
  const acceptanceCoverageById = new Map(
    acceptanceScenarioCoverage
      .map((entry) => {
        const scenarioId = getNonEmptyString(entry.scenarioId);
        return scenarioId ? ([scenarioId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const acceptanceCoverageIssues = [
    ...(acceptanceScenarioCoverage.length === 0
      ? ['acceptanceScenarioCoverage 不能为空']
      : []),
    ...acceptanceScenarioCoverage.flatMap((entry, index) => {
      const scenarioId = getNonEmptyString(entry.scenarioId);

      return [
        ...(!scenarioId
          ? [`acceptanceScenarioCoverage[${index}].scenarioId 缺失`]
          : []),
        ...(scenarioId && !knownScenarioIds.has(scenarioId)
          ? [
              `acceptanceScenarioCoverage[${index}].scenarioId 引用了未知场景 ${formatIssueValue(
                scenarioId,
              )}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].journeyIds`,
          getStringArray(entry.journeyIds),
          knownJourneyIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].viewportIds`,
          getStringArray(entry.viewportIds),
          knownViewportIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].assertionIds`,
          getStringArray(entry.assertionIds),
          knownAssertionIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].artifactIds`,
          getStringArray(entry.artifactIds),
          knownArtifactIds,
        ),
      ];
    }),
    ...scenarioIds.flatMap((scenarioId) => {
      const entry = acceptanceCoverageById.get(scenarioId);
      const scenario = appSpec.acceptanceScenarios.find(
        (candidate) => candidate.id === scenarioId,
      );

      if (!entry) {
        return [`场景 ${scenarioId} 缺少 Gate 5 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          scenario?.requirementIds ?? [],
        ),
        ...(getStringArray(entry.journeyIds).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].journeyIds 不能为空`]
          : []),
        ...(getStringArray(entry.viewportIds).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].viewportIds 不能为空`]
          : []),
        ...(getStringArray(entry.assertionIds).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].assertionIds 不能为空`]
          : []),
        ...(getStringArray(entry.artifactIds).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].artifactIds 不能为空`]
          : []),
      ];
    }),
  ];
  const requirementCoverageById = new Map(
    requirementCoverage
      .map((entry) => {
        const requirementId = getNonEmptyString(entry.requirementId);
        return requirementId ? ([requirementId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const requirementCoverageIssues = [
    ...(requirementCoverage.length === 0
      ? ['requirementCoverage 不能为空']
      : []),
    ...requirementCoverage.flatMap((entry, index) => {
      const requirementId = getNonEmptyString(entry.requirementId);

      return [
        ...(!requirementId
          ? [`requirementCoverage[${index}].requirementId 缺失`]
          : []),
        ...(requirementId && !knownRequirementIds.has(requirementId)
          ? [
              `requirementCoverage[${index}].requirementId 引用了未知需求 ${formatIssueValue(
                requirementId,
              )}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].journeyIds`,
          getStringArray(entry.journeyIds),
          knownJourneyIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].assertionIds`,
          getStringArray(entry.assertionIds),
          knownAssertionIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].artifactIds`,
          getStringArray(entry.artifactIds),
          knownArtifactIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].staticContractIds`,
          getStringArray(entry.staticContractIds),
          knownStaticContractIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].gate4ApiCheckIds`,
          getStringArray(entry.gate4ApiCheckIds),
          knownGate4ApiCheckIds,
        ),
      ];
    }),
    ...requirementIds.flatMap((requirementId) => {
      const entry = requirementCoverageById.get(requirementId);

      if (!entry) {
        return [`需求 ${requirementId} 缺少 Gate 5 覆盖声明`];
      }

      const expectedScenarioIds =
        appSpec.traceability.find(
          (candidate) => candidate.requirementId === requirementId,
        )?.scenarioIds ?? [];

      return [
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          expectedScenarioIds,
        ),
        ...[
          'journeyIds',
          'assertionIds',
          'artifactIds',
          'staticContractIds',
          'gate4ApiCheckIds',
        ].flatMap((field) =>
          getStringArray(entry[field]).length === 0
            ? [`requirementCoverage[${requirementId}].${field} 不能为空`]
            : [],
        ),
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].gate4ApiCheckIds`,
          getStringArray(entry.gate4ApiCheckIds),
          gate4ApiCheckIds,
        ),
      ];
    }),
  ];
  const journeyCoverageById = new Map(
    journeyCoverage
      .map((entry) => {
        const journeyId = getNonEmptyString(entry.journeyId);
        return journeyId ? ([journeyId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const allowedJourneyKinds = new Set<string>([
    ...GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS,
    ...GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS,
  ]);
  const journeyCoverageIssues = [
    ...(journeyCoverage.length === 0 ? ['journeyCoverage 不能为空'] : []),
    ...journeyCoverage.flatMap((entry, index) => {
      const journeyId = getNonEmptyString(entry.journeyId);
      const kind = getNonEmptyString(entry.kind);

      return [
        ...(!journeyId ? [`journeyCoverage[${index}].journeyId 缺失`] : []),
        ...(journeyId && !knownJourneyIds.has(journeyId)
          ? [
              `journeyCoverage[${index}].journeyId 引用了未知 journey ${formatIssueValue(
                journeyId,
              )}`,
            ]
          : []),
        ...(!kind ? [`journeyCoverage[${index}].kind 缺失`] : []),
        ...(kind && !allowedJourneyKinds.has(kind)
          ? [
              `journeyCoverage[${index}].kind 是非法 journey kind ${formatIssueValue(
                kind,
              )}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `journeyCoverage[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `journeyCoverage[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `journeyCoverage[${index}].viewportIds`,
          getStringArray(entry.viewportIds),
          knownViewportIds,
        ),
        ...buildUnknownReferenceIssues(
          `journeyCoverage[${index}].assertionIds`,
          getStringArray(entry.assertionIds),
          knownAssertionIds,
        ),
        ...buildUnknownReferenceIssues(
          `journeyCoverage[${index}].artifactIds`,
          getStringArray(entry.artifactIds),
          knownArtifactIds,
        ),
      ];
    }),
    ...journeyIds.flatMap((journeyId) => {
      const entry = journeyCoverageById.get(journeyId);

      if (!entry) {
        return [`journey ${journeyId} 缺少 Gate 5 覆盖声明`];
      }

      return [
        ...[
          'scenarioIds',
          'requirementIds',
          'viewportIds',
          'assertionIds',
          'artifactIds',
        ].flatMap((field) =>
          getStringArray(entry[field]).length === 0
            ? [`journeyCoverage[${journeyId}].${field} 不能为空`]
            : [],
        ),
      ];
    }),
  ];
  const failureCaptureIssues = [
    ...buildMissingItemsIssues(
      'failureCaptureFields',
      getStringArray(browserAcceptancePlan.failureCaptureFields),
      [...GATE_5_REQUIRED_FAILURE_CAPTURE_FIELDS],
    ),
  ];

  return [
    {
      id: 'browser-acceptance-plan-version',
      label: 'BrowserAcceptancePlan 版本绑定',
      passed: versionIssues.length === 0,
      summary:
        '检查 browserAcceptancePlan 是否绑定当前 AppSpec、generationPlan、staticContracts、buildUnitPlan 和 integrationPlan。',
      issues: versionIssues,
    },
    {
      id: 'browser-tool-plan',
      label: '浏览器 runner 计划',
      passed: browserToolIssues.length === 0,
      summary:
        '检查 Playwright runner 命令、测试入口、base URL 占位形态和场景覆盖，确保没有真实访问 token。',
      issues: browserToolIssues,
    },
    {
      id: 'viewport-matrix',
      label: '桌面与移动 viewport matrix',
      passed: viewportIssues.length === 0,
      summary:
        '检查 browser acceptance skeleton 是否覆盖 desktop 与 mobile 视口、尺寸和场景/需求。',
      issues: viewportIssues,
    },
    {
      id: 'public-runtime-journeys',
      label: '公开 runtime journeys',
      passed: publicJourneyIssues.length === 0,
      summary:
        '检查打开公开 runtime、填写/交互提交、等待/读取 submission detail 是否绑定 acceptance scenarios、需求、Gate 4 API checks 和静态合约。',
      issues: publicJourneyIssues,
    },
    {
      id: 'creator-management-journeys',
      label: '创建者管理 journeys',
      passed: creatorJourneyIssues.length === 0,
      summary:
        '检查创建者查看 generation run、gate run、submission list/detail 的保守浏览器验收建模。',
      issues: creatorJourneyIssues,
    },
    {
      id: 'browser-assertions',
      label: 'console/network/accessibility/responsive assertions',
      passed: assertionIssues.length === 0,
      summary:
        '检查 console error、network 2xx/泄漏/公开端边界、可达可点和响应式布局 assertions。',
      issues: assertionIssues,
    },
    {
      id: 'artifact-expectations',
      label: '截图、视频和 trace artifact 期望',
      passed: artifactIssues.length === 0,
      summary:
        '检查后续真实浏览器 runner 的 screenshot/video/trace/console/network/failure artifacts 是否引用 Gate 4 trace artifacts。',
      issues: artifactIssues,
    },
    {
      id: 'acceptance-scenario-coverage',
      label: 'acceptance scenario 覆盖',
      passed: acceptanceCoverageIssues.length === 0,
      summary:
        '检查每条 acceptance scenario 是否连接到 Gate 5 journeys、viewports、assertions 和 artifacts。',
      issues: acceptanceCoverageIssues,
    },
    {
      id: 'requirement-coverage',
      label: '需求覆盖',
      passed: requirementCoverageIssues.length === 0,
      summary:
        '检查每条核心需求是否连接到 Gate 5 journeys、assertions、artifacts、静态合约和 Gate 4 API checks。',
      issues: requirementCoverageIssues,
    },
    {
      id: 'journey-coverage',
      label: 'journey 覆盖',
      passed: journeyCoverageIssues.length === 0,
      summary:
        '检查每条 browser journey 是否连接场景、需求、viewport、assertion 和 artifact。',
      issues: journeyCoverageIssues,
    },
    {
      id: 'failure-capture-fields',
      label: '失败捕获字段',
      passed: failureCaptureIssues.length === 0,
      summary:
        '检查后续真实 Gate 5 runner 失败时必须捕获 journey、viewport、assertion、console/network、截图、trace 和耗时。',
      issues: failureCaptureIssues,
    },
  ];
}
