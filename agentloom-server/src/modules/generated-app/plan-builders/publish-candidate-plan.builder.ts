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
import type { GeneratedAppPublishCandidateExecutionLevel } from '../generated-app.publish-candidate-runner';
import { evaluateGeneratedAppReadiness } from '../generated-app.gates';

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

export interface Gate7Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate7Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export const GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON =
  'Gate 7 publish-candidate guard skeleton 检测到 Gate 4-6 仍为 skeleton-only upstream evidence，且缺少后续真实 integration/browser/verifier 证据，不能形成 publish candidate。';

export const GATE_7_SKELETON_EVIDENCE_NOTE =
  'Gate 7 当前执行受控本地 publish-candidate contract；不会创建生产发布、真实 artifact archive、真实签名或 public share token。';

export const GATE_7_REQUIRED_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
  'gate-7',
] as const;

export const GATE_7_UPSTREAM_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
] as const;

export const GATE_7_REQUIRED_READINESS_PRECONDITIONS = [
  'all-gate-0-through-gate-7-blocking-gates-passed',
  'no-blocking-findings',
  'no-unresolved-warning-findings',
  'real-artifacts-signed-off',
  'real-independent-verifier-verdict-pass',
  'public-share-token-created-only-after-publish-candidate',
] as const;

export const GATE_7_REQUIRED_NON_SKELETON_EVIDENCE_CLASSES = [
  'real_frontend_build_artifact',
  'real_plugin_bundle_artifact',
  'real_test_report',
  'real_integration_trace',
  'real_browser_artifact',
  'real_independent_verifier_report',
  'real_source_artifact',
] as const;

export const GATE_7_ALLOWED_ARTIFACT_KINDS = [
  'frontend_artifact',
  'plugin_bundle_artifact',
  'test_report',
  'integration_trace',
  'browser_artifact',
  'verifier_report',
  'source_artifact_placeholder',
] as const;

export const GATE_7_REQUIRED_ARTIFACT_KINDS = [
  ...GATE_7_ALLOWED_ARTIFACT_KINDS,
] as const;

export const GATE_7_ALLOWED_EXECUTION_LEVELS = [
  'publish-candidate-guard-skeleton',
  'real-local-publish-candidate-contract',
  'fixture-publish-candidate-contract',
  'disabled-publish-candidate-contract',
] as const;

export const GATE_7_REQUIRED_BLOCKER_CATEGORIES = [
  'skeleton_only_upstream_gate',
  'missing_real_execution_artifact',
  'missing_real_independent_verifier_verdict',
  'unresolved_warning_or_blocking_finding',
  'stale_public_token_requirement',
] as const;

export const GATE_7_ALLOWED_REAL_GATE_RUNNER_IDS = [
  'gate-3-real-build-unit-runner',
  'gate-4-real-integration-runner',
  'gate-5-real-browser-acceptance-runner',
  'gate-5-real-browser-e2e-runner',
  'gate-6-real-independent-verifier-runner',
  'gate-7-real-publish-candidate-runner',
] as const;

export const GATE_7_REQUIRED_BLOCKING_REASON_FRAGMENTS = [
  'skeleton/contract-level',
  '真实 integration/browser/verifier artifact',
  '真实独立 verifier verdict',
] as const;

export const GATE_7_EXPECTED_EVIDENCE_IDS = [
  'gate-7-publish-readiness-inputs',
  'gate-7-artifact-release-manifest',
  'gate-7-publication-blockers',
  'gate-7-rollback-share-controls',
  'gate-7-final-verdict',
  'gate-7-coverage-matrices',
  'gate-7-failure-capture-fields',
] as const;

export const GATE_7_ALLOWED_FINAL_VERDICT_FIELDS = [
  'publishCandidateAllowed',
  'blockingReasons',
  'warningReasons',
  'requiredRealGateRunnerIds',
  'requiredGate5RealRunnerId',
  'evidenceIds',
  'repairSuggestions',
] as const;

export const GATE_7_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'publishCandidateGuardRunId',
  'upstreamGateIds',
  'skeletonOnlyGateIds',
  'missingRealEvidenceClasses',
  'artifactIds',
  'blockingReasons',
  'warningReasons',
  'publicShareTokenAction',
  'repairSuggestions',
  'durationMs',
] as const;

