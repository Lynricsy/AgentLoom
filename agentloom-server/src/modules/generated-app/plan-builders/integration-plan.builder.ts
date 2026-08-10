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

import type { GeneratedAppIntegrationExecutionLevel } from '../generated-app.integration-runner';

import {
  buildPlanRoute,
  buildPlanSegment,
} from '../generated-app.app-spec.util';
import {
  GATE_2_STATIC_CONTRACT_IDS,
  GATE_3_ARTIFACT_KINDS,
} from './generation-plan.builder';

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

export interface Gate4Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate4Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export const GATE_4_SKELETON_EVIDENCE_NOTE =
  'Gate 4 integration-skeleton 只做合约完整性检查；fixture-integration 不执行真实本地 integration contract；real-local-integration 才表示受控本地 public/creator API contract、Agent/Workflow trace fixture 与插件 smoke trace fixture 已执行，但仍不是生产 sandbox run 或真实 Extism WASM 执行。';

export const GATE_4_ALLOWED_EXECUTION_LEVELS = [
  'integration-skeleton',
  'real-local-integration',
  'fixture-integration',
  'disabled-integration',
] as const;

export const GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS = [
  'dry-run-fixture-skeleton',
  'controlled-local-trace-fixture',
] as const;

export const GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS = [
  'gate-4-public-runtime-read',
  'gate-4-public-runtime-submit-input',
  'gate-4-public-submission-detail',
] as const;

export const GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS = [
  'gate-4-creator-generation-run-query',
  'gate-4-creator-gate-run-query',
  'gate-4-creator-submission-query',
] as const;

export const GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS = [
  'public_runtime_read',
  'public_runtime_submit',
  'public_submission_detail',
] as const;

export const GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS = [
  'creator_generation_run_query',
  'creator_gate_run_query',
  'creator_submission_query',
] as const;

export const GATE_4_TRACE_ARTIFACT_KINDS = [
  'public_runtime_api_trace',
  'creator_management_api_trace',
  'agent_workflow_dry_run_trace',
  'plugin_sandbox_smoke_trace',
] as const;

export const GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'checkId',
  'requestId',
  'method',
  'pathTemplate',
  'responseStatus',
  'responseBodySummary',
  'errorMessage',
  'traceArtifactPath',
  'durationMs',
] as const;

export const GATE_4_CORE_TRACE_ARTIFACT_IDS = [
  'public-runtime-api-trace',
  'creator-management-api-trace',
  'agent-workflow-dry-run-trace',
] as const;

export const GATE_4_PUBLIC_RUNTIME_CHECK_STATIC_CONTRACTS: Record<
  string,
  string[]
> = {
  public_runtime_read: [
    'gate-2-public-runtime-contract',
    'gate-2-frontend-route-contract',
  ],
  public_runtime_submit: [
    'gate-2-public-runtime-contract',
    'gate-2-submission-persistence-contract',
  ],
  public_submission_detail: [
    'gate-2-public-runtime-contract',
    'gate-2-submission-persistence-contract',
  ],
};

export const GATE_4_CREATOR_CHECK_STATIC_CONTRACTS: Record<string, string[]> = {
  creator_generation_run_query: [
    'gate-2-test-entry-contract',
    'gate-2-traceability-contract',
  ],
  creator_gate_run_query: [
    'gate-2-test-entry-contract',
    'gate-2-traceability-contract',
  ],
  creator_submission_query: [
    'gate-2-submission-persistence-contract',
    'gate-2-traceability-contract',
  ],
};

export const GATE_4_PUBLIC_RUNTIME_CHECK_PAYLOAD_CONTRACT_REFS: Record<
  string,
  string[]
> = {
  public_runtime_read: [
    'staticContracts.publicRuntime.input',
    'staticContracts.publicRuntime.output',
  ],
  public_runtime_submit: [
    'staticContracts.publicRuntime.input',
    'staticContracts.submissionPersistence',
  ],
  public_submission_detail: [
    'staticContracts.publicRuntime.output',
    'staticContracts.submissionPersistence',
  ],
};

export const GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS = [
  'staticContracts.publicRuntime.input',
  'staticContracts.publicRuntime.output',
  'staticContracts.submissionPersistence',
] as const;

