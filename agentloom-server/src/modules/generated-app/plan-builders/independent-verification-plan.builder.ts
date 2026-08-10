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
import type { GeneratedAppIndependentVerifierExecutionLevel } from '../generated-app.independent-verifier-runner';
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

export interface Gate6Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate6Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export const GATE_6_SKELETON_EVIDENCE_NOTE =
  'Gate 6 当前只做 independent-verifier-skeleton 完整性检查；未执行真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定。';

export const GATE_6_REAL_LOCAL_VERIFIER_NOTE =
  'Gate 6 real-local-independent-verifier 执行服务端受控 deterministic 本地独立规则审查；不访问外部网络，不调用任意模型，不读取 generation transcript、public share token、API key 或 secret，也不代表外部模型或人工审查。';

export const GATE_6_REQUIRED_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
] as const;

export const GATE_6_ALLOWED_EXECUTION_LEVELS = [
  'independent-verifier-skeleton',
  'real-local-independent-verifier',
  'fixture-independent-verifier',
  'disabled-independent-verifier',
] as const;

export const GATE_6_LOCAL_INDEPENDENT_VERIFIER_COMMAND =
  'agentloom generated-app gate-6 local-independent-verifier';

export const GATE_6_REQUIRED_ISOLATION_CONTROLS = [
  'fresh-reviewer-identity',
  'fresh-context-no-generation-transcript',
  'redacted-evidence-bundle-only',
  'reject-generator-self-attestation',
  'evidence-id-citation-required',
  'no-public-share-token-or-real-secret',
] as const;

export const GATE_6_REQUIRED_RUBRIC_CATEGORIES = [
  'requirement_coverage',
  'scenario_coverage',
  'ui_runtime_usability',
  'agent_workflow_behavior',
  'plugin_permission_safety',
  'security_privacy',
  'data_persistence',
  'public_runtime_boundary',
  'failure_error_states',
  'publish_blockers',
] as const;

export const GATE_6_REQUIRED_VERDICT_FIELDS = [
  'blockingFindings',
  'warnings',
  'decision',
  'traceabilityCoverage',
  'repairSuggestions',
  'residualRiskSummary',
] as const;

export const GATE_6_ALLOWED_FINDING_SEVERITIES = [
  'blocking',
  'warning',
] as const;

export const GATE_6_ALLOWED_DECISION_VALUES = ['pass', 'fail'] as const;

export const GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS = [
  'reviewer_identity_context_isolation',
  'input_material_redaction',
  'reject_generator_self_attestation',
  'evidence_id_citation_required',
] as const;

export const GATE_6_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'verifierRunId',
  'verifierIdentity',
  'inputBundleId',
  'blockingFindings',
  'warningFindings',
  'evidenceIds',
  'repairSuggestions',
  'residualRiskSummary',
  'durationMs',
] as const;

export const GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS = [
  'publicShareToken',
  'authorization',
  'apiKey',
  'secret',
] as const;

export const GATE_6_REQUIRED_COVERAGE_MATRIX_IDS = [
  'requirementCoverage',
  'scenarioCoverage',
  'evidenceCoverage',
  'gateCoverage',
] as const;

export const GATE_6_ALLOWED_COVERAGE_MATRIX_SOURCE_PLANS = [
  'generationPlan',
  'staticContracts',
  'buildUnitPlan',
  'integrationPlan',
  'browserAcceptancePlan',
  'independentVerificationPlan',
] as const;