export function buildPublishCandidatePlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  gateResults: GeneratedAppGateResult[],
  executionLevel: GeneratedAppPublishCandidateExecutionLevel,
): GeneratedAppPublishCandidatePlan {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const upstreamGateIds = [...GATE_7_UPSTREAM_GATE_IDS];
  const upstreamEvidenceRefs = upstreamGateIds.map((gateId) => ({
    gateId,
    evidenceIds:
      gateResults
        .find((gate) => gate.gateId === gateId)
        ?.evidence.map((evidence) => evidence.id) ?? [],
  }));
  const upstreamGateGaps = upstreamGateIds.filter((gateId) => {
    const gate = gateResults.find((candidate) => candidate.gateId === gateId);

    return gate?.status !== 'passed' || gate.evidence.length === 0;
  });
  const upstreamEvidenceIds = upstreamEvidenceRefs.flatMap(
    (entry) => entry.evidenceIds,
  );
  const gate7EvidenceIds = [...GATE_7_EXPECTED_EVIDENCE_IDS];
  const skeletonOnlyUpstreamGateIds = resolveGate7SkeletonOnlyUpstreamGateIds(
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
  );
  const upstreamAllReal = skeletonOnlyUpstreamGateIds.length === 0;
  const upstreamPassedWithEvidence = upstreamGateGaps.length === 0;
  const publishCandidateAllowed =
    executionLevel === 'real-local-publish-candidate-contract' &&
    upstreamAllReal &&
    upstreamPassedWithEvidence;
  const gate6IsReal =
    independentVerificationPlan.executionLevel ===
    'real-local-independent-verifier';
  const skeletonOnlyGateLabel =
    skeletonOnlyUpstreamGateIds.length > 0
      ? skeletonOnlyUpstreamGateIds.join('、')
      : upstreamGateGaps.length > 0
        ? `${upstreamGateGaps.join('、')} 未通过或缺少 evidence`
        : 'Gate 7 publish-candidate guard';
  const skeletonOnlyBlockerGateIds =
    skeletonOnlyUpstreamGateIds.length > 0
      ? [...skeletonOnlyUpstreamGateIds]
      : upstreamGateGaps.length > 0
        ? [...upstreamGateGaps]
        : ['gate-7'];
  const releaseManifestBase: GeneratedAppPublishCandidatePlan['artifactReleaseManifest'] =
    [
      ...buildUnitPlan.artifactExpectations
        .filter((artifact) => artifact.kind === 'frontend_build')
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          kind: 'frontend_artifact' as const,
          sourceGateId: 'gate-3',
          sourcePlan: 'buildUnitPlan',
          path: artifact.path,
          required: artifact.required,
          placeholder: true,
          containsSecrets: false as const,
          evidenceIds: upstreamEvidenceRefs.find(
            (entry) => entry.gateId === 'gate-3',
          )?.evidenceIds ?? [...gate7EvidenceIds],
        })),
      ...buildUnitPlan.artifactExpectations
        .filter((artifact) => artifact.kind === 'plugin_bundle')
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          kind: 'plugin_bundle_artifact' as const,
          sourceGateId: 'gate-3',
          sourcePlan: 'buildUnitPlan',
          path: artifact.path,
          required: artifact.required,
          placeholder: true,
          containsSecrets: false as const,
          evidenceIds: upstreamEvidenceRefs.find(
            (entry) => entry.gateId === 'gate-3',
          )?.evidenceIds ?? [...gate7EvidenceIds],
        })),
      ...(buildUnitPlan.artifactExpectations.some(
        (artifact) => artifact.kind === 'plugin_bundle',
      )
        ? []
        : [
            {
              artifactId: 'no-plugin-bundle-artifacts-required',
              kind: 'plugin_bundle_artifact' as const,
              sourceGateId: 'gate-3',
              sourcePlan: 'buildUnitPlan',
              path: 'artifacts/gate-7/no-plugin-bundle-required.json',
              required: false,
              placeholder: true,
              containsSecrets: false as const,
              evidenceIds: [...gate7EvidenceIds],
            },
          ]),
      ...buildUnitPlan.artifactExpectations
        .filter((artifact) =>
          [
            'unit_test_report',
            'component_golden_report',
            'coverage_report',
          ].includes(artifact.kind),
        )
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          kind: 'test_report' as const,
          sourceGateId: 'gate-3',
          sourcePlan: 'buildUnitPlan',
          path: artifact.path,
          required: artifact.required,
          placeholder: true,
          containsSecrets: false as const,
          evidenceIds: upstreamEvidenceRefs.find(
            (entry) => entry.gateId === 'gate-3',
          )?.evidenceIds ?? [...gate7EvidenceIds],
        })),
      ...integrationPlan.traceArtifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        kind: 'integration_trace' as const,
        sourceGateId: 'gate-4',
        sourcePlan: 'integrationPlan',
        path: artifact.path,
        required: true,
        placeholder: true,
        containsSecrets: false as const,
        evidenceIds: upstreamEvidenceRefs.find(
          (entry) => entry.gateId === 'gate-4',
        )?.evidenceIds ?? [...gate7EvidenceIds],
      })),
      ...browserAcceptancePlan.artifactExpectations.map((artifact) => ({
        artifactId: artifact.artifactId,
        kind: 'browser_artifact' as const,
        sourceGateId: 'gate-5',
        sourcePlan: 'browserAcceptancePlan',
        path: artifact.path,
        required: artifact.required,
        placeholder: true,
        containsSecrets: false as const,
        evidenceIds: upstreamEvidenceRefs.find(
          (entry) => entry.gateId === 'gate-5',
        )?.evidenceIds ?? [...gate7EvidenceIds],
      })),
      {
        artifactId: 'independent-verifier-report-placeholder',
        kind: 'verifier_report',
        sourceGateId: 'gate-6',
        sourcePlan: 'independentVerificationPlan',
        path: 'artifacts/gate-6/independent-verifier-report.json',
        required: true,
        placeholder: true,
        containsSecrets: false,
        evidenceIds: upstreamEvidenceRefs.find(
          (entry) => entry.gateId === 'gate-6',
        )?.evidenceIds ?? [...gate7EvidenceIds],
      },
      {
        artifactId: 'source-artifact-placeholder',
        kind: 'source_artifact_placeholder',
        sourceGateId: 'gate-7',
        sourcePlan: 'publishCandidatePlan',
        path: 'artifacts/gate-7/source-artifact-placeholder.tar.zst',
        required: true,
        placeholder: true,
        containsSecrets: false,
        evidenceIds: [...upstreamEvidenceIds, ...gate7EvidenceIds],
      },
    ];
  const releaseManifest = releaseManifestBase.map((artifact) => ({
    ...artifact,
    checksum: {
      algorithm: 'sha256' as const,
      value: `sha256-placeholder:${artifact.artifactId}`,
      placeholder: true as const,
      materialized: false as const,
    },
    archiveMaterialized: false as const,
    signature: {
      status: 'not-signed' as const,
      signatureArtifactId: null,
      reason:
        'Gate 7 local contract runner does not create production signatures.',
    },
    signoffStatus: publishCandidateAllowed
      ? ('contract-accepted' as const)
      : executionLevel === 'fixture-publish-candidate-contract'
        ? ('fixture-only' as const)
        : ('not-executed' as const),
  }));
  const artifactIds = releaseManifest.map((artifact) => artifact.artifactId);
  const blockerIds = publishCandidateAllowed
    ? []
    : [
        'blocker-skeleton-only-upstream-gates',
        'blocker-missing-real-execution-artifacts',
        'blocker-missing-real-independent-verifier-verdict',
        'blocker-unresolved-warning-or-blocking-findings',
        'blocker-stale-public-token-requires-regeneration',
      ];
  const gate5NonSkeleton = isGate5NonSkeletonExecutionLevel(
    browserAcceptancePlan.executionLevel,
  );
  const gate5RealRunnerId = resolveGate5RequiredRealRunnerId(
    browserAcceptancePlan.executionLevel,
  );
  const missingExecutionArtifactGateIds = [
    ...(buildUnitPlan.executionLevel === 'real-local-command-plan'
      ? []
      : ['gate-3']),
    ...(integrationPlan.executionLevel === 'real-local-integration'
      ? []
      : ['gate-4']),
    ...(gate5NonSkeleton ? [] : ['gate-5']),
    ...(gate6IsReal ? [] : ['gate-6']),
    'gate-7',
  ];
  const missingExecutionArtifactMessage =
    gate6IsReal &&
    gate5NonSkeleton &&
    integrationPlan.executionLevel === 'real-local-integration'
      ? 'Gate 3、Gate 4、Gate 5 和 Gate 6 已提供受控本地 real-local evidence；剩余发布阻断来自 Gate 7 真实 publish candidate runner、release manifest、artifact signoff 与 public-share signoff 缺失。'
      : gate5NonSkeleton &&
          integrationPlan.executionLevel === 'real-local-integration'
        ? 'Gate 3、Gate 4 和 Gate 5 已提供受控本地 real-local contract evidence；剩余发布阻断来自 Gate 6 真实独立 verifier report/verdict 缺失。'
        : integrationPlan.executionLevel === 'real-local-integration'
          ? '缺少真实浏览器 artifact；Gate 4 已提供受控本地 integration trace，但 Gate 5 尚未执行真实 browser acceptance runner。'
          : '缺少真实集成 trace 和浏览器 artifact；Gate 3 只覆盖构建与单元层。';

  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    staticContractsVersion: staticContracts.contractVersion,
    buildUnitPlanVersion: buildUnitPlan.planVersion,
    integrationPlanVersion: integrationPlan.planVersion,
    browserAcceptancePlanVersion: browserAcceptancePlan.planVersion,
    independentVerificationPlanVersion: independentVerificationPlan.planVersion,
    executionLevel,
    skeletonDisclaimer: GATE_7_SKELETON_EVIDENCE_NOTE,
    publishReadinessInputs: {
      requiredGateIds: [...GATE_7_REQUIRED_GATE_IDS],
      upstreamGateIds,
      upstreamEvidenceRefs,
      readinessPreconditions: [...GATE_7_REQUIRED_READINESS_PRECONDITIONS],
      requiredNonSkeletonEvidenceClasses: [
        ...GATE_7_REQUIRED_NON_SKELETON_EVIDENCE_CLASSES,
      ],
    },
    artifactReleaseManifest: releaseManifest,
    publicationBlockers: publishCandidateAllowed
      ? []
      : [
          {
            blockerId: blockerIds[0] ?? 'blocker-skeleton-only-upstream-gates',
            category: 'skeleton_only_upstream_gate',
            gateIds: skeletonOnlyBlockerGateIds,
            evidenceIds: upstreamEvidenceIds,
            artifactIds,
            message:
              skeletonOnlyUpstreamGateIds.length > 0
                ? `${skeletonOnlyGateLabel} 当前仍只有 contract-level skeleton/fixture evidence，不能作为发布候选签收依据。`
                : 'Gate 3-6 已不再归入 skeleton-only upstream；Gate 7 当前执行器尚未允许形成 publish candidate。',
            blocking: true,
          },
          {
            blockerId:
              blockerIds[1] ?? 'blocker-missing-real-execution-artifacts',
            category: 'missing_real_execution_artifact',
            gateIds: missingExecutionArtifactGateIds,
            evidenceIds: upstreamEvidenceIds,
            artifactIds,
            message: missingExecutionArtifactMessage,
            blocking: true,
          },
          {
            blockerId:
              blockerIds[2] ??
              'blocker-missing-real-independent-verifier-verdict',
            category: 'missing_real_independent_verifier_verdict',
            gateIds: ['gate-6'],
            evidenceIds:
              upstreamEvidenceRefs.find((entry) => entry.gateId === 'gate-6')
                ?.evidenceIds ?? upstreamEvidenceIds,
            artifactIds: ['independent-verifier-report-placeholder'],
            message: gate6IsReal
              ? 'Gate 6 real-local independent verifier verdict 已生成，但尚未被真实 Gate 7 release manifest、artifact signoff 与 public-share signoff 签收。'
              : '缺少真实独立 verifier verdict，Gate 6 skeleton/fixture 不能替代真实审查结论。',
            blocking: true,
          },
          {
            blockerId:
              blockerIds[3] ??
              'blocker-unresolved-warning-or-blocking-findings',
            category: 'unresolved_warning_or_blocking_finding',
            gateIds: ['gate-6', 'gate-7'],
            evidenceIds: [...upstreamEvidenceIds, ...gate7EvidenceIds],
            artifactIds: ['independent-verifier-report-placeholder'],
            message:
              '当前没有真实 verifier 结论证明 warning 和 blocking findings 已清零。',
            blocking: true,
          },
          {
            blockerId:
              blockerIds[4] ??
              'blocker-stale-public-token-requires-regeneration',
            category: 'stale_public_token_requirement',
            gateIds: ['gate-7'],
            evidenceIds: gate7EvidenceIds,
            artifactIds: ['source-artifact-placeholder'],
            message:
              'Gate 7 失败时必须保持 public share token disabled/cleared，未来通过后也必须走既有 regenerate/enable 控制重新创建 token。',
            blocking: true,
          },
        ],
    rollbackShareControls: {
      publicTokenCreation: 'deferred-until-enable-public-share',
      publicShareEnabledWhileGuardFails: false,
      createdPublicShareToken: null,
      stalePublicTokenRequiredAction: 'clear-before-enable-public-share',
      closeShareControl: 'DELETE /generated-apps/:appId/public-share',
      enableShareControl: 'POST /generated-apps/:appId/public-share',
      regenerateShareControl:
        'POST /generated-apps/:appId/public-share/regenerate',
      existingPublicShareControlsReferenced: true,
      publicShareSignoff: 'deferred-until-enable-public-share',
      createsPublicShareToken: false,
    },
    finalVerdict: {
      publishCandidateAllowed,
      blockingReasons: publishCandidateAllowed
        ? []
        : [
            skeletonOnlyUpstreamGateIds.length > 0
              ? `${skeletonOnlyGateLabel} 当前只有 skeleton/contract-level completeness evidence。`
              : 'Gate 7 当前未形成真实 local publish candidate contract，缺少 release manifest contract 或 public-share deferred signoff。',
            gate6IsReal
              ? '缺少真实 release manifest、artifact 签收和 public-share signoff。'
              : gate5NonSkeleton
                ? '缺少真实 independent verifier artifact 签收。'
                : integrationPlan.executionLevel === 'real-local-integration'
                  ? '缺少真实 browser/verifier artifact 签收。'
                  : '缺少真实 integration/browser/verifier artifact 签收。',
            gate6IsReal
              ? 'Gate 6 real-local independent verifier verdict 尚未被真实 Gate 7 release manifest、artifact signoff 与 public-share signoff 签收。'
              : '缺少真实独立 verifier verdict，Gate 6 skeleton/fixture 不能替代真实审查结论。',
            'Gate 7 guard 失败期间 public share token 必须保持禁用并清空。',
          ],
      warningReasons: publishCandidateAllowed
        ? []
        : [
            '当前 plan 只保留 attempted publish candidate contract，不能对终端用户公开。',
          ],
      requiredRealGateRunnerIds: buildGate7RequiredRealGateRunnerIds(
        browserAcceptancePlan.executionLevel,
      ),
      requiredGate5RealRunnerId: gate5RealRunnerId,
      evidenceIds: [...upstreamEvidenceIds, ...gate7EvidenceIds],
      repairSuggestions: publishCandidateAllowed
        ? [
            '后续若要公开给终端用户，必须显式调用 enablePublicShare 走 readiness guard 创建新 token。',
            '生产级 artifact archive、真实签名和外部 verifier 可作为后续增强门禁补齐，不得由本地 contract runner 伪造。',
          ]
        : [
            gate6IsReal
              ? '保留 Gate 3-6 受控本地 real-local evidence，继续接入真实 Gate 7 publish candidate runner、release manifest、artifact signoff 和 public-share signoff。'
              : gate5NonSkeleton
                ? '保留 Gate 4 real-local integration 与 Gate 5 real-local browser-contract runner 证据，继续接入真实 Gate 6 independent verifier。'
                : integrationPlan.executionLevel === 'real-local-integration'
                  ? '保留 Gate 4 real-local integration runner 证据，继续接入真实 Gate 5 browser runner。'
                  : '接入真实 Gate 4 integration runner 并产出 API、Agent/Workflow、插件 sandbox trace。',
            gate5NonSkeleton
              ? 'Gate 5 已有受控本地 DOM/accessibility/network/console contract evidence；后续如需 Playwright 截图/视频/trace，可在独立增强门禁补充。'
              : '接入真实 Gate 5 browser runner 并产出截图、视频、trace、console 和 network 证据。',
            gate6IsReal
              ? '实现真实 Gate 7 发布候选检查，签收 release manifest、source artifact、test report 和 public-share signoff。'
              : '接入真实 Gate 6 independent verifier 并产出独立 verdict。',
            '只有真实 Gate 3-7 阻断证据通过后才允许重新创建公开分享 token。',
          ],
    },
    requirementCoverage: appSpec.coreRequirements.map((requirement) => ({
      requirementId: requirement.id,
      scenarioIds:
        appSpec.traceability.find(
          (entry) => entry.requirementId === requirement.id,
        )?.scenarioIds ?? [],
      gateIds: [...GATE_7_REQUIRED_GATE_IDS],
      evidenceIds: [...upstreamEvidenceIds, ...gate7EvidenceIds],
      artifactIds,
      blockerIds,
    })),
    gateCoverage: GATE_7_REQUIRED_GATE_IDS.map((gateId) => ({
      gateId,
      evidenceIds:
        gateId === 'gate-7'
          ? gate7EvidenceIds
          : (upstreamEvidenceRefs.find((entry) => entry.gateId === gateId)
              ?.evidenceIds ?? []),
      required: true,
      executionLevel: resolveGate7CoverageExecutionLevel(
        gateId,
        buildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        independentVerificationPlan,
        executionLevel,
      ),
      skeletonOnly:
        gateId === 'gate-7'
          ? executionLevel !== 'real-local-publish-candidate-contract'
          : skeletonOnlyUpstreamGateIds.includes(gateId),
      requiredRealGateRunnerId: resolveGate7RequiredRealRunnerId(
        gateId,
        browserAcceptancePlan.executionLevel,
      ),
    })),
    artifactCoverage: releaseManifest.map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      sourceGateId: artifact.sourceGateId,
      evidenceIds: artifact.evidenceIds,
      requirementIds,
      scenarioIds,
      required: artifact.required,
    })),
    failureCaptureFields: [
      ...GATE_7_REQUIRED_FAILURE_CAPTURE_FIELDS,
      'publishCandidatePlanPath',
    ],
  };
}