export function buildIntegrationPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  executionLevel: GeneratedAppIntegrationExecutionLevel = 'integration-skeleton',
): GeneratedAppIntegrationPlan {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const orchestrationNodeIds = staticContracts.orchestration.nodes.map(
    (node) => node.nodeId,
  );
  const orchestrationEdgeRefs = staticContracts.orchestration.edges.map(
    (edge) => `${edge.fromNodeId}->${edge.toNodeId}`,
  );
  const dependencyArtifacts = buildUnitPlan.artifactExpectations.map(
    (artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      sourceGateId: 'gate-3' as const,
      path: artifact.path,
      required: true,
    }),
  );
  const publicRuntimeApiChecks: GeneratedAppIntegrationPlan['publicRuntimeApiChecks'] =
    [
      {
        checkId: 'gate-4-public-runtime-read',
        kind: 'public_runtime_read',
        method: 'GET',
        pathTemplate: '/generated-apps/public/{token}',
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-frontend-route-contract',
        ],
        requirementIds,
        scenarioIds,
        expectedStatus: 200,
        payloadContractRefs: [
          'staticContracts.publicRuntime.input',
          'staticContracts.publicRuntime.output',
        ],
      },
      {
        checkId: 'gate-4-public-runtime-submit-input',
        kind: 'public_runtime_submit',
        method: 'POST',
        pathTemplate: '/generated-apps/public/{token}/submissions',
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-submission-persistence-contract',
        ],
        requirementIds,
        scenarioIds,
        expectedStatus: 201,
        payloadContractRefs: [
          'staticContracts.publicRuntime.input',
          'staticContracts.submissionPersistence',
        ],
      },
      {
        checkId: 'gate-4-public-submission-detail',
        kind: 'public_submission_detail',
        method: 'GET',
        pathTemplate:
          '/generated-apps/public/{token}/submissions/{submissionId}',
        staticContractIds: [
          'gate-2-public-runtime-contract',
          'gate-2-submission-persistence-contract',
        ],
        requirementIds,
        scenarioIds,
        expectedStatus: 200,
        payloadContractRefs: [
          'staticContracts.publicRuntime.output',
          'staticContracts.submissionPersistence',
        ],
      },
    ];
  const creatorManagementApiChecks: GeneratedAppIntegrationPlan['creatorManagementApiChecks'] =
    [
      {
        checkId: 'gate-4-creator-generation-run-query',
        kind: 'creator_generation_run_query',
        method: 'GET',
        pathTemplate: '/generated-apps/{appId}/generation-runs',
        staticContractIds: [
          'gate-2-test-entry-contract',
          'gate-2-traceability-contract',
        ],
        requirementIds,
        expectedStatus: 200,
      },
      {
        checkId: 'gate-4-creator-gate-run-query',
        kind: 'creator_gate_run_query',
        method: 'GET',
        pathTemplate:
          '/generated-apps/{appId}/gate-runs?generationRunId={runId}',
        staticContractIds: [
          'gate-2-test-entry-contract',
          'gate-2-traceability-contract',
        ],
        requirementIds,
        expectedStatus: 200,
      },
      {
        checkId: 'gate-4-creator-submission-query',
        kind: 'creator_submission_query',
        method: 'GET',
        pathTemplate: '/generated-apps/{appId}/submissions',
        staticContractIds: [
          'gate-2-submission-persistence-contract',
          'gate-2-traceability-contract',
        ],
        requirementIds,
        expectedStatus: 200,
      },
    ];
  const fixtureIdsByScenarioId = new Map(
    appSpec.acceptanceScenarios.map((scenario) => [
      scenario.id,
      `fixture-${buildPlanSegment(scenario.id)}`,
    ]),
  );
  const dryRunFixtures = appSpec.acceptanceScenarios.map<
    GeneratedAppIntegrationPlan['agentWorkflowDryRunExpectations']['fixtures'][number]
  >((scenario) => ({
    fixtureId:
      fixtureIdsByScenarioId.get(scenario.id) ??
      `fixture-${buildPlanSegment(scenario.id)}`,
    scenarioId: scenario.id,
    requirementIds: scenario.requirementIds,
    orchestrationNodeIds,
    orchestrationEdgeRefs,
    inputMapping: {
      staticContractId: 'gate-2-public-runtime-contract',
      requiredFields: staticContracts.publicRuntime.input.requiredFields,
    },
    outputMapping: {
      staticContractId: 'gate-2-public-runtime-contract',
      destinations: staticContracts.publicRuntime.output.destinations,
    },
    traceArtifactIds: ['agent-workflow-dry-run-trace'],
  }));
  const pluginSmokeTools = generationPlan.pluginTools.tools.map<
    GeneratedAppIntegrationPlan['pluginSandboxSmokeExpectations']['tools'][number]
  >((tool) => ({
    toolId: tool.toolId,
    smokeCheckId: `gate-4-plugin-smoke-${tool.toolId}`,
    artifactId: `plugin-bundle-${tool.toolId}`,
    fixturePath: `artifacts/gate-4/plugins/${tool.toolId}-smoke-fixture.json`,
    expectedTraceArtifactId: `plugin-smoke-trace-${tool.toolId}`,
    requirementIds: tool.requirementIds,
    sandboxRuntime: 'wasm-extism',
  }));
  const pluginSmokeCheckIds = pluginSmokeTools.map((tool) => tool.smokeCheckId);
  const coreCheckIds = [
    ...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS,
    ...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS,
    'gate-4-agent-workflow-dry-run-fixture',
  ];
  const traceArtifacts: GeneratedAppIntegrationPlan['traceArtifacts'] = [
    {
      artifactId: 'public-runtime-api-trace',
      kind: 'public_runtime_api_trace',
      path: 'artifacts/gate-4/public-runtime-api-trace.json',
      producedByCheckIds: [...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS],
    },
    {
      artifactId: 'creator-management-api-trace',
      kind: 'creator_management_api_trace',
      path: 'artifacts/gate-4/creator-management-api-trace.json',
      producedByCheckIds: [...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS],
    },
    {
      artifactId: 'agent-workflow-dry-run-trace',
      kind: 'agent_workflow_dry_run_trace',
      path: 'artifacts/gate-4/agent-workflow-dry-run-trace.json',
      producedByCheckIds: ['gate-4-agent-workflow-dry-run-fixture'],
    },
    ...pluginSmokeTools.map((tool) => ({
      artifactId: tool.expectedTraceArtifactId,
      kind: 'plugin_sandbox_smoke_trace' as const,
      path: `artifacts/gate-4/plugins/${tool.toolId}-smoke-trace.json`,
      producedByCheckIds: [tool.smokeCheckId],
    })),
  ];
  const coverageCheckIds = [...coreCheckIds, ...pluginSmokeCheckIds];

  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    staticContractsVersion: staticContracts.contractVersion,
    buildUnitPlanVersion: buildUnitPlan.planVersion,
    executionLevel,
    skeletonDisclaimer: GATE_4_SKELETON_EVIDENCE_NOTE,
    testTenant: {
      tenantKind: 'synthetic',
      tenantAlias: 'generated-app-gate-4-test-tenant',
      authMode: 'tenant-scoped-synthetic-no-real-token',
      usesRealTokens: false,
      noProductionResources: true,
    },
    testResources: {
      resourceIsolation: 'ephemeral-test-resources-only',
      usesRealTokens: false,
      generatedAppWorkspacePath:
        buildUnitPlan.generationWorkspace?.relativePath ??
        'generated-app-workspace',
      fixtureDirectory: 'artifacts/gate-4/fixtures',
      requiredScenarioIds: scenarioIds,
    },
    publicRuntimeApiChecks,
    creatorManagementApiChecks,
    agentWorkflowDryRunExpectations: {
      expectationLevel:
        executionLevel === 'real-local-integration'
          ? 'controlled-local-trace-fixture'
          : 'dry-run-fixture-skeleton',
      orchestrationNodeIds,
      orchestrationEdgeRefs,
      fixtures: dryRunFixtures,
    },
    pluginSandboxSmokeExpectations: {
      tools: pluginSmokeTools,
      emptyReason:
        generationPlan.pluginTools.tools.length === 0
          ? '当前 generationPlan.pluginTools 未声明私有插件；Gate 4 不需要插件 WASM/Extism smoke skeleton，但明确记录无插件原因。'
          : null,
    },
    dependencyArtifacts,
    acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map((scenario) => ({
      scenarioId: scenario.id,
      requirementIds: scenario.requirementIds,
      coveredByCheckIds: [
        'gate-4-public-runtime-submit-input',
        'gate-4-agent-workflow-dry-run-fixture',
        ...pluginSmokeCheckIds,
      ],
      fixtureIds: [
        fixtureIdsByScenarioId.get(scenario.id) ??
          `fixture-${buildPlanSegment(scenario.id)}`,
      ],
    })),
    requirementCoverage: appSpec.coreRequirements.map((requirement) => ({
      requirementId: requirement.id,
      scenarioIds:
        appSpec.traceability.find(
          (entry) => entry.requirementId === requirement.id,
        )?.scenarioIds ?? [],
      coveredByCheckIds: coverageCheckIds,
      dependencyArtifactIds: dependencyArtifacts.map(
        (artifact) => artifact.artifactId,
      ),
    })),
    orchestrationCoverage: orchestrationNodeIds.map((nodeId) => ({
      nodeId,
      edgeRefs: orchestrationEdgeRefs,
      coveredByFixtureIds: dryRunFixtures.map((fixture) => fixture.fixtureId),
      coveredByCheckIds: ['gate-4-agent-workflow-dry-run-fixture'],
    })),
    traceArtifacts,
    failureCaptureFields: [
      ...GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS,
      'assertionSummary',
      'redactedPayloadPreview',
    ],
  };
}