export function buildIndependentVerificationPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  gateResults: GeneratedAppGateResult[],
  executionLevel: GeneratedAppIndependentVerifierExecutionLevel = 'independent-verifier-skeleton',
): GeneratedAppIndependentVerificationPlan {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const requiredGateIds = [...GATE_6_REQUIRED_GATE_IDS];
  const gateEvidenceRefs = requiredGateIds.map((gateId) => ({
    gateId,
    evidenceIds:
      gateResults
        .find((gate) => gate.gateId === gateId)
        ?.evidence.map((evidence) => evidence.id) ?? [],
  }));
  const evidenceIds = gateEvidenceRefs.flatMap((entry) => entry.evidenceIds);
  const staticContractIds = [...GATE_2_STATIC_CONTRACT_IDS];
  const buildUnitArtifactIds = buildUnitPlan.artifactExpectations.map(
    (artifact) => artifact.artifactId,
  );
  const integrationTraceArtifactIds = integrationPlan.traceArtifacts.map(
    (artifact) => artifact.artifactId,
  );
  const browserArtifactIds = browserAcceptancePlan.artifactExpectations.map(
    (artifact) => artifact.artifactId,
  );
  const rubricCategories = [...GATE_6_REQUIRED_RUBRIC_CATEGORIES];
  const coverageMatrixRefs: GeneratedAppIndependentVerificationPlan['evidenceBundle']['coverageMatrixRefs'] =
    [
      {
        matrixId: 'requirementCoverage',
        sourcePlan: 'independentVerificationPlan',
        requirementIds,
        scenarioIds,
        gateIds: requiredGateIds,
      },
      {
        matrixId: 'scenarioCoverage',
        sourcePlan: 'browserAcceptancePlan',
        requirementIds,
        scenarioIds,
        gateIds: requiredGateIds,
      },
      {
        matrixId: 'evidenceCoverage',
        sourcePlan: 'independentVerificationPlan',
        requirementIds,
        scenarioIds,
        gateIds: requiredGateIds,
      },
      {
        matrixId: 'gateCoverage',
        sourcePlan: 'independentVerificationPlan',
        requirementIds,
        scenarioIds,
        gateIds: requiredGateIds,
      },
    ];

  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    staticContractsVersion: staticContracts.contractVersion,
    buildUnitPlanVersion: buildUnitPlan.planVersion,
    integrationPlanVersion: integrationPlan.planVersion,
    browserAcceptancePlanVersion: browserAcceptancePlan.planVersion,
    executionLevel,
    skeletonDisclaimer:
      executionLevel === 'real-local-independent-verifier'
        ? GATE_6_REAL_LOCAL_VERIFIER_NOTE
        : GATE_6_SKELETON_EVIDENCE_NOTE,
    verifierRunner: {
      runner: 'local-independent-rules-verifier',
      command: GATE_6_LOCAL_INDEPENDENT_VERIFIER_COMMAND,
      workingDirectory: 'generated-run',
      usesExternalNetwork: false,
      usesExternalModel: false,
      usesHumanReviewer: false,
      usesGenerationTranscript: false,
      inputBundleId: 'gate-6-redacted-evidence-bundle',
      verdictArtifactPath: 'artifacts/gate-6/independent-verifier-verdict.json',
    },
    verifierIsolationPolicy: {
      verifierContext: 'fresh-independent-context',
      reuseGenerationContext: false,
      acceptsGeneratorSelfAttestation: false,
      readsPublicShareToken: false,
      readsRealSecrets: false,
      inputMaterialPolicy: 'redacted-evidence-bundle-only',
      requiredControls: [...GATE_6_REQUIRED_ISOLATION_CONTROLS],
    },
    evidenceBundle: {
      bundleId: 'gate-6-redacted-evidence-bundle',
      redactionLevel: 'redacted-no-public-token-or-secret',
      referencedGateIds: requiredGateIds,
      gateEvidenceRefs,
      staticContractIds,
      buildUnitArtifactIds,
      integrationTraceArtifactIds,
      browserArtifactIds,
      coverageMatrixRefs,
      forbiddenSensitiveFields: [...GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS],
    },
    rubric: rubricCategories.map((category) => ({
      category,
      label: buildGate6RubricLabel(category),
      requirementIds,
      scenarioIds,
      evidenceIds,
      blocking: true,
    })),
    verdictSchema: {
      requiredFields: [...GATE_6_REQUIRED_VERDICT_FIELDS],
      findingSeverities: [...GATE_6_ALLOWED_FINDING_SEVERITIES],
      decisionValues: [...GATE_6_ALLOWED_DECISION_VALUES],
      requiresEvidenceIds: true,
      requiresRepairSuggestions: true,
      residualRiskSummaryRequired: true,
    },
    verdictArtifact: {
      artifactId: 'independent-verifier-verdict',
      kind: 'verifier_report',
      path: 'artifacts/gate-6/independent-verifier-verdict.json',
      required: true,
      materialized: executionLevel === 'real-local-independent-verifier',
      containsSecrets: false,
    },
    independenceChecks: [
      {
        checkId: 'gate-6-reviewer-context-isolation',
        kind: 'reviewer_identity_context_isolation',
        required: true,
        gateIds: requiredGateIds,
        evidenceIds,
      },
      {
        checkId: 'gate-6-redacted-input-material',
        kind: 'input_material_redaction',
        required: true,
        gateIds: requiredGateIds,
        evidenceIds,
      },
      {
        checkId: 'gate-6-reject-generator-self-attestation',
        kind: 'reject_generator_self_attestation',
        required: true,
        gateIds: requiredGateIds,
        evidenceIds,
      },
      {
        checkId: 'gate-6-evidence-id-citation-required',
        kind: 'evidence_id_citation_required',
        required: true,
        gateIds: requiredGateIds,
        evidenceIds,
      },
    ],
    requirementCoverage: appSpec.coreRequirements.map((requirement) => ({
      requirementId: requirement.id,
      scenarioIds:
        appSpec.traceability.find(
          (entry) => entry.requirementId === requirement.id,
        )?.scenarioIds ?? [],
      rubricCategories,
      evidenceIds,
      gateIds: requiredGateIds,
      staticContractIds,
      browserArtifactIds,
    })),
    scenarioCoverage: appSpec.acceptanceScenarios.map((scenario) => ({
      scenarioId: scenario.id,
      requirementIds: scenario.requirementIds,
      rubricCategories,
      evidenceIds,
      gateIds: requiredGateIds,
      browserArtifactIds,
    })),
    evidenceCoverage: gateEvidenceRefs.flatMap((entry) =>
      entry.evidenceIds.map((evidenceId) => ({
        evidenceId,
        gateId: entry.gateId,
        usedByRubricCategories: rubricCategories,
        requirementIds,
        scenarioIds,
      })),
    ),
    gateCoverage: gateEvidenceRefs.map((entry) => ({
      gateId: entry.gateId,
      evidenceIds: entry.evidenceIds,
      required: true,
      coveredByRubricCategories: rubricCategories,
    })),
    failureCaptureFields: [
      ...GATE_6_REQUIRED_FAILURE_CAPTURE_FIELDS,
      'redactedEvidenceBundlePath',
    ],
  };
}

export function buildGate6RubricLabel(
  category: GeneratedAppIndependentVerificationPlan['rubric'][number]['category'],
): string {
  const labels: Record<
    GeneratedAppIndependentVerificationPlan['rubric'][number]['category'],
    string
  > = {
    requirement_coverage: '需求覆盖',
    scenario_coverage: 'scenario 覆盖',
    ui_runtime_usability: 'UI/runtime 可用性',
    agent_workflow_behavior: 'Agent/Workflow 行为',
    plugin_permission_safety: '插件/权限安全',
    security_privacy: '安全与隐私',
    data_persistence: '数据持久化',
    public_runtime_boundary: '公开 runtime 边界',
    failure_error_states: '失败与错误态',
    publish_blockers: '可发布阻断项',
  };

  return labels[category];
}