export function resolveGate7SkeletonOnlyUpstreamGateIds(
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
): string[] {
  return [
    ...(buildUnitPlan.executionLevel === 'real-local-command-plan'
      ? []
      : ['gate-3']),
    ...(integrationPlan.executionLevel === 'real-local-integration'
      ? []
      : ['gate-4']),
    ...(isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
      ? []
      : ['gate-5']),
    ...(independentVerificationPlan.executionLevel ===
    'real-local-independent-verifier'
      ? []
      : ['gate-6']),
  ];
}

export function resolveGate7CoverageExecutionLevel(
  gateId: string,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  gate7ExecutionLevel: GeneratedAppPublishCandidateExecutionLevel,
): string {
  const executionLevels: Record<string, string> = {
    'gate-0': 'app-spec-deterministic-completeness',
    'gate-1': 'architecture-plan-deterministic-completeness',
    'gate-2': 'static-contracts-deterministic-completeness',
    'gate-3': buildUnitPlan.executionLevel,
    'gate-4': integrationPlan.executionLevel,
    'gate-5': browserAcceptancePlan.executionLevel,
    'gate-6': independentVerificationPlan.executionLevel,
    'gate-7': gate7ExecutionLevel,
  };

  return executionLevels[gateId] ?? 'unknown';
}

export function resolveGate7RequiredRealRunnerId(
  gateId: string,
  browserAcceptanceExecutionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
): string {
  const realRunnerIds: Record<string, string> = {
    'gate-3': 'gate-3-real-build-unit-runner',
    'gate-4': 'gate-4-real-integration-runner',
    'gate-5': resolveGate5RequiredRealRunnerId(browserAcceptanceExecutionLevel),
    'gate-6': 'gate-6-real-independent-verifier-runner',
    'gate-7': 'gate-7-real-publish-candidate-runner',
  };

  return realRunnerIds[gateId] ?? 'not-required-for-current-deterministic-gate';
}

export function isGate5NonSkeletonExecutionLevel(
  executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
): boolean {
  return (
    executionLevel === 'real-local-browser-contract' ||
    executionLevel === 'real-browser-e2e'
  );
}

export function resolveGate5RequiredRealRunnerId(
  executionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
): string {
  return executionLevel === 'real-browser-e2e'
    ? 'gate-5-real-browser-e2e-runner'
    : 'gate-5-real-browser-acceptance-runner';
}

export function evaluateGate7PublishCandidatePlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  gateResults: GeneratedAppGateResult[],
  publishCandidatePlan: unknown,
): Gate7Evaluation {
  const checks = buildGate7Checks(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
    gateResults,
    publishCandidatePlan,
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-7-${check.id}`,
    label: check.label,
    kind: 'manual' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? `${check.summary} ${GATE_7_SKELETON_EVIDENCE_NOTE}`
        : `${check.summary} 缺口：${check.issues.join(
            '；',
          )} ${GATE_7_SKELETON_EVIDENCE_NOTE}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'publish-candidate-plan-incomplete',
      message: `PublishCandidatePlan publish-candidate guard skeleton 检查失败：${failedChecks
        .map((check) => check.label)
        .join(
          '、',
        )}；本失败只来自 publish-candidate-guard-skeleton 合约完整性检查，不代表真实发布候选已生成、真实 artifact 已签收、真实质量门禁全量通过或可以公开分享。`,
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
        'Gate 7 失败：publishCandidatePlan 未完整覆盖发布 readiness 输入、artifact release manifest、publication blockers、rollback/share controls、final verdict、覆盖矩阵或失败捕获字段；本结果仅表示 publish-candidate guard skeleton 检查失败，不代表真实发布候选已生成、真实 artifact 已签收、真实质量门禁全量通过或可以公开分享。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.publishCandidatePlan，使其绑定 AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan/independentVerificationPlan 版本，覆盖 Gate 0-7 readiness 输入、Gate 0-6 evidence ids、真实非 skeleton 证据要求、artifact release manifest、publication blockers、public share 禁用控制、final verdict 和覆盖矩阵；当前 Gate 7 仍只检查 publish-candidate-guard-skeleton，不能启用公开分享。',
    };
  }

  const plan = publishCandidatePlan as GeneratedAppPublishCandidatePlan;
  if (plan.finalVerdict.publishCandidateAllowed === true) {
    return {
      status: 'passed',
      summary:
        'Gate 7 publishCandidatePlan 合约完整：release manifest、artifact checksum placeholders、Gate 0-6 evidence citations、rollback/public-share deferred controls 和 publishCandidateAllowed=true verdict 可交给 Gate 7 runner 执行。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  const blockingReasons = plan.finalVerdict.blockingReasons.join('；');
  const skeletonOnlyUpstreamGateIds = resolveGate7SkeletonOnlyUpstreamGateIds(
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
  );
  const gate7FailureIntro = buildGate7FailureIntro(
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
  );
  const failure: GeneratedAppGateRunFailure = {
    code: 'publish-candidate-guard-blocked',
    message: `${gate7FailureIntro} 阻断原因：${blockingReasons}`,
    details: {
      blockers: plan.publicationBlockers,
      finalVerdict: plan.finalVerdict,
      skeletonOnlyUpstreamGateIds,
    },
  };

  return {
    status: 'failed',
    summary: buildGate7FailureSummary(
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
    ),
    evidence,
    failure,
    repairInstructions: buildGate7RepairInstructions(
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
      independentVerificationPlan,
    ),
  };
}

export function buildGate7FailureIntro(
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
): string {
  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel) &&
    independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
  ) {
    return 'Gate 7 publish-candidate guard skeleton 检测到 Gate 3-6 已有受控本地 real-local evidence，但 Gate 7 仍缺少真实 publish candidate runner、release manifest、artifact signoff 与 public-share signoff，不能形成 publish candidate。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
  ) {
    return 'Gate 7 publish-candidate guard skeleton 检测到 Gate 6 仍为 skeleton-only upstream evidence，且缺少真实 independent verifier evidence，不能形成 publish candidate。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration'
  ) {
    return 'Gate 7 publish-candidate guard skeleton 检测到 Gate 5-6 仍为 skeleton-only upstream evidence，且缺少后续真实 browser/verifier 证据，不能形成 publish candidate。';
  }

  if (buildUnitPlan.executionLevel === 'real-local-command-plan') {
    return GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON;
  }

  return 'Gate 7 publish-candidate guard skeleton 检测到 Gate 3 仍不是真实本地命令执行证据，且 Gate 4-6 仍为 skeleton-only upstream evidence，不能形成 publish candidate。';
}