export function evaluateGate4IntegrationPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: unknown,
): Gate4Evaluation {
  const checks = buildGate4Checks(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-4-${check.id}`,
    label: check.label,
    kind: 'test' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? `${check.summary} ${GATE_4_SKELETON_EVIDENCE_NOTE}`
        : `${check.summary} 缺口：${check.issues.join(
            '；',
          )} ${GATE_4_SKELETON_EVIDENCE_NOTE}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'integration-plan-incomplete',
      message: `IntegrationPlan 集成 skeleton 检查失败：${failedChecks
        .map((check) => check.label)
        .join(
          '、',
        )}；本失败只来自 integration-skeleton 合约完整性检查，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。`,
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
        'Gate 4 失败：integrationPlan 未完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 或失败捕获字段；本结果仅表示契约级 integration skeleton 检查失败，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.integrationPlan，使其覆盖测试租户/资源、public runtime API checks、creator management API checks、Agent/Workflow dry-run fixture、plugin sandbox smoke expectations、Gate 3 dependency artifacts、需求/场景/编排覆盖、trace artifacts 和 failure capture fields；当前 Gate 4 仍只检查 integration-skeleton 合约，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 4 通过：integrationPlan 集成 skeleton 已完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 和失败捕获字段；本结果仅表示契约级 integration skeleton 完整，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function buildGate4Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: unknown,
): Gate4Check[] {
  if (!isRecord(integrationPlan)) {
    return [
      {
        id: 'integration-plan-object',
        label: 'IntegrationPlan JSON 对象',
        passed: false,
        summary: '检查 generationPlan.integrationPlan 是否为结构化 JSON 对象。',
        issues: ['integrationPlan 不是对象'],
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
  const orchestrationNodeIds = staticContracts.orchestration.nodes.map(
    (node) => node.nodeId,
  );
  const knownOrchestrationNodeIds = new Set(orchestrationNodeIds);
  const orchestrationEdgeRefs = staticContracts.orchestration.edges.map(
    (edge) => `${edge.fromNodeId}->${edge.toNodeId}`,
  );
  const knownOrchestrationEdgeRefs = new Set(orchestrationEdgeRefs);
  const expectedDependencyArtifactIds = buildUnitPlan.artifactExpectations.map(
    (artifact) => artifact.artifactId,
  );
  const knownDependencyArtifactIds = new Set(expectedDependencyArtifactIds);
  const plannedToolIds = new Set(
    generationPlan.pluginTools.tools.map((tool) => tool.toolId),
  );
  const plannedToolById = new Map(
    generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
  );
  const expectedTraceArtifactIds = [
    ...GATE_4_CORE_TRACE_ARTIFACT_IDS,
    ...generationPlan.pluginTools.tools.map(
      (tool) => `plugin-smoke-trace-${tool.toolId}`,
    ),
  ];
  const expectedPluginSmokeCheckIds = generationPlan.pluginTools.tools.map(
    (tool) => `gate-4-plugin-smoke-${tool.toolId}`,
  );
  const expectedArtifactKindById = new Map(
    buildUnitPlan.artifactExpectations.map((artifact) => [
      artifact.artifactId,
      artifact.kind,
    ]),
  );
  const expectedTraceArtifactKindById = new Map<string, string>([
    ['public-runtime-api-trace', 'public_runtime_api_trace'],
    ['creator-management-api-trace', 'creator_management_api_trace'],
    ['agent-workflow-dry-run-trace', 'agent_workflow_dry_run_trace'],
    ...generationPlan.pluginTools.tools.map(
      (tool) =>
        [
          `plugin-smoke-trace-${tool.toolId}`,
          'plugin_sandbox_smoke_trace',
        ] as const,
    ),
  ]);

  const testTenant = getRecord(integrationPlan.testTenant);
  const testResources = getRecord(integrationPlan.testResources);
  const publicRuntimeApiChecks = getRecordArray(
    integrationPlan.publicRuntimeApiChecks,
  );
  const creatorManagementApiChecks = getRecordArray(
    integrationPlan.creatorManagementApiChecks,
  );
  const dryRunExpectations = getRecord(
    integrationPlan.agentWorkflowDryRunExpectations,
  );
  const dryRunFixtures = getRecordArray(dryRunExpectations?.fixtures);
  const pluginSmokeExpectations = getRecord(
    integrationPlan.pluginSandboxSmokeExpectations,
  );
  const pluginSmokeTools = getRecordArray(pluginSmokeExpectations?.tools);
  const dependencyArtifacts = getRecordArray(
    integrationPlan.dependencyArtifacts,
  );
  const acceptanceScenarioCoverage = getRecordArray(
    integrationPlan.acceptanceScenarioCoverage,
  );
  const requirementCoverage = getRecordArray(
    integrationPlan.requirementCoverage,
  );
  const orchestrationCoverage = getRecordArray(
    integrationPlan.orchestrationCoverage,
  );
  const traceArtifacts = getRecordArray(integrationPlan.traceArtifacts);

  const publicCheckIds = publicRuntimeApiChecks
    .map((check) => getNonEmptyString(check.checkId))
    .filter((checkId): checkId is string => checkId !== null);
  const creatorCheckIds = creatorManagementApiChecks
    .map((check) => getNonEmptyString(check.checkId))
    .filter((checkId): checkId is string => checkId !== null);
  const pluginSmokeCheckIds = pluginSmokeTools
    .map((tool) => getNonEmptyString(tool.smokeCheckId))
    .filter((checkId): checkId is string => checkId !== null);
  const dryRunFixtureIds = dryRunFixtures
    .map((fixture) => getNonEmptyString(fixture.fixtureId))
    .filter((fixtureId): fixtureId is string => fixtureId !== null);
  const dependencyArtifactIds = dependencyArtifacts
    .map((artifact) => getNonEmptyString(artifact.artifactId))
    .filter((artifactId): artifactId is string => artifactId !== null);
  const traceArtifactIds = traceArtifacts
    .map((artifact) => getNonEmptyString(artifact.artifactId))
    .filter((artifactId): artifactId is string => artifactId !== null);
  const knownActualTraceArtifactIds = new Set(traceArtifactIds);
  const knownDryRunFixtureIds = new Set(dryRunFixtureIds);
  const knownGate4CheckIds = new Set<string>([
    ...publicCheckIds,
    ...creatorCheckIds,
    'gate-4-agent-workflow-dry-run-fixture',
    ...pluginSmokeCheckIds,
  ]);
  const expectedPublicCheckKinds = new Map<string, string>([
    ['gate-4-public-runtime-read', 'public_runtime_read'],
    ['gate-4-public-runtime-submit-input', 'public_runtime_submit'],
    ['gate-4-public-submission-detail', 'public_submission_detail'],
  ]);
  const expectedCreatorCheckKinds = new Map<string, string>([
    ['gate-4-creator-generation-run-query', 'creator_generation_run_query'],
    ['gate-4-creator-gate-run-query', 'creator_gate_run_query'],
    ['gate-4-creator-submission-query', 'creator_submission_query'],
  ]);
  const expectedGate4CheckIds = [
    ...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS,
    ...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS,
    'gate-4-agent-workflow-dry-run-fixture',
    ...expectedPluginSmokeCheckIds,
  ];

  const versionIssues = [
    ...(integrationPlan.planVersion === 1 ? [] : ['planVersion 必须为 1']),
    ...(integrationPlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            integrationPlan.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(integrationPlan.generationPlanVersion === generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            integrationPlan.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
    ...(integrationPlan.staticContractsVersion ===
    staticContracts.contractVersion
      ? []
      : [
          `staticContractsVersion=${String(
            integrationPlan.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...(integrationPlan.buildUnitPlanVersion === buildUnitPlan.planVersion
      ? []
      : [
          `buildUnitPlanVersion=${String(
            integrationPlan.buildUnitPlanVersion,
          )} 与 buildUnitPlan.planVersion=${buildUnitPlan.planVersion} 不一致`,
        ]),
    ...(GATE_4_ALLOWED_EXECUTION_LEVELS.includes(
      integrationPlan.executionLevel as (typeof GATE_4_ALLOWED_EXECUTION_LEVELS)[number],
    )
      ? []
      : [
          `executionLevel 必须为 ${GATE_4_ALLOWED_EXECUTION_LEVELS.join(
            ' | ',
          )} 之一`,
        ]),
    ...(!getNonEmptyString(integrationPlan.skeletonDisclaimer)
      ? ['skeletonDisclaimer 缺失']
      : []),
  ];
  const testTenantIssues = [
    ...requireRecord(testTenant, 'testTenant'),
    ...(testTenant?.tenantKind === 'synthetic'
      ? []
      : ['testTenant.tenantKind 必须为 synthetic']),
    ...(!getNonEmptyString(testTenant?.tenantAlias)
      ? ['testTenant.tenantAlias 缺失']
      : []),
    ...(testTenant?.authMode === 'tenant-scoped-synthetic-no-real-token'
      ? []
      : ['testTenant.authMode 必须为 tenant-scoped-synthetic-no-real-token']),
    ...(testTenant?.usesRealTokens === false
      ? []
      : ['testTenant.usesRealTokens 必须为 false']),
    ...(testTenant?.noProductionResources === true
      ? []
      : ['testTenant.noProductionResources 必须为 true']),
    ...collectSensitiveTokenIssues(integrationPlan),
  ];
  const testResourceIssues = [
    ...requireRecord(testResources, 'testResources'),
    ...(testResources?.resourceIsolation === 'ephemeral-test-resources-only'
      ? []
      : [
          'testResources.resourceIsolation 必须为 ephemeral-test-resources-only',
        ]),
    ...(testResources?.usesRealTokens === false
      ? []
      : ['testResources.usesRealTokens 必须为 false']),
    ...(!getNonEmptyString(testResources?.generatedAppWorkspacePath)
      ? ['testResources.generatedAppWorkspacePath 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'testResources.generatedAppWorkspacePath',
      getNonEmptyString(testResources?.generatedAppWorkspacePath),
    ),
    ...(!getNonEmptyString(testResources?.fixtureDirectory)
      ? ['testResources.fixtureDirectory 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'testResources.fixtureDirectory',
      getNonEmptyString(testResources?.fixtureDirectory),
    ),
    ...buildMissingItemsIssues(
      'testResources.requiredScenarioIds',
      getStringArray(testResources?.requiredScenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'testResources.requiredScenarioIds',
      getStringArray(testResources?.requiredScenarioIds),
      knownScenarioIds,
    ),
  ];
  const publicRuntimeApiIssues = [
    ...(publicRuntimeApiChecks.length === 0
      ? ['publicRuntimeApiChecks 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publicRuntimeApiChecks.checkId',
      publicCheckIds,
      [...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS],
    ),
    ...buildDuplicateItemIssues(
      'publicRuntimeApiChecks.checkId',
      publicCheckIds,
    ),
    ...publicRuntimeApiChecks.flatMap((check, index) => {
      const checkId = getNonEmptyString(check.checkId);
      const kind = getNonEmptyString(check.kind);
      const expectedKind = checkId
        ? expectedPublicCheckKinds.get(checkId)
        : undefined;
      const requiredStaticContractIds = kind
        ? (GATE_4_PUBLIC_RUNTIME_CHECK_STATIC_CONTRACTS[kind] ?? [])
        : [];
      const requiredPayloadContractRefs = kind
        ? (GATE_4_PUBLIC_RUNTIME_CHECK_PAYLOAD_CONTRACT_REFS[kind] ?? [])
        : [];

      return [
        ...(!checkId ? [`publicRuntimeApiChecks[${index}].checkId 缺失`] : []),
        ...(checkId && !expectedPublicCheckKinds.has(checkId)
          ? [
              `publicRuntimeApiChecks[${index}].checkId 引用了未知 API check ${formatIssueValue(
                checkId,
              )}`,
            ]
          : []),
        ...(!kind ? [`publicRuntimeApiChecks[${index}].kind 缺失`] : []),
        ...(kind &&
        !GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS.includes(
          kind as (typeof GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS)[number],
        )
          ? [
              `publicRuntimeApiChecks[${index}].kind 必须是 ${GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(expectedKind && kind !== expectedKind
          ? [
              `publicRuntimeApiChecks[${index}].kind 与 checkId ${checkId} 不一致`,
            ]
          : []),
        ...(!['GET', 'POST'].includes(String(check.method))
          ? [`publicRuntimeApiChecks[${index}].method 必须为 GET 或 POST`]
          : []),
        ...(!getNonEmptyString(check.pathTemplate)
          ? [`publicRuntimeApiChecks[${index}].pathTemplate 缺失`]
          : []),
        ...(getNonEmptyString(check.pathTemplate) &&
        !getNonEmptyString(check.pathTemplate)!.startsWith(
          '/generated-apps/public/{token}',
        )
          ? [
              `publicRuntimeApiChecks[${index}].pathTemplate 必须停留在 public token runtime surface`,
            ]
          : []),
        ...(getNonEmptyString(check.pathTemplate)?.includes('{appId}') ||
        getNonEmptyString(check.pathTemplate)?.includes('/generation-runs') ||
        getNonEmptyString(check.pathTemplate)?.includes('/gate-runs')
          ? [
              `publicRuntimeApiChecks[${index}].pathTemplate 不得串入 creator/internal API boundary`,
            ]
          : []),
        ...(typeof check.expectedStatus === 'number' &&
        check.expectedStatus >= 200 &&
        check.expectedStatus < 300
          ? []
          : [
              `publicRuntimeApiChecks[${index}].expectedStatus 必须是 2xx number`,
            ]),
        ...buildMissingItemsIssues(
          `publicRuntimeApiChecks[${index}].staticContractIds`,
          getStringArray(check.staticContractIds),
          requiredStaticContractIds,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeApiChecks[${index}].staticContractIds`,
          getStringArray(check.staticContractIds),
          knownStaticContractIds,
        ),
        ...buildMissingItemsIssues(
          `publicRuntimeApiChecks[${index}].requirementIds`,
          getStringArray(check.requirementIds),
          requirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeApiChecks[${index}].requirementIds`,
          getStringArray(check.requirementIds),
          knownRequirementIds,
        ),
        ...buildMissingItemsIssues(
          `publicRuntimeApiChecks[${index}].scenarioIds`,
          getStringArray(check.scenarioIds),
          scenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeApiChecks[${index}].scenarioIds`,
          getStringArray(check.scenarioIds),
          knownScenarioIds,
        ),
        ...(getStringArray(check.payloadContractRefs).length === 0
          ? [`publicRuntimeApiChecks[${index}].payloadContractRefs 不能为空`]
          : []),
        ...buildMissingItemsIssues(
          `publicRuntimeApiChecks[${index}].payloadContractRefs`,
          getStringArray(check.payloadContractRefs),
          requiredPayloadContractRefs,
        ),
        ...buildUnknownReferenceIssues(
          `publicRuntimeApiChecks[${index}].payloadContractRefs`,
          getStringArray(check.payloadContractRefs),
          new Set([...GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS]),
        ),
      ];
    }),
  ];
  const creatorApiIssues = [
    ...(creatorManagementApiChecks.length === 0
      ? ['creatorManagementApiChecks 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'creatorManagementApiChecks.checkId',
      creatorCheckIds,
      [...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS],
    ),
    ...buildDuplicateItemIssues(
      'creatorManagementApiChecks.checkId',
      creatorCheckIds,
    ),
    ...creatorManagementApiChecks.flatMap((check, index) => {
      const checkId = getNonEmptyString(check.checkId);
      const kind = getNonEmptyString(check.kind);
      const expectedKind = checkId
        ? expectedCreatorCheckKinds.get(checkId)
        : undefined;
      const requiredStaticContractIds = kind
        ? (GATE_4_CREATOR_CHECK_STATIC_CONTRACTS[kind] ?? [])
        : [];

      return [
        ...(!checkId
          ? [`creatorManagementApiChecks[${index}].checkId 缺失`]
          : []),
        ...(checkId && !expectedCreatorCheckKinds.has(checkId)
          ? [
              `creatorManagementApiChecks[${index}].checkId 引用了未知 API check ${formatIssueValue(
                checkId,
              )}`,
            ]
          : []),
        ...(!kind ? [`creatorManagementApiChecks[${index}].kind 缺失`] : []),
        ...(kind &&
        !GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS.includes(
          kind as (typeof GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS)[number],
        )
          ? [
              `creatorManagementApiChecks[${index}].kind 必须是 ${GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(expectedKind && kind !== expectedKind
          ? [
              `creatorManagementApiChecks[${index}].kind 与 checkId ${checkId} 不一致`,
            ]
          : []),
        ...(check.method === 'GET'
          ? []
          : [`creatorManagementApiChecks[${index}].method 必须为 GET`]),
        ...(!getNonEmptyString(check.pathTemplate)
          ? [`creatorManagementApiChecks[${index}].pathTemplate 缺失`]
          : []),
        ...(getNonEmptyString(check.pathTemplate) &&
        !getNonEmptyString(check.pathTemplate)!.startsWith(
          '/generated-apps/{appId}',
        )
          ? [
              `creatorManagementApiChecks[${index}].pathTemplate 必须停留在 creator app surface`,
            ]
          : []),
        ...(getNonEmptyString(check.pathTemplate)?.includes('/public/{token}')
          ? [
              `creatorManagementApiChecks[${index}].pathTemplate 不得串入 public token API boundary`,
            ]
          : []),
        ...(check.expectedStatus === 200
          ? []
          : [`creatorManagementApiChecks[${index}].expectedStatus 必须为 200`]),
        ...buildMissingItemsIssues(
          `creatorManagementApiChecks[${index}].staticContractIds`,
          getStringArray(check.staticContractIds),
          requiredStaticContractIds,
        ),
        ...buildUnknownReferenceIssues(
          `creatorManagementApiChecks[${index}].staticContractIds`,
          getStringArray(check.staticContractIds),
          knownStaticContractIds,
        ),
        ...buildMissingItemsIssues(
          `creatorManagementApiChecks[${index}].requirementIds`,
          getStringArray(check.requirementIds),
          requirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `creatorManagementApiChecks[${index}].requirementIds`,
          getStringArray(check.requirementIds),
          knownRequirementIds,
        ),
      ];
    }),
  ];
  const dryRunIssues = [
    ...requireRecord(dryRunExpectations, 'agentWorkflowDryRunExpectations'),
    ...(GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS.includes(
      getNonEmptyString(
        dryRunExpectations?.expectationLevel,
      ) as (typeof GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS)[number],
    )
      ? []
      : [
          `agentWorkflowDryRunExpectations.expectationLevel 必须为 ${GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS.join(
            ' | ',
          )} 之一`,
        ]),
    ...buildMissingItemsIssues(
      'agentWorkflowDryRunExpectations.orchestrationNodeIds',
      getStringArray(dryRunExpectations?.orchestrationNodeIds),
      orchestrationNodeIds,
    ),
    ...buildUnknownReferenceIssues(
      'agentWorkflowDryRunExpectations.orchestrationNodeIds',
      getStringArray(dryRunExpectations?.orchestrationNodeIds),
      knownOrchestrationNodeIds,
    ),
    ...buildMissingItemsIssues(
      'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
      getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
      orchestrationEdgeRefs,
    ),
    ...buildUnknownReferenceIssues(
      'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
      getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
      knownOrchestrationEdgeRefs,
    ),
    ...(dryRunFixtures.length === 0
      ? ['agentWorkflowDryRunExpectations.fixtures 不能为空']
      : []),
    ...buildDuplicateItemIssues(
      'agentWorkflowDryRunExpectations.fixtures.fixtureId',
      dryRunFixtureIds,
    ),
    ...scenarioIds.flatMap((scenarioId) =>
      dryRunFixtures.some(
        (fixture) => getNonEmptyString(fixture.scenarioId) === scenarioId,
      )
        ? []
        : [`场景 ${scenarioId} 缺少 Agent/Workflow dry-run fixture`],
    ),
    ...dryRunFixtures.flatMap((fixture, index) => {
      const scenarioId = getNonEmptyString(fixture.scenarioId);
      const scenario = scenarioId
        ? appSpec.acceptanceScenarios.find(
            (candidate) => candidate.id === scenarioId,
          )
        : null;
      const inputMapping = getRecord(fixture.inputMapping);
      const outputMapping = getRecord(fixture.outputMapping);

      return [
        ...(!getNonEmptyString(fixture.fixtureId)
          ? [
              `agentWorkflowDryRunExpectations.fixtures[${index}].fixtureId 缺失`,
            ]
          : []),
        ...(!scenarioId
          ? [
              `agentWorkflowDryRunExpectations.fixtures[${index}].scenarioId 缺失`,
            ]
          : []),
        ...(scenarioId && !knownScenarioIds.has(scenarioId)
          ? [
              `agentWorkflowDryRunExpectations.fixtures[${index}].scenarioId 引用了未知场景 ${formatIssueValue(
                scenarioId,
              )}`,
            ]
          : []),
        ...(scenario
          ? buildMissingItemsIssues(
              `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
              getStringArray(fixture.requirementIds),
              scenario.requirementIds,
            )
          : []),
        ...buildUnknownReferenceIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
          getStringArray(fixture.requirementIds),
          knownRequirementIds,
        ),
        ...buildMissingItemsIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
          getStringArray(fixture.orchestrationNodeIds),
          orchestrationNodeIds,
        ),
        ...buildUnknownReferenceIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
          getStringArray(fixture.orchestrationNodeIds),
          knownOrchestrationNodeIds,
        ),
        ...buildMissingItemsIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
          getStringArray(fixture.orchestrationEdgeRefs),
          orchestrationEdgeRefs,
        ),
        ...buildUnknownReferenceIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
          getStringArray(fixture.orchestrationEdgeRefs),
          knownOrchestrationEdgeRefs,
        ),
        ...requireRecord(
          inputMapping,
          `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping`,
        ),
        ...(inputMapping?.staticContractId === 'gate-2-public-runtime-contract'
          ? []
          : [
              `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
            ]),
        ...buildMissingItemsIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.requiredFields`,
          getStringArray(inputMapping?.requiredFields),
          staticContracts.publicRuntime.input.requiredFields,
        ),
        ...requireRecord(
          outputMapping,
          `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping`,
        ),
        ...(outputMapping?.staticContractId === 'gate-2-public-runtime-contract'
          ? []
          : [
              `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
            ]),
        ...buildMissingItemsIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.destinations`,
          getStringArray(outputMapping?.destinations),
          staticContracts.publicRuntime.output.destinations,
        ),
        ...(getStringArray(fixture.traceArtifactIds).length === 0
          ? [
              `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds 不能为空`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds`,
          getStringArray(fixture.traceArtifactIds),
          knownActualTraceArtifactIds,
        ),
      ];
    }),
  ];
  const pluginSmokeIssues = [
    ...requireRecord(pluginSmokeExpectations, 'pluginSandboxSmokeExpectations'),
    ...(generationPlan.pluginTools.tools.length === 0 &&
    pluginSmokeTools.length > 0
      ? ['无插件计划时 pluginSandboxSmokeExpectations.tools 必须为空']
      : []),
    ...(generationPlan.pluginTools.tools.length === 0 &&
    !getNonEmptyString(pluginSmokeExpectations?.emptyReason)
      ? ['无插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须说明原因']
      : []),
    ...(generationPlan.pluginTools.tools.length > 0 &&
    pluginSmokeExpectations?.emptyReason !== null
      ? ['有插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须为 null']
      : []),
    ...generationPlan.pluginTools.tools
      .filter(
        (plannedTool) =>
          !pluginSmokeTools.some(
            (tool) => getNonEmptyString(tool.toolId) === plannedTool.toolId,
          ),
      )
      .map(
        (plannedTool) =>
          `插件/工具 ${formatIssueValue(
            plannedTool.toolId,
          )} 缺少 Gate 4 sandbox smoke 期望`,
      ),
    ...(generationPlan.pluginTools.tools.length > 0
      ? [
          ...buildMissingItemsIssues(
            'pluginSandboxSmokeExpectations.tools.smokeCheckId',
            pluginSmokeCheckIds,
            expectedPluginSmokeCheckIds,
          ),
          ...buildDuplicateItemIssues(
            'pluginSandboxSmokeExpectations.tools.smokeCheckId',
            pluginSmokeCheckIds,
          ),
        ]
      : []),
    ...pluginSmokeTools.flatMap((tool, index) => {
      const toolId = getNonEmptyString(tool.toolId);
      const plannedTool = toolId ? plannedToolById.get(toolId) : null;
      const expectedSmokeCheckId = plannedTool
        ? `gate-4-plugin-smoke-${plannedTool.toolId}`
        : null;
      const expectedArtifactId = plannedTool
        ? `plugin-bundle-${plannedTool.toolId}`
        : null;
      const expectedTraceArtifactId = plannedTool
        ? `plugin-smoke-trace-${plannedTool.toolId}`
        : null;

      return [
        ...(!toolId
          ? [`pluginSandboxSmokeExpectations.tools[${index}].toolId 缺失`]
          : []),
        ...(toolId && !plannedToolIds.has(toolId)
          ? [
              `pluginSandboxSmokeExpectations.tools[${index}].toolId 引用了未知插件/工具 ${formatIssueValue(
                toolId,
              )}`,
            ]
          : []),
        ...(!getNonEmptyString(tool.smokeCheckId)
          ? [`pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 缺失`]
          : []),
        ...(expectedSmokeCheckId && tool.smokeCheckId !== expectedSmokeCheckId
          ? [
              `pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 必须为 ${expectedSmokeCheckId}`,
            ]
          : []),
        ...(!getNonEmptyString(tool.artifactId)
          ? [`pluginSandboxSmokeExpectations.tools[${index}].artifactId 缺失`]
          : []),
        ...(expectedArtifactId && tool.artifactId !== expectedArtifactId
          ? [
              `pluginSandboxSmokeExpectations.tools[${index}].artifactId 必须引用 ${expectedArtifactId}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `pluginSandboxSmokeExpectations.tools[${index}].artifactId`,
          getStringArray([tool.artifactId]),
          knownDependencyArtifactIds,
        ),
        ...(!getNonEmptyString(tool.fixturePath)
          ? [`pluginSandboxSmokeExpectations.tools[${index}].fixturePath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginSandboxSmokeExpectations.tools[${index}].fixturePath`,
          getNonEmptyString(tool.fixturePath),
        ),
        ...(!getNonEmptyString(tool.expectedTraceArtifactId)
          ? [
              `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId 缺失`,
            ]
          : []),
        ...(expectedTraceArtifactId &&
        tool.expectedTraceArtifactId !== expectedTraceArtifactId
          ? [
              `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId 必须引用 ${expectedTraceArtifactId}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId`,
          getStringArray([tool.expectedTraceArtifactId]),
          knownActualTraceArtifactIds,
        ),
        ...(tool.sandboxRuntime === 'wasm-extism'
          ? []
          : [
              `pluginSandboxSmokeExpectations.tools[${index}].sandboxRuntime 必须为 wasm-extism`,
            ]),
        ...(plannedTool
          ? buildMissingItemsIssues(
              `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
              getStringArray(tool.requirementIds),
              plannedTool.requirementIds,
            )
          : []),
        ...buildUnknownReferenceIssues(
          `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
          getStringArray(tool.requirementIds),
          knownRequirementIds,
        ),
      ];
    }),
  ];
  const dependencyArtifactIssues = [
    ...(dependencyArtifacts.length === 0
      ? ['dependencyArtifacts 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'dependencyArtifacts.artifactId',
      dependencyArtifactIds,
      expectedDependencyArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'dependencyArtifacts.artifactId',
      dependencyArtifactIds,
      knownDependencyArtifactIds,
    ),
    ...buildDuplicateItemIssues(
      'dependencyArtifacts.artifactId',
      dependencyArtifactIds,
    ),
    ...dependencyArtifacts.flatMap((artifact, index) => [
      ...(!getNonEmptyString(artifact.artifactId)
        ? [`dependencyArtifacts[${index}].artifactId 缺失`]
        : []),
      ...(!getNonEmptyString(artifact.kind)
        ? [`dependencyArtifacts[${index}].kind 缺失`]
        : []),
      ...(getNonEmptyString(artifact.kind) &&
      !GATE_3_ARTIFACT_KINDS.includes(
        getNonEmptyString(
          artifact.kind,
        ) as (typeof GATE_3_ARTIFACT_KINDS)[number],
      )
        ? [
            `dependencyArtifacts[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
              ' | ',
            )} 之一`,
          ]
        : []),
      ...(getNonEmptyString(artifact.artifactId) &&
      getNonEmptyString(artifact.kind) &&
      expectedArtifactKindById.get(
        getNonEmptyString(artifact.artifactId) ?? '',
      ) !== undefined &&
      expectedArtifactKindById.get(
        getNonEmptyString(artifact.artifactId) ?? '',
      ) !== getNonEmptyString(artifact.kind)
        ? [
            `dependencyArtifacts[${index}].kind 与 Gate 3 artifact ${formatIssueValue(
              getNonEmptyString(artifact.artifactId) ?? '',
            )} 不一致`,
          ]
        : []),
      ...(artifact.sourceGateId === 'gate-3'
        ? []
        : [`dependencyArtifacts[${index}].sourceGateId 必须为 gate-3`]),
      ...(!getNonEmptyString(artifact.path)
        ? [`dependencyArtifacts[${index}].path 缺失`]
        : []),
      ...buildSafeRelativePathIssues(
        `dependencyArtifacts[${index}].path`,
        getNonEmptyString(artifact.path),
      ),
      ...(artifact.required === true
        ? []
        : [`dependencyArtifacts[${index}].required 必须为 true`]),
    ]),
  ];
  const scenarioCoverageById = new Map(
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
          `acceptanceScenarioCoverage[${index}].coveredByCheckIds`,
          getStringArray(entry.coveredByCheckIds),
          knownGate4CheckIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${index}].fixtureIds`,
          getStringArray(entry.fixtureIds),
          knownDryRunFixtureIds,
        ),
      ];
    }),
    ...scenarioIds.flatMap((scenarioId) => {
      const entry = scenarioCoverageById.get(scenarioId);
      const scenario = appSpec.acceptanceScenarios.find(
        (candidate) => candidate.id === scenarioId,
      );

      if (!entry) {
        return [`场景 ${scenarioId} 缺少 Gate 4 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          scenario?.requirementIds ?? [],
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.coveredByCheckIds).length === 0
          ? [
              `acceptanceScenarioCoverage[${scenarioId}].coveredByCheckIds 不能为空`,
            ]
          : []),
        ...(getStringArray(entry.fixtureIds).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].fixtureIds 不能为空`]
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
          `requirementCoverage[${index}].coveredByCheckIds`,
          getStringArray(entry.coveredByCheckIds),
          knownGate4CheckIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].dependencyArtifactIds`,
          getStringArray(entry.dependencyArtifactIds),
          knownDependencyArtifactIds,
        ),
      ];
    }),
    ...requirementIds.flatMap((requirementId) => {
      const entry = requirementCoverageById.get(requirementId);

      if (!entry) {
        return [`需求 ${requirementId} 缺少 Gate 4 覆盖声明`];
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
        ...(getStringArray(entry.coveredByCheckIds).length === 0
          ? [`requirementCoverage[${requirementId}].coveredByCheckIds 不能为空`]
          : []),
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].coveredByCheckIds`,
          getStringArray(entry.coveredByCheckIds),
          expectedGate4CheckIds,
        ),
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].dependencyArtifactIds`,
          getStringArray(entry.dependencyArtifactIds),
          expectedDependencyArtifactIds,
        ),
      ];
    }),
  ];
  const orchestrationCoverageByNodeId = new Map(
    orchestrationCoverage
      .map((entry) => {
        const nodeId = getNonEmptyString(entry.nodeId);
        return nodeId ? ([nodeId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const orchestrationCoverageIssues = [
    ...(orchestrationCoverage.length === 0
      ? ['orchestrationCoverage 不能为空']
      : []),
    ...orchestrationCoverage.flatMap((entry, index) => {
      const nodeId = getNonEmptyString(entry.nodeId);

      return [
        ...(!nodeId ? [`orchestrationCoverage[${index}].nodeId 缺失`] : []),
        ...(nodeId && !knownOrchestrationNodeIds.has(nodeId)
          ? [
              `orchestrationCoverage[${index}].nodeId 引用了未知编排节点 ${formatIssueValue(
                nodeId,
              )}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `orchestrationCoverage[${index}].edgeRefs`,
          getStringArray(entry.edgeRefs),
          knownOrchestrationEdgeRefs,
        ),
        ...buildUnknownReferenceIssues(
          `orchestrationCoverage[${index}].coveredByFixtureIds`,
          getStringArray(entry.coveredByFixtureIds),
          knownDryRunFixtureIds,
        ),
        ...buildUnknownReferenceIssues(
          `orchestrationCoverage[${index}].coveredByCheckIds`,
          getStringArray(entry.coveredByCheckIds),
          knownGate4CheckIds,
        ),
      ];
    }),
    ...orchestrationNodeIds.flatMap((nodeId) => {
      const entry = orchestrationCoverageByNodeId.get(nodeId);

      if (!entry) {
        return [`编排节点 ${nodeId} 缺少 Gate 4 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `orchestrationCoverage[${nodeId}].edgeRefs`,
          getStringArray(entry.edgeRefs),
          orchestrationEdgeRefs,
        ),
        ...(getStringArray(entry.coveredByFixtureIds).length === 0
          ? [`orchestrationCoverage[${nodeId}].coveredByFixtureIds 不能为空`]
          : []),
        ...(getStringArray(entry.coveredByCheckIds).length === 0
          ? [`orchestrationCoverage[${nodeId}].coveredByCheckIds 不能为空`]
          : []),
      ];
    }),
  ];
  const traceArtifactIssues = [
    ...(traceArtifacts.length === 0 ? ['traceArtifacts 不能为空'] : []),
    ...buildMissingItemsIssues(
      'traceArtifacts.artifactId',
      traceArtifactIds,
      expectedTraceArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'traceArtifacts.artifactId',
      traceArtifactIds,
      new Set(expectedTraceArtifactIds),
    ),
    ...buildDuplicateItemIssues('traceArtifacts.artifactId', traceArtifactIds),
    ...traceArtifacts.flatMap((artifact, index) => [
      ...(!getNonEmptyString(artifact.artifactId)
        ? [`traceArtifacts[${index}].artifactId 缺失`]
        : []),
      ...(!getNonEmptyString(artifact.kind)
        ? [`traceArtifacts[${index}].kind 缺失`]
        : []),
      ...(getNonEmptyString(artifact.kind) &&
      !GATE_4_TRACE_ARTIFACT_KINDS.includes(
        getNonEmptyString(
          artifact.kind,
        ) as (typeof GATE_4_TRACE_ARTIFACT_KINDS)[number],
      )
        ? [
            `traceArtifacts[${index}].kind 必须是 ${GATE_4_TRACE_ARTIFACT_KINDS.join(
              ' | ',
            )} 之一`,
          ]
        : []),
      ...(getNonEmptyString(artifact.artifactId) &&
      getNonEmptyString(artifact.kind) &&
      expectedTraceArtifactKindById.get(
        getNonEmptyString(artifact.artifactId) ?? '',
      ) !== undefined &&
      expectedTraceArtifactKindById.get(
        getNonEmptyString(artifact.artifactId) ?? '',
      ) !== getNonEmptyString(artifact.kind)
        ? [
            `traceArtifacts[${index}].kind 与 trace artifact ${formatIssueValue(
              getNonEmptyString(artifact.artifactId) ?? '',
            )} 不一致`,
          ]
        : []),
      ...(!getNonEmptyString(artifact.path)
        ? [`traceArtifacts[${index}].path 缺失`]
        : []),
      ...buildSafeRelativePathIssues(
        `traceArtifacts[${index}].path`,
        getNonEmptyString(artifact.path),
      ),
      ...(getStringArray(artifact.producedByCheckIds).length === 0
        ? [`traceArtifacts[${index}].producedByCheckIds 不能为空`]
        : []),
      ...buildUnknownReferenceIssues(
        `traceArtifacts[${index}].producedByCheckIds`,
        getStringArray(artifact.producedByCheckIds),
        knownGate4CheckIds,
      ),
    ]),
  ];
  const failureCaptureIssues = [
    ...buildMissingItemsIssues(
      'failureCaptureFields',
      getStringArray(integrationPlan.failureCaptureFields),
      [...GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS],
    ),
  ];

  return [
    {
      id: 'integration-plan-version',
      label: 'IntegrationPlan 版本绑定',
      passed: versionIssues.length === 0,
      summary:
        '检查 integrationPlan 是否绑定当前 AppSpec、generationPlan、staticContracts 和 buildUnitPlan。',
      issues: versionIssues,
    },
    {
      id: 'test-tenant-and-resources',
      label: '测试租户与测试资源计划',
      passed: testTenantIssues.length === 0 && testResourceIssues.length === 0,
      summary:
        '检查 Gate 4 测试租户和测试资源是否使用合成上下文、无真实 token 且覆盖全部场景 fixture。',
      issues: [...testTenantIssues, ...testResourceIssues],
    },
    {
      id: 'public-runtime-api-checks',
      label: 'public runtime API checks',
      passed: publicRuntimeApiIssues.length === 0,
      summary:
        '检查公开 runtime 读取、提交 input、读取 submission detail 是否绑定 Gate 2 public input/output/submission persistence contract。',
      issues: publicRuntimeApiIssues,
    },
    {
      id: 'creator-management-api-checks',
      label: 'creator management API checks',
      passed: creatorApiIssues.length === 0,
      summary:
        '检查创建者侧 generation run、gate run 和 submission 查询集成 skeleton。',
      issues: creatorApiIssues,
    },
    {
      id: 'agent-workflow-dry-run-fixtures',
      label: 'Agent/Workflow dry-run fixture 期望',
      passed: dryRunIssues.length === 0,
      summary:
        '检查 Agent/Workflow dry-run fixture 是否覆盖编排节点、边、输入输出映射和 trace artifact。',
      issues: dryRunIssues,
    },
    {
      id: 'plugin-sandbox-smoke-expectations',
      label: '插件 sandbox smoke 期望',
      passed: pluginSmokeIssues.length === 0,
      summary:
        '检查每个计划插件/工具是否有 WASM/Extism smoke expectation 和 trace artifact；无插件时必须说明原因。',
      issues: pluginSmokeIssues,
    },
    {
      id: 'dependency-artifacts',
      label: 'Gate 3 依赖 artifacts',
      passed: dependencyArtifactIssues.length === 0,
      summary:
        '检查 Gate 4 integration skeleton 是否引用 Gate 3 build/unit artifacts。',
      issues: dependencyArtifactIssues,
    },
    {
      id: 'acceptance-scenario-coverage',
      label: 'acceptance scenario 覆盖',
      passed: acceptanceCoverageIssues.length === 0,
      summary:
        '检查每条 acceptance scenario 是否连接到 Gate 4 API check 和 dry-run fixture。',
      issues: acceptanceCoverageIssues,
    },
    {
      id: 'requirement-coverage',
      label: '需求覆盖',
      passed: requirementCoverageIssues.length === 0,
      summary:
        '检查每条核心需求是否连接到 Gate 4 checks 和 Gate 3 依赖 artifacts。',
      issues: requirementCoverageIssues,
    },
    {
      id: 'orchestration-coverage',
      label: '编排覆盖',
      passed: orchestrationCoverageIssues.length === 0,
      summary:
        '检查每个 Agent/Workflow 编排节点和边是否连接到 dry-run fixture 与 Gate 4 check。',
      issues: orchestrationCoverageIssues,
    },
    {
      id: 'trace-artifacts',
      label: 'trace artifacts',
      passed: traceArtifactIssues.length === 0,
      summary:
        '检查 public API、creator API、dry-run 和插件 smoke trace artifact 期望。',
      issues: traceArtifactIssues,
    },
    {
      id: 'failure-capture-fields',
      label: '失败捕获字段',
      passed: failureCaptureIssues.length === 0,
      summary:
        '检查后续真实 Gate 4 runner 失败时必须捕获 requestId、状态码、错误摘要、trace artifact 和耗时。',
      issues: failureCaptureIssues,
    },
  ];
}