export function evaluateGate6IndependentVerificationPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  gateResults: GeneratedAppGateResult[],
  independentVerificationPlan: unknown,
): Gate6Evaluation {
  const checks = buildGate6Checks(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    gateResults,
    independentVerificationPlan,
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-6-${check.id}`,
    label: check.label,
    kind: 'verifier' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? `${check.summary} ${GATE_6_SKELETON_EVIDENCE_NOTE}`
        : `${check.summary} 缺口：${check.issues.join(
            '；',
          )} ${GATE_6_SKELETON_EVIDENCE_NOTE}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'independent-verifier-plan-incomplete',
      message: `IndependentVerificationPlan 独立审查 skeleton 检查失败：${failedChecks
        .map((check) => check.label)
        .join(
          '、',
        )}；本失败只来自 independent-verifier-skeleton 合约完整性检查，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。`,
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
        'Gate 6 失败：independentVerificationPlan 未完整覆盖 verifier 隔离策略、redacted evidence bundle、审查 rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖或失败捕获字段；本结果仅表示契约级 independent verifier skeleton 检查失败，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.independentVerificationPlan，使其覆盖 AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan 版本绑定、verifier 隔离策略、只含 redacted evidence 的 bundle、Gate 0-5 evidence ids、rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖和 failure capture fields；当前 Gate 6 仍只检查 independent-verifier-skeleton 合约，不代表真实独立模型/代理/人工审查或真实需求满足判定已经执行。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 6 通过：independentVerificationPlan 独立审查 skeleton 已完整覆盖 verifier 隔离策略、redacted evidence bundle、Gate 0-5 evidence ids、审查 rubric、verdict schema、independence checks、需求/场景/evidence/gate 覆盖和失败捕获字段；本结果仅表示契约级 independent verifier skeleton 完整，不代表真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定已经执行。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function buildGate6Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  gateResults: GeneratedAppGateResult[],
  independentVerificationPlan: unknown,
): Gate6Check[] {
  if (!isRecord(independentVerificationPlan)) {
    return [
      {
        id: 'independent-verification-plan-object',
        label: 'IndependentVerificationPlan JSON 对象',
        passed: false,
        summary:
          '检查 generationPlan.independentVerificationPlan 是否为结构化 JSON 对象。',
        issues: ['independentVerificationPlan 不是对象'],
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
  const requiredGateIds = [...GATE_6_REQUIRED_GATE_IDS];
  const knownGateIds = new Set<string>(requiredGateIds);
  const knownStaticContractIds = new Set<string>([
    ...GATE_2_STATIC_CONTRACT_IDS,
  ]);
  const buildUnitArtifactIds = buildUnitPlan.artifactExpectations.map(
    (artifact) => artifact.artifactId,
  );
  const knownBuildUnitArtifactIds = new Set(buildUnitArtifactIds);
  const integrationTraceArtifactIds = integrationPlan.traceArtifacts.map(
    (artifact) => artifact.artifactId,
  );
  const knownIntegrationTraceArtifactIds = new Set(integrationTraceArtifactIds);
  const browserArtifactIds = browserAcceptancePlan.artifactExpectations.map(
    (artifact) => artifact.artifactId,
  );
  const knownBrowserArtifactIds = new Set(browserArtifactIds);
  const gateEvidenceIdsByGateId = new Map<string, string[]>(
    requiredGateIds.map((gateId) => [
      gateId,
      gateResults
        .find((gate) => gate.gateId === gateId)
        ?.evidence.map((evidence) => evidence.id) ?? [],
    ]),
  );
  const knownEvidenceEntries = [...gateEvidenceIdsByGateId.entries()].flatMap(
    ([gateId, evidenceIds]) =>
      evidenceIds.map((evidenceId) => ({ gateId, evidenceId })),
  );
  const evidenceIds = knownEvidenceEntries.map((entry) => entry.evidenceId);
  const knownEvidenceIds = new Set(evidenceIds);
  const knownRubricCategories = new Set<string>([
    ...GATE_6_REQUIRED_RUBRIC_CATEGORIES,
  ]);
  const evidenceBundle = getRecord(independentVerificationPlan.evidenceBundle);
  const verifierIsolationPolicy = getRecord(
    independentVerificationPlan.verifierIsolationPolicy,
  );
  const verifierRunner = getRecord(independentVerificationPlan.verifierRunner);
  const gateEvidenceRefs = getRecordArray(evidenceBundle?.gateEvidenceRefs);
  const coverageMatrixRefs = getRecordArray(evidenceBundle?.coverageMatrixRefs);
  const rubric = getRecordArray(independentVerificationPlan.rubric);
  const verdictSchema = getRecord(independentVerificationPlan.verdictSchema);
  const verdictArtifact = getRecord(
    independentVerificationPlan.verdictArtifact,
  );
  const independenceChecks = getRecordArray(
    independentVerificationPlan.independenceChecks,
  );
  const requirementCoverage = getRecordArray(
    independentVerificationPlan.requirementCoverage,
  );
  const scenarioCoverage = getRecordArray(
    independentVerificationPlan.scenarioCoverage,
  );
  const evidenceCoverage = getRecordArray(
    independentVerificationPlan.evidenceCoverage,
  );
  const gateCoverage = getRecordArray(independentVerificationPlan.gateCoverage);

  const versionIssues = [
    ...(independentVerificationPlan.planVersion === 1
      ? []
      : ['planVersion 必须为 1']),
    ...(independentVerificationPlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            independentVerificationPlan.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(independentVerificationPlan.generationPlanVersion ===
    generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            independentVerificationPlan.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
    ...(independentVerificationPlan.staticContractsVersion ===
    staticContracts.contractVersion
      ? []
      : [
          `staticContractsVersion=${String(
            independentVerificationPlan.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...(independentVerificationPlan.buildUnitPlanVersion ===
    buildUnitPlan.planVersion
      ? []
      : [
          `buildUnitPlanVersion=${String(
            independentVerificationPlan.buildUnitPlanVersion,
          )} 与 buildUnitPlan.planVersion=${buildUnitPlan.planVersion} 不一致`,
        ]),
    ...(independentVerificationPlan.integrationPlanVersion ===
    integrationPlan.planVersion
      ? []
      : [
          `integrationPlanVersion=${String(
            independentVerificationPlan.integrationPlanVersion,
          )} 与 integrationPlan.planVersion=${integrationPlan.planVersion} 不一致`,
        ]),
    ...(independentVerificationPlan.browserAcceptancePlanVersion ===
    browserAcceptancePlan.planVersion
      ? []
      : [
          `browserAcceptancePlanVersion=${String(
            independentVerificationPlan.browserAcceptancePlanVersion,
          )} 与 browserAcceptancePlan.planVersion=${browserAcceptancePlan.planVersion} 不一致`,
        ]),
    ...(GATE_6_ALLOWED_EXECUTION_LEVELS.includes(
      independentVerificationPlan.executionLevel as (typeof GATE_6_ALLOWED_EXECUTION_LEVELS)[number],
    )
      ? []
      : [
          `executionLevel 必须为 ${GATE_6_ALLOWED_EXECUTION_LEVELS.join(
            ' | ',
          )} 之一`,
        ]),
    ...(!getNonEmptyString(independentVerificationPlan.skeletonDisclaimer)
      ? ['skeletonDisclaimer 缺失']
      : []),
    ...collectSensitiveTokenIssues(
      independentVerificationPlan,
      'independentVerificationPlan',
    ),
  ];
  const verifierRunnerIssues = [
    ...requireRecord(verifierRunner, 'verifierRunner'),
    ...(verifierRunner?.runner === 'local-independent-rules-verifier'
      ? []
      : ['verifierRunner.runner 必须为 local-independent-rules-verifier']),
    ...(verifierRunner?.command === GATE_6_LOCAL_INDEPENDENT_VERIFIER_COMMAND
      ? []
      : [
          `verifierRunner.command 必须为 ${GATE_6_LOCAL_INDEPENDENT_VERIFIER_COMMAND}`,
        ]),
    ...(verifierRunner?.workingDirectory === 'generated-run'
      ? []
      : ['verifierRunner.workingDirectory 必须为 generated-run']),
    ...(verifierRunner?.usesExternalNetwork === false
      ? []
      : ['verifierRunner.usesExternalNetwork 必须为 false']),
    ...(verifierRunner?.usesExternalModel === false
      ? []
      : ['verifierRunner.usesExternalModel 必须为 false']),
    ...(verifierRunner?.usesHumanReviewer === false
      ? []
      : ['verifierRunner.usesHumanReviewer 必须为 false']),
    ...(verifierRunner?.usesGenerationTranscript === false
      ? []
      : ['verifierRunner.usesGenerationTranscript 必须为 false']),
    ...(verifierRunner?.inputBundleId === 'gate-6-redacted-evidence-bundle'
      ? []
      : [
          'verifierRunner.inputBundleId 必须引用 gate-6-redacted-evidence-bundle',
        ]),
    ...(verifierRunner?.verdictArtifactPath ===
    'artifacts/gate-6/independent-verifier-verdict.json'
      ? []
      : [
          'verifierRunner.verdictArtifactPath 必须为 artifacts/gate-6/independent-verifier-verdict.json',
        ]),
  ];
  const isolationIssues = [
    ...requireRecord(verifierIsolationPolicy, 'verifierIsolationPolicy'),
    ...(verifierIsolationPolicy?.verifierContext === 'fresh-independent-context'
      ? []
      : [
          'verifierIsolationPolicy.verifierContext 必须为 fresh-independent-context',
        ]),
    ...(verifierIsolationPolicy?.reuseGenerationContext === false
      ? []
      : ['verifierIsolationPolicy.reuseGenerationContext 必须为 false']),
    ...(verifierIsolationPolicy?.acceptsGeneratorSelfAttestation === false
      ? []
      : [
          'verifierIsolationPolicy.acceptsGeneratorSelfAttestation 必须为 false',
        ]),
    ...(verifierIsolationPolicy?.readsPublicShareToken === false
      ? []
      : ['verifierIsolationPolicy.readsPublicShareToken 必须为 false']),
    ...(verifierIsolationPolicy?.readsRealSecrets === false
      ? []
      : ['verifierIsolationPolicy.readsRealSecrets 必须为 false']),
    ...(verifierIsolationPolicy?.inputMaterialPolicy ===
    'redacted-evidence-bundle-only'
      ? []
      : [
          'verifierIsolationPolicy.inputMaterialPolicy 必须为 redacted-evidence-bundle-only',
        ]),
    ...(getStringArray(verifierIsolationPolicy?.requiredControls).length === 0
      ? ['verifierIsolationPolicy.requiredControls 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'verifierIsolationPolicy.requiredControls',
      getStringArray(verifierIsolationPolicy?.requiredControls),
      [...GATE_6_REQUIRED_ISOLATION_CONTROLS],
    ),
  ];
  const gateEvidenceRefGateIds = gateEvidenceRefs
    .map((entry) => getNonEmptyString(entry.gateId))
    .filter((gateId): gateId is string => gateId !== null);
  const coverageMatrixIds = coverageMatrixRefs
    .map((entry) => getNonEmptyString(entry.matrixId))
    .filter((matrixId): matrixId is string => matrixId !== null);
  const evidenceBundleIssues = [
    ...requireRecord(evidenceBundle, 'evidenceBundle'),
    ...(!getNonEmptyString(evidenceBundle?.bundleId)
      ? ['evidenceBundle.bundleId 缺失']
      : []),
    ...(evidenceBundle?.redactionLevel === 'redacted-no-public-token-or-secret'
      ? []
      : [
          'evidenceBundle.redactionLevel 必须为 redacted-no-public-token-or-secret',
        ]),
    ...(getStringArray(evidenceBundle?.referencedGateIds).length === 0
      ? ['evidenceBundle.referencedGateIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.referencedGateIds',
      getStringArray(evidenceBundle?.referencedGateIds),
      requiredGateIds,
    ),
    ...buildUnknownReferenceIssues(
      'evidenceBundle.referencedGateIds',
      getStringArray(evidenceBundle?.referencedGateIds),
      knownGateIds,
    ),
    ...buildDuplicateItemIssues(
      'evidenceBundle.referencedGateIds',
      getStringArray(evidenceBundle?.referencedGateIds),
    ),
    ...(gateEvidenceRefs.length === 0
      ? ['evidenceBundle.gateEvidenceRefs 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.gateEvidenceRefs.gateId',
      gateEvidenceRefGateIds,
      requiredGateIds,
    ),
    ...gateEvidenceRefs.flatMap((entry, index) => {
      const gateId = getNonEmptyString(entry.gateId);
      const entryEvidenceIds = getStringArray(entry.evidenceIds);
      const gateSpecificEvidenceIds =
        gateId === null ? [] : (gateEvidenceIdsByGateId.get(gateId) ?? []);

      return [
        ...(!gateId
          ? [`evidenceBundle.gateEvidenceRefs[${index}].gateId 缺失`]
          : []),
        ...(gateId && !knownGateIds.has(gateId)
          ? [
              `evidenceBundle.gateEvidenceRefs[${index}].gateId 引用了未知 gate ${formatIssueValue(
                gateId,
              )}`,
            ]
          : []),
        ...(entryEvidenceIds.length === 0
          ? [`evidenceBundle.gateEvidenceRefs[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `evidenceBundle.gateEvidenceRefs[${index}].evidenceIds`,
          entryEvidenceIds,
          knownEvidenceIds,
        ),
        ...entryEvidenceIds
          .filter(
            (evidenceId) =>
              gateId !== null &&
              knownGateIds.has(gateId) &&
              knownEvidenceIds.has(evidenceId) &&
              !gateSpecificEvidenceIds.includes(evidenceId),
          )
          .map(
            (evidenceId) =>
              `evidenceBundle.gateEvidenceRefs[${index}].evidenceIds ${formatIssueValue(
                evidenceId,
              )} 不属于 ${gateId}`,
          ),
      ];
    }),
    ...(getStringArray(evidenceBundle?.staticContractIds).length === 0
      ? ['evidenceBundle.staticContractIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.staticContractIds',
      getStringArray(evidenceBundle?.staticContractIds),
      [...GATE_2_STATIC_CONTRACT_IDS],
    ),
    ...buildUnknownReferenceIssues(
      'evidenceBundle.staticContractIds',
      getStringArray(evidenceBundle?.staticContractIds),
      knownStaticContractIds,
    ),
    ...(getStringArray(evidenceBundle?.buildUnitArtifactIds).length === 0
      ? ['evidenceBundle.buildUnitArtifactIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.buildUnitArtifactIds',
      getStringArray(evidenceBundle?.buildUnitArtifactIds),
      buildUnitArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'evidenceBundle.buildUnitArtifactIds',
      getStringArray(evidenceBundle?.buildUnitArtifactIds),
      knownBuildUnitArtifactIds,
    ),
    ...(getStringArray(evidenceBundle?.integrationTraceArtifactIds).length === 0
      ? ['evidenceBundle.integrationTraceArtifactIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.integrationTraceArtifactIds',
      getStringArray(evidenceBundle?.integrationTraceArtifactIds),
      integrationTraceArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'evidenceBundle.integrationTraceArtifactIds',
      getStringArray(evidenceBundle?.integrationTraceArtifactIds),
      knownIntegrationTraceArtifactIds,
    ),
    ...(getStringArray(evidenceBundle?.browserArtifactIds).length === 0
      ? ['evidenceBundle.browserArtifactIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.browserArtifactIds',
      getStringArray(evidenceBundle?.browserArtifactIds),
      browserArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'evidenceBundle.browserArtifactIds',
      getStringArray(evidenceBundle?.browserArtifactIds),
      knownBrowserArtifactIds,
    ),
    ...(coverageMatrixRefs.length === 0
      ? ['evidenceBundle.coverageMatrixRefs 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.coverageMatrixRefs.matrixId',
      coverageMatrixIds,
      [...GATE_6_REQUIRED_COVERAGE_MATRIX_IDS],
    ),
    ...buildDuplicateItemIssues(
      'evidenceBundle.coverageMatrixRefs.matrixId',
      coverageMatrixIds,
    ),
    ...coverageMatrixRefs.flatMap((entry, index) => {
      const matrixId = getNonEmptyString(entry.matrixId);
      const sourcePlan = getNonEmptyString(entry.sourcePlan);
      const allowedMatrixIds = new Set<string>([
        ...GATE_6_REQUIRED_COVERAGE_MATRIX_IDS,
      ]);
      const allowedSourcePlans = new Set<string>([
        ...GATE_6_ALLOWED_COVERAGE_MATRIX_SOURCE_PLANS,
      ]);

      return [
        ...(!matrixId ? [`coverageMatrixRefs[${index}].matrixId 缺失`] : []),
        ...(matrixId && !allowedMatrixIds.has(matrixId)
          ? [
              `coverageMatrixRefs[${index}].matrixId 是非法 coverage matrix ${formatIssueValue(
                matrixId,
              )}`,
            ]
          : []),
        ...(!sourcePlan
          ? [`coverageMatrixRefs[${index}].sourcePlan 缺失`]
          : []),
        ...(sourcePlan && !allowedSourcePlans.has(sourcePlan)
          ? [
              `coverageMatrixRefs[${index}].sourcePlan 是非法 source plan ${formatIssueValue(
                sourcePlan,
              )}`,
            ]
          : []),
        ...(getStringArray(entry.requirementIds).length === 0
          ? [`coverageMatrixRefs[${index}].requirementIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `coverageMatrixRefs[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.scenarioIds).length === 0
          ? [`coverageMatrixRefs[${index}].scenarioIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `coverageMatrixRefs[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...(getStringArray(entry.gateIds).length === 0
          ? [`coverageMatrixRefs[${index}].gateIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `coverageMatrixRefs[${index}].gateIds`,
          getStringArray(entry.gateIds),
          knownGateIds,
        ),
      ];
    }),
    ...(getStringArray(evidenceBundle?.forbiddenSensitiveFields).length === 0
      ? ['evidenceBundle.forbiddenSensitiveFields 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'evidenceBundle.forbiddenSensitiveFields',
      getStringArray(evidenceBundle?.forbiddenSensitiveFields),
      [...GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS],
    ),
  ];
  const rubricCategories = rubric
    .map((entry) => getNonEmptyString(entry.category))
    .filter((category): category is string => category !== null);
  const rubricIssues = [
    ...(rubric.length === 0 ? ['rubric 不能为空'] : []),
    ...buildMissingItemsIssues('rubric.category', rubricCategories, [
      ...GATE_6_REQUIRED_RUBRIC_CATEGORIES,
    ]),
    ...buildDuplicateItemIssues('rubric.category', rubricCategories),
    ...rubric.flatMap((entry, index) => {
      const category = getNonEmptyString(entry.category);

      return [
        ...(!category ? [`rubric[${index}].category 缺失`] : []),
        ...(category && !knownRubricCategories.has(category)
          ? [
              `rubric[${index}].category 是非法 rubric category ${formatIssueValue(
                category,
              )}`,
            ]
          : []),
        ...(!getNonEmptyString(entry.label)
          ? [`rubric[${index}].label 缺失`]
          : []),
        ...(getStringArray(entry.requirementIds).length === 0
          ? [`rubric[${index}].requirementIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `rubric[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.scenarioIds).length === 0
          ? [`rubric[${index}].scenarioIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `rubric[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`rubric[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `rubric[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...(typeof entry.blocking === 'boolean'
          ? []
          : [`rubric[${index}].blocking 必须为 boolean`]),
      ];
    }),
  ];
  const verdictSchemaIssues = [
    ...requireRecord(verdictSchema, 'verdictSchema'),
    ...(getStringArray(verdictSchema?.requiredFields).length === 0
      ? ['verdictSchema.requiredFields 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'verdictSchema.requiredFields',
      getStringArray(verdictSchema?.requiredFields),
      [...GATE_6_REQUIRED_VERDICT_FIELDS],
    ),
    ...getStringArray(verdictSchema?.requiredFields)
      .filter(
        (field) =>
          !new Set<string>([...GATE_6_REQUIRED_VERDICT_FIELDS]).has(field),
      )
      .map(
        (field) =>
          `verdictSchema.requiredFields 包含非法字段 ${formatIssueValue(
            field,
          )}`,
      ),
    ...(getStringArray(verdictSchema?.findingSeverities).length === 0
      ? ['verdictSchema.findingSeverities 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'verdictSchema.findingSeverities',
      getStringArray(verdictSchema?.findingSeverities),
      [...GATE_6_ALLOWED_FINDING_SEVERITIES],
    ),
    ...getStringArray(verdictSchema?.findingSeverities)
      .filter(
        (severity) =>
          !new Set<string>([...GATE_6_ALLOWED_FINDING_SEVERITIES]).has(
            severity,
          ),
      )
      .map(
        (severity) =>
          `verdictSchema.findingSeverities 包含非法 severity ${formatIssueValue(
            severity,
          )}`,
      ),
    ...(getStringArray(verdictSchema?.decisionValues).length === 0
      ? ['verdictSchema.decisionValues 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'verdictSchema.decisionValues',
      getStringArray(verdictSchema?.decisionValues),
      [...GATE_6_ALLOWED_DECISION_VALUES],
    ),
    ...getStringArray(verdictSchema?.decisionValues)
      .filter(
        (decision) =>
          !new Set<string>([...GATE_6_ALLOWED_DECISION_VALUES]).has(decision),
      )
      .map(
        (decision) =>
          `verdictSchema.decisionValues 包含非法 decision ${formatIssueValue(
            decision,
          )}`,
      ),
    ...(verdictSchema?.requiresEvidenceIds === true
      ? []
      : ['verdictSchema.requiresEvidenceIds 必须为 true']),
    ...(verdictSchema?.requiresRepairSuggestions === true
      ? []
      : ['verdictSchema.requiresRepairSuggestions 必须为 true']),
    ...(verdictSchema?.residualRiskSummaryRequired === true
      ? []
      : ['verdictSchema.residualRiskSummaryRequired 必须为 true']),
  ];
  const verdictArtifactIssues = [
    ...requireRecord(verdictArtifact, 'verdictArtifact'),
    ...(verdictArtifact?.artifactId === 'independent-verifier-verdict'
      ? []
      : ['verdictArtifact.artifactId 必须为 independent-verifier-verdict']),
    ...(verdictArtifact?.kind === 'verifier_report'
      ? []
      : ['verdictArtifact.kind 必须为 verifier_report']),
    ...(verdictArtifact?.path ===
    'artifacts/gate-6/independent-verifier-verdict.json'
      ? []
      : [
          'verdictArtifact.path 必须为 artifacts/gate-6/independent-verifier-verdict.json',
        ]),
    ...(verdictArtifact?.required === true
      ? []
      : ['verdictArtifact.required 必须为 true']),
    ...(typeof verdictArtifact?.materialized === 'boolean'
      ? []
      : ['verdictArtifact.materialized 必须是 boolean']),
    ...(verdictArtifact?.containsSecrets === false
      ? []
      : ['verdictArtifact.containsSecrets 必须为 false']),
  ];
  const independenceCheckKinds = independenceChecks
    .map((entry) => getNonEmptyString(entry.kind))
    .filter((kind): kind is string => kind !== null);
  const knownIndependenceKinds = new Set<string>([
    ...GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS,
  ]);
  const independenceIssues = [
    ...(independenceChecks.length === 0 ? ['independenceChecks 不能为空'] : []),
    ...buildMissingItemsIssues(
      'independenceChecks.kind',
      independenceCheckKinds,
      [...GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS],
    ),
    ...independenceChecks.flatMap((entry, index) => {
      const checkId = getNonEmptyString(entry.checkId);
      const kind = getNonEmptyString(entry.kind);

      return [
        ...(!checkId ? [`independenceChecks[${index}].checkId 缺失`] : []),
        ...(!kind ? [`independenceChecks[${index}].kind 缺失`] : []),
        ...(kind && !knownIndependenceKinds.has(kind)
          ? [
              `independenceChecks[${index}].kind 是非法 independence check kind ${formatIssueValue(
                kind,
              )}`,
            ]
          : []),
        ...(entry.required === true
          ? []
          : [`independenceChecks[${index}].required 必须为 true`]),
        ...(getStringArray(entry.gateIds).length === 0
          ? [`independenceChecks[${index}].gateIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `independenceChecks[${index}].gateIds`,
          getStringArray(entry.gateIds),
          knownGateIds,
        ),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`independenceChecks[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `independenceChecks[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
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
          `requirementCoverage[${index}].rubricCategories`,
          getStringArray(entry.rubricCategories),
          knownRubricCategories,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].gateIds`,
          getStringArray(entry.gateIds),
          knownGateIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].staticContractIds`,
          getStringArray(entry.staticContractIds),
          knownStaticContractIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].browserArtifactIds`,
          getStringArray(entry.browserArtifactIds),
          knownBrowserArtifactIds,
        ),
      ];
    }),
    ...requirementIds.flatMap((requirementId) => {
      const entry = requirementCoverageById.get(requirementId);
      const expectedScenarioIds =
        appSpec.traceability.find(
          (candidate) => candidate.requirementId === requirementId,
        )?.scenarioIds ?? [];

      if (!entry) {
        return [`需求 ${requirementId} 缺少 Gate 6 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          expectedScenarioIds,
        ),
        ...[
          'rubricCategories',
          'evidenceIds',
          'gateIds',
          'staticContractIds',
          'browserArtifactIds',
        ].flatMap((field) =>
          getStringArray(entry[field]).length === 0
            ? [`requirementCoverage[${requirementId}].${field} 不能为空`]
            : [],
        ),
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].gateIds`,
          getStringArray(entry.gateIds),
          requiredGateIds,
        ),
      ];
    }),
  ];
  const scenarioCoverageById = new Map(
    scenarioCoverage
      .map((entry) => {
        const scenarioId = getNonEmptyString(entry.scenarioId);
        return scenarioId ? ([scenarioId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const scenarioCoverageIssues = [
    ...(scenarioCoverage.length === 0 ? ['scenarioCoverage 不能为空'] : []),
    ...scenarioCoverage.flatMap((entry, index) => {
      const scenarioId = getNonEmptyString(entry.scenarioId);

      return [
        ...(!scenarioId ? [`scenarioCoverage[${index}].scenarioId 缺失`] : []),
        ...(scenarioId && !knownScenarioIds.has(scenarioId)
          ? [
              `scenarioCoverage[${index}].scenarioId 引用了未知场景 ${formatIssueValue(
                scenarioId,
              )}`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `scenarioCoverage[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `scenarioCoverage[${index}].rubricCategories`,
          getStringArray(entry.rubricCategories),
          knownRubricCategories,
        ),
        ...buildUnknownReferenceIssues(
          `scenarioCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...buildUnknownReferenceIssues(
          `scenarioCoverage[${index}].gateIds`,
          getStringArray(entry.gateIds),
          knownGateIds,
        ),
        ...buildUnknownReferenceIssues(
          `scenarioCoverage[${index}].browserArtifactIds`,
          getStringArray(entry.browserArtifactIds),
          knownBrowserArtifactIds,
        ),
      ];
    }),
    ...scenarioIds.flatMap((scenarioId) => {
      const entry = scenarioCoverageById.get(scenarioId);
      const scenario = appSpec.acceptanceScenarios.find(
        (candidate) => candidate.id === scenarioId,
      );

      if (!entry) {
        return [`场景 ${scenarioId} 缺少 Gate 6 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `scenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          scenario?.requirementIds ?? [],
        ),
        ...[
          'rubricCategories',
          'evidenceIds',
          'gateIds',
          'browserArtifactIds',
        ].flatMap((field) =>
          getStringArray(entry[field]).length === 0
            ? [`scenarioCoverage[${scenarioId}].${field} 不能为空`]
            : [],
        ),
        ...buildMissingItemsIssues(
          `scenarioCoverage[${scenarioId}].gateIds`,
          getStringArray(entry.gateIds),
          requiredGateIds,
        ),
      ];
    }),
  ];
  const evidenceCoverageById = new Map(
    evidenceCoverage
      .map((entry) => {
        const evidenceId = getNonEmptyString(entry.evidenceId);
        return evidenceId ? ([evidenceId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const evidenceCoverageIssues = [
    ...(evidenceCoverage.length === 0 ? ['evidenceCoverage 不能为空'] : []),
    ...evidenceCoverage.flatMap((entry, index) => {
      const evidenceId = getNonEmptyString(entry.evidenceId);
      const gateId = getNonEmptyString(entry.gateId);
      const expectedGateId = evidenceId
        ? knownEvidenceEntries.find(
            (candidate) => candidate.evidenceId === evidenceId,
          )?.gateId
        : undefined;

      return [
        ...(!evidenceId ? [`evidenceCoverage[${index}].evidenceId 缺失`] : []),
        ...(evidenceId && !knownEvidenceIds.has(evidenceId)
          ? [
              `evidenceCoverage[${index}].evidenceId 引用了未知 evidence ${formatIssueValue(
                evidenceId,
              )}`,
            ]
          : []),
        ...(!gateId ? [`evidenceCoverage[${index}].gateId 缺失`] : []),
        ...(gateId && !knownGateIds.has(gateId)
          ? [
              `evidenceCoverage[${index}].gateId 引用了未知 gate ${formatIssueValue(
                gateId,
              )}`,
            ]
          : []),
        ...(gateId && expectedGateId && gateId !== expectedGateId
          ? [
              `evidenceCoverage[${index}].gateId 与 evidence ${formatIssueValue(
                evidenceId ?? '',
              )} 所属 gate ${expectedGateId} 不一致`,
            ]
          : []),
        ...(getStringArray(entry.usedByRubricCategories).length === 0
          ? [`evidenceCoverage[${index}].usedByRubricCategories 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `evidenceCoverage[${index}].usedByRubricCategories`,
          getStringArray(entry.usedByRubricCategories),
          knownRubricCategories,
        ),
        ...(getStringArray(entry.requirementIds).length === 0
          ? [`evidenceCoverage[${index}].requirementIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `evidenceCoverage[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.scenarioIds).length === 0
          ? [`evidenceCoverage[${index}].scenarioIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `evidenceCoverage[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
      ];
    }),
    ...evidenceIds.flatMap((evidenceId) =>
      evidenceCoverageById.has(evidenceId)
        ? []
        : [`evidence ${evidenceId} 缺少 Gate 6 覆盖声明`],
    ),
  ];
  const gateCoverageById = new Map(
    gateCoverage
      .map((entry) => {
        const gateId = getNonEmptyString(entry.gateId);
        return gateId ? ([gateId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const gateCoverageIssues = [
    ...(gateCoverage.length === 0 ? ['gateCoverage 不能为空'] : []),
    ...gateCoverage.flatMap((entry, index) => {
      const gateId = getNonEmptyString(entry.gateId);
      const expectedEvidenceIds =
        gateId === null ? [] : (gateEvidenceIdsByGateId.get(gateId) ?? []);

      return [
        ...(!gateId ? [`gateCoverage[${index}].gateId 缺失`] : []),
        ...(gateId && !knownGateIds.has(gateId)
          ? [
              `gateCoverage[${index}].gateId 引用了未知 gate ${formatIssueValue(
                gateId,
              )}`,
            ]
          : []),
        ...(entry.required === true
          ? []
          : [`gateCoverage[${index}].required 必须为 true`]),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`gateCoverage[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `gateCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...buildMissingItemsIssues(
          `gateCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          expectedEvidenceIds,
        ),
        ...(getStringArray(entry.coveredByRubricCategories).length === 0
          ? [`gateCoverage[${index}].coveredByRubricCategories 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `gateCoverage[${index}].coveredByRubricCategories`,
          getStringArray(entry.coveredByRubricCategories),
          knownRubricCategories,
        ),
      ];
    }),
    ...requiredGateIds.flatMap((gateId) =>
      gateCoverageById.has(gateId)
        ? []
        : [`gate ${gateId} 缺少 Gate 6 覆盖声明`],
    ),
  ];
  const failureCaptureIssues = [
    ...buildMissingItemsIssues(
      'failureCaptureFields',
      getStringArray(independentVerificationPlan.failureCaptureFields),
      [...GATE_6_REQUIRED_FAILURE_CAPTURE_FIELDS],
    ),
  ];

  return [
    {
      id: 'independent-verifier-plan-version',
      label: 'IndependentVerificationPlan 版本绑定',
      passed: versionIssues.length === 0,
      summary:
        '检查 independentVerificationPlan 是否绑定当前 AppSpec、generationPlan、staticContracts、buildUnitPlan、integrationPlan 和 browserAcceptancePlan。',
      issues: versionIssues,
    },
    {
      id: 'verifier-isolation-policy',
      label: 'verifier 隔离策略',
      passed: isolationIssues.length === 0,
      summary:
        '检查 verifier context 不复用生成上下文、不接受 generator self-attestation、不读取 publicShareToken/真实 secret，且只读取 redacted evidence bundle。',
      issues: isolationIssues,
    },
    {
      id: 'verifier-runner-contract',
      label: 'verifier runner 合约',
      passed: verifierRunnerIssues.length === 0,
      summary:
        '检查 Gate 6 本地独立规则 verifier runner 是否禁用外部网络/模型/人工审查/generation transcript 并固定输出 artifact。',
      issues: verifierRunnerIssues,
    },
    {
      id: 'redacted-evidence-bundle',
      label: 'redacted evidence bundle',
      passed: evidenceBundleIssues.length === 0,
      summary:
        '检查 evidence bundle 是否引用 Gate 0-5、gate evidence ids、static contracts、build/unit artifacts、integration traces、browser artifacts 和 coverage matrix，且不含真实 token。',
      issues: evidenceBundleIssues,
    },
    {
      id: 'independent-verifier-rubric',
      label: '独立审查 rubric',
      passed: rubricIssues.length === 0,
      summary:
        '检查需求覆盖、scenario 覆盖、UI/runtime、Agent/Workflow、插件/权限、安全/隐私、数据持久化、公开 runtime、错误态和发布阻断项 rubric。',
      issues: rubricIssues,
    },
    {
      id: 'verdict-schema',
      label: 'verdict schema',
      passed:
        verdictSchemaIssues.length === 0 && verdictArtifactIssues.length === 0,
      summary:
        '检查 verdict schema/artifact 是否包含 blocking findings、warnings、pass/fail decision、traceability coverage、repair suggestions、residual risk summary 和 verifier report artifact。',
      issues: [...verdictSchemaIssues, ...verdictArtifactIssues],
    },
    {
      id: 'independence-checks',
      label: 'independence checks',
      passed: independenceIssues.length === 0,
      summary:
        '检查审查者身份/上下文隔离、输入材料 redaction、拒绝 generator self-attestation 和 evidence id citation 要求。',
      issues: independenceIssues,
    },
    {
      id: 'requirement-coverage',
      label: '需求覆盖',
      passed: requirementCoverageIssues.length === 0,
      summary:
        '检查每条核心需求是否连接 Gate 6 rubric、Gate 0-5 evidence、static contracts 和 browser artifacts。',
      issues: requirementCoverageIssues,
    },
    {
      id: 'scenario-coverage',
      label: 'scenario 覆盖',
      passed: scenarioCoverageIssues.length === 0,
      summary:
        '检查每条 acceptance scenario 是否连接 Gate 6 rubric、Gate 0-5 evidence 和 browser artifacts。',
      issues: scenarioCoverageIssues,
    },
    {
      id: 'evidence-coverage',
      label: 'evidence 覆盖',
      passed: evidenceCoverageIssues.length === 0,
      summary:
        '检查 Gate 0-5 每条 evidence 是否被 Gate 6 覆盖矩阵引用且 gate 归属正确。',
      issues: evidenceCoverageIssues,
    },
    {
      id: 'gate-coverage',
      label: 'Gate 覆盖',
      passed: gateCoverageIssues.length === 0,
      summary: '检查 Gate 0-5 是否都有 evidence coverage 和 rubric coverage。',
      issues: gateCoverageIssues,
    },
    {
      id: 'failure-capture-fields',
      label: '失败捕获字段',
      passed: failureCaptureIssues.length === 0,
      summary:
        '检查后续真实 Gate 6 runner 失败时必须捕获 verifier、bundle、finding、evidence、repair 和 residual risk 字段。',
      issues: failureCaptureIssues,
    },
  ];
}