export function buildGate7FailureSummary(
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
): string {
  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel) &&
    independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
  ) {
    return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 构建与单元层、Gate 4 受控本地 integration 层、Gate 5 受控本地 browser-contract 层和 Gate 6 受控本地 independent verifier 层已记录 real-local evidence，但 Gate 7 仍缺少真实 release manifest、artifact signoff、public-share signoff 和 publish candidate guard，不能形成 publish candidate 或启用公开分享。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
  ) {
    return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 构建与单元层、Gate 4 受控本地 integration 层、Gate 5 受控本地 browser-contract 层已按当前执行器记录 real-local contract evidence，但 Gate 6 仍只有 independent-verifier-skeleton evidence，缺少真实 independent verifier verdict，不能形成 publish candidate 或启用公开分享。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration'
  ) {
    return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 构建与单元层、Gate 4 受控本地 integration 层已按当前执行器记录 real-local contract evidence，但 Gate 5-6 仍只有 skeleton/contract-level completeness evidence，缺少真实 browser/verifier 证据，不能形成 publish candidate 或启用公开分享。';
  }

  if (buildUnitPlan.executionLevel === 'real-local-command-plan') {
    return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 构建与单元层已按当前执行器记录 evidence，但 Gate 4-6 仍只有 skeleton/fixture/contract-level completeness evidence，缺少真实 integration/browser/verifier 证据，不能形成 publish candidate 或启用公开分享。';
  }

  return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 仍不是真实本地命令执行证据，Gate 4-6 仍只有 skeleton/fixture/contract-level completeness evidence，不能形成 publish candidate 或启用公开分享。';
}

export function buildGate7CompletedRunSummary(
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
): string {
  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel) &&
    independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
  ) {
    return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner、Gate 5 受控本地 browser-contract runner 和 Gate 6 受控本地 independent verifier runner；Gate 7 publish-candidate guard 仍缺少真实 release manifest、artifact signoff 与 public-share signoff，当前应用不能形成 publish candidate，保持不可发布。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
  ) {
    return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner、Gate 5 受控本地 browser-contract runner；Gate 6 independent verifier 仍为 skeleton 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
  }

  if (integrationPlan.executionLevel === 'real-local-integration') {
    return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner；Gate 5 browser acceptance 和 Gate 6 independent verifier 仍为 skeleton/fixture 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实浏览器/独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
  }

  return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器；Gate 4 integration、Gate 5 browser acceptance 和 Gate 6 independent verifier 仍为 skeleton/fixture 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实集成/浏览器/独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
}

export function buildGate7RepairInstructions(
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
): string {
  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel) &&
    independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
  ) {
    return '接入真实 Gate 7 publish candidate runner、release manifest、artifact signoff 和 public-share signoff 后，再重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
  ) {
    return '接入真实 Gate 6 independent verifier runner、真实 verifier report 和独立 verdict 后，再由 Gate 7 重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
  }

  if (
    buildUnitPlan.executionLevel === 'real-local-command-plan' &&
    integrationPlan.executionLevel === 'real-local-integration'
  ) {
    return '接入真实 Gate 5-6 browser/verifier 执行 runner、真实 browser artifact 签收和真实独立 verifier verdict 后，再由 Gate 7 重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
  }

  if (buildUnitPlan.executionLevel === 'real-local-command-plan') {
    return '接入真实 Gate 4-6 执行 runner、真实 artifact 签收和真实独立 verifier verdict 后，再由 Gate 7 重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
  }

  return '接入真实 Gate 3-6 执行 runner、真实 artifact 签收和真实独立 verifier verdict 后，再由 Gate 7 重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
}

export function buildGate7Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: GeneratedAppBuildUnitPlan,
  integrationPlan: GeneratedAppIntegrationPlan,
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  gateResults: GeneratedAppGateResult[],
  publishCandidatePlan: unknown,
): Gate7Check[] {
  if (!isRecord(publishCandidatePlan)) {
    return [
      {
        id: 'publish-candidate-plan-object',
        label: 'PublishCandidatePlan JSON 对象',
        passed: false,
        summary:
          '检查 generationPlan.publishCandidatePlan 是否为结构化 JSON 对象。',
        issues: ['publishCandidatePlan 不是对象'],
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
  const requiredGateIds = [...GATE_7_REQUIRED_GATE_IDS];
  const upstreamGateIds = [...GATE_7_UPSTREAM_GATE_IDS];
  const knownGateIds = new Set<string>(requiredGateIds);
  const upstreamGateIdSet = new Set<string>(upstreamGateIds);
  const gateEvidenceIdsByGateId = new Map<string, string[]>(
    upstreamGateIds.map((gateId) => [
      gateId,
      gateResults
        .find((gate) => gate.gateId === gateId)
        ?.evidence.map((evidence) => evidence.id) ?? [],
    ]),
  );
  const upstreamEvidenceEntries = [
    ...gateEvidenceIdsByGateId.entries(),
  ].flatMap(([gateId, evidenceIds]) =>
    evidenceIds.map((evidenceId) => ({ gateId, evidenceId })),
  );
  const upstreamEvidenceIds = upstreamEvidenceEntries.map(
    (entry) => entry.evidenceId,
  );
  const knownEvidenceIds = new Set<string>([
    ...upstreamEvidenceIds,
    ...GATE_7_EXPECTED_EVIDENCE_IDS,
  ]);
  const publishReadinessInputs = getRecord(
    publishCandidatePlan.publishReadinessInputs,
  );
  const artifactReleaseManifest = getRecordArray(
    publishCandidatePlan.artifactReleaseManifest,
  );
  const publicationBlockers = getRecordArray(
    publishCandidatePlan.publicationBlockers,
  );
  const rollbackShareControls = getRecord(
    publishCandidatePlan.rollbackShareControls,
  );
  const finalVerdict = getRecord(publishCandidatePlan.finalVerdict);
  const requirementCoverage = getRecordArray(
    publishCandidatePlan.requirementCoverage,
  );
  const gateCoverage = getRecordArray(publishCandidatePlan.gateCoverage);
  const artifactCoverage = getRecordArray(
    publishCandidatePlan.artifactCoverage,
  );
  const artifactIds = artifactReleaseManifest
    .map((artifact) => getNonEmptyString(artifact.artifactId))
    .filter((artifactId): artifactId is string => artifactId !== null);
  const knownArtifactIds = new Set(artifactIds);
  const blockerIds = publicationBlockers
    .map((blocker) => getNonEmptyString(blocker.blockerId))
    .filter((blockerId): blockerId is string => blockerId !== null);
  const knownBlockerIds = new Set(blockerIds);
  const allowedArtifactKinds = new Set<string>([
    ...GATE_7_ALLOWED_ARTIFACT_KINDS,
  ]);
  const requiredArtifactKinds = [...GATE_7_REQUIRED_ARTIFACT_KINDS];
  const artifactKinds = artifactReleaseManifest
    .map((artifact) => getNonEmptyString(artifact.kind))
    .filter((kind): kind is string => kind !== null);
  const blockerCategories = publicationBlockers
    .map((blocker) => getNonEmptyString(blocker.category))
    .filter((category): category is string => category !== null);
  const allowedBlockerCategories = new Set<string>([
    ...GATE_7_REQUIRED_BLOCKER_CATEGORIES,
  ]);
  const finalVerdictRequiredRealGateRunnerIds = getStringArray(
    finalVerdict?.requiredRealGateRunnerIds,
  );
  const publishCandidateAllowed =
    finalVerdict?.publishCandidateAllowed === true;
  const publishCandidatePlanExecutionLevel = getNonEmptyString(
    publishCandidatePlan.executionLevel,
  );
  const expectedArtifactSignoffStatus = publishCandidateAllowed
    ? 'contract-accepted'
    : publishCandidatePlanExecutionLevel ===
        'fixture-publish-candidate-contract'
      ? 'fixture-only'
      : 'not-executed';
  const expectedRequiredRealGateRunnerIds = buildGate7RequiredRealGateRunnerIds(
    browserAcceptancePlan.executionLevel,
  );
  const allowedFinalVerdictRealGateRunnerIds = new Set<string>([
    ...GATE_7_ALLOWED_REAL_GATE_RUNNER_IDS,
  ]);
  const allowedGateCoverageRealGateRunnerIds = new Set<string>([
    ...GATE_7_ALLOWED_REAL_GATE_RUNNER_IDS,
    'not-required-for-current-deterministic-gate',
  ]);
  const finalVerdictBlockingReasons = getStringArray(
    finalVerdict?.blockingReasons,
  );
  const requiredBlockingReasonFragments =
    independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier' &&
    isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel) &&
    integrationPlan.executionLevel === 'real-local-integration'
      ? ['Gate 7', 'release manifest', 'artifact 签收', 'public-share signoff']
      : isGate5NonSkeletonExecutionLevel(browserAcceptancePlan.executionLevel)
        ? [
            'skeleton/contract-level',
            '真实 independent verifier artifact',
            '真实独立 verifier verdict',
          ]
        : integrationPlan.executionLevel === 'real-local-integration'
          ? [
              'skeleton/contract-level',
              '真实 browser/verifier artifact',
              '真实独立 verifier verdict',
            ]
          : [...GATE_7_REQUIRED_BLOCKING_REASON_FRAGMENTS];

  const versionAndInputIssues = [
    ...(publishCandidatePlan.planVersion === 1 ? [] : ['planVersion 必须为 1']),
    ...(publishCandidatePlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            publishCandidatePlan.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(publishCandidatePlan.generationPlanVersion ===
    generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            publishCandidatePlan.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
    ...(publishCandidatePlan.staticContractsVersion ===
    staticContracts.contractVersion
      ? []
      : [
          `staticContractsVersion=${String(
            publishCandidatePlan.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...(publishCandidatePlan.buildUnitPlanVersion === buildUnitPlan.planVersion
      ? []
      : [
          `buildUnitPlanVersion=${String(
            publishCandidatePlan.buildUnitPlanVersion,
          )} 与 buildUnitPlan.planVersion=${buildUnitPlan.planVersion} 不一致`,
        ]),
    ...(publishCandidatePlan.integrationPlanVersion ===
    integrationPlan.planVersion
      ? []
      : [
          `integrationPlanVersion=${String(
            publishCandidatePlan.integrationPlanVersion,
          )} 与 integrationPlan.planVersion=${integrationPlan.planVersion} 不一致`,
        ]),
    ...(publishCandidatePlan.browserAcceptancePlanVersion ===
    browserAcceptancePlan.planVersion
      ? []
      : [
          `browserAcceptancePlanVersion=${String(
            publishCandidatePlan.browserAcceptancePlanVersion,
          )} 与 browserAcceptancePlan.planVersion=${browserAcceptancePlan.planVersion} 不一致`,
        ]),
    ...(publishCandidatePlan.independentVerificationPlanVersion ===
    independentVerificationPlan.planVersion
      ? []
      : [
          `independentVerificationPlanVersion=${String(
            publishCandidatePlan.independentVerificationPlanVersion,
          )} 与 independentVerificationPlan.planVersion=${independentVerificationPlan.planVersion} 不一致`,
        ]),
    ...(getStringArray([publishCandidatePlan.executionLevel]).some((level) =>
      new Set<string>([...GATE_7_ALLOWED_EXECUTION_LEVELS]).has(level),
    )
      ? []
      : [
          `executionLevel 必须是 ${GATE_7_ALLOWED_EXECUTION_LEVELS.join(
            ' | ',
          )}`,
        ]),
    ...(!getNonEmptyString(publishCandidatePlan.skeletonDisclaimer)
      ? ['skeletonDisclaimer 缺失']
      : []),
    ...collectSensitiveTokenIssues(
      publishCandidatePlan,
      'publishCandidatePlan',
    ),
    ...requireRecord(publishReadinessInputs, 'publishReadinessInputs'),
    ...(getStringArray(publishReadinessInputs?.requiredGateIds).length === 0
      ? ['publishReadinessInputs.requiredGateIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publishReadinessInputs.requiredGateIds',
      getStringArray(publishReadinessInputs?.requiredGateIds),
      requiredGateIds,
    ),
    ...buildUnknownReferenceIssues(
      'publishReadinessInputs.requiredGateIds',
      getStringArray(publishReadinessInputs?.requiredGateIds),
      knownGateIds,
    ),
    ...buildDuplicateItemIssues(
      'publishReadinessInputs.requiredGateIds',
      getStringArray(publishReadinessInputs?.requiredGateIds),
    ),
    ...(getStringArray(publishReadinessInputs?.upstreamGateIds).length === 0
      ? ['publishReadinessInputs.upstreamGateIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publishReadinessInputs.upstreamGateIds',
      getStringArray(publishReadinessInputs?.upstreamGateIds),
      upstreamGateIds,
    ),
    ...buildUnknownReferenceIssues(
      'publishReadinessInputs.upstreamGateIds',
      getStringArray(publishReadinessInputs?.upstreamGateIds),
      upstreamGateIdSet,
    ),
    ...(getRecordArray(publishReadinessInputs?.upstreamEvidenceRefs).length ===
    0
      ? ['publishReadinessInputs.upstreamEvidenceRefs 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publishReadinessInputs.upstreamEvidenceRefs.gateId',
      getRecordArray(publishReadinessInputs?.upstreamEvidenceRefs)
        .map((entry) => getNonEmptyString(entry.gateId))
        .filter((gateId): gateId is string => gateId !== null),
      upstreamGateIds,
    ),
    ...getRecordArray(publishReadinessInputs?.upstreamEvidenceRefs).flatMap(
      (entry, index) => {
        const gateId = getNonEmptyString(entry.gateId);
        const evidenceIds = getStringArray(entry.evidenceIds);
        const expectedEvidenceIds =
          gateId === null ? [] : (gateEvidenceIdsByGateId.get(gateId) ?? []);

        return [
          ...(!gateId
            ? [
                `publishReadinessInputs.upstreamEvidenceRefs[${index}].gateId 缺失`,
              ]
            : []),
          ...(gateId && !upstreamGateIdSet.has(gateId)
            ? [
                `publishReadinessInputs.upstreamEvidenceRefs[${index}].gateId 引用了未知 gate ${formatIssueValue(
                  gateId,
                )}`,
              ]
            : []),
          ...(evidenceIds.length === 0
            ? [
                `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds 不能为空`,
              ]
            : []),
          ...buildUnknownReferenceIssues(
            `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds`,
            evidenceIds,
            knownEvidenceIds,
          ),
          ...buildMissingItemsIssues(
            `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds`,
            evidenceIds,
            expectedEvidenceIds,
          ),
        ];
      },
    ),
    ...upstreamGateIds.flatMap((gateId) =>
      gateResults.find((gate) => gate.gateId === gateId)?.status === 'passed'
        ? []
        : [`Gate 7 前置 ${gateId} 必须为 passed`],
    ),
    ...(getStringArray(publishReadinessInputs?.readinessPreconditions)
      .length === 0
      ? ['publishReadinessInputs.readinessPreconditions 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publishReadinessInputs.readinessPreconditions',
      getStringArray(publishReadinessInputs?.readinessPreconditions),
      [...GATE_7_REQUIRED_READINESS_PRECONDITIONS],
    ),
    ...(getStringArray(
      publishReadinessInputs?.requiredNonSkeletonEvidenceClasses,
    ).length === 0
      ? ['publishReadinessInputs.requiredNonSkeletonEvidenceClasses 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'publishReadinessInputs.requiredNonSkeletonEvidenceClasses',
      getStringArray(
        publishReadinessInputs?.requiredNonSkeletonEvidenceClasses,
      ),
      [...GATE_7_REQUIRED_NON_SKELETON_EVIDENCE_CLASSES],
    ),
  ];
  const artifactIssues = [
    ...(artifactReleaseManifest.length === 0
      ? ['artifactReleaseManifest 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'artifactReleaseManifest.kind',
      artifactKinds,
      requiredArtifactKinds,
    ),
    ...buildDuplicateItemIssues(
      'artifactReleaseManifest.artifactId',
      artifactIds,
    ),
    ...artifactReleaseManifest.flatMap((artifact, index) => {
      const artifactId = getNonEmptyString(artifact.artifactId);
      const kind = getNonEmptyString(artifact.kind);
      const sourceGateId = getNonEmptyString(artifact.sourceGateId);
      const path = getNonEmptyString(artifact.path);
      const checksum = getRecord(artifact.checksum);
      const signature = getRecord(artifact.signature);

      return [
        ...(!artifactId
          ? [`artifactReleaseManifest[${index}].artifactId 缺失`]
          : []),
        ...(!kind ? [`artifactReleaseManifest[${index}].kind 缺失`] : []),
        ...(kind && !allowedArtifactKinds.has(kind)
          ? [
              `artifactReleaseManifest[${index}].kind 是非法 artifact kind ${formatIssueValue(
                kind,
              )}`,
            ]
          : []),
        ...(!sourceGateId
          ? [`artifactReleaseManifest[${index}].sourceGateId 缺失`]
          : []),
        ...(sourceGateId && !knownGateIds.has(sourceGateId)
          ? [
              `artifactReleaseManifest[${index}].sourceGateId 引用了未知 gate ${formatIssueValue(
                sourceGateId,
              )}`,
            ]
          : []),
        ...(!getNonEmptyString(artifact.sourcePlan)
          ? [`artifactReleaseManifest[${index}].sourcePlan 缺失`]
          : []),
        ...(!path ? [`artifactReleaseManifest[${index}].path 缺失`] : []),
        ...buildSafeRelativePathIssues(
          `artifactReleaseManifest[${index}].path`,
          path,
        ),
        ...(typeof artifact.required === 'boolean'
          ? []
          : [`artifactReleaseManifest[${index}].required 必须是 boolean`]),
        ...(artifact.placeholder === true
          ? []
          : [`artifactReleaseManifest[${index}].placeholder 必须为 true`]),
        ...(artifact.containsSecrets === false
          ? []
          : [`artifactReleaseManifest[${index}].containsSecrets 必须为 false`]),
        ...requireRecord(
          checksum,
          `artifactReleaseManifest[${index}].checksum`,
        ),
        ...(checksum?.algorithm === 'sha256'
          ? []
          : [
              `artifactReleaseManifest[${index}].checksum.algorithm 必须为 sha256`,
            ]),
        ...(getNonEmptyString(checksum?.value)?.startsWith(
          'sha256-placeholder:',
        )
          ? []
          : [
              `artifactReleaseManifest[${index}].checksum.value 必须为 sha256-placeholder 占位值`,
            ]),
        ...(checksum?.placeholder === true
          ? []
          : [
              `artifactReleaseManifest[${index}].checksum.placeholder 必须为 true`,
            ]),
        ...(checksum?.materialized === false
          ? []
          : [
              `artifactReleaseManifest[${index}].checksum.materialized 必须为 false`,
            ]),
        ...(artifact.archiveMaterialized === false
          ? []
          : [
              `artifactReleaseManifest[${index}].archiveMaterialized 必须为 false`,
            ]),
        ...requireRecord(
          signature,
          `artifactReleaseManifest[${index}].signature`,
        ),
        ...(signature?.status === 'not-signed'
          ? []
          : [
              `artifactReleaseManifest[${index}].signature.status 必须为 not-signed`,
            ]),
        ...(signature?.signatureArtifactId === null
          ? []
          : [
              `artifactReleaseManifest[${index}].signature.signatureArtifactId 必须为 null`,
            ]),
        ...(artifact.signoffStatus === expectedArtifactSignoffStatus
          ? []
          : [
              `artifactReleaseManifest[${index}].signoffStatus 必须为 ${expectedArtifactSignoffStatus}`,
            ]),
        ...(getStringArray(artifact.evidenceIds).length === 0
          ? [`artifactReleaseManifest[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `artifactReleaseManifest[${index}].evidenceIds`,
          getStringArray(artifact.evidenceIds),
          knownEvidenceIds,
        ),
      ];
    }),
  ];
  const blockerIssues = [
    ...(publishCandidateAllowed && publicationBlockers.length > 0
      ? ['publicationBlockers 通过时必须为空']
      : []),
    ...(!publishCandidateAllowed && publicationBlockers.length === 0
      ? ['publicationBlockers 不能为空']
      : []),
    ...(publishCandidateAllowed
      ? []
      : buildMissingItemsIssues(
          'publicationBlockers.category',
          blockerCategories,
          [...GATE_7_REQUIRED_BLOCKER_CATEGORIES],
        )),
    ...buildDuplicateItemIssues('publicationBlockers.blockerId', blockerIds),
    ...publicationBlockers.flatMap((blocker, index) => {
      const blockerId = getNonEmptyString(blocker.blockerId);
      const category = getNonEmptyString(blocker.category);

      return [
        ...(!blockerId ? [`publicationBlockers[${index}].blockerId 缺失`] : []),
        ...(!category ? [`publicationBlockers[${index}].category 缺失`] : []),
        ...(category && !allowedBlockerCategories.has(category)
          ? [
              `publicationBlockers[${index}].category 是非法 blocker category ${formatIssueValue(
                category,
              )}`,
            ]
          : []),
        ...(blocker.blocking === true
          ? []
          : [`publicationBlockers[${index}].blocking 必须为 true`]),
        ...(!getNonEmptyString(blocker.message)
          ? [`publicationBlockers[${index}].message 缺失`]
          : []),
        ...(getStringArray(blocker.gateIds).length === 0
          ? [`publicationBlockers[${index}].gateIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `publicationBlockers[${index}].gateIds`,
          getStringArray(blocker.gateIds),
          knownGateIds,
        ),
        ...(getStringArray(blocker.evidenceIds).length === 0
          ? [`publicationBlockers[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `publicationBlockers[${index}].evidenceIds`,
          getStringArray(blocker.evidenceIds),
          knownEvidenceIds,
        ),
        ...(getStringArray(blocker.artifactIds).length === 0
          ? [`publicationBlockers[${index}].artifactIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `publicationBlockers[${index}].artifactIds`,
          getStringArray(blocker.artifactIds),
          knownArtifactIds,
        ),
      ];
    }),
  ];
  const rollbackIssues = [
    ...requireRecord(rollbackShareControls, 'rollbackShareControls'),
    ...(rollbackShareControls?.publicTokenCreation ===
    'deferred-until-enable-public-share'
      ? []
      : [
          'rollbackShareControls.publicTokenCreation 必须为 deferred-until-enable-public-share',
        ]),
    ...(rollbackShareControls?.publicShareEnabledWhileGuardFails === false
      ? []
      : [
          'rollbackShareControls.publicShareEnabledWhileGuardFails 必须为 false',
        ]),
    ...(rollbackShareControls?.createdPublicShareToken === null
      ? []
      : ['rollbackShareControls.createdPublicShareToken 必须为 null']),
    ...(rollbackShareControls?.stalePublicTokenRequiredAction ===
    'clear-before-enable-public-share'
      ? []
      : [
          'rollbackShareControls.stalePublicTokenRequiredAction 必须为 clear-before-enable-public-share',
        ]),
    ...(rollbackShareControls?.closeShareControl ===
    'DELETE /generated-apps/:appId/public-share'
      ? []
      : ['rollbackShareControls.closeShareControl 必须引用关闭公开分享接口']),
    ...(rollbackShareControls?.enableShareControl ===
    'POST /generated-apps/:appId/public-share'
      ? []
      : ['rollbackShareControls.enableShareControl 必须引用启用公开分享接口']),
    ...(rollbackShareControls?.regenerateShareControl ===
    'POST /generated-apps/:appId/public-share/regenerate'
      ? []
      : [
          'rollbackShareControls.regenerateShareControl 必须引用重新生成公开分享接口',
        ]),
    ...(rollbackShareControls?.existingPublicShareControlsReferenced === true
      ? []
      : [
          'rollbackShareControls.existingPublicShareControlsReferenced 必须为 true',
        ]),
    ...(rollbackShareControls?.publicShareSignoff ===
    'deferred-until-enable-public-share'
      ? []
      : [
          'rollbackShareControls.publicShareSignoff 必须为 deferred-until-enable-public-share',
        ]),
    ...(rollbackShareControls?.createsPublicShareToken === false
      ? []
      : ['rollbackShareControls.createsPublicShareToken 必须为 false']),
  ];
  const verdictFieldNames = finalVerdict ? Object.keys(finalVerdict) : [];
  const finalVerdictIssues = [
    ...requireRecord(finalVerdict, 'finalVerdict'),
    ...verdictFieldNames
      .filter(
        (field) =>
          !new Set<string>([...GATE_7_ALLOWED_FINAL_VERDICT_FIELDS]).has(field),
      )
      .map(
        (field) =>
          `finalVerdict 包含非法 verdict field ${formatIssueValue(field)}`,
      ),
    ...buildMissingItemsIssues('finalVerdict fields', verdictFieldNames, [
      ...GATE_7_ALLOWED_FINAL_VERDICT_FIELDS,
    ]),
    ...(typeof finalVerdict?.publishCandidateAllowed === 'boolean'
      ? []
      : ['finalVerdict.publishCandidateAllowed 必须是 boolean']),
    ...(!publishCandidateAllowed && finalVerdictBlockingReasons.length === 0
      ? ['finalVerdict.blockingReasons 不能为空']
      : []),
    ...(publishCandidateAllowed && finalVerdictBlockingReasons.length > 0
      ? ['finalVerdict.blockingReasons 通过时必须为空']
      : []),
    ...(publishCandidateAllowed
      ? []
      : requiredBlockingReasonFragments.flatMap((fragment) =>
          finalVerdictBlockingReasons.some((reason) =>
            reason.includes(fragment),
          )
            ? []
            : [`finalVerdict.blockingReasons 缺少 ${fragment} 阻断原因`],
        )),
    ...(Array.isArray(finalVerdict?.warningReasons)
      ? []
      : ['finalVerdict.warningReasons 必须是数组']),
    ...(finalVerdictRequiredRealGateRunnerIds.length === 0
      ? ['finalVerdict.requiredRealGateRunnerIds 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'finalVerdict.requiredRealGateRunnerIds',
      finalVerdictRequiredRealGateRunnerIds,
      expectedRequiredRealGateRunnerIds,
    ),
    ...buildUnknownReferenceIssues(
      'finalVerdict.requiredRealGateRunnerIds',
      finalVerdictRequiredRealGateRunnerIds,
      allowedFinalVerdictRealGateRunnerIds,
    ),
    ...finalVerdictRequiredRealGateRunnerIds
      .filter(
        (runnerId) => !expectedRequiredRealGateRunnerIds.includes(runnerId),
      )
      .map(
        (runnerId) =>
          `finalVerdict.requiredRealGateRunnerIds 不应包含当前 Gate 5 executionLevel 未要求的 runner ${formatIssueValue(
            runnerId,
          )}`,
      ),
    ...buildDuplicateItemIssues(
      'finalVerdict.requiredRealGateRunnerIds',
      finalVerdictRequiredRealGateRunnerIds,
    ),
    ...(finalVerdict?.requiredGate5RealRunnerId ===
    resolveGate5RequiredRealRunnerId(browserAcceptancePlan.executionLevel)
      ? []
      : [
          `finalVerdict.requiredGate5RealRunnerId 必须为 ${resolveGate5RequiredRealRunnerId(
            browserAcceptancePlan.executionLevel,
          )}`,
        ]),
    ...(getStringArray(finalVerdict?.evidenceIds).length === 0
      ? ['finalVerdict.evidenceIds 不能为空']
      : []),
    ...buildUnknownReferenceIssues(
      'finalVerdict.evidenceIds',
      getStringArray(finalVerdict?.evidenceIds),
      knownEvidenceIds,
    ),
    ...(getStringArray(finalVerdict?.repairSuggestions).length === 0
      ? ['finalVerdict.repairSuggestions 不能为空']
      : []),
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
  const artifactCoverageById = new Map(
    artifactCoverage
      .map((entry) => {
        const artifactId = getNonEmptyString(entry.artifactId);
        return artifactId ? ([artifactId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );
  const coverageIssues = [
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
        ...(getStringArray(entry.scenarioIds).length === 0
          ? [`requirementCoverage[${index}].scenarioIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...(getStringArray(entry.gateIds).length === 0
          ? [`requirementCoverage[${index}].gateIds 不能为空`]
          : []),
        ...buildMissingItemsIssues(
          `requirementCoverage[${index}].gateIds`,
          getStringArray(entry.gateIds),
          requiredGateIds,
        ),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].gateIds`,
          getStringArray(entry.gateIds),
          knownGateIds,
        ),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`requirementCoverage[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...(getStringArray(entry.artifactIds).length === 0
          ? [`requirementCoverage[${index}].artifactIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].artifactIds`,
          getStringArray(entry.artifactIds),
          knownArtifactIds,
        ),
        ...(!publishCandidateAllowed &&
        getStringArray(entry.blockerIds).length === 0
          ? [`requirementCoverage[${index}].blockerIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `requirementCoverage[${index}].blockerIds`,
          getStringArray(entry.blockerIds),
          knownBlockerIds,
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
        return [`需求 ${requirementId} 缺少 Gate 7 覆盖声明`];
      }

      return [
        ...buildMissingItemsIssues(
          `requirementCoverage[${requirementId}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          expectedScenarioIds,
        ),
      ];
    }),
    ...(gateCoverage.length === 0 ? ['gateCoverage 不能为空'] : []),
    ...gateCoverage.flatMap((entry, index) => {
      const gateId = getNonEmptyString(entry.gateId);
      const requiredRealGateRunnerId = getNonEmptyString(
        entry.requiredRealGateRunnerId,
      );
      const expectedRealGateRunnerId = gateId
        ? resolveGate7RequiredRealRunnerId(
            gateId,
            browserAcceptancePlan.executionLevel,
          )
        : null;

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
        ...(typeof entry.skeletonOnly === 'boolean'
          ? []
          : [`gateCoverage[${index}].skeletonOnly 必须是 boolean`]),
        ...(!getNonEmptyString(entry.executionLevel)
          ? [`gateCoverage[${index}].executionLevel 缺失`]
          : []),
        ...(!requiredRealGateRunnerId
          ? [`gateCoverage[${index}].requiredRealGateRunnerId 缺失`]
          : []),
        ...(requiredRealGateRunnerId &&
        !allowedGateCoverageRealGateRunnerIds.has(requiredRealGateRunnerId)
          ? [
              `gateCoverage[${index}].requiredRealGateRunnerId 引用了未知 real runner ${formatIssueValue(
                requiredRealGateRunnerId,
              )}`,
            ]
          : []),
        ...(gateId &&
        knownGateIds.has(gateId) &&
        requiredRealGateRunnerId &&
        expectedRealGateRunnerId &&
        requiredRealGateRunnerId !== expectedRealGateRunnerId
          ? [
              `gateCoverage[${index}].requiredRealGateRunnerId 必须为 ${expectedRealGateRunnerId}`,
            ]
          : []),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`gateCoverage[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `gateCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
      ];
    }),
    ...requiredGateIds.flatMap((gateId) =>
      gateCoverageById.has(gateId)
        ? []
        : [`gate ${gateId} 缺少 Gate 7 覆盖声明`],
    ),
    ...(artifactCoverage.length === 0 ? ['artifactCoverage 不能为空'] : []),
    ...artifactCoverage.flatMap((entry, index) => {
      const artifactId = getNonEmptyString(entry.artifactId);
      const kind = getNonEmptyString(entry.kind);
      const manifestArtifact = artifactId
        ? artifactReleaseManifest.find(
            (artifact) => getNonEmptyString(artifact.artifactId) === artifactId,
          )
        : undefined;

      return [
        ...(!artifactId ? [`artifactCoverage[${index}].artifactId 缺失`] : []),
        ...(artifactId && !knownArtifactIds.has(artifactId)
          ? [
              `artifactCoverage[${index}].artifactId 引用了未知 artifact ${formatIssueValue(
                artifactId,
              )}`,
            ]
          : []),
        ...(!kind ? [`artifactCoverage[${index}].kind 缺失`] : []),
        ...(kind && !allowedArtifactKinds.has(kind)
          ? [
              `artifactCoverage[${index}].kind 是非法 artifact kind ${formatIssueValue(
                kind,
              )}`,
            ]
          : []),
        ...(manifestArtifact &&
        kind &&
        getNonEmptyString(manifestArtifact.kind) !== kind
          ? [
              `artifactCoverage[${index}].kind 与 artifactReleaseManifest 不一致`,
            ]
          : []),
        ...buildUnknownReferenceIssues(
          `artifactCoverage[${index}].sourceGateId`,
          getStringArray([entry.sourceGateId]),
          knownGateIds,
        ),
        ...(getStringArray(entry.evidenceIds).length === 0
          ? [`artifactCoverage[${index}].evidenceIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `artifactCoverage[${index}].evidenceIds`,
          getStringArray(entry.evidenceIds),
          knownEvidenceIds,
        ),
        ...(getStringArray(entry.requirementIds).length === 0
          ? [`artifactCoverage[${index}].requirementIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `artifactCoverage[${index}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.scenarioIds).length === 0
          ? [`artifactCoverage[${index}].scenarioIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `artifactCoverage[${index}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...(typeof entry.required === 'boolean'
          ? []
          : [`artifactCoverage[${index}].required 必须是 boolean`]),
      ];
    }),
    ...artifactIds.flatMap((artifactId) =>
      artifactCoverageById.has(artifactId)
        ? []
        : [`artifact ${artifactId} 缺少 Gate 7 覆盖声明`],
    ),
  ];
  const failureCaptureIssues = [
    ...buildMissingItemsIssues(
      'failureCaptureFields',
      getStringArray(publishCandidatePlan.failureCaptureFields),
      [...GATE_7_REQUIRED_FAILURE_CAPTURE_FIELDS],
    ),
  ];

  return [
    {
      id: 'publish-readiness-inputs',
      label: 'publish readiness 输入',
      passed: versionAndInputIssues.length === 0,
      summary:
        '检查 publishCandidatePlan 版本绑定、Gate 0-7 readiness 输入、Gate 0-6 evidence ids、preconditions 和 required non-skeleton evidence classes。',
      issues: versionAndInputIssues,
    },
    {
      id: 'artifact-release-manifest',
      label: 'artifact release manifest',
      passed: artifactIssues.length === 0,
      summary:
        '检查 frontend artifact、plugin bundle artifacts、test reports、integration traces、browser artifacts、verifier report 和 source artifact placeholder，且不含真实 token/secret。',
      issues: artifactIssues,
    },
    {
      id: 'publication-blockers',
      label: 'publication blockers',
      passed: blockerIssues.length === 0,
      summary:
        '检查 skeleton-only upstream gates、缺失真实执行 artifact、缺失真实 verifier verdict、未解决 findings 和 stale public token requirement 阻断项。',
      issues: blockerIssues,
    },
    {
      id: 'rollback-share-controls',
      label: 'rollback/share controls',
      passed: rollbackIssues.length === 0,
      summary:
        '检查 Gate 7 guard 失败时 public token 创建保持禁用、token 不写入 plan，并引用现有关闭/重新生成公开分享控制。',
      issues: rollbackIssues,
    },
    {
      id: 'final-verdict',
      label: 'final verdict schema',
      passed: finalVerdictIssues.length === 0,
      summary:
        '检查 final verdict 是否显式 publishCandidateAllowed=false、列出 blocking/warning reasons、真实 runner 要求、evidence ids 和 repair suggestions。',
      issues: finalVerdictIssues,
    },
    {
      id: 'coverage-matrices',
      label: 'requirement/gate/artifact 覆盖',
      passed: coverageIssues.length === 0,
      summary:
        '检查 requirementCoverage、gateCoverage 和 artifactCoverage 是否拒绝 dangling requirement/gate/evidence/artifact/blocker references。',
      issues: coverageIssues,
    },
    {
      id: 'failure-capture-fields',
      label: '失败捕获字段',
      passed: failureCaptureIssues.length === 0,
      summary:
        '检查真实 Gate 7 runner 失败时必须捕获 guard run、上游门禁、缺失证据、artifact、public share 动作和修复建议字段。',
      issues: failureCaptureIssues,
    },
  ];
}

export function buildGate7RequiredRealGateRunnerIds(
  browserAcceptanceExecutionLevel: GeneratedAppBrowserAcceptanceExecutionLevel,
): string[] {
  return [
    'gate-3-real-build-unit-runner',
    'gate-4-real-integration-runner',
    resolveGate5RequiredRealRunnerId(browserAcceptanceExecutionLevel),
    'gate-6-real-independent-verifier-runner',
    'gate-7-real-publish-candidate-runner',
  ];
}

export function applyPublishCandidateEvidenceGuard(
  gateResults: GeneratedAppGateResult[],
  generationPlan: GeneratedApp['generationPlan'] | undefined,
): GeneratedAppGateResult[] {
  const readiness = evaluateGeneratedAppReadiness(gateResults);

  if (readiness.state !== 'publish_candidate') {
    return gateResults;
  }

  const guardIssues = collectPublishCandidateEvidenceGuardIssues(
    gateResults,
    generationPlan,
  );

  if (guardIssues.length === 0) {
    return gateResults;
  }

  const nowIso = new Date().toISOString();

  return gateResults.map((gate) => {
    if (gate.gateId !== 'gate-7') {
      return gate;
    }

    return {
      ...gate,
      status: 'failed',
      summary:
        'Gate 7 失败：publish candidate evidence guard 拒绝了缺少可信 real-local Gate 7 签收的结果；fixture、disabled、skeleton、malformed 或仅手动声明的 evidence 不能放行 publish candidate。',
      evidence: [
        ...gate.evidence,
        {
          id: 'gate-7-publish-candidate-evidence-guard',
          label: 'Gate 7 publish candidate evidence guard',
          kind: 'manual',
          url: null,
          summary: `服务端在 readiness 同步前阻断 publish candidate：${guardIssues.join(
            '；',
          )}`,
          details: {
            issues: guardIssues,
            publicShareTokenCreated: false,
            createdPublicShareToken: null,
          },
        },
      ],
      updatedAt: nowIso,
    };
  });
}

export function collectPublishCandidateEvidenceGuardIssues(
  gateResults: GeneratedAppGateResult[],
  generationPlan: GeneratedApp['generationPlan'] | undefined,
): string[] {
  const gateResultsById = new Map(
    gateResults.map((gate) => [gate.gateId, gate]),
  );
  const plan = getRecord(generationPlan);
  const buildUnitPlan = getRecord(plan?.buildUnitPlan);
  const integrationPlan = getRecord(plan?.integrationPlan);
  const browserAcceptancePlan = getRecord(plan?.browserAcceptancePlan);
  const independentVerificationPlan = getRecord(
    plan?.independentVerificationPlan,
  );
  const publishCandidatePlan = getRecord(plan?.publishCandidatePlan);
  const finalVerdict = getRecord(publishCandidatePlan?.finalVerdict);
  const rollbackShareControls = getRecord(
    publishCandidatePlan?.rollbackShareControls,
  );
  const artifactReleaseManifest = getRecordArray(
    publishCandidatePlan?.artifactReleaseManifest,
  );
  const gate7 = gateResultsById.get('gate-7');
  const gate7EvidenceIds = new Set(
    gate7?.evidence.map((evidence) => evidence.id) ?? [],
  );
  const hasTrustedGate7RunnerEvidence =
    gate7?.evidence.some((evidence) => {
      const details = getRecord(evidence.details);

      return (
        details?.runnerId === 'gate-7-real-publish-candidate-runner' &&
        details.executionLevel === 'real-local-publish-candidate-contract' &&
        details.executed === true &&
        details.publicShareTokenCreated === false &&
        details.createdPublicShareToken === null
      );
    }) ?? false;
  const gate5ExecutionLevel = getNonEmptyString(
    browserAcceptancePlan?.executionLevel,
  );
  const gate5RequiredRunnerId =
    gate5ExecutionLevel === 'real-browser-e2e'
      ? 'gate-5-real-browser-e2e-runner'
      : 'gate-5-real-browser-acceptance-runner';
  const hasTrustedGate5RunnerEvidence =
    gateResultsById.get('gate-5')?.evidence.some((evidence) => {
      const details = getRecord(evidence.details);

      if (details?.runnerId !== gate5RequiredRunnerId) {
        return false;
      }

      if (gate5ExecutionLevel === 'real-browser-e2e') {
        return (
          details.executionLevel === 'real-browser-e2e' &&
          details.executed === true &&
          details.playwrightExecuted === true &&
          details.realBrowserExecuted === true
        );
      }

      return (
        details.executionLevel === 'real-local-browser-contract' &&
        details.executed === true &&
        details.playwrightExecuted === false &&
        details.realBrowserExecuted === false
      );
    }) ?? false;

  return [
    ...GATE_7_REQUIRED_GATE_IDS.flatMap((gateId) => {
      const gate = gateResultsById.get(gateId);

      return gate?.status === 'passed' ? [] : [`${gateId} 必须为 passed`];
    }),
    ...(buildUnitPlan?.executionLevel === 'real-local-command-plan'
      ? []
      : [
          'generationPlan.buildUnitPlan.executionLevel 必须为 real-local-command-plan',
        ]),
    ...(integrationPlan?.executionLevel === 'real-local-integration'
      ? []
      : [
          'generationPlan.integrationPlan.executionLevel 必须为 real-local-integration',
        ]),
    ...(browserAcceptancePlan?.executionLevel ===
      'real-local-browser-contract' ||
    browserAcceptancePlan?.executionLevel === 'real-browser-e2e'
      ? []
      : [
          'generationPlan.browserAcceptancePlan.executionLevel 必须为 real-local-browser-contract 或 real-browser-e2e',
        ]),
    ...(hasTrustedGate5RunnerEvidence
      ? []
      : [
          `Gate 5 run evidence 必须来自 ${gate5RequiredRunnerId}；real-browser-e2e 必须证明 executed=true、playwrightExecuted=true、realBrowserExecuted=true，不能使用 unavailable/not-implemented、fixture 或 local contract evidence 替代真实 E2E。`,
        ]),
    ...(independentVerificationPlan?.executionLevel ===
    'real-local-independent-verifier'
      ? []
      : [
          'generationPlan.independentVerificationPlan.executionLevel 必须为 real-local-independent-verifier',
        ]),
    ...(publishCandidatePlan?.executionLevel ===
    'real-local-publish-candidate-contract'
      ? []
      : [
          'generationPlan.publishCandidatePlan.executionLevel 必须为 real-local-publish-candidate-contract',
        ]),
    ...(finalVerdict?.publishCandidateAllowed === true
      ? []
      : [
          'generationPlan.publishCandidatePlan.finalVerdict.publishCandidateAllowed 必须为 true',
        ]),
    ...(getStringArray(finalVerdict?.blockingReasons).length === 0
      ? []
      : [
          'generationPlan.publishCandidatePlan.finalVerdict.blockingReasons 必须为空',
        ]),
    ...(rollbackShareControls?.publicTokenCreation ===
    'deferred-until-enable-public-share'
      ? []
      : [
          'generationPlan.publishCandidatePlan.rollbackShareControls.publicTokenCreation 必须 deferred',
        ]),
    ...(rollbackShareControls?.createdPublicShareToken === null
      ? []
      : [
          'generationPlan.publishCandidatePlan.rollbackShareControls.createdPublicShareToken 必须为 null',
        ]),
    ...(rollbackShareControls?.createsPublicShareToken === false
      ? []
      : [
          'generationPlan.publishCandidatePlan.rollbackShareControls.createsPublicShareToken 必须为 false',
        ]),
    ...(artifactReleaseManifest.length > 0
      ? []
      : [
          'generationPlan.publishCandidatePlan.artifactReleaseManifest 不能为空',
        ]),
    ...artifactReleaseManifest.flatMap((artifact, index) => [
      ...(artifact.placeholder === true
        ? []
        : [`artifactReleaseManifest[${index}].placeholder 必须为 true`]),
      ...(artifact.archiveMaterialized === false
        ? []
        : [
            `artifactReleaseManifest[${index}].archiveMaterialized 必须为 false`,
          ]),
      ...(getRecord(artifact.signature)?.status === 'not-signed'
        ? []
        : [
            `artifactReleaseManifest[${index}].signature.status 必须为 not-signed`,
          ]),
      ...(artifact.signoffStatus === 'contract-accepted'
        ? []
        : [
            `artifactReleaseManifest[${index}].signoffStatus 必须为 contract-accepted`,
          ]),
    ]),
    ...(gate7EvidenceIds.has('gate-7-artifact-release-manifest') &&
    gate7EvidenceIds.has('gate-7-rollback-share-controls') &&
    gate7EvidenceIds.has('gate-7-final-verdict')
      ? []
      : [
          'Gate 7 run evidence 必须包含 release manifest、rollback/share controls 和 final verdict',
        ]),
    ...(hasTrustedGate7RunnerEvidence
      ? []
      : [
          'Gate 7 run evidence 必须来自 gate-7-real-publish-candidate-runner 且 executed=true、publicShareTokenCreated=false',
        ]),
  ];
}
