import * as crypto from 'crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppGateRunFailure,
  GeneratedAppGateRun,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
  GeneratedAppStatus,
  GeneratedAppSubmission,
} from '../../database/schema';
import {
  CreateGeneratedAppGenerationRunSchema,
  type CreateGeneratedAppGenerationRunDtoType,
  CreateGeneratedAppGateRunSchema,
  type CreateGeneratedAppGateRunDtoType,
  CreateGeneratedAppRepairAttemptSchema,
  type CreateGeneratedAppRepairAttemptDtoType,
  type CreateGeneratedAppSubmissionDtoType,
  type CreateGeneratedAppDtoType,
  type DeleteGeneratedAppSubmissionsResponseDto,
  type DeleteGeneratedAppSubmissionsDtoType,
  type GeneratedAppGenerationRunResponseDto,
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
  type GeneratedAppResponseDto,
  type GeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppResponseDto,
  type QueryGeneratedAppGenerationRunsDtoType,
  type QueryGeneratedAppGateRunsDtoType,
  type QueryGeneratedAppRepairAttemptsDtoType,
  type QueryGeneratedAppSubmissionsDtoType,
  type QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsSchema,
  type RecordGeneratedAppGateRunResponseDto,
  type RecordGeneratedAppGateResultsDtoType,
  StartGeneratedAppGenerationRunSchema,
  type StartGeneratedAppGenerationRunDtoType,
  type StartGeneratedAppGenerationRunResponseDto,
  UpdateGeneratedAppGenerationRunSchema,
  type UpdateGeneratedAppGenerationRunDtoType,
  UpdateGeneratedAppRepairAttemptSchema,
  type UpdateGeneratedAppRepairAttemptDtoType,
} from './dto';
import {
  createInitialGeneratedAppGateResults,
  evaluateGeneratedAppReadiness,
  getGeneratedAppGateDefinition,
  getGeneratedAppStatusForReadiness,
  normalizeGeneratedAppGateResults,
} from './generated-app.gates';
import {
  GeneratedAppGateDefinitionNotFoundException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';
import {
  GeneratedAppGate3WorkspaceRunner,
  type GeneratedAppGate3CommandPlan,
  type GeneratedAppGenerationWorkspaceContract,
} from './generated-app.workspace';
import {
  GeneratedAppGate4IntegrationRunner,
  type GeneratedAppIntegrationExecutionLevel,
} from './generated-app.integration-runner';
import {
  GeneratedAppGate5BrowserAcceptanceRunner,
  type GeneratedAppBrowserAcceptanceExecutionLevel,
} from './generated-app.browser-acceptance-runner';
import {
  GeneratedAppGate6IndependentVerifierRunner,
  type GeneratedAppIndependentVerifierExecutionLevel,
} from './generated-app.independent-verifier-runner';
import {
  GeneratedAppGate7PublishCandidateRunner,
  type GeneratedAppPublishCandidateExecutionLevel,
} from './generated-app.publish-candidate-runner';
import {
  buildGeneratedAppRuntimeForm,
  buildPublicGeneratedAppRuntimeDescription,
  buildPublicGeneratedAppRuntimeSpec,
  evaluateGeneratedAppLocalRuntime,
} from './generated-app.runtime';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';

const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

const GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON =
  'Gate 7 publish-candidate guard skeleton 检测到 Gate 4-6 仍为 skeleton-only upstream evidence，且缺少后续真实 integration/browser/verifier 证据，不能形成 publish candidate。';
const PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,})\b/i;
const PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN =
  /(?:\/(?:root|home|users|var|tmp|etc|workspace)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/i;

const GATE_2_STATIC_CONTRACT_IDS = [
  'gate-2-public-runtime-contract',
  'gate-2-frontend-route-contract',
  'gate-2-orchestration-contract',
  'gate-2-plugin-permission-contract',
  'gate-2-submission-persistence-contract',
  'gate-2-test-entry-contract',
  'gate-2-traceability-contract',
] as const;

const GATE_3_CORE_ARTIFACT_IDS = [
  'frontend-build-output',
  'unit-test-report',
  'component-golden-report',
  'coverage-report',
] as const;

const GATE_3_ARTIFACT_KINDS = [
  'frontend_build',
  'unit_test_report',
  'component_golden_report',
  'coverage_report',
  'plugin_bundle',
] as const;

const GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'command',
  'exitCode',
  'stdout',
  'stderr',
  'durationMs',
  'artifactPath',
] as const;

const GATE_3_COVERAGE_TARGET_IDS = [
  'gate-3-generation-workspace-contract',
  'gate-3-command-plan',
  'gate-3-frontend-build-command',
  'gate-3-typecheck-command',
  'gate-3-unit-test-command',
  'gate-3-component-golden-test-entry',
  'gate-3-artifact-expectations',
  'gate-3-static-contracts-coverage',
  'gate-3-acceptance-scenario-coverage',
  'gate-3-plugin-build-expectations',
  'gate-3-failure-capture-fields',
] as const;

const GATE_3_ALLOWED_EXECUTION_LEVELS = [
  'contract-skeleton',
  'real-local-command-plan',
  'fixture-execution',
  'disabled-execution',
] as const;

const GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE =
  'generated-app-editor-handoff';

const GATE_3_REQUIRED_WORKSPACE_FILE_PATHS = [
  'package.json',
  'index.html',
  'tsconfig.json',
  'tsconfig.generated-app.json',
  'vite.config.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/generated-app/app-spec.ts',
  'src/generated-app/static-contracts.ts',
  'src/generated-app/runtime.ts',
  'src/generated-app/__tests__/runtime.contract.spec.ts',
  'src/generated-app/__tests__/runtime.golden.spec.tsx',
  'generated-app.manifest.json',
  'scripts/gate3-build.mjs',
  'scripts/gate3-typecheck.mjs',
  'scripts/gate3-unit.mjs',
  'scripts/gate3-component-golden.mjs',
] as const;

const GATE_3_REQUIRED_COMMAND_IDS = [
  'gate-3-frontend-build-command',
  'gate-3-typecheck-command',
  'gate-3-unit-test-command',
  'gate-3-component-golden-test-entry',
] as const;

const GATE_3_ALLOWED_COMMAND_BY_ID = {
  'gate-3-frontend-build-command': 'node scripts/gate3-build.mjs',
  'gate-3-typecheck-command': 'node scripts/gate3-typecheck.mjs',
  'gate-3-unit-test-command': 'node scripts/gate3-unit.mjs',
  'gate-3-component-golden-test-entry':
    'node scripts/gate3-component-golden.mjs',
} as const satisfies Record<
  (typeof GATE_3_REQUIRED_COMMAND_IDS)[number],
  string
>;

const GATE_3_SKELETON_EVIDENCE_NOTE =
  'Gate 3 contract-skeleton 只检查计划完整性；fixture-execution 不执行真实命令；real-local-command-plan 才表示受控本地命令已执行。';

const GATE_4_SKELETON_EVIDENCE_NOTE =
  'Gate 4 integration-skeleton 只做合约完整性检查；fixture-integration 不执行真实本地 integration contract；real-local-integration 才表示受控本地 public/creator API contract、Agent/Workflow trace fixture 与插件 smoke trace fixture 已执行，但仍不是生产 sandbox run 或真实 Extism WASM 执行。';

const GATE_4_ALLOWED_EXECUTION_LEVELS = [
  'integration-skeleton',
  'real-local-integration',
  'fixture-integration',
  'disabled-integration',
] as const;

const GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS = [
  'dry-run-fixture-skeleton',
  'controlled-local-trace-fixture',
] as const;

const GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS = [
  'gate-4-public-runtime-read',
  'gate-4-public-runtime-submit-input',
  'gate-4-public-submission-detail',
] as const;

const GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS = [
  'gate-4-creator-generation-run-query',
  'gate-4-creator-gate-run-query',
  'gate-4-creator-submission-query',
] as const;

const GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS = [
  'public_runtime_read',
  'public_runtime_submit',
  'public_submission_detail',
] as const;

const GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS = [
  'creator_generation_run_query',
  'creator_gate_run_query',
  'creator_submission_query',
] as const;

const GATE_4_TRACE_ARTIFACT_KINDS = [
  'public_runtime_api_trace',
  'creator_management_api_trace',
  'agent_workflow_dry_run_trace',
  'plugin_sandbox_smoke_trace',
] as const;

const GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS = [
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

const GATE_4_CORE_TRACE_ARTIFACT_IDS = [
  'public-runtime-api-trace',
  'creator-management-api-trace',
  'agent-workflow-dry-run-trace',
] as const;

const GATE_4_PUBLIC_RUNTIME_CHECK_STATIC_CONTRACTS: Record<string, string[]> = {
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

const GATE_4_CREATOR_CHECK_STATIC_CONTRACTS: Record<string, string[]> = {
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

const GATE_4_PUBLIC_RUNTIME_CHECK_PAYLOAD_CONTRACT_REFS: Record<
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

const GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS = [
  'staticContracts.publicRuntime.input',
  'staticContracts.publicRuntime.output',
  'staticContracts.submissionPersistence',
] as const;

const GATE_5_SKELETON_EVIDENCE_NOTE =
  'Gate 5 当前只做 browser-acceptance-skeleton 完整性检查；未执行真实 Playwright/browser test、真实截图/视频/trace 捕获、真实 console/network 检查、真实公开链接访问或真实端到端交互。';

const GATE_5_REAL_LOCAL_BROWSER_CONTRACT_NOTE =
  'Gate 5 real-local-browser-contract 执行受控 deterministic 本地 DOM/accessibility/network/console contract；不执行任意 shell/用户路径，不启动 Playwright 或真实浏览器，不访问真实公开链接，也不捕获真实截图、视频或 Playwright trace。';

const GATE_5_ALLOWED_EXECUTION_LEVELS = [
  'browser-acceptance-skeleton',
  'real-local-browser-contract',
  'fixture-browser-acceptance',
  'disabled-browser-acceptance',
] as const;

const GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND =
  'agentloom generated-app gate-5 local-browser-contract';

const GATE_5_VIEWPORT_IDS = ['viewport-desktop', 'viewport-mobile'] as const;

const GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS = [
  'gate-5-public-runtime-open',
  'gate-5-public-runtime-submit',
  'gate-5-public-submission-detail',
] as const;

const GATE_5_CREATOR_MANAGEMENT_JOURNEY_IDS = [
  'gate-5-creator-generation-run-review',
  'gate-5-creator-gate-run-review',
  'gate-5-creator-submission-review',
] as const;

const GATE_5_ALLOWED_PUBLIC_JOURNEY_KINDS = [
  'public_runtime_open',
  'public_runtime_interaction_submit',
  'public_submission_result_detail',
] as const;

const GATE_5_ALLOWED_CREATOR_JOURNEY_KINDS = [
  'creator_generation_run_review',
  'creator_gate_run_review',
  'creator_submission_review',
] as const;

const GATE_5_ALLOWED_ASSERTION_KINDS = [
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

const GATE_5_REQUIRED_ASSERTION_IDS = [
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

const GATE_5_ALLOWED_ARTIFACT_KINDS = [
  'screenshot',
  'video',
  'playwright_trace',
  'console_log',
  'network_log',
  'failure_summary',
] as const;

const GATE_5_REQUIRED_ARTIFACT_IDS = [
  'desktop-screenshot',
  'mobile-screenshot',
  'browser-video',
  'playwright-trace',
  'console-log',
  'network-log',
  'failure-summary',
] as const;

const GATE_5_REQUIRED_FAILURE_CAPTURE_FIELDS = [
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

const GATE_5_REQUIRED_PUBLIC_FORBIDDEN_ENDPOINT_PATTERNS = [
  '/generated-apps/{appId}',
  '/generated-apps/{appId}/generation-runs',
  '/generated-apps/{appId}/gate-runs',
  '/generated-apps/{appId}/submissions',
  '/settings',
  '/internal',
] as const;

const GATE_5_REQUIRED_SECRET_LEAK_PATTERNS = [
  'authorization',
  'public_share_token',
  'api_key',
  'secret',
] as const;

const GATE_6_SKELETON_EVIDENCE_NOTE =
  'Gate 6 当前只做 independent-verifier-skeleton 完整性检查；未执行真实独立模型审查、真实独立代理审查、真实人工审查、真实运行结果判定或真实需求满足判定。';

const GATE_6_REAL_LOCAL_VERIFIER_NOTE =
  'Gate 6 real-local-independent-verifier 执行服务端受控 deterministic 本地独立规则审查；不访问外部网络，不调用任意模型，不读取 generation transcript、public share token、API key 或 secret，也不代表外部模型或人工审查。';

const GATE_6_REQUIRED_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
] as const;

const GATE_6_ALLOWED_EXECUTION_LEVELS = [
  'independent-verifier-skeleton',
  'real-local-independent-verifier',
  'fixture-independent-verifier',
  'disabled-independent-verifier',
] as const;

const GATE_6_LOCAL_INDEPENDENT_VERIFIER_COMMAND =
  'agentloom generated-app gate-6 local-independent-verifier';

const GATE_6_REQUIRED_ISOLATION_CONTROLS = [
  'fresh-reviewer-identity',
  'fresh-context-no-generation-transcript',
  'redacted-evidence-bundle-only',
  'reject-generator-self-attestation',
  'evidence-id-citation-required',
  'no-public-share-token-or-real-secret',
] as const;

const GATE_6_REQUIRED_RUBRIC_CATEGORIES = [
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

const GATE_6_REQUIRED_VERDICT_FIELDS = [
  'blockingFindings',
  'warnings',
  'decision',
  'traceabilityCoverage',
  'repairSuggestions',
  'residualRiskSummary',
] as const;

const GATE_6_ALLOWED_FINDING_SEVERITIES = ['blocking', 'warning'] as const;

const GATE_6_ALLOWED_DECISION_VALUES = ['pass', 'fail'] as const;

const GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS = [
  'reviewer_identity_context_isolation',
  'input_material_redaction',
  'reject_generator_self_attestation',
  'evidence_id_citation_required',
] as const;

const GATE_6_REQUIRED_FAILURE_CAPTURE_FIELDS = [
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

const GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS = [
  'publicShareToken',
  'authorization',
  'apiKey',
  'secret',
] as const;

const GATE_6_REQUIRED_COVERAGE_MATRIX_IDS = [
  'requirementCoverage',
  'scenarioCoverage',
  'evidenceCoverage',
  'gateCoverage',
] as const;

const GATE_6_ALLOWED_COVERAGE_MATRIX_SOURCE_PLANS = [
  'generationPlan',
  'staticContracts',
  'buildUnitPlan',
  'integrationPlan',
  'browserAcceptancePlan',
  'independentVerificationPlan',
] as const;

const GATE_7_SKELETON_EVIDENCE_NOTE =
  'Gate 7 当前执行受控本地 publish-candidate contract；不会创建生产发布、真实 artifact archive、真实签名或 public share token。';

const GATE_7_REQUIRED_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
  'gate-7',
] as const;

const GATE_7_UPSTREAM_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
] as const;

const GATE_7_REQUIRED_READINESS_PRECONDITIONS = [
  'all-gate-0-through-gate-7-blocking-gates-passed',
  'no-blocking-findings',
  'no-unresolved-warning-findings',
  'real-artifacts-signed-off',
  'real-independent-verifier-verdict-pass',
  'public-share-token-created-only-after-publish-candidate',
] as const;

const GATE_7_REQUIRED_NON_SKELETON_EVIDENCE_CLASSES = [
  'real_frontend_build_artifact',
  'real_plugin_bundle_artifact',
  'real_test_report',
  'real_integration_trace',
  'real_browser_artifact',
  'real_independent_verifier_report',
  'real_source_artifact',
] as const;

const GATE_7_ALLOWED_ARTIFACT_KINDS = [
  'frontend_artifact',
  'plugin_bundle_artifact',
  'test_report',
  'integration_trace',
  'browser_artifact',
  'verifier_report',
  'source_artifact_placeholder',
] as const;

const GATE_7_REQUIRED_ARTIFACT_KINDS = [
  ...GATE_7_ALLOWED_ARTIFACT_KINDS,
] as const;

const GATE_7_ALLOWED_EXECUTION_LEVELS = [
  'publish-candidate-guard-skeleton',
  'real-local-publish-candidate-contract',
  'fixture-publish-candidate-contract',
  'disabled-publish-candidate-contract',
] as const;

const GATE_7_REQUIRED_BLOCKER_CATEGORIES = [
  'skeleton_only_upstream_gate',
  'missing_real_execution_artifact',
  'missing_real_independent_verifier_verdict',
  'unresolved_warning_or_blocking_finding',
  'stale_public_token_requirement',
] as const;

const GATE_7_REQUIRED_REAL_GATE_RUNNER_IDS = [
  'gate-3-real-build-unit-runner',
  'gate-4-real-integration-runner',
  'gate-5-real-browser-acceptance-runner',
  'gate-6-real-independent-verifier-runner',
  'gate-7-real-publish-candidate-runner',
] as const;

const GATE_7_REQUIRED_BLOCKING_REASON_FRAGMENTS = [
  'skeleton/contract-level',
  '真实 integration/browser/verifier artifact',
  '真实独立 verifier verdict',
] as const;

const GATE_7_EXPECTED_EVIDENCE_IDS = [
  'gate-7-publish-readiness-inputs',
  'gate-7-artifact-release-manifest',
  'gate-7-publication-blockers',
  'gate-7-rollback-share-controls',
  'gate-7-final-verdict',
  'gate-7-coverage-matrices',
  'gate-7-failure-capture-fields',
] as const;

const GATE_7_ALLOWED_FINAL_VERDICT_FIELDS = [
  'publishCandidateAllowed',
  'blockingReasons',
  'warningReasons',
  'requiredRealGateRunnerIds',
  'evidenceIds',
  'repairSuggestions',
] as const;

const GATE_7_REQUIRED_FAILURE_CAPTURE_FIELDS = [
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

interface Gate0Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate0Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate1Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate1Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate2Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate2Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate3Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate3Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate4Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate4Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate5Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate5Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate6Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate6Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate7Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate7Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

@Injectable()
export class GeneratedAppService {
  private readonly gate3WorkspaceRunner: GeneratedAppGate3WorkspaceRunner;
  private readonly gate4IntegrationRunner: GeneratedAppGate4IntegrationRunner;
  private readonly gate5BrowserAcceptanceRunner: GeneratedAppGate5BrowserAcceptanceRunner;
  private readonly gate6IndependentVerifierRunner: GeneratedAppGate6IndependentVerifierRunner;
  private readonly gate7PublishCandidateRunner: GeneratedAppGate7PublishCandidateRunner;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    @Optional() gate3WorkspaceRunner?: GeneratedAppGate3WorkspaceRunner,
    @Optional() gate4IntegrationRunner?: GeneratedAppGate4IntegrationRunner,
    @Optional()
    gate5BrowserAcceptanceRunner?: GeneratedAppGate5BrowserAcceptanceRunner,
    @Optional()
    gate6IndependentVerifierRunner?: GeneratedAppGate6IndependentVerifierRunner,
    @Optional()
    gate7PublishCandidateRunner?: GeneratedAppGate7PublishCandidateRunner,
  ) {
    this.gate3WorkspaceRunner =
      gate3WorkspaceRunner ??
      new GeneratedAppGate3WorkspaceRunner(this.configService);
    this.gate4IntegrationRunner =
      gate4IntegrationRunner ??
      new GeneratedAppGate4IntegrationRunner(this.configService);
    this.gate5BrowserAcceptanceRunner =
      gate5BrowserAcceptanceRunner ??
      new GeneratedAppGate5BrowserAcceptanceRunner(this.configService);
    this.gate6IndependentVerifierRunner =
      gate6IndependentVerifierRunner ??
      new GeneratedAppGate6IndependentVerifierRunner(this.configService);
    this.gate7PublishCandidateRunner =
      gate7PublishCandidateRunner ??
      new GeneratedAppGate7PublishCandidateRunner(this.configService);
  }

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const prompt = dto.prompt.trim();
    const appSpec = this.buildInitialAppSpec(prompt);
    const gateResults = createInitialGeneratedAppGateResults();
    const readiness = evaluateGeneratedAppReadiness(gateResults);
    const status: GeneratedAppStatus = 'app_spec_ready';

    const [created] = await this.tenantDb
      .insert(schema.generatedApps)
      .values({
        tenantId,
        prompt,
        appName: appSpec.appName,
        description: appSpec.summary,
        status,
        appSpec,
        generationPlan: null,
        gateResults,
        readiness,
        preview: DEFAULT_PREVIEW,
        pluginIds: [],
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return this.toResponseDto(created);
  }

  async list(
    tenantId: string,
    query: QueryGeneratedAppsDtoType,
  ): Promise<{
    data: GeneratedAppResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const filters = query.status
      ? and(
          eq(schema.generatedApps.tenantId, tenantId),
          eq(schema.generatedApps.status, query.status),
        )
      : eq(schema.generatedApps.tenantId, tenantId);

    const [apps, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedApps)
        .where(filters)
        .orderBy(desc(schema.generatedApps.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedApps)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: apps.map((app) => this.toResponseDto(app)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.toResponseDto(app);
  }

  async recordGateResults(
    tenantId: string,
    userId: string,
    appId: string,
    dto: RecordGeneratedAppGateResultsDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);

    const parsed = RecordGeneratedAppGateResultsSchema.parse(dto);
    const gateResults = normalizeGeneratedAppGateResults(
      parsed.gateResults as GeneratedAppGateResult[],
    );
    const updatePayload = this.buildGateResultsUpdatePayload(
      userId,
      gateResults,
      {
        generationPlan: parsed.generationPlan,
        currentGenerationPlan: parsed.generationPlan ?? app.generationPlan,
        preview: parsed.preview,
      },
    );

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return this.toResponseDto(updated);
  }

  async listGenerationRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGenerationRunsDtoType,
  ): Promise<{
    data: GeneratedAppGenerationRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
      eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
    ];

    if (query.status) {
      baseFilters.push(
        eq(schema.generatedAppGenerationRuns.status, query.status),
      );
    }

    const filters = and(...baseFilters);
    const [runs, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppGenerationRuns)
        .where(filters)
        .orderBy(desc(schema.generatedAppGenerationRuns.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppGenerationRuns)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: runs.map((run) => this.toGenerationRunResponseDto(run)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = CreateGeneratedAppGenerationRunSchema.parse(dto);
    const startedAt = parsed.startedAt
      ? new Date(parsed.startedAt)
      : new Date();
    const completedAt =
      parsed.completedAt === undefined
        ? null
        : parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt);

    const [run] = await this.tenantDb
      .insert(schema.generatedAppGenerationRuns)
      .values({
        tenantId,
        generatedAppId: appId,
        runNumber: parsed.runNumber,
        status: parsed.status,
        triggerSource: parsed.triggerSource,
        maxRepairAttempts: parsed.maxRepairAttempts,
        maxRuntimeSeconds: parsed.maxRuntimeSeconds,
        summary: parsed.summary,
        failureReason: parsed.failureReason ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    return this.toGenerationRunResponseDto(run);
  }

  async startGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<StartGeneratedAppGenerationRunResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = StartGeneratedAppGenerationRunSchema.parse(dto);
    const startedAt = new Date();
    const runNumber = await this.resolveNextGenerationRunNumber(
      tenantId,
      appId,
    );

    const [run] = await this.tenantDb
      .insert(schema.generatedAppGenerationRuns)
      .values({
        tenantId,
        generatedAppId: appId,
        runNumber,
        status: 'running',
        triggerSource: parsed.triggerSource,
        maxRepairAttempts: parsed.maxRepairAttempts,
        maxRuntimeSeconds: parsed.maxRuntimeSeconds,
        summary: '门禁运行器骨架已启动，正在执行 Gate 0 AppSpec 完整性检查。',
        failureReason: null,
        startedAt,
        completedAt: null,
        createdBy: userId,
      })
      .returning();

    const gate0Evaluation = this.evaluateGate0AppSpec(app.appSpec);
    const gateCompletedAt = new Date();
    const gateRunResult = await this.createGateRunAndUpdateApp(
      tenantId,
      userId,
      app,
      {
        gateId: 'gate-0',
        generationRunId: run.id,
        attemptNumber: 1,
        status: gate0Evaluation.status,
        summary: gate0Evaluation.summary,
        evidence: gate0Evaluation.evidence,
        failure: gate0Evaluation.failure,
        repairInstructions: gate0Evaluation.repairInstructions,
        startedAt: startedAt.toISOString(),
        completedAt: gateCompletedAt.toISOString(),
      },
      {
        buildGateResults: (gateResult, nowIso) =>
          this.buildRunnerGateResults(app, [gateResult], nowIso),
      },
    );
    const producedGateRuns: GeneratedAppGateRunResponseDto[] = [
      gateRunResult.gateRun,
    ];
    let latestApp = gateRunResult.app;
    let finalFailureReason: string | null =
      gate0Evaluation.failure?.message ??
      'Gate 0 AppSpec 完整性检查失败，不能继续执行 Gate 1 架构计划门禁。';
    let completedSummary =
      '门禁运行器骨架在 Gate 0 AppSpec 完整性检查失败；当前应用保持不可发布。';
    let completedAt = gateCompletedAt;
    let completedStatus: schema.GeneratedAppGenerationRunStatus = 'failed';

    if (gate0Evaluation.status === 'passed') {
      const generationPlan = this.buildGenerationPlan(app.appSpec);
      const gate1Evaluation = this.evaluateGate1GenerationPlan(
        app.appSpec,
        generationPlan,
      );
      const gate0Result = latestApp.gateResults.find(
        (gate) => gate.gateId === 'gate-0',
      );
      const gate1StartedAt = new Date();
      const gate1CompletedAt = new Date();
      const gate1AppSnapshot: GeneratedApp = {
        ...app,
        gateResults: latestApp.gateResults,
        generationPlan: latestApp.generationPlan,
      };
      const gate1RunResult = await this.createGateRunAndUpdateApp(
        tenantId,
        userId,
        gate1AppSnapshot,
        {
          gateId: 'gate-1',
          generationRunId: run.id,
          attemptNumber: 1,
          status: gate1Evaluation.status,
          summary: gate1Evaluation.summary,
          evidence: gate1Evaluation.evidence,
          failure: gate1Evaluation.failure,
          repairInstructions: gate1Evaluation.repairInstructions,
          startedAt: gate1StartedAt.toISOString(),
          completedAt: gate1CompletedAt.toISOString(),
        },
        {
          generationPlan,
          buildGateResults: (gate1Result, nowIso) =>
            this.buildRunnerGateResults(
              app,
              gate0Result ? [gate0Result, gate1Result] : [gate1Result],
              nowIso,
            ),
        },
      );

      producedGateRuns.push(gate1RunResult.gateRun);
      latestApp = gate1RunResult.app;
      completedAt = gate1CompletedAt;

      if (gate1Evaluation.status === 'failed') {
        finalFailureReason =
          gate1Evaluation.failure?.message ??
          'Gate 1 架构计划门禁失败，不能继续执行 Gate 2-7。';
        completedSummary =
          '门禁运行器骨架完成 Gate 0，但 Gate 1 架构计划门禁失败；当前应用保持不可发布。';
      } else {
        const staticContracts = this.buildStaticContracts(
          app.appSpec,
          generationPlan,
        );
        const generationPlanWithStaticContracts: GeneratedAppGenerationPlan = {
          ...generationPlan,
          staticContracts,
        };
        const gate2Evaluation = this.evaluateGate2StaticContracts(
          app.appSpec,
          generationPlan,
          staticContracts,
        );
        const gate1Result = latestApp.gateResults.find(
          (gate) => gate.gateId === 'gate-1',
        );
        const gate2StartedAt = new Date();
        const gate2CompletedAt = new Date();
        const gate2AppSnapshot: GeneratedApp = {
          ...app,
          gateResults: latestApp.gateResults,
          generationPlan: latestApp.generationPlan,
        };
        const gate2RunResult = await this.createGateRunAndUpdateApp(
          tenantId,
          userId,
          gate2AppSnapshot,
          {
            gateId: 'gate-2',
            generationRunId: run.id,
            attemptNumber: 1,
            status: gate2Evaluation.status,
            summary: gate2Evaluation.summary,
            evidence: gate2Evaluation.evidence,
            failure: gate2Evaluation.failure,
            repairInstructions: gate2Evaluation.repairInstructions,
            startedAt: gate2StartedAt.toISOString(),
            completedAt: gate2CompletedAt.toISOString(),
          },
          {
            generationPlan: generationPlanWithStaticContracts,
            buildGateResults: (gate2Result, nowIso) =>
              this.buildRunnerGateResults(
                app,
                [
                  ...(gate0Result ? [gate0Result] : []),
                  ...(gate1Result ? [gate1Result] : []),
                  gate2Result,
                ],
                nowIso,
              ),
          },
        );

        producedGateRuns.push(gate2RunResult.gateRun);
        latestApp = gate2RunResult.app;
        completedAt = gate2CompletedAt;

        if (gate2Evaluation.status === 'failed') {
          finalFailureReason =
            gate2Evaluation.failure?.message ??
            'Gate 2 静态合约门禁失败，不能继续执行 Gate 3-7。';
          completedSummary =
            '门禁运行器骨架完成 Gate 0 和 Gate 1，但 Gate 2 静态合约门禁失败；当前应用保持不可发布。';
        } else {
          const gate3Workspace =
            this.gate3WorkspaceRunner.buildWorkspaceContract({
              tenantId,
              appId,
              generationRunId: run.id,
              appSpec: app.appSpec,
              staticContracts,
            });
          const gate3CommandPlan = this.gate3WorkspaceRunner.buildCommandPlan({
            workspace: gate3Workspace,
            requirementIds: app.appSpec.coreRequirements.map(
              (requirement) => requirement.id,
            ),
            scenarioIds: app.appSpec.acceptanceScenarios.map(
              (scenario) => scenario.id,
            ),
          });
          const buildUnitPlan = this.buildBuildUnitPlan(
            app.appSpec,
            generationPlan,
            staticContracts,
            gate3Workspace,
            gate3CommandPlan,
            this.gate3WorkspaceRunner.getExecutionLevel(),
          );
          const generationPlanWithBuildUnitPlan: GeneratedAppGenerationPlan = {
            ...generationPlanWithStaticContracts,
            buildUnitPlan,
          };
          let gate3Evaluation = this.evaluateGate3BuildUnitPlan(
            app.appSpec,
            generationPlan,
            staticContracts,
            buildUnitPlan,
          );
          if (gate3Evaluation.status === 'passed') {
            gate3Evaluation = await this.gate3WorkspaceRunner.materializeAndRun(
              {
                tenantId,
                appId,
                generationRunId: run.id,
                appSpec: app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
                workspace: gate3Workspace,
                commandPlan: gate3CommandPlan,
              },
            );
          }
          const gate2Result = latestApp.gateResults.find(
            (gate) => gate.gateId === 'gate-2',
          );
          const gate3StartedAt = new Date();
          const gate3CompletedAt = new Date();
          const gate3AppSnapshot: GeneratedApp = {
            ...app,
            gateResults: latestApp.gateResults,
            generationPlan: latestApp.generationPlan,
          };
          const gate3RunResult = await this.createGateRunAndUpdateApp(
            tenantId,
            userId,
            gate3AppSnapshot,
            {
              gateId: 'gate-3',
              generationRunId: run.id,
              attemptNumber: 1,
              status: gate3Evaluation.status,
              summary: gate3Evaluation.summary,
              evidence: gate3Evaluation.evidence,
              failure: gate3Evaluation.failure,
              repairInstructions: gate3Evaluation.repairInstructions,
              startedAt: gate3StartedAt.toISOString(),
              completedAt: gate3CompletedAt.toISOString(),
            },
            {
              generationPlan: generationPlanWithBuildUnitPlan,
              buildGateResults: (gate3Result, nowIso) =>
                this.buildRunnerGateResults(
                  app,
                  [
                    ...(gate0Result ? [gate0Result] : []),
                    ...(gate1Result ? [gate1Result] : []),
                    ...(gate2Result ? [gate2Result] : []),
                    gate3Result,
                  ],
                  nowIso,
                ),
            },
          );

          producedGateRuns.push(gate3RunResult.gateRun);
          latestApp = gate3RunResult.app;
          completedAt = gate3CompletedAt;

          if (gate3Evaluation.status === 'failed') {
            finalFailureReason =
              gate3Evaluation.failure?.message ??
              'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。';
            completedSummary =
              '门禁运行器完成 Gate 0、Gate 1 和 Gate 2，但 Gate 3 Generation Workspace、构建/单元执行或 buildUnitPlan 检查失败；Gate 4-7 未执行，当前应用保持不可发布。';
          } else {
            const integrationPlan = this.buildIntegrationPlan(
              app.appSpec,
              generationPlan,
              staticContracts,
              buildUnitPlan,
              this.gate4IntegrationRunner.getExecutionLevel(),
            );
            const generationPlanWithIntegrationPlan: GeneratedAppGenerationPlan =
              {
                ...generationPlanWithBuildUnitPlan,
                integrationPlan,
              };
            let gate4Evaluation = this.evaluateGate4IntegrationPlan(
              app.appSpec,
              generationPlan,
              staticContracts,
              buildUnitPlan,
              integrationPlan,
            );
            if (gate4Evaluation.status === 'passed') {
              gate4Evaluation = this.gate4IntegrationRunner.run({
                appSpec: app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
                integrationPlan,
              });
            }
            const gate3Result = latestApp.gateResults.find(
              (gate) => gate.gateId === 'gate-3',
            );
            const gate4StartedAt = new Date();
            const gate4CompletedAt = new Date();
            const gate4AppSnapshot: GeneratedApp = {
              ...app,
              gateResults: latestApp.gateResults,
              generationPlan: latestApp.generationPlan,
            };
            const gate4RunResult = await this.createGateRunAndUpdateApp(
              tenantId,
              userId,
              gate4AppSnapshot,
              {
                gateId: 'gate-4',
                generationRunId: run.id,
                attemptNumber: 1,
                status: gate4Evaluation.status,
                summary: gate4Evaluation.summary,
                evidence: gate4Evaluation.evidence,
                failure: gate4Evaluation.failure,
                repairInstructions: gate4Evaluation.repairInstructions,
                startedAt: gate4StartedAt.toISOString(),
                completedAt: gate4CompletedAt.toISOString(),
              },
              {
                generationPlan: generationPlanWithIntegrationPlan,
                buildGateResults: (gate4Result, nowIso) =>
                  this.buildRunnerGateResults(
                    app,
                    [
                      ...(gate0Result ? [gate0Result] : []),
                      ...(gate1Result ? [gate1Result] : []),
                      ...(gate2Result ? [gate2Result] : []),
                      ...(gate3Result ? [gate3Result] : []),
                      gate4Result,
                    ],
                    nowIso,
                  ),
              },
            );

            producedGateRuns.push(gate4RunResult.gateRun);
            latestApp = gate4RunResult.app;
            completedAt = gate4CompletedAt;

            if (gate4Evaluation.status === 'failed') {
              finalFailureReason =
                gate4Evaluation.failure?.message ??
                'Gate 4 集成门禁失败，不能继续执行 Gate 5-7。';
              completedSummary =
                '门禁运行器完成 Gate 0、Gate 1、Gate 2 和 Gate 3，但 Gate 4 integration runner 或 integrationPlan 检查失败；Gate 5-7 未执行，当前应用保持不可发布。';
            } else {
              const browserAcceptancePlan = this.buildBrowserAcceptancePlan(
                app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
                integrationPlan,
                this.gate5BrowserAcceptanceRunner.getExecutionLevel(),
              );
              const generationPlanWithBrowserAcceptancePlan: GeneratedAppGenerationPlan =
                {
                  ...generationPlanWithIntegrationPlan,
                  browserAcceptancePlan,
                };
              let gate5Evaluation = this.evaluateGate5BrowserAcceptancePlan(
                app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
                integrationPlan,
                browserAcceptancePlan,
              );
              if (gate5Evaluation.status === 'passed') {
                gate5Evaluation = this.gate5BrowserAcceptanceRunner.run({
                  appSpec: app.appSpec,
                  generationPlan,
                  staticContracts,
                  buildUnitPlan,
                  integrationPlan,
                  browserAcceptancePlan,
                });
              }
              const gate4Result = latestApp.gateResults.find(
                (gate) => gate.gateId === 'gate-4',
              );
              const gate5StartedAt = new Date();
              const gate5CompletedAt = new Date();
              const gate5AppSnapshot: GeneratedApp = {
                ...app,
                gateResults: latestApp.gateResults,
                generationPlan: latestApp.generationPlan,
              };
              const gate5RunResult = await this.createGateRunAndUpdateApp(
                tenantId,
                userId,
                gate5AppSnapshot,
                {
                  gateId: 'gate-5',
                  generationRunId: run.id,
                  attemptNumber: 1,
                  status: gate5Evaluation.status,
                  summary: gate5Evaluation.summary,
                  evidence: gate5Evaluation.evidence,
                  failure: gate5Evaluation.failure,
                  repairInstructions: gate5Evaluation.repairInstructions,
                  startedAt: gate5StartedAt.toISOString(),
                  completedAt: gate5CompletedAt.toISOString(),
                },
                {
                  generationPlan: generationPlanWithBrowserAcceptancePlan,
                  buildGateResults: (gate5Result, nowIso) =>
                    this.buildRunnerGateResults(
                      app,
                      [
                        ...(gate0Result ? [gate0Result] : []),
                        ...(gate1Result ? [gate1Result] : []),
                        ...(gate2Result ? [gate2Result] : []),
                        ...(gate3Result ? [gate3Result] : []),
                        ...(gate4Result ? [gate4Result] : []),
                        gate5Result,
                      ],
                      nowIso,
                    ),
                },
              );

              producedGateRuns.push(gate5RunResult.gateRun);
              latestApp = gate5RunResult.app;
              completedAt = gate5CompletedAt;

              if (gate5Evaluation.status === 'failed') {
                finalFailureReason =
                  gate5Evaluation.failure?.message ??
                  'Gate 5 浏览器验收门禁失败，不能继续执行 Gate 6-7。';
                completedSummary =
                  '门禁运行器完成 Gate 0、Gate 1、Gate 2、Gate 3 和 Gate 4，但 Gate 5 browser acceptance plan 或执行器检查失败；Gate 6-7 未执行，当前应用保持不可发布。';
              } else {
                const independentVerificationPlan =
                  this.buildIndependentVerificationPlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                    latestApp.gateResults,
                    this.gate6IndependentVerifierRunner.getExecutionLevel(),
                  );
                const generationPlanWithIndependentVerificationPlan: GeneratedAppGenerationPlan =
                  {
                    ...generationPlanWithBrowserAcceptancePlan,
                    independentVerificationPlan,
                  };
                let gate6Evaluation =
                  this.evaluateGate6IndependentVerificationPlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                    latestApp.gateResults,
                    independentVerificationPlan,
                  );
                if (gate6Evaluation.status === 'passed') {
                  gate6Evaluation = this.gate6IndependentVerifierRunner.run({
                    appSpec: app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                    gateResults: latestApp.gateResults,
                    independentVerificationPlan,
                  });
                }
                const gate5Result = latestApp.gateResults.find(
                  (gate) => gate.gateId === 'gate-5',
                );
                const gate6StartedAt = new Date();
                const gate6CompletedAt = new Date();
                const gate6AppSnapshot: GeneratedApp = {
                  ...app,
                  gateResults: latestApp.gateResults,
                  generationPlan: latestApp.generationPlan,
                };
                const gate6RunResult = await this.createGateRunAndUpdateApp(
                  tenantId,
                  userId,
                  gate6AppSnapshot,
                  {
                    gateId: 'gate-6',
                    generationRunId: run.id,
                    attemptNumber: 1,
                    status: gate6Evaluation.status,
                    summary: gate6Evaluation.summary,
                    evidence: gate6Evaluation.evidence,
                    failure: gate6Evaluation.failure,
                    repairInstructions: gate6Evaluation.repairInstructions,
                    startedAt: gate6StartedAt.toISOString(),
                    completedAt: gate6CompletedAt.toISOString(),
                  },
                  {
                    generationPlan:
                      generationPlanWithIndependentVerificationPlan,
                    buildGateResults: (gate6Result, nowIso) =>
                      this.buildRunnerGateResults(
                        app,
                        [
                          ...(gate0Result ? [gate0Result] : []),
                          ...(gate1Result ? [gate1Result] : []),
                          ...(gate2Result ? [gate2Result] : []),
                          ...(gate3Result ? [gate3Result] : []),
                          ...(gate4Result ? [gate4Result] : []),
                          ...(gate5Result ? [gate5Result] : []),
                          gate6Result,
                        ],
                        nowIso,
                      ),
                  },
                );

                producedGateRuns.push(gate6RunResult.gateRun);
                latestApp = gate6RunResult.app;
                completedAt = gate6CompletedAt;

                if (gate6Evaluation.status === 'failed') {
                  finalFailureReason =
                    gate6Evaluation.failure?.message ??
                    'Gate 6 独立审查计划或执行器失败，不能继续执行 Gate 7。';
                  completedSummary =
                    '门禁运行器完成 Gate 0、Gate 1、Gate 2、Gate 3、Gate 4 和 Gate 5，但 Gate 6 independent verifier 计划或执行器失败；当前应用保持不可发布。';
                } else {
                  const publishCandidatePlan = this.buildPublishCandidatePlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                    independentVerificationPlan,
                    latestApp.gateResults,
                    this.gate7PublishCandidateRunner.getExecutionLevel(),
                  );
                  const generationPlanWithPublishCandidatePlan: GeneratedAppGenerationPlan =
                    {
                      ...generationPlanWithIndependentVerificationPlan,
                      publishCandidatePlan,
                    };
                  let gate7Evaluation = this.evaluateGate7PublishCandidatePlan(
                    app.appSpec,
                    generationPlan,
                    staticContracts,
                    buildUnitPlan,
                    integrationPlan,
                    browserAcceptancePlan,
                    independentVerificationPlan,
                    latestApp.gateResults,
                    publishCandidatePlan,
                  );
                  if (gate7Evaluation.status === 'passed') {
                    gate7Evaluation = this.gate7PublishCandidateRunner.run({
                      appSpec: app.appSpec,
                      generationPlan,
                      staticContracts,
                      buildUnitPlan,
                      integrationPlan,
                      browserAcceptancePlan,
                      independentVerificationPlan,
                      gateResults: latestApp.gateResults,
                      publishCandidatePlan,
                    });
                  }
                  const gate6Result = latestApp.gateResults.find(
                    (gate) => gate.gateId === 'gate-6',
                  );
                  const gate7StartedAt = new Date();
                  const gate7CompletedAt = new Date();
                  const gate7AppSnapshot: GeneratedApp = {
                    ...app,
                    gateResults: latestApp.gateResults,
                    generationPlan: latestApp.generationPlan,
                  };
                  const gate7RunResult = await this.createGateRunAndUpdateApp(
                    tenantId,
                    userId,
                    gate7AppSnapshot,
                    {
                      gateId: 'gate-7',
                      generationRunId: run.id,
                      attemptNumber: 1,
                      status: gate7Evaluation.status,
                      summary: gate7Evaluation.summary,
                      evidence: gate7Evaluation.evidence,
                      failure: gate7Evaluation.failure,
                      repairInstructions: gate7Evaluation.repairInstructions,
                      startedAt: gate7StartedAt.toISOString(),
                      completedAt: gate7CompletedAt.toISOString(),
                    },
                    {
                      generationPlan: generationPlanWithPublishCandidatePlan,
                      buildGateResults: (gate7Result, nowIso) =>
                        this.buildRunnerGateResults(
                          app,
                          [
                            ...(gate0Result ? [gate0Result] : []),
                            ...(gate1Result ? [gate1Result] : []),
                            ...(gate2Result ? [gate2Result] : []),
                            ...(gate3Result ? [gate3Result] : []),
                            ...(gate4Result ? [gate4Result] : []),
                            ...(gate5Result ? [gate5Result] : []),
                            ...(gate6Result ? [gate6Result] : []),
                            gate7Result,
                          ],
                          nowIso,
                        ),
                    },
                  );

                  producedGateRuns.push(gate7RunResult.gateRun);
                  latestApp = gate7RunResult.app;
                  completedAt = gate7CompletedAt;
                  if (gate7Evaluation.status === 'passed') {
                    latestApp = await this.ensureGeneratedWorkflowEditorBinding(
                      tenantId,
                      userId,
                      latestApp,
                      run.id,
                    );
                    completedStatus = 'passed';
                    finalFailureReason = null;
                    completedSummary =
                      '门禁运行器完成 Gate 0-7；Gate 7 real-local publish candidate contract runner 已签收 release manifest contract、artifact checksum placeholders、Gate 0-6 evidence citations 和 deferred public-share controls，当前应用进入 publish_candidate，但不会自动发布或创建 public share token。';
                  } else {
                    finalFailureReason =
                      gate7Evaluation.failure?.message ??
                      GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON;
                    completedSummary = this.buildGate7CompletedRunSummary(
                      buildUnitPlan,
                      integrationPlan,
                      browserAcceptancePlan,
                      independentVerificationPlan,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    const [completedRun] = await this.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set({
        status: completedStatus,
        summary: completedSummary,
        failureReason: finalFailureReason,
        completedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, run.id),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .returning();

    if (!completedRun) {
      throw new GeneratedAppGenerationRunNotFoundException(run.id);
    }

    return {
      generationRun: this.toGenerationRunResponseDto(completedRun),
      gateRuns: producedGateRuns,
      app: latestApp,
    };
  }

  async updateGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
    dto: UpdateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    const parsed = UpdateGeneratedAppGenerationRunSchema.parse(dto);
    const updatePayload: Partial<schema.NewGeneratedAppGenerationRun> = {
      updatedAt: new Date(),
    };

    if (parsed.status !== undefined) {
      updatePayload.status = parsed.status;
    }

    if (parsed.summary !== undefined) {
      updatePayload.summary = parsed.summary;
    }

    if (parsed.failureReason !== undefined) {
      updatePayload.failureReason = parsed.failureReason;
    }

    if (parsed.startedAt !== undefined) {
      updatePayload.startedAt = new Date(parsed.startedAt);
    }

    if (parsed.completedAt !== undefined) {
      updatePayload.completedAt =
        parsed.completedAt === null ? null : new Date(parsed.completedAt);
    }

    const [updated] = await this.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppGenerationRunNotFoundException(runId);
    }

    return this.toGenerationRunResponseDto(updated);
  }

  async listRepairAttempts(
    tenantId: string,
    appId: string,
    runId: string,
    query: QueryGeneratedAppRepairAttemptsDtoType,
  ): Promise<{
    data: GeneratedAppRepairAttemptResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
      eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
      eq(schema.generatedAppRepairAttempts.generationRunId, runId),
    ];

    if (query.status) {
      baseFilters.push(
        eq(schema.generatedAppRepairAttempts.status, query.status),
      );
    }

    if (query.targetGateId) {
      baseFilters.push(
        eq(schema.generatedAppRepairAttempts.targetGateId, query.targetGateId),
      );
    }

    const filters = and(...baseFilters);
    const [attempts, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppRepairAttempts)
        .where(filters)
        .orderBy(desc(schema.generatedAppRepairAttempts.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppRepairAttempts)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: attempts.map((attempt) => this.toRepairAttemptResponseDto(attempt)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createRepairAttempt(
    tenantId: string,
    userId: string,
    appId: string,
    runId: string,
    dto: CreateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    await this.findGenerationRunRecord(tenantId, appId, runId);
    const parsed = CreateGeneratedAppRepairAttemptSchema.parse(dto);
    const startedAt = parsed.startedAt
      ? new Date(parsed.startedAt)
      : new Date();
    const completedAt =
      parsed.completedAt === undefined
        ? null
        : parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt);

    const [attempt] = await this.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId,
        generatedAppId: appId,
        generationRunId: runId,
        attemptNumber: parsed.attemptNumber,
        targetGateId: parsed.targetGateId,
        status: parsed.status,
        failureSummary: parsed.failureSummary,
        changeSummary: parsed.changeSummary ?? null,
        verificationSummary: parsed.verificationSummary ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    return this.toRepairAttemptResponseDto(attempt);
  }

  async updateRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
    dto: UpdateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    const parsed = UpdateGeneratedAppRepairAttemptSchema.parse(dto);
    const updatePayload: Partial<schema.NewGeneratedAppRepairAttempt> = {
      updatedAt: new Date(),
    };

    if (parsed.status !== undefined) {
      updatePayload.status = parsed.status;
    }

    if (parsed.failureSummary !== undefined) {
      updatePayload.failureSummary = parsed.failureSummary;
    }

    if (parsed.changeSummary !== undefined) {
      updatePayload.changeSummary = parsed.changeSummary;
    }

    if (parsed.verificationSummary !== undefined) {
      updatePayload.verificationSummary = parsed.verificationSummary;
    }

    if (parsed.startedAt !== undefined) {
      updatePayload.startedAt = new Date(parsed.startedAt);
    }

    if (parsed.completedAt !== undefined) {
      updatePayload.completedAt =
        parsed.completedAt === null ? null : new Date(parsed.completedAt);
    }

    const [updated] = await this.tenantDb
      .update(schema.generatedAppRepairAttempts)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
          eq(schema.generatedAppRepairAttempts.generationRunId, runId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }

    return this.toRepairAttemptResponseDto(updated);
  }

  async listGateRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGateRunsDtoType,
  ): Promise<{
    data: GeneratedAppGateRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppGateRuns.tenantId, tenantId),
      eq(schema.generatedAppGateRuns.generatedAppId, appId),
    ];

    if (query.gateId) {
      baseFilters.push(eq(schema.generatedAppGateRuns.gateId, query.gateId));
    }

    if (query.status) {
      baseFilters.push(eq(schema.generatedAppGateRuns.status, query.status));
    }

    if (query.generationRunId) {
      baseFilters.push(
        eq(schema.generatedAppGateRuns.generationRunId, query.generationRunId),
      );
    }

    if (query.repairAttemptId) {
      baseFilters.push(
        eq(schema.generatedAppGateRuns.repairAttemptId, query.repairAttemptId),
      );
    }

    const filters = and(...baseFilters);
    const [gateRuns, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppGateRuns)
        .where(filters)
        .orderBy(desc(schema.generatedAppGateRuns.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppGateRuns)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: gateRuns.map((gateRun) => this.toGateRunResponseDto(gateRun)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async recordGateRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGateRunDtoType,
  ): Promise<RecordGeneratedAppGateRunResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = CreateGeneratedAppGateRunSchema.parse(dto);
    await this.assertGateRunLinks(tenantId, appId, parsed);

    return this.createGateRunAndUpdateApp(tenantId, userId, app, parsed);
  }

  async enablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.activatePublicShare(tenantId, userId, app, {
      forceNewToken: false,
    });
  }

  async regeneratePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.activatePublicShare(tenantId, userId, app, {
      forceNewToken: true,
    });
  }

  async disablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const status = this.resolveStatusForShareDisabled(app.readiness);

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        status,
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return this.toResponseDto(updated);
  }

  async getPublicApp(token: string): Promise<PublicGeneratedAppResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const publicAppSpec = buildPublicGeneratedAppRuntimeSpec({
      appSpec: app.appSpec,
      pages: this.getPublicRuntimePages(app.appSpec),
    });
    const publicDescription = buildPublicGeneratedAppRuntimeDescription({
      appSpec: app.appSpec,
      description: app.description,
    });

    await this.db
      .update(schema.generatedApps)
      .set({
        publicViewCount: sql`${schema.generatedApps.publicViewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.generatedApps.id, app.id));

    return {
      token,
      appId: app.id,
      title: publicAppSpec.appName,
      description: publicDescription,
      dataUseNotice:
        '你在此公开应用中提交的内容、运行结果和最终报告会被保存，并提供给应用创建者查看。',
      appSpec: publicAppSpec,
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: app.preview.previewUrl,
      },
      runtimeForm: buildGeneratedAppRuntimeForm({
        appSpec: app.appSpec,
        generationPlan: app.generationPlan,
        description: app.description,
      }),
      createdAt: app.createdAt,
    };
  }

  async createPublicSubmission(
    token: string,
    dto: CreateGeneratedAppSubmissionDtoType,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const anonymousSessionId = this.normalizePublicAnonymousSessionId(
      dto.anonymousSessionId,
    );
    const now = new Date();
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app,
      input: dto.input ?? {},
      now,
    });

    const [submission] = await this.db
      .insert(schema.generatedAppSubmissions)
      .values({
        tenantId: app.tenantId,
        generatedAppId: app.id,
        appSpecVersion: app.appSpec.version,
        publicShareToken: token,
        anonymousSessionId,
        status: evaluation.status,
        input: evaluation.input,
        result: evaluation.result,
        report: evaluation.report,
        errorMessage: evaluation.errorMessage,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.toPublicSubmissionResponseDto(submission);
  }

  async getPublicSubmission(
    token: string,
    submissionId: string,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const [submission] = await this.db
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.generatedAppId, app.id),
          eq(schema.generatedAppSubmissions.publicShareToken, token),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return this.toPublicSubmissionResponseDto(submission);
  }

  async listSubmissions(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppSubmissionsDtoType,
  ): Promise<{
    data: GeneratedAppSubmissionResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppSubmissions.tenantId, tenantId),
      eq(schema.generatedAppSubmissions.generatedAppId, appId),
      isNull(schema.generatedAppSubmissions.deletedAt),
    ];
    const filters = query.status
      ? and(
          ...baseFilters,
          eq(schema.generatedAppSubmissions.status, query.status),
        )
      : and(...baseFilters);

    const [submissions, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppSubmissions)
        .where(filters)
        .orderBy(desc(schema.generatedAppSubmissions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppSubmissions)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: submissions.map((submission) =>
        this.toSubmissionResponseDto(submission),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmissionResponseDto> {
    const submission = await this.findSubmissionRecord(
      tenantId,
      appId,
      submissionId,
    );

    return this.toSubmissionResponseDto(submission);
  }

  async deleteSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const [deleted] = await this.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    if (!deleted) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return { deletedCount: 1 };
  }

  async deleteSubmissions(
    tenantId: string,
    appId: string,
    dto: DeleteGeneratedAppSubmissionsDtoType,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const ids = [...new Set(dto.ids)];
    const deleted = await this.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          inArray(schema.generatedAppSubmissions.id, ids),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    return { deletedCount: deleted.length };
  }

  assertCanEnablePublicShare(app: Pick<GeneratedApp, 'id' | 'readiness'>) {
    if (
      app.readiness.state !== 'publish_candidate' ||
      !app.readiness.canCreatePublicShare
    ) {
      throw new GeneratedAppPublicShareNotReadyException(
        app.id,
        app.readiness.summary,
      );
    }
  }

  private normalizePublicAnonymousSessionId(value: string | undefined): string {
    const trimmed = value?.trim();

    if (!trimmed) {
      return crypto.randomUUID();
    }

    if (
      PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN.test(trimmed) ||
      PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN.test(trimmed)
    ) {
      return crypto.randomUUID();
    }

    return trimmed;
  }

  private async assertGateRunLinks(
    tenantId: string,
    appId: string,
    parsed: CreateGeneratedAppGateRunDtoType,
  ) {
    const gateDefinition = getGeneratedAppGateDefinition(parsed.gateId);

    if (!gateDefinition) {
      throw new GeneratedAppGateDefinitionNotFoundException(parsed.gateId);
    }

    if (parsed.generationRunId) {
      await this.findGenerationRunRecord(
        tenantId,
        appId,
        parsed.generationRunId,
      );
    }

    if (parsed.repairAttemptId) {
      const repairAttempt = await this.findRepairAttemptRecord(
        tenantId,
        appId,
        parsed.repairAttemptId,
      );

      if (
        parsed.generationRunId &&
        repairAttempt.generationRunId !== parsed.generationRunId
      ) {
        throw new GeneratedAppRepairAttemptNotFoundException(
          parsed.repairAttemptId,
        );
      }
    }
  }

  private async createGateRunAndUpdateApp(
    tenantId: string,
    userId: string,
    app: GeneratedApp,
    parsed: CreateGeneratedAppGateRunDtoType,
    options: {
      buildGateResults?: (
        gateResult: GeneratedAppGateResult,
        nowIso: string,
      ) => GeneratedAppGateResult[];
      generationPlan?: GeneratedAppGenerationPlan | null;
    } = {},
  ): Promise<RecordGeneratedAppGateRunResponseDto> {
    const gateDefinition = getGeneratedAppGateDefinition(parsed.gateId);

    if (!gateDefinition) {
      throw new GeneratedAppGateDefinitionNotFoundException(parsed.gateId);
    }

    const now = new Date();
    const startedAt = parsed.startedAt ? new Date(parsed.startedAt) : now;
    const completedAt =
      parsed.completedAt !== undefined
        ? parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt)
        : parsed.status === 'running'
          ? null
          : now;

    const [gateRun] = await this.tenantDb
      .insert(schema.generatedAppGateRuns)
      .values({
        tenantId,
        generatedAppId: app.id,
        generationRunId: parsed.generationRunId ?? null,
        repairAttemptId: parsed.repairAttemptId ?? null,
        gateId: gateDefinition.gateId,
        gateOrder: gateDefinition.order,
        gateName: gateDefinition.name,
        blocking: gateDefinition.blocking,
        attemptNumber: parsed.attemptNumber,
        status: parsed.status,
        summary: parsed.summary,
        evidence: parsed.evidence,
        failure: parsed.failure ?? null,
        repairInstructions: parsed.repairInstructions ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    const updatedAt = completedAt ?? now;
    const gateResult: GeneratedAppGateResult = {
      gateId: gateDefinition.gateId,
      order: gateDefinition.order,
      name: gateDefinition.name,
      blocking: gateDefinition.blocking,
      status: parsed.status,
      summary: parsed.summary,
      evidence: parsed.evidence,
      updatedAt: updatedAt.toISOString(),
    };
    const gateResults =
      options.buildGateResults?.(gateResult, updatedAt.toISOString()) ??
      normalizeGeneratedAppGateResults([
        ...app.gateResults.filter((gate) => gate.gateId !== gateResult.gateId),
        gateResult,
      ]);
    const updatePayload = this.buildGateResultsUpdatePayload(
      userId,
      gateResults,
      {
        generationPlan: options.generationPlan,
        currentGenerationPlan: options.generationPlan ?? app.generationPlan,
      },
    );

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedApps.id, app.id),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(app.id);
    }

    return {
      gateRun: this.toGateRunResponseDto(gateRun),
      app: this.toResponseDto(updated),
    };
  }

  private async ensureGeneratedWorkflowEditorBinding(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
    generationRunId: string,
  ): Promise<GeneratedAppResponseDto> {
    if (app.workflowDefinitionId) {
      return app;
    }

    const existingWorkflow = await this.findGeneratedWorkflowEditorBinding(
      tenantId,
      app.id,
    );
    const workflowDefinitionId =
      existingWorkflow?.id ??
      (await this.createGeneratedWorkflowEditorBinding(
        tenantId,
        userId,
        app,
        generationRunId,
      ));

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        workflowDefinitionId,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedApps.id, app.id),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(app.id);
    }

    return this.toResponseDto(updated);
  }

  private async findGeneratedWorkflowEditorBinding(
    tenantId: string,
    appId: string,
  ): Promise<{ id: string } | null> {
    const [workflow] = await this.tenantDb
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.tenantId, tenantId),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'source'`,
            GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE,
          ),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'generatedAppId'`,
            appId,
          ),
        ),
      )
      .limit(1);

    return workflow ?? null;
  }

  private async createGeneratedWorkflowEditorBinding(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
    generationRunId: string,
  ): Promise<string> {
    let slug = generateSlug(`${app.appName}-generated-editor-draft`);

    for (let attempt = 0; attempt <= 5; attempt += 1) {
      try {
        const [workflow] = await this.tenantDb
          .insert(schema.workflowDefinitions)
          .values({
            tenantId,
            name: `${app.appName} - 生成应用编辑草稿`,
            slug,
            description:
              '由 Generated App 自动生成流程创建的专业编辑器草稿入口。该 Workflow 仅用于创建者继续精修，不代表已发布或已在公开 runtime 中执行。',
            icon: 'WandSparkles',
            nodes: this.buildGeneratedWorkflowEditorNodes(app),
            edges: this.buildGeneratedWorkflowEditorEdges(),
            viewport: { x: 0, y: 0, zoom: 0.85 },
            metadata: {
              source: GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE,
              generatedAppId: app.id,
              generationRunId,
              appSpecVersion: app.appSpec.version,
              bindingKind: 'editor-handoff-draft',
              publishBoundary:
                'draft-only: this binding does not publish, execute, or enable public sharing by itself',
              publicRuntimeBoundary:
                'Generated App public runtime never exposes this internal resource id',
              createdFromGate: 'gate-7',
              createdAt: new Date().toISOString(),
            },
            inputSchema: this.buildGeneratedWorkflowInputSchema(app),
            status: 'draft',
            createdBy: userId,
            updatedBy: userId,
          })
          .returning({ id: schema.workflowDefinitions.id });

        if (!workflow) {
          throw new Error(
            'Generated workflow editor binding insert returned no row',
          );
        }

        return workflow.id;
      } catch (error: unknown) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === 5) {
          throw error;
        }

        const existingWorkflow = await this.findGeneratedWorkflowEditorBinding(
          tenantId,
          app.id,
        );

        if (existingWorkflow) {
          return existingWorkflow.id;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: generated workflow slug retry exhausted');
  }

  private buildGeneratedWorkflowEditorNodes(
    app: GeneratedAppResponseDto,
  ): schema.ReactFlowNode[] {
    const promptText = [
      `Generated App: ${app.appName}`,
      `App ID: ${app.id}`,
      `AppSpec v${app.appSpec.version}`,
      '',
      app.appSpec.summary,
      '',
      '此草稿用于在现有 Workflow 编辑器中继续精修生成应用的编排。当前公开 runtime 仍使用 Generated App deterministic runtime，不会自动执行此草稿 Workflow。',
    ].join('\n');

    return [
      {
        id: 'generated-app-manual-trigger',
        type: 'trigger',
        position: { x: 0, y: 80 },
        data: {
          label: '生成应用输入',
          nodeType: 'manual-trigger',
          category: 'trigger',
          description: '创建者在专业编辑器中继续精修时使用的手动入口。',
          config: {},
          inputPorts: [],
          outputPorts: [
            this.createWorkflowPort('exec-out', '', 'output', 'exec'),
            this.createWorkflowPort(
              'payload-out',
              '触发数据',
              'output',
              'json',
            ),
          ],
        },
      },
      {
        id: 'generated-app-handoff-note',
        type: 'output',
        position: { x: 360, y: 0 },
        data: {
          label: '生成应用交接说明',
          nodeType: 'text',
          category: 'output',
          description:
            '说明该资源绑定是 editor handoff draft，而非已发布资源。',
          config: {
            text: promptText,
          },
          inputPorts: [],
          outputPorts: [
            this.createWorkflowPort('text-out', '文本', 'output', 'text', {
              multiple: true,
              maxConnections: null,
            }),
          ],
        },
      },
      {
        id: 'generated-app-draft-output',
        type: 'output',
        position: { x: 720, y: 80 },
        data: {
          label: '草稿输出',
          nodeType: 'text-output',
          category: 'output',
          description: '用于承接精修后的应用报告或输出。',
          config: {},
          inputPorts: [
            this.createWorkflowPort('exec-in', '', 'input', 'exec'),
            this.createWorkflowPort('content-in', '文本', 'input', 'text'),
          ],
          outputPorts: [],
        },
      },
    ];
  }

  private buildGeneratedWorkflowEditorEdges(): schema.ReactFlowEdge[] {
    return [
      {
        id: 'generated-app-trigger-to-output-exec',
        source: 'generated-app-manual-trigger',
        target: 'generated-app-draft-output',
        sourceHandle: 'exec-out',
        targetHandle: 'exec-in',
        type: 'smart',
      },
      {
        id: 'generated-app-note-to-output-text',
        source: 'generated-app-handoff-note',
        target: 'generated-app-draft-output',
        sourceHandle: 'text-out',
        targetHandle: 'content-in',
        type: 'smart',
      },
    ];
  }

  private createWorkflowPort(
    id: string,
    label: string,
    direction: 'input' | 'output',
    dataType: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id,
      label,
      direction,
      dataType,
      required: false,
      multiple: false,
      maxConnections: direction === 'input' ? 1 : null,
      ...overrides,
    };
  }

  private buildGeneratedWorkflowInputSchema(
    app: GeneratedAppResponseDto,
  ): WorkflowInputSchema {
    return {
      version: 1,
      collectionMode: 'form',
      fields: [
        {
          id: 'generatedAppInput',
          label: '生成应用输入',
          type: 'text',
          required: true,
          description: app.appSpec.userGoal,
          collectionHint: 'form',
        },
      ],
    };
  }

  private buildRunnerGateResults(
    app: GeneratedApp,
    executedGateResults: GeneratedAppGateResult[],
    nowIso: string,
  ): GeneratedAppGateResult[] {
    const initialGateResults = createInitialGeneratedAppGateResults(nowIso);
    const canonicalGateIds = new Set(
      initialGateResults.map((gate) => gate.gateId),
    );
    const executedByGateId = new Map(
      executedGateResults.map((gate) => [gate.gateId, gate]),
    );
    const extensionGateResults = app.gateResults.filter(
      (gate) => !canonicalGateIds.has(gate.gateId),
    );

    return normalizeGeneratedAppGateResults(
      [
        ...initialGateResults.map(
          (gate) => executedByGateId.get(gate.gateId) ?? gate,
        ),
        ...extensionGateResults,
      ],
      nowIso,
    );
  }

  private buildGenerationPlan(
    appSpec: GeneratedAppSpec,
  ): GeneratedAppGenerationPlan {
    const allRequirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const allScenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const allPageIds = appSpec.pages.map((page) => page.id);
    const scenarioIdsByRequirementId = new Map<string, string[]>();

    for (const requirement of appSpec.coreRequirements) {
      const traceEntry = appSpec.traceability.find(
        (entry) => entry.requirementId === requirement.id,
      );
      const scenarioIds =
        traceEntry?.scenarioIds.filter((scenarioId) =>
          allScenarioIds.includes(scenarioId),
        ) ??
        appSpec.acceptanceScenarios
          .filter((scenario) =>
            scenario.requirementIds.includes(requirement.id),
          )
          .map((scenario) => scenario.id);

      scenarioIdsByRequirementId.set(requirement.id, scenarioIds);
    }

    return {
      planVersion: 1,
      appSpecVersion: appSpec.version,
      frontend: {
        stack: 'react-vite-agentloom-runtime',
        runtimeSurface: {
          kind: 'generated-app',
          publicAccess: 'private-token-after-gates',
          dataUseNoticeRequired: appSpec.dataPolicy.publicSubmissionsPersisted,
        },
        pages: appSpec.pages.map((page) => ({
          pageId: page.id,
          name: page.name,
          purpose: page.purpose,
          route: this.buildPlanRoute(page.id),
          requirementIds: allRequirementIds,
          scenarioIds: allScenarioIds,
        })),
      },
      orchestration: {
        target: 'workflow',
        strategy: 'generated-workflow-with-agent-capability',
        inputContract: {
          source: 'public-runtime-submission',
          requiredFields: ['input'],
          scenarioIds: allScenarioIds,
        },
        outputContract: {
          destinations: ['public-runtime-report', 'creator-submission-detail'],
          reportRequired: true,
        },
        steps: appSpec.coreRequirements.map((requirement, index) => ({
          stepId: `step-${index + 1}-${this.buildPlanSegment(requirement.id)}`,
          label: `实现 ${requirement.id}`,
          purpose: requirement.text,
          requirementIds: [requirement.id],
          scenarioIds: scenarioIdsByRequirementId.get(requirement.id) ?? [],
        })),
      },
      pluginTools: {
        tools: [],
        emptyReason:
          '当前 AppSpec 未声明需要平台现有能力之外的私有插件或外部工具；后续 Gate 2-4 可在发现缺口时补充受控插件计划。',
        permissionPolicy: [
          '插件/工具必须显式声明权限。',
          '未通过 manifest、构建、签名、权限审计和 sandbox smoke test 前不得绑定到 Agent/Workflow。',
          '禁止隐式放开网络、存储、知识库或 LLM 权限。',
        ],
      },
      dataPersistence: {
        publicSubmissionsPersisted:
          appSpec.dataPolicy.publicSubmissionsPersisted,
        creatorCanDeleteSubmissions:
          appSpec.dataPolicy.creatorCanDeleteSubmissions,
        endUserLoginRequired: appSpec.dataPolicy.endUserLoginRequired,
        tenantScoped: true,
        tokenSnapshotRequired: true,
        softDeleteRequired: true,
      },
      testGates: {
        blockingGateIds: [
          'gate-2',
          'gate-3',
          'gate-4',
          'gate-5',
          'gate-6',
          'gate-7',
        ],
        gatePlan: [
          {
            gateId: 'gate-2',
            purpose:
              '校验前端类型、API contract、Agent/Workflow 图 schema、DAG、端口兼容和插件 manifest。',
            evidenceKind: 'static_check',
          },
          {
            gateId: 'gate-3',
            purpose:
              '执行前端构建、单元测试、组件测试、插件构建和 golden tests。',
            evidenceKind: 'build',
          },
          {
            gateId: 'gate-4',
            purpose:
              '运行生成应用与 Agent/Workflow dry-run、插件 WASM/Extism sandbox smoke test。',
            evidenceKind: 'test',
          },
          {
            gateId: 'gate-5',
            purpose:
              '用浏览器自动化覆盖核心 acceptance scenarios、console 和 network 失败检查。',
            evidenceKind: 'browser',
          },
          {
            gateId: 'gate-6',
            purpose: '独立 verifier 审查 AppSpec、计划、证据矩阵与运行结果。',
            evidenceKind: 'verifier',
          },
          {
            gateId: 'gate-7',
            purpose:
              '确认所有阻断门禁通过且无 warning 后才形成 publish candidate。',
            evidenceKind: 'manual',
          },
        ],
        acceptanceScenarioIds: allScenarioIds,
      },
      traceability: appSpec.coreRequirements.map((requirement) => ({
        requirementId: requirement.id,
        scenarioIds: scenarioIdsByRequirementId.get(requirement.id) ?? [],
        pageIds: allPageIds,
        orchestrationStepIds: [
          `step-${
            appSpec.coreRequirements.findIndex(
              (candidate) => candidate.id === requirement.id,
            ) + 1
          }-${this.buildPlanSegment(requirement.id)}`,
        ],
        planEvidenceIds: [
          'gate-1-frontend-plan',
          'gate-1-orchestration-plan',
          'gate-1-plugin-tool-plan',
          'gate-1-data-persistence-plan',
          'gate-1-test-gate-plan',
        ],
      })),
    };
  }

  private buildStaticContracts(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
  ): GeneratedAppStaticContracts {
    const orchestrationNodes = generationPlan.orchestration.steps.map(
      (step) => ({
        nodeId: `node-${this.buildPlanSegment(step.stepId)}`,
        stepId: step.stepId,
        label: step.label,
        requirementIds: step.requirementIds,
        scenarioIds: step.scenarioIds,
        inputHandle: 'input',
        outputHandle: 'output',
      }),
    );

    return {
      contractVersion: 1,
      appSpecVersion: appSpec.version,
      generationPlanVersion: generationPlan.planVersion,
      publicRuntime: {
        input: {
          source: generationPlan.orchestration.inputContract.source,
          requiredFields:
            generationPlan.orchestration.inputContract.requiredFields,
          scenarioIds: generationPlan.orchestration.inputContract.scenarioIds,
          dataUseNoticeRequired:
            generationPlan.frontend.runtimeSurface.dataUseNoticeRequired,
          anonymousSessionRequired: true,
          endUserLoginRequired: appSpec.dataPolicy.endUserLoginRequired,
        },
        output: {
          destinations:
            generationPlan.orchestration.outputContract.destinations,
          reportRequired:
            generationPlan.orchestration.outputContract.reportRequired,
          errorStateRequired: true,
        },
      },
      frontendRoutes: generationPlan.frontend.pages.map((page) => ({
        pageId: page.pageId,
        name: page.name,
        route: page.route,
        requirementIds: page.requirementIds,
        scenarioIds: page.scenarioIds,
      })),
      orchestration: {
        target: generationPlan.orchestration.target,
        strategy: generationPlan.orchestration.strategy,
        inputContract: generationPlan.orchestration.inputContract,
        outputContract: generationPlan.orchestration.outputContract,
        nodes: orchestrationNodes,
        edges: orchestrationNodes.slice(1).map((node, index) => ({
          fromNodeId: orchestrationNodes[index]?.nodeId ?? node.nodeId,
          toNodeId: node.nodeId,
        })),
      },
      pluginToolPermissions: {
        tools: generationPlan.pluginTools.tools.map((tool) => ({
          toolId: tool.toolId,
          purpose: tool.purpose,
          requirementIds: tool.requirementIds,
          permissions: tool.permissionNotes,
          manifestRequired: true,
          sandboxSmokeTestRequired: true,
        })),
        emptyReason: generationPlan.pluginTools.emptyReason,
        permissionPolicy: generationPlan.pluginTools.permissionPolicy,
        implicitPermissionsAllowed: false,
      },
      submissionPersistence: {
        ...generationPlan.dataPersistence,
        fields: [
          'input',
          'result',
          'report',
          'errorMessage',
          'anonymousSessionId',
          'publicShareToken',
        ],
      },
      testEntry: {
        staticCheckCommand:
          'agentloom generated-app gate-2 static-contracts --deterministic',
        buildGateCommand: 'agentloom generated-app gate-3 build-and-unit',
        unitGateCommand: 'agentloom generated-app gate-3 unit-tests',
        integrationGateCommand: 'agentloom generated-app gate-4 integration',
        browserGateCommand: 'agentloom generated-app gate-5 browser-acceptance',
        verifierGateCommand:
          'agentloom generated-app gate-6 independent-verifier',
        publishCandidateGateCommand:
          'agentloom generated-app gate-7 publish-candidate',
        acceptanceScenarioIds: generationPlan.testGates.acceptanceScenarioIds,
        blockingGateIds: ['gate-3', 'gate-4', 'gate-5', 'gate-6', 'gate-7'],
      },
      traceability: generationPlan.traceability.map((entry) => ({
        requirementId: entry.requirementId,
        scenarioIds: entry.scenarioIds,
        pageIds: entry.pageIds,
        orchestrationNodeIds: entry.orchestrationStepIds.map(
          (stepId) => `node-${this.buildPlanSegment(stepId)}`,
        ),
        staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
      })),
    };
  }

  private evaluateGate2StaticContracts(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: unknown,
  ): Gate2Evaluation {
    const checks = this.buildGate2Checks(
      appSpec,
      generationPlan,
      staticContracts,
    );
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-2-${check.id}`,
      label: check.label,
      kind: 'static_check' as const,
      url: null,
      summary:
        check.issues.length === 0
          ? check.summary
          : `${check.summary} 缺口：${check.issues.join('；')}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'static-contracts-incomplete',
        message: `StaticContracts 静态合约检查失败：${failedChecks
          .map((check) => check.label)
          .join('、')}。`,
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
          'Gate 2 失败：staticContracts 未完整覆盖公开运行、前端路由、编排、插件权限、提交持久化、测试入口或 traceability。',
        evidence,
        failure,
        repairInstructions:
          '修复 generationPlan.staticContracts，使其覆盖 public runtime 输入输出、frontend route/page、Workflow/Agent 编排、插件/工具权限、submission persistence、Gate 3-7 测试入口和每条核心需求 traceability。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 2 通过：staticContracts 已覆盖公开运行输入输出、前端路由、Workflow/Agent 编排、插件权限、提交持久化、测试入口和需求 traceability。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildBuildUnitPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    generationWorkspace?: GeneratedAppGenerationWorkspaceContract,
    commandPlan?: GeneratedAppGate3CommandPlan[],
    executionLevel?: GeneratedAppBuildUnitPlan['executionLevel'],
  ): GeneratedAppBuildUnitPlan {
    const requirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const scenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const routeIds = staticContracts.frontendRoutes.map(
      (route) => route.pageId,
    );
    const staticContractCoverage = GATE_2_STATIC_CONTRACT_IDS.map(
      (staticContractId) => ({
        staticContractId,
        coveredBy: [
          'gate-3-frontend-build-command',
          'gate-3-typecheck-command',
          'gate-3-unit-test-command',
        ],
      }),
    );
    const pluginBundleArtifacts = generationPlan.pluginTools.tools.map(
      (tool) => ({
        artifactId: `plugin-bundle-${tool.toolId}`,
        kind: 'plugin_bundle' as const,
        path: `artifacts/gate-3/plugins/${tool.toolId}.alp`,
        required: true,
      }),
    );

    const resolvedWorkspace =
      generationWorkspace ??
      this.gate3WorkspaceRunner.buildWorkspaceContract({
        tenantId: 'test-tenant',
        appId: 'test-app',
        generationRunId: 'test-run',
        appSpec,
        staticContracts,
      });
    const resolvedExecutionLevel =
      executionLevel ?? this.gate3WorkspaceRunner.getExecutionLevel();
    const resolvedCommandPlan =
      commandPlan ??
      this.gate3WorkspaceRunner.buildCommandPlan({
        workspace: resolvedWorkspace,
        requirementIds,
        scenarioIds,
      });
    const commandById = new Map(
      resolvedCommandPlan.map((command) => [command.commandId, command]),
    );
    const frontendBuildCommand =
      commandById.get('gate-3-frontend-build-command')?.command ??
      staticContracts.testEntry.buildGateCommand;
    const typecheckCommand =
      commandById.get('gate-3-typecheck-command')?.command ??
      'agentloom generated-app gate-3 typecheck';
    const unitTestCommand =
      commandById.get('gate-3-unit-test-command')?.command ??
      staticContracts.testEntry.unitGateCommand;
    const componentGoldenCommand =
      commandById.get('gate-3-component-golden-test-entry')?.command ??
      'agentloom generated-app gate-3 component-golden';

    return {
      planVersion: 1,
      appSpecVersion: appSpec.version,
      generationPlanVersion: generationPlan.planVersion,
      staticContractsVersion: staticContracts.contractVersion,
      executionLevel: resolvedExecutionLevel,
      generationWorkspace: resolvedWorkspace,
      commandPlan: resolvedCommandPlan.map((command) => ({
        commandId: command.commandId,
        command: command.command,
        workingDirectory: command.workingDirectory,
        requirementIds: command.requirementIds,
        scenarioIds: command.scenarioIds,
        producesArtifactIds: command.producesArtifactIds,
      })),
      frontendBuild: {
        command: frontendBuildCommand,
        workingDirectory: resolvedWorkspace.relativePath,
        routeIds,
        requirementIds,
        scenarioIds,
        expectedArtifacts: ['dist/index.html', 'dist/assets/manifest.json'],
      },
      typecheck: {
        command: typecheckCommand,
        tsconfigPath: 'tsconfig.generated-app.json',
        requirementIds,
      },
      unitTests: {
        command: unitTestCommand,
        entry: 'src/generated-app/__tests__/runtime.contract.spec.ts',
        requirementIds,
        scenarioIds,
      },
      componentGoldenTests: {
        command: componentGoldenCommand,
        entry: 'src/generated-app/__tests__/runtime.golden.spec.tsx',
        scenarioIds,
        goldenArtifactPath: 'artifacts/gate-3/component-golden-report.json',
      },
      artifactExpectations: [
        {
          artifactId: 'frontend-build-output',
          kind: 'frontend_build',
          path: 'dist/index.html',
          required: true,
        },
        {
          artifactId: 'unit-test-report',
          kind: 'unit_test_report',
          path: 'artifacts/gate-3/unit-test-report.json',
          required: true,
        },
        {
          artifactId: 'component-golden-report',
          kind: 'component_golden_report',
          path: 'artifacts/gate-3/component-golden-report.json',
          required: true,
        },
        {
          artifactId: 'coverage-report',
          kind: 'coverage_report',
          path: 'coverage/generated-app/coverage-summary.json',
          required: true,
        },
        ...pluginBundleArtifacts,
      ],
      staticContractsCoverage: staticContractCoverage,
      acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map(
        (scenario) => ({
          scenarioId: scenario.id,
          requirementIds: scenario.requirementIds,
          coveredBy: [
            'gate-3-unit-test-command',
            'gate-3-component-golden-test-entry',
          ],
        }),
      ),
      pluginBuildExpectations: {
        tools: generationPlan.pluginTools.tools.map((tool) => ({
          toolId: tool.toolId,
          command: `agentloom generated-app gate-3 plugin-build ${tool.toolId}`,
          manifestPath: `plugins/${tool.toolId}/agentloom.plugin.json`,
          artifactPath: `artifacts/gate-3/plugins/${tool.toolId}.alp`,
          goldenTestCommand: `agentloom generated-app gate-3 plugin-golden ${tool.toolId}`,
          requirementIds: tool.requirementIds,
        })),
        emptyReason:
          generationPlan.pluginTools.tools.length === 0
            ? '当前 generationPlan.pluginTools 未声明私有插件；Gate 3 不需要执行插件构建，但仍保留插件构建期望空原因。'
            : null,
      },
      failureCaptureFields: [
        ...GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS,
        'failedTestNames',
        'coverageSummary',
      ],
    };
  }

  private evaluateGate3BuildUnitPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: unknown,
  ): Gate3Evaluation {
    const checks = this.buildGate3Checks(
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
    );
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-3-${check.id}`,
      label: check.label,
      kind: (check.id.includes('test') ||
      check.id.includes('acceptance-scenario')
        ? 'test'
        : 'build') as GeneratedAppGateEvidence['kind'],
      url: null,
      summary:
        check.issues.length === 0
          ? `${check.summary} ${GATE_3_SKELETON_EVIDENCE_NOTE}`
          : `${check.summary} 缺口：${check.issues.join(
              '；',
            )} ${GATE_3_SKELETON_EVIDENCE_NOTE}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'build-unit-plan-incomplete',
        message: `BuildUnitPlan 构建与单元 skeleton 检查失败：${failedChecks
          .map((check) => check.label)
          .join('、')}。`,
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
          'Gate 3 失败：buildUnitPlan 未完整覆盖构建命令、类型检查、单元/组件/golden 测试、artifact 期望、插件构建期望、合约覆盖、场景覆盖或失败捕获字段。',
        evidence,
        failure,
        repairInstructions:
          '修复 generationPlan.buildUnitPlan，使其覆盖前端 build/typecheck/unit/component/golden 测试入口、artifact expectations、staticContracts coverage、acceptanceScenario coverage、插件构建期望和失败捕获字段；当前 Gate 3 仍只检查 contract-skeleton 合约，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildIntegrationPlan(
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
        `fixture-${this.buildPlanSegment(scenario.id)}`,
      ]),
    );
    const dryRunFixtures = appSpec.acceptanceScenarios.map<
      GeneratedAppIntegrationPlan['agentWorkflowDryRunExpectations']['fixtures'][number]
    >((scenario) => ({
      fixtureId:
        fixtureIdsByScenarioId.get(scenario.id) ??
        `fixture-${this.buildPlanSegment(scenario.id)}`,
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
    const pluginSmokeCheckIds = pluginSmokeTools.map(
      (tool) => tool.smokeCheckId,
    );
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
      acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map(
        (scenario) => ({
          scenarioId: scenario.id,
          requirementIds: scenario.requirementIds,
          coveredByCheckIds: [
            'gate-4-public-runtime-submit-input',
            'gate-4-agent-workflow-dry-run-fixture',
            ...pluginSmokeCheckIds,
          ],
          fixtureIds: [
            fixtureIdsByScenarioId.get(scenario.id) ??
              `fixture-${this.buildPlanSegment(scenario.id)}`,
          ],
        }),
      ),
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

  private evaluateGate4IntegrationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: unknown,
  ): Gate4Evaluation {
    const checks = this.buildGate4Checks(
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

  private buildBrowserAcceptancePlan(
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
        executionLevel === 'real-local-browser-contract'
          ? GATE_5_REAL_LOCAL_BROWSER_CONTRACT_NOTE
          : GATE_5_SKELETON_EVIDENCE_NOTE,
      browserToolPlan: {
        runner:
          executionLevel === 'browser-acceptance-skeleton'
            ? 'playwright'
            : 'local-browser-contract',
        command:
          executionLevel === 'browser-acceptance-skeleton'
            ? staticContracts.testEntry.browserGateCommand
            : GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND,
        testEntry:
          executionLevel === 'browser-acceptance-skeleton'
            ? 'tests/generated-app/browser-acceptance.spec.ts'
            : 'server-controlled-local-browser-contract',
        workingDirectory: 'generated-run',
        baseUrlShape:
          executionLevel === 'browser-acceptance-skeleton'
            ? 'http://localhost:{previewPort}/generated-apps/public/{publicShareAccess}'
            : 'local-contract://generated-app/public-runtime/{publicShareAccess}',
        publicShareAccessPlaceholder: '{publicShareAccessFromTestFixture}',
        usesRealTokens: false,
        scenarioIds,
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
      acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map(
        (scenario) => ({
          scenarioId: scenario.id,
          requirementIds: scenario.requirementIds,
          journeyIds: allJourneyIds,
          viewportIds: publicViewportIds,
          assertionIds: allAssertionIds,
          artifactIds: [...GATE_5_REQUIRED_ARTIFACT_IDS],
        }),
      ),
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

  private evaluateGate5BrowserAcceptancePlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: unknown,
  ): Gate5Evaluation {
    const checks = this.buildGate5Checks(
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
      browserAcceptancePlan,
    );
    const browserPlanRecord = this.isRecord(browserAcceptancePlan)
      ? browserAcceptancePlan
      : null;
    const gate5EvidenceNote =
      browserPlanRecord?.executionLevel === 'real-local-browser-contract'
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
        browserPlanRecord?.executionLevel === 'real-local-browser-contract'
          ? 'Gate 5 计划通过：browserAcceptancePlan 已完整覆盖 real-local browser-contract runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、artifact refs、覆盖矩阵、失败捕获字段和安全边界；将继续执行受控本地 browser contract runner。'
          : 'Gate 5 通过：browserAcceptancePlan 浏览器验收 skeleton/fixture 计划已完整覆盖 runner、桌面/移动视口、公开 runtime journeys、创建者管理 journeys、console/network/accessibility/responsive assertions、artifact refs、覆盖矩阵和失败捕获字段；fixture/skeleton 不代表真实 browser acceptance 执行。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildGate5Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: unknown,
  ): Gate5Check[] {
    if (!this.isRecord(browserAcceptancePlan)) {
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

    const browserToolPlan = this.getRecord(
      browserAcceptancePlan.browserToolPlan,
    );
    const viewportMatrix = this.getRecordArray(
      browserAcceptancePlan.viewportMatrix,
    );
    const publicRuntimeJourneys = this.getRecordArray(
      browserAcceptancePlan.publicRuntimeJourneys,
    );
    const creatorManagementJourneys = this.getRecordArray(
      browserAcceptancePlan.creatorManagementJourneys,
    );
    const consoleAssertions = this.getRecordArray(
      browserAcceptancePlan.consoleAssertions,
    );
    const networkAssertions = this.getRecordArray(
      browserAcceptancePlan.networkAssertions,
    );
    const accessibilityAssertions = this.getRecordArray(
      browserAcceptancePlan.accessibilityInteractionAssertions,
    );
    const responsiveAssertions = this.getRecordArray(
      browserAcceptancePlan.responsiveLayoutAssertions,
    );
    const allAssertions = [
      ...consoleAssertions,
      ...networkAssertions,
      ...accessibilityAssertions,
      ...responsiveAssertions,
    ];
    const artifactExpectations = this.getRecordArray(
      browserAcceptancePlan.artifactExpectations,
    );
    const acceptanceScenarioCoverage = this.getRecordArray(
      browserAcceptancePlan.acceptanceScenarioCoverage,
    );
    const requirementCoverage = this.getRecordArray(
      browserAcceptancePlan.requirementCoverage,
    );
    const journeyCoverage = this.getRecordArray(
      browserAcceptancePlan.journeyCoverage,
    );

    const viewportIds = viewportMatrix
      .map((viewport) => this.getNonEmptyString(viewport.viewportId))
      .filter((viewportId): viewportId is string => viewportId !== null);
    const knownViewportIds = new Set(viewportIds);
    const publicJourneyIds = publicRuntimeJourneys
      .map((journey) => this.getNonEmptyString(journey.journeyId))
      .filter((journeyId): journeyId is string => journeyId !== null);
    const creatorJourneyIds = creatorManagementJourneys
      .map((journey) => this.getNonEmptyString(journey.journeyId))
      .filter((journeyId): journeyId is string => journeyId !== null);
    const journeyIds = [...publicJourneyIds, ...creatorJourneyIds];
    const knownJourneyIds = new Set(journeyIds);
    const assertionIds = allAssertions
      .map((assertion) => this.getNonEmptyString(assertion.assertionId))
      .filter((assertionId): assertionId is string => assertionId !== null);
    const knownAssertionIds = new Set(assertionIds);
    const artifactIds = artifactExpectations
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const knownArtifactIds = new Set(artifactIds);
    const expectedPublicJourneyKinds = new Map<string, string>([
      ['gate-5-public-runtime-open', 'public_runtime_open'],
      ['gate-5-public-runtime-submit', 'public_runtime_interaction_submit'],
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
      [
        'gate-5-responsive-content-not-occluded',
        'viewport_content_not_occluded',
      ],
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
      ...(browserAcceptancePlan.buildUnitPlanVersion ===
      buildUnitPlan.planVersion
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
      ...(!this.getNonEmptyString(browserAcceptancePlan.skeletonDisclaimer)
        ? ['skeletonDisclaimer 缺失']
        : []),
    ];
    const expectedBrowserRunner =
      browserAcceptancePlan.executionLevel === 'browser-acceptance-skeleton'
        ? 'playwright'
        : 'local-browser-contract';
    const expectedBrowserCommand =
      browserAcceptancePlan.executionLevel === 'browser-acceptance-skeleton'
        ? staticContracts.testEntry.browserGateCommand
        : GATE_5_LOCAL_BROWSER_CONTRACT_COMMAND;
    const browserToolIssues = [
      ...this.requireRecord(browserToolPlan, 'browserToolPlan'),
      ...(browserToolPlan?.runner === expectedBrowserRunner
        ? []
        : [
            `browserToolPlan.runner 必须为 ${expectedBrowserRunner}，与 executionLevel=${String(
              browserAcceptancePlan.executionLevel,
            )} 匹配`,
          ]),
      ...(!this.getNonEmptyString(browserToolPlan?.command)
        ? ['browserToolPlan.command 缺失']
        : []),
      ...(this.getNonEmptyString(browserToolPlan?.command) ===
      expectedBrowserCommand
        ? []
        : [
            `browserToolPlan.command 必须为受控命令描述 ${expectedBrowserCommand}`,
          ]),
      ...(!this.getNonEmptyString(browserToolPlan?.testEntry)
        ? ['browserToolPlan.testEntry 缺失']
        : []),
      ...(!this.getNonEmptyString(browserToolPlan?.workingDirectory)
        ? ['browserToolPlan.workingDirectory 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'browserToolPlan.workingDirectory',
        this.getNonEmptyString(browserToolPlan?.workingDirectory),
      ),
      ...(browserAcceptancePlan.executionLevel !==
        'browser-acceptance-skeleton' &&
      this.getNonEmptyString(browserToolPlan?.workingDirectory) !==
        'generated-run'
        ? ['browserToolPlan.workingDirectory 必须为 generated-run']
        : []),
      ...(!this.getNonEmptyString(browserToolPlan?.baseUrlShape)
        ? ['browserToolPlan.baseUrlShape 缺失']
        : []),
      ...(this.getNonEmptyString(browserToolPlan?.baseUrlShape)?.includes(
        '{publicShareAccess}',
      )
        ? []
        : ['browserToolPlan.baseUrlShape 必须使用占位访问标识']),
      ...(!this.getNonEmptyString(browserToolPlan?.publicShareAccessPlaceholder)
        ? ['browserToolPlan.publicShareAccessPlaceholder 缺失']
        : []),
      ...(browserToolPlan?.usesRealTokens === false
        ? []
        : ['browserToolPlan.usesRealTokens 必须为 false']),
      ...this.buildMissingItemsIssues(
        'browserToolPlan.scenarioIds',
        this.getStringArray(browserToolPlan?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'browserToolPlan.scenarioIds',
        this.getStringArray(browserToolPlan?.scenarioIds),
        knownScenarioIds,
      ),
      ...this.collectSensitiveTokenIssues(
        browserAcceptancePlan,
        'browserAcceptancePlan',
      ),
    ];
    const viewportIssues = [
      ...(viewportMatrix.length === 0 ? ['viewportMatrix 不能为空'] : []),
      ...this.buildMissingItemsIssues(
        'viewportMatrix.viewportId',
        viewportIds,
        [...GATE_5_VIEWPORT_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'viewportMatrix.viewportId',
        viewportIds,
      ),
      ...(viewportMatrix.some((viewport) => viewport.category === 'desktop')
        ? []
        : ['viewportMatrix 必须包含 desktop 视口']),
      ...(viewportMatrix.some((viewport) => viewport.category === 'mobile')
        ? []
        : ['viewportMatrix 必须包含 mobile 视口']),
      ...viewportMatrix.flatMap((viewport, index) => [
        ...(!this.getNonEmptyString(viewport.viewportId)
          ? [`viewportMatrix[${index}].viewportId 缺失`]
          : []),
        ...(!['desktop', 'mobile'].includes(String(viewport.category))
          ? [`viewportMatrix[${index}].category 必须为 desktop 或 mobile`]
          : []),
        ...(!this.getNonEmptyString(viewport.deviceLabel)
          ? [`viewportMatrix[${index}].deviceLabel 缺失`]
          : []),
        ...(typeof viewport.width === 'number' && viewport.width > 0
          ? []
          : [`viewportMatrix[${index}].width 必须为正数`]),
        ...(typeof viewport.height === 'number' && viewport.height > 0
          ? []
          : [`viewportMatrix[${index}].height 必须为正数`]),
        ...this.buildMissingItemsIssues(
          `viewportMatrix[${index}].scenarioIds`,
          this.getStringArray(viewport.scenarioIds),
          scenarioIds,
        ),
        ...this.buildUnknownReferenceIssues(
          `viewportMatrix[${index}].scenarioIds`,
          this.getStringArray(viewport.scenarioIds),
          knownScenarioIds,
        ),
        ...this.buildMissingItemsIssues(
          `viewportMatrix[${index}].requirementIds`,
          this.getStringArray(viewport.requirementIds),
          requirementIds,
        ),
        ...this.buildUnknownReferenceIssues(
          `viewportMatrix[${index}].requirementIds`,
          this.getStringArray(viewport.requirementIds),
          knownRequirementIds,
        ),
      ]),
    ];
    const publicJourneyIssues = [
      ...(publicRuntimeJourneys.length === 0
        ? ['publicRuntimeJourneys 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publicRuntimeJourneys.journeyId',
        publicJourneyIds,
        [...GATE_5_PUBLIC_RUNTIME_JOURNEY_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'publicRuntimeJourneys.journeyId',
        publicJourneyIds,
      ),
      ...publicRuntimeJourneys.flatMap((journey, index) => {
        const journeyId = this.getNonEmptyString(journey.journeyId);
        const kind = this.getNonEmptyString(journey.kind);
        const expectedKind = journeyId
          ? expectedPublicJourneyKinds.get(journeyId)
          : undefined;

        return [
          ...(!journeyId
            ? [`publicRuntimeJourneys[${index}].journeyId 缺失`]
            : []),
          ...(journeyId && !expectedPublicJourneyKinds.has(journeyId)
            ? [
                `publicRuntimeJourneys[${index}].journeyId 引用了未知 journey ${this.formatIssueValue(
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
          ...(!this.getNonEmptyString(journey.title)
            ? [`publicRuntimeJourneys[${index}].title 缺失`]
            : []),
          ...(this.getStringArray(journey.steps).length === 0
            ? [`publicRuntimeJourneys[${index}].steps 不能为空`]
            : []),
          ...this.buildMissingItemsIssues(
            `publicRuntimeJourneys[${index}].viewportIds`,
            this.getStringArray(journey.viewportIds),
            [...GATE_5_VIEWPORT_IDS],
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeJourneys[${index}].viewportIds`,
            this.getStringArray(journey.viewportIds),
            knownViewportIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeJourneys[${index}].scenarioIds`,
            this.getStringArray(journey.scenarioIds),
            scenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeJourneys[${index}].scenarioIds`,
            this.getStringArray(journey.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeJourneys[${index}].requirementIds`,
            this.getStringArray(journey.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeJourneys[${index}].requirementIds`,
            this.getStringArray(journey.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(journey.publicRuntimeApiCheckIds).length === 0
            ? [
                `publicRuntimeJourneys[${index}].publicRuntimeApiCheckIds 不能为空`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeJourneys[${index}].publicRuntimeApiCheckIds`,
            this.getStringArray(journey.publicRuntimeApiCheckIds),
            knownGate4PublicApiCheckIds,
          ),
          ...(this.getStringArray(journey.staticContractIds).length === 0
            ? [`publicRuntimeJourneys[${index}].staticContractIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeJourneys[${index}].staticContractIds`,
            this.getStringArray(journey.staticContractIds),
            knownStaticContractIds,
          ),
        ];
      }),
    ];
    const creatorJourneyIssues = [
      ...(creatorManagementJourneys.length === 0
        ? ['creatorManagementJourneys 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'creatorManagementJourneys.journeyId',
        creatorJourneyIds,
        [...GATE_5_CREATOR_MANAGEMENT_JOURNEY_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'creatorManagementJourneys.journeyId',
        creatorJourneyIds,
      ),
      ...creatorManagementJourneys.flatMap((journey, index) => {
        const journeyId = this.getNonEmptyString(journey.journeyId);
        const kind = this.getNonEmptyString(journey.kind);
        const expectedKind = journeyId
          ? expectedCreatorJourneyKinds.get(journeyId)
          : undefined;

        return [
          ...(!journeyId
            ? [`creatorManagementJourneys[${index}].journeyId 缺失`]
            : []),
          ...(journeyId && !expectedCreatorJourneyKinds.has(journeyId)
            ? [
                `creatorManagementJourneys[${index}].journeyId 引用了未知 journey ${this.formatIssueValue(
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
          ...(!this.getNonEmptyString(journey.title)
            ? [`creatorManagementJourneys[${index}].title 缺失`]
            : []),
          ...(this.getStringArray(journey.steps).length === 0
            ? [`creatorManagementJourneys[${index}].steps 不能为空`]
            : []),
          ...(this.getStringArray(journey.viewportIds).length === 0
            ? [`creatorManagementJourneys[${index}].viewportIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementJourneys[${index}].viewportIds`,
            this.getStringArray(journey.viewportIds),
            knownViewportIds,
          ),
          ...this.buildMissingItemsIssues(
            `creatorManagementJourneys[${index}].scenarioIds`,
            this.getStringArray(journey.scenarioIds),
            scenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementJourneys[${index}].scenarioIds`,
            this.getStringArray(journey.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildMissingItemsIssues(
            `creatorManagementJourneys[${index}].requirementIds`,
            this.getStringArray(journey.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementJourneys[${index}].requirementIds`,
            this.getStringArray(journey.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(journey.creatorManagementApiCheckIds)
            .length === 0
            ? [
                `creatorManagementJourneys[${index}].creatorManagementApiCheckIds 不能为空`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementJourneys[${index}].creatorManagementApiCheckIds`,
            this.getStringArray(journey.creatorManagementApiCheckIds),
            knownGate4CreatorApiCheckIds,
          ),
          ...(this.getStringArray(journey.staticContractIds).length === 0
            ? [`creatorManagementJourneys[${index}].staticContractIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementJourneys[${index}].staticContractIds`,
            this.getStringArray(journey.staticContractIds),
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
      ...this.buildMissingItemsIssues('assertions.assertionId', assertionIds, [
        ...GATE_5_REQUIRED_ASSERTION_IDS,
      ]),
      ...this.buildDuplicateItemIssues('assertions.assertionId', assertionIds),
      ...allAssertions.flatMap((assertion, index) => {
        const assertionId = this.getNonEmptyString(assertion.assertionId);
        const kind = this.getNonEmptyString(assertion.kind);
        const expectedKind = assertionId
          ? expectedAssertionKinds.get(assertionId)
          : undefined;
        const assertionJourneyIds = this.getStringArray(assertion.journeyIds);
        const assertionViewportIds = this.getStringArray(assertion.viewportIds);
        const assertionApiCheckIds = this.getStringArray(assertion.apiCheckIds);
        const forbiddenEndpointPatterns = this.getStringArray(
          assertion.forbiddenEndpointPatterns,
        );

        return [
          ...(!assertionId ? [`assertions[${index}].assertionId 缺失`] : []),
          ...(assertionId &&
          !GATE_5_REQUIRED_ASSERTION_IDS.includes(
            assertionId as (typeof GATE_5_REQUIRED_ASSERTION_IDS)[number],
          )
            ? [
                `assertions[${index}].assertionId 引用了未知 assertion ${this.formatIssueValue(
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
          ...this.buildUnknownReferenceIssues(
            `assertions[${index}].journeyIds`,
            assertionJourneyIds,
            knownJourneyIds,
          ),
          ...('viewportIds' in assertion && assertionViewportIds.length === 0
            ? [`assertions[${index}].viewportIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `assertions[${index}].viewportIds`,
            assertionViewportIds,
            knownViewportIds,
          ),
          ...(kind === 'allowed_warning_policy' &&
          this.getStringArray(assertion.allowedWarnings).length === 0 &&
          !this.getNonEmptyString(assertion.emptyAllowedWarningsReason)
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
          ...this.buildUnknownReferenceIssues(
            `assertions[${index}].apiCheckIds`,
            assertionApiCheckIds,
            knownGate4ApiCheckIds,
          ),
          ...('staticContractIds' in assertion &&
          this.getStringArray(assertion.staticContractIds).length === 0
            ? [`assertions[${index}].staticContractIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `assertions[${index}].staticContractIds`,
            this.getStringArray(assertion.staticContractIds),
            knownStaticContractIds,
          ),
          ...(kind === 'public_journey_forbids_creator_internal_endpoints'
            ? [
                ...assertionJourneyIds
                  .filter((journeyId) => !publicJourneyIds.includes(journeyId))
                  .map(
                    (journeyId) =>
                      `assertions[${index}].journeyIds 只能引用公开 runtime journey，收到 ${this.formatIssueValue(
                        journeyId,
                      )}`,
                  ),
                ...assertionApiCheckIds
                  .filter(
                    (apiCheckId) =>
                      !knownGate4PublicApiCheckIds.has(apiCheckId),
                  )
                  .map(
                    (apiCheckId) =>
                      `assertions[${index}].apiCheckIds 只能引用 Gate 4 public runtime API check，收到 ${this.formatIssueValue(
                        apiCheckId,
                      )}`,
                  ),
                ...(forbiddenEndpointPatterns.length === 0
                  ? [`assertions[${index}].forbiddenEndpointPatterns 不能为空`]
                  : []),
                ...this.buildMissingItemsIssues(
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
                ...this.buildMissingItemsIssues(
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
            ? this.buildMissingItemsIssues(
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
      ...this.buildMissingItemsIssues(
        'artifactExpectations.artifactId',
        artifactIds,
        [...GATE_5_REQUIRED_ARTIFACT_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'artifactExpectations.artifactId',
        artifactIds,
      ),
      ...artifactExpectations.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`artifactExpectations[${index}].artifactId 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.artifactId) &&
        !GATE_5_REQUIRED_ARTIFACT_IDS.includes(
          this.getNonEmptyString(
            artifact.artifactId,
          ) as (typeof GATE_5_REQUIRED_ARTIFACT_IDS)[number],
        )
          ? [
              `artifactExpectations[${index}].artifactId 引用了未知 artifact ${this.formatIssueValue(
                this.getNonEmptyString(artifact.artifactId) ?? '',
              )}`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`artifactExpectations[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !GATE_5_ALLOWED_ARTIFACT_KINDS.includes(
          this.getNonEmptyString(
            artifact.kind,
          ) as (typeof GATE_5_ALLOWED_ARTIFACT_KINDS)[number],
        )
          ? [
              `artifactExpectations[${index}].kind 必须是 ${GATE_5_ALLOWED_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`artifactExpectations[${index}].path 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.path)?.startsWith(
          'artifacts/gate-5/',
        )
          ? []
          : [
              `artifactExpectations[${index}].path 必须位于 artifacts/gate-5/ generated-run relative 路径下`,
            ]),
        ...this.buildSafeRelativePathIssues(
          `artifactExpectations[${index}].path`,
          this.getNonEmptyString(artifact.path),
        ),
        ...(artifact.required === true
          ? []
          : [`artifactExpectations[${index}].required 必须为 true`]),
        ...(this.getStringArray(artifact.producedByJourneyIds).length === 0
          ? [`artifactExpectations[${index}].producedByJourneyIds 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `artifactExpectations[${index}].producedByJourneyIds`,
          this.getStringArray(artifact.producedByJourneyIds),
          knownJourneyIds,
        ),
        ...(this.getStringArray(artifact.producedByAssertionIds).length === 0
          ? [`artifactExpectations[${index}].producedByAssertionIds 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `artifactExpectations[${index}].producedByAssertionIds`,
          this.getStringArray(artifact.producedByAssertionIds),
          knownAssertionIds,
        ),
        ...(this.getStringArray(artifact.referencesGate4TraceArtifactIds)
          .length === 0
          ? [
              `artifactExpectations[${index}].referencesGate4TraceArtifactIds 不能为空`,
            ]
          : []),
        ...this.buildUnknownReferenceIssues(
          `artifactExpectations[${index}].referencesGate4TraceArtifactIds`,
          this.getStringArray(artifact.referencesGate4TraceArtifactIds),
          knownGate4TraceArtifactIds,
        ),
      ]),
    ];
    const acceptanceCoverageById = new Map(
      acceptanceScenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
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
        const scenarioId = this.getNonEmptyString(entry.scenarioId);

        return [
          ...(!scenarioId
            ? [`acceptanceScenarioCoverage[${index}].scenarioId 缺失`]
            : []),
          ...(scenarioId && !knownScenarioIds.has(scenarioId)
            ? [
                `acceptanceScenarioCoverage[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].journeyIds`,
            this.getStringArray(entry.journeyIds),
            knownJourneyIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].viewportIds`,
            this.getStringArray(entry.viewportIds),
            knownViewportIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].assertionIds`,
            this.getStringArray(entry.assertionIds),
            knownAssertionIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].artifactIds`,
            this.getStringArray(entry.artifactIds),
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
          ...this.buildMissingItemsIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            scenario?.requirementIds ?? [],
          ),
          ...(this.getStringArray(entry.journeyIds).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].journeyIds 不能为空`]
            : []),
          ...(this.getStringArray(entry.viewportIds).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].viewportIds 不能为空`]
            : []),
          ...(this.getStringArray(entry.assertionIds).length === 0
            ? [
                `acceptanceScenarioCoverage[${scenarioId}].assertionIds 不能为空`,
              ]
            : []),
          ...(this.getStringArray(entry.artifactIds).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].artifactIds 不能为空`]
            : []),
        ];
      }),
    ];
    const requirementCoverageById = new Map(
      requirementCoverage
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
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
        const requirementId = this.getNonEmptyString(entry.requirementId);

        return [
          ...(!requirementId
            ? [`requirementCoverage[${index}].requirementId 缺失`]
            : []),
          ...(requirementId && !knownRequirementIds.has(requirementId)
            ? [
                `requirementCoverage[${index}].requirementId 引用了未知需求 ${this.formatIssueValue(
                  requirementId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].journeyIds`,
            this.getStringArray(entry.journeyIds),
            knownJourneyIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].assertionIds`,
            this.getStringArray(entry.assertionIds),
            knownAssertionIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].artifactIds`,
            this.getStringArray(entry.artifactIds),
            knownArtifactIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].gate4ApiCheckIds`,
            this.getStringArray(entry.gate4ApiCheckIds),
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
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            expectedScenarioIds,
          ),
          ...[
            'journeyIds',
            'assertionIds',
            'artifactIds',
            'staticContractIds',
            'gate4ApiCheckIds',
          ].flatMap((field) =>
            this.getStringArray(entry[field]).length === 0
              ? [`requirementCoverage[${requirementId}].${field} 不能为空`]
              : [],
          ),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].gate4ApiCheckIds`,
            this.getStringArray(entry.gate4ApiCheckIds),
            gate4ApiCheckIds,
          ),
        ];
      }),
    ];
    const journeyCoverageById = new Map(
      journeyCoverage
        .map((entry) => {
          const journeyId = this.getNonEmptyString(entry.journeyId);
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
        const journeyId = this.getNonEmptyString(entry.journeyId);
        const kind = this.getNonEmptyString(entry.kind);

        return [
          ...(!journeyId ? [`journeyCoverage[${index}].journeyId 缺失`] : []),
          ...(journeyId && !knownJourneyIds.has(journeyId)
            ? [
                `journeyCoverage[${index}].journeyId 引用了未知 journey ${this.formatIssueValue(
                  journeyId,
                )}`,
              ]
            : []),
          ...(!kind ? [`journeyCoverage[${index}].kind 缺失`] : []),
          ...(kind && !allowedJourneyKinds.has(kind)
            ? [
                `journeyCoverage[${index}].kind 是非法 journey kind ${this.formatIssueValue(
                  kind,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `journeyCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `journeyCoverage[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `journeyCoverage[${index}].viewportIds`,
            this.getStringArray(entry.viewportIds),
            knownViewportIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `journeyCoverage[${index}].assertionIds`,
            this.getStringArray(entry.assertionIds),
            knownAssertionIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `journeyCoverage[${index}].artifactIds`,
            this.getStringArray(entry.artifactIds),
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
            this.getStringArray(entry[field]).length === 0
              ? [`journeyCoverage[${journeyId}].${field} 不能为空`]
              : [],
          ),
        ];
      }),
    ];
    const failureCaptureIssues = [
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(browserAcceptancePlan.failureCaptureFields),
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

  private buildIndependentVerificationPlan(
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
        verdictArtifactPath:
          'artifacts/gate-6/independent-verifier-verdict.json',
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
        forbiddenSensitiveFields: [
          ...GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS,
        ],
      },
      rubric: rubricCategories.map((category) => ({
        category,
        label: this.buildGate6RubricLabel(category),
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

  private buildGate6RubricLabel(
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

  private evaluateGate6IndependentVerificationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    gateResults: GeneratedAppGateResult[],
    independentVerificationPlan: unknown,
  ): Gate6Evaluation {
    const checks = this.buildGate6Checks(
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

  private buildGate6Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    gateResults: GeneratedAppGateResult[],
    independentVerificationPlan: unknown,
  ): Gate6Check[] {
    if (!this.isRecord(independentVerificationPlan)) {
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
    const knownIntegrationTraceArtifactIds = new Set(
      integrationTraceArtifactIds,
    );
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
    const evidenceBundle = this.getRecord(
      independentVerificationPlan.evidenceBundle,
    );
    const verifierIsolationPolicy = this.getRecord(
      independentVerificationPlan.verifierIsolationPolicy,
    );
    const verifierRunner = this.getRecord(
      independentVerificationPlan.verifierRunner,
    );
    const gateEvidenceRefs = this.getRecordArray(
      evidenceBundle?.gateEvidenceRefs,
    );
    const coverageMatrixRefs = this.getRecordArray(
      evidenceBundle?.coverageMatrixRefs,
    );
    const rubric = this.getRecordArray(independentVerificationPlan.rubric);
    const verdictSchema = this.getRecord(
      independentVerificationPlan.verdictSchema,
    );
    const verdictArtifact = this.getRecord(
      independentVerificationPlan.verdictArtifact,
    );
    const independenceChecks = this.getRecordArray(
      independentVerificationPlan.independenceChecks,
    );
    const requirementCoverage = this.getRecordArray(
      independentVerificationPlan.requirementCoverage,
    );
    const scenarioCoverage = this.getRecordArray(
      independentVerificationPlan.scenarioCoverage,
    );
    const evidenceCoverage = this.getRecordArray(
      independentVerificationPlan.evidenceCoverage,
    );
    const gateCoverage = this.getRecordArray(
      independentVerificationPlan.gateCoverage,
    );

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
      ...(!this.getNonEmptyString(
        independentVerificationPlan.skeletonDisclaimer,
      )
        ? ['skeletonDisclaimer 缺失']
        : []),
      ...this.collectSensitiveTokenIssues(
        independentVerificationPlan,
        'independentVerificationPlan',
      ),
    ];
    const verifierRunnerIssues = [
      ...this.requireRecord(verifierRunner, 'verifierRunner'),
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
      ...this.requireRecord(verifierIsolationPolicy, 'verifierIsolationPolicy'),
      ...(verifierIsolationPolicy?.verifierContext ===
      'fresh-independent-context'
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
      ...(this.getStringArray(verifierIsolationPolicy?.requiredControls)
        .length === 0
        ? ['verifierIsolationPolicy.requiredControls 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'verifierIsolationPolicy.requiredControls',
        this.getStringArray(verifierIsolationPolicy?.requiredControls),
        [...GATE_6_REQUIRED_ISOLATION_CONTROLS],
      ),
    ];
    const gateEvidenceRefGateIds = gateEvidenceRefs
      .map((entry) => this.getNonEmptyString(entry.gateId))
      .filter((gateId): gateId is string => gateId !== null);
    const coverageMatrixIds = coverageMatrixRefs
      .map((entry) => this.getNonEmptyString(entry.matrixId))
      .filter((matrixId): matrixId is string => matrixId !== null);
    const evidenceBundleIssues = [
      ...this.requireRecord(evidenceBundle, 'evidenceBundle'),
      ...(!this.getNonEmptyString(evidenceBundle?.bundleId)
        ? ['evidenceBundle.bundleId 缺失']
        : []),
      ...(evidenceBundle?.redactionLevel ===
      'redacted-no-public-token-or-secret'
        ? []
        : [
            'evidenceBundle.redactionLevel 必须为 redacted-no-public-token-or-secret',
          ]),
      ...(this.getStringArray(evidenceBundle?.referencedGateIds).length === 0
        ? ['evidenceBundle.referencedGateIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.referencedGateIds',
        this.getStringArray(evidenceBundle?.referencedGateIds),
        requiredGateIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'evidenceBundle.referencedGateIds',
        this.getStringArray(evidenceBundle?.referencedGateIds),
        knownGateIds,
      ),
      ...this.buildDuplicateItemIssues(
        'evidenceBundle.referencedGateIds',
        this.getStringArray(evidenceBundle?.referencedGateIds),
      ),
      ...(gateEvidenceRefs.length === 0
        ? ['evidenceBundle.gateEvidenceRefs 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.gateEvidenceRefs.gateId',
        gateEvidenceRefGateIds,
        requiredGateIds,
      ),
      ...gateEvidenceRefs.flatMap((entry, index) => {
        const gateId = this.getNonEmptyString(entry.gateId);
        const entryEvidenceIds = this.getStringArray(entry.evidenceIds);
        const gateSpecificEvidenceIds =
          gateId === null ? [] : (gateEvidenceIdsByGateId.get(gateId) ?? []);

        return [
          ...(!gateId
            ? [`evidenceBundle.gateEvidenceRefs[${index}].gateId 缺失`]
            : []),
          ...(gateId && !knownGateIds.has(gateId)
            ? [
                `evidenceBundle.gateEvidenceRefs[${index}].gateId 引用了未知 gate ${this.formatIssueValue(
                  gateId,
                )}`,
              ]
            : []),
          ...(entryEvidenceIds.length === 0
            ? [`evidenceBundle.gateEvidenceRefs[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
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
                `evidenceBundle.gateEvidenceRefs[${index}].evidenceIds ${this.formatIssueValue(
                  evidenceId,
                )} 不属于 ${gateId}`,
            ),
        ];
      }),
      ...(this.getStringArray(evidenceBundle?.staticContractIds).length === 0
        ? ['evidenceBundle.staticContractIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.staticContractIds',
        this.getStringArray(evidenceBundle?.staticContractIds),
        [...GATE_2_STATIC_CONTRACT_IDS],
      ),
      ...this.buildUnknownReferenceIssues(
        'evidenceBundle.staticContractIds',
        this.getStringArray(evidenceBundle?.staticContractIds),
        knownStaticContractIds,
      ),
      ...(this.getStringArray(evidenceBundle?.buildUnitArtifactIds).length === 0
        ? ['evidenceBundle.buildUnitArtifactIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.buildUnitArtifactIds',
        this.getStringArray(evidenceBundle?.buildUnitArtifactIds),
        buildUnitArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'evidenceBundle.buildUnitArtifactIds',
        this.getStringArray(evidenceBundle?.buildUnitArtifactIds),
        knownBuildUnitArtifactIds,
      ),
      ...(this.getStringArray(evidenceBundle?.integrationTraceArtifactIds)
        .length === 0
        ? ['evidenceBundle.integrationTraceArtifactIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.integrationTraceArtifactIds',
        this.getStringArray(evidenceBundle?.integrationTraceArtifactIds),
        integrationTraceArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'evidenceBundle.integrationTraceArtifactIds',
        this.getStringArray(evidenceBundle?.integrationTraceArtifactIds),
        knownIntegrationTraceArtifactIds,
      ),
      ...(this.getStringArray(evidenceBundle?.browserArtifactIds).length === 0
        ? ['evidenceBundle.browserArtifactIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.browserArtifactIds',
        this.getStringArray(evidenceBundle?.browserArtifactIds),
        browserArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'evidenceBundle.browserArtifactIds',
        this.getStringArray(evidenceBundle?.browserArtifactIds),
        knownBrowserArtifactIds,
      ),
      ...(coverageMatrixRefs.length === 0
        ? ['evidenceBundle.coverageMatrixRefs 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.coverageMatrixRefs.matrixId',
        coverageMatrixIds,
        [...GATE_6_REQUIRED_COVERAGE_MATRIX_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'evidenceBundle.coverageMatrixRefs.matrixId',
        coverageMatrixIds,
      ),
      ...coverageMatrixRefs.flatMap((entry, index) => {
        const matrixId = this.getNonEmptyString(entry.matrixId);
        const sourcePlan = this.getNonEmptyString(entry.sourcePlan);
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
                `coverageMatrixRefs[${index}].matrixId 是非法 coverage matrix ${this.formatIssueValue(
                  matrixId,
                )}`,
              ]
            : []),
          ...(!sourcePlan
            ? [`coverageMatrixRefs[${index}].sourcePlan 缺失`]
            : []),
          ...(sourcePlan && !allowedSourcePlans.has(sourcePlan)
            ? [
                `coverageMatrixRefs[${index}].sourcePlan 是非法 source plan ${this.formatIssueValue(
                  sourcePlan,
                )}`,
              ]
            : []),
          ...(this.getStringArray(entry.requirementIds).length === 0
            ? [`coverageMatrixRefs[${index}].requirementIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `coverageMatrixRefs[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.scenarioIds).length === 0
            ? [`coverageMatrixRefs[${index}].scenarioIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `coverageMatrixRefs[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...(this.getStringArray(entry.gateIds).length === 0
            ? [`coverageMatrixRefs[${index}].gateIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `coverageMatrixRefs[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            knownGateIds,
          ),
        ];
      }),
      ...(this.getStringArray(evidenceBundle?.forbiddenSensitiveFields)
        .length === 0
        ? ['evidenceBundle.forbiddenSensitiveFields 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'evidenceBundle.forbiddenSensitiveFields',
        this.getStringArray(evidenceBundle?.forbiddenSensitiveFields),
        [...GATE_6_REQUIRED_FORBIDDEN_SENSITIVE_FIELDS],
      ),
    ];
    const rubricCategories = rubric
      .map((entry) => this.getNonEmptyString(entry.category))
      .filter((category): category is string => category !== null);
    const rubricIssues = [
      ...(rubric.length === 0 ? ['rubric 不能为空'] : []),
      ...this.buildMissingItemsIssues('rubric.category', rubricCategories, [
        ...GATE_6_REQUIRED_RUBRIC_CATEGORIES,
      ]),
      ...this.buildDuplicateItemIssues('rubric.category', rubricCategories),
      ...rubric.flatMap((entry, index) => {
        const category = this.getNonEmptyString(entry.category);

        return [
          ...(!category ? [`rubric[${index}].category 缺失`] : []),
          ...(category && !knownRubricCategories.has(category)
            ? [
                `rubric[${index}].category 是非法 rubric category ${this.formatIssueValue(
                  category,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(entry.label)
            ? [`rubric[${index}].label 缺失`]
            : []),
          ...(this.getStringArray(entry.requirementIds).length === 0
            ? [`rubric[${index}].requirementIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `rubric[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.scenarioIds).length === 0
            ? [`rubric[${index}].scenarioIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `rubric[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`rubric[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `rubric[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...(typeof entry.blocking === 'boolean'
            ? []
            : [`rubric[${index}].blocking 必须为 boolean`]),
        ];
      }),
    ];
    const verdictSchemaIssues = [
      ...this.requireRecord(verdictSchema, 'verdictSchema'),
      ...(this.getStringArray(verdictSchema?.requiredFields).length === 0
        ? ['verdictSchema.requiredFields 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'verdictSchema.requiredFields',
        this.getStringArray(verdictSchema?.requiredFields),
        [...GATE_6_REQUIRED_VERDICT_FIELDS],
      ),
      ...this.getStringArray(verdictSchema?.requiredFields)
        .filter(
          (field) =>
            !new Set<string>([...GATE_6_REQUIRED_VERDICT_FIELDS]).has(field),
        )
        .map(
          (field) =>
            `verdictSchema.requiredFields 包含非法字段 ${this.formatIssueValue(
              field,
            )}`,
        ),
      ...(this.getStringArray(verdictSchema?.findingSeverities).length === 0
        ? ['verdictSchema.findingSeverities 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'verdictSchema.findingSeverities',
        this.getStringArray(verdictSchema?.findingSeverities),
        [...GATE_6_ALLOWED_FINDING_SEVERITIES],
      ),
      ...this.getStringArray(verdictSchema?.findingSeverities)
        .filter(
          (severity) =>
            !new Set<string>([...GATE_6_ALLOWED_FINDING_SEVERITIES]).has(
              severity,
            ),
        )
        .map(
          (severity) =>
            `verdictSchema.findingSeverities 包含非法 severity ${this.formatIssueValue(
              severity,
            )}`,
        ),
      ...(this.getStringArray(verdictSchema?.decisionValues).length === 0
        ? ['verdictSchema.decisionValues 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'verdictSchema.decisionValues',
        this.getStringArray(verdictSchema?.decisionValues),
        [...GATE_6_ALLOWED_DECISION_VALUES],
      ),
      ...this.getStringArray(verdictSchema?.decisionValues)
        .filter(
          (decision) =>
            !new Set<string>([...GATE_6_ALLOWED_DECISION_VALUES]).has(decision),
        )
        .map(
          (decision) =>
            `verdictSchema.decisionValues 包含非法 decision ${this.formatIssueValue(
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
      ...this.requireRecord(verdictArtifact, 'verdictArtifact'),
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
      .map((entry) => this.getNonEmptyString(entry.kind))
      .filter((kind): kind is string => kind !== null);
    const knownIndependenceKinds = new Set<string>([
      ...GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS,
    ]);
    const independenceIssues = [
      ...(independenceChecks.length === 0
        ? ['independenceChecks 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'independenceChecks.kind',
        independenceCheckKinds,
        [...GATE_6_REQUIRED_INDEPENDENCE_CHECK_KINDS],
      ),
      ...independenceChecks.flatMap((entry, index) => {
        const checkId = this.getNonEmptyString(entry.checkId);
        const kind = this.getNonEmptyString(entry.kind);

        return [
          ...(!checkId ? [`independenceChecks[${index}].checkId 缺失`] : []),
          ...(!kind ? [`independenceChecks[${index}].kind 缺失`] : []),
          ...(kind && !knownIndependenceKinds.has(kind)
            ? [
                `independenceChecks[${index}].kind 是非法 independence check kind ${this.formatIssueValue(
                  kind,
                )}`,
              ]
            : []),
          ...(entry.required === true
            ? []
            : [`independenceChecks[${index}].required 必须为 true`]),
          ...(this.getStringArray(entry.gateIds).length === 0
            ? [`independenceChecks[${index}].gateIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `independenceChecks[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            knownGateIds,
          ),
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`independenceChecks[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `independenceChecks[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
        ];
      }),
    ];
    const requirementCoverageById = new Map(
      requirementCoverage
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
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
        const requirementId = this.getNonEmptyString(entry.requirementId);

        return [
          ...(!requirementId
            ? [`requirementCoverage[${index}].requirementId 缺失`]
            : []),
          ...(requirementId && !knownRequirementIds.has(requirementId)
            ? [
                `requirementCoverage[${index}].requirementId 引用了未知需求 ${this.formatIssueValue(
                  requirementId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].rubricCategories`,
            this.getStringArray(entry.rubricCategories),
            knownRubricCategories,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            knownGateIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].browserArtifactIds`,
            this.getStringArray(entry.browserArtifactIds),
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
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            expectedScenarioIds,
          ),
          ...[
            'rubricCategories',
            'evidenceIds',
            'gateIds',
            'staticContractIds',
            'browserArtifactIds',
          ].flatMap((field) =>
            this.getStringArray(entry[field]).length === 0
              ? [`requirementCoverage[${requirementId}].${field} 不能为空`]
              : [],
          ),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].gateIds`,
            this.getStringArray(entry.gateIds),
            requiredGateIds,
          ),
        ];
      }),
    ];
    const scenarioCoverageById = new Map(
      scenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
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
        const scenarioId = this.getNonEmptyString(entry.scenarioId);

        return [
          ...(!scenarioId
            ? [`scenarioCoverage[${index}].scenarioId 缺失`]
            : []),
          ...(scenarioId && !knownScenarioIds.has(scenarioId)
            ? [
                `scenarioCoverage[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `scenarioCoverage[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `scenarioCoverage[${index}].rubricCategories`,
            this.getStringArray(entry.rubricCategories),
            knownRubricCategories,
          ),
          ...this.buildUnknownReferenceIssues(
            `scenarioCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `scenarioCoverage[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            knownGateIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `scenarioCoverage[${index}].browserArtifactIds`,
            this.getStringArray(entry.browserArtifactIds),
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
          ...this.buildMissingItemsIssues(
            `scenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            scenario?.requirementIds ?? [],
          ),
          ...[
            'rubricCategories',
            'evidenceIds',
            'gateIds',
            'browserArtifactIds',
          ].flatMap((field) =>
            this.getStringArray(entry[field]).length === 0
              ? [`scenarioCoverage[${scenarioId}].${field} 不能为空`]
              : [],
          ),
          ...this.buildMissingItemsIssues(
            `scenarioCoverage[${scenarioId}].gateIds`,
            this.getStringArray(entry.gateIds),
            requiredGateIds,
          ),
        ];
      }),
    ];
    const evidenceCoverageById = new Map(
      evidenceCoverage
        .map((entry) => {
          const evidenceId = this.getNonEmptyString(entry.evidenceId);
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
        const evidenceId = this.getNonEmptyString(entry.evidenceId);
        const gateId = this.getNonEmptyString(entry.gateId);
        const expectedGateId = evidenceId
          ? knownEvidenceEntries.find(
              (candidate) => candidate.evidenceId === evidenceId,
            )?.gateId
          : undefined;

        return [
          ...(!evidenceId
            ? [`evidenceCoverage[${index}].evidenceId 缺失`]
            : []),
          ...(evidenceId && !knownEvidenceIds.has(evidenceId)
            ? [
                `evidenceCoverage[${index}].evidenceId 引用了未知 evidence ${this.formatIssueValue(
                  evidenceId,
                )}`,
              ]
            : []),
          ...(!gateId ? [`evidenceCoverage[${index}].gateId 缺失`] : []),
          ...(gateId && !knownGateIds.has(gateId)
            ? [
                `evidenceCoverage[${index}].gateId 引用了未知 gate ${this.formatIssueValue(
                  gateId,
                )}`,
              ]
            : []),
          ...(gateId && expectedGateId && gateId !== expectedGateId
            ? [
                `evidenceCoverage[${index}].gateId 与 evidence ${this.formatIssueValue(
                  evidenceId ?? '',
                )} 所属 gate ${expectedGateId} 不一致`,
              ]
            : []),
          ...(this.getStringArray(entry.usedByRubricCategories).length === 0
            ? [`evidenceCoverage[${index}].usedByRubricCategories 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `evidenceCoverage[${index}].usedByRubricCategories`,
            this.getStringArray(entry.usedByRubricCategories),
            knownRubricCategories,
          ),
          ...(this.getStringArray(entry.requirementIds).length === 0
            ? [`evidenceCoverage[${index}].requirementIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `evidenceCoverage[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.scenarioIds).length === 0
            ? [`evidenceCoverage[${index}].scenarioIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `evidenceCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
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
          const gateId = this.getNonEmptyString(entry.gateId);
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
        const gateId = this.getNonEmptyString(entry.gateId);
        const expectedEvidenceIds =
          gateId === null ? [] : (gateEvidenceIdsByGateId.get(gateId) ?? []);

        return [
          ...(!gateId ? [`gateCoverage[${index}].gateId 缺失`] : []),
          ...(gateId && !knownGateIds.has(gateId)
            ? [
                `gateCoverage[${index}].gateId 引用了未知 gate ${this.formatIssueValue(
                  gateId,
                )}`,
              ]
            : []),
          ...(entry.required === true
            ? []
            : [`gateCoverage[${index}].required 必须为 true`]),
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`gateCoverage[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `gateCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...this.buildMissingItemsIssues(
            `gateCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            expectedEvidenceIds,
          ),
          ...(this.getStringArray(entry.coveredByRubricCategories).length === 0
            ? [`gateCoverage[${index}].coveredByRubricCategories 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `gateCoverage[${index}].coveredByRubricCategories`,
            this.getStringArray(entry.coveredByRubricCategories),
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
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(independentVerificationPlan.failureCaptureFields),
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
          verdictSchemaIssues.length === 0 &&
          verdictArtifactIssues.length === 0,
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
        summary:
          '检查 Gate 0-5 是否都有 evidence coverage 和 rubric coverage。',
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

  private buildPublishCandidatePlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
    gateResults: GeneratedAppGateResult[],
    executionLevel: GeneratedAppPublishCandidateExecutionLevel = this.gate7PublishCandidateRunner.getExecutionLevel(),
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
    const skeletonOnlyUpstreamGateIds =
      this.resolveGate7SkeletonOnlyUpstreamGateIds(
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
    const missingExecutionArtifactGateIds = [
      ...(buildUnitPlan.executionLevel === 'real-local-command-plan'
        ? []
        : ['gate-3']),
      ...(integrationPlan.executionLevel === 'real-local-integration'
        ? []
        : ['gate-4']),
      ...(browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
        ? []
        : ['gate-5']),
      ...(gate6IsReal ? [] : ['gate-6']),
      'gate-7',
    ];
    const missingExecutionArtifactMessage =
      gate6IsReal &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      integrationPlan.executionLevel === 'real-local-integration'
        ? 'Gate 3、Gate 4、Gate 5 和 Gate 6 已提供受控本地 real-local evidence；剩余发布阻断来自 Gate 7 真实 publish candidate runner、release manifest、artifact signoff 与 public-share signoff 缺失。'
        : browserAcceptancePlan.executionLevel ===
              'real-local-browser-contract' &&
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
      independentVerificationPlanVersion:
        independentVerificationPlan.planVersion,
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
              blockerId:
                blockerIds[0] ?? 'blocker-skeleton-only-upstream-gates',
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
                : browserAcceptancePlan.executionLevel ===
                    'real-local-browser-contract'
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
        requiredRealGateRunnerIds: [...GATE_7_REQUIRED_REAL_GATE_RUNNER_IDS],
        evidenceIds: [...upstreamEvidenceIds, ...gate7EvidenceIds],
        repairSuggestions: publishCandidateAllowed
          ? [
              '后续若要公开给终端用户，必须显式调用 enablePublicShare 走 readiness guard 创建新 token。',
              '生产级 artifact archive、真实签名和外部 verifier 可作为后续增强门禁补齐，不得由本地 contract runner 伪造。',
            ]
          : [
              gate6IsReal
                ? '保留 Gate 3-6 受控本地 real-local evidence，继续接入真实 Gate 7 publish candidate runner、release manifest、artifact signoff 和 public-share signoff。'
                : browserAcceptancePlan.executionLevel ===
                    'real-local-browser-contract'
                  ? '保留 Gate 4 real-local integration 与 Gate 5 real-local browser-contract runner 证据，继续接入真实 Gate 6 independent verifier。'
                  : integrationPlan.executionLevel === 'real-local-integration'
                    ? '保留 Gate 4 real-local integration runner 证据，继续接入真实 Gate 5 browser runner。'
                    : '接入真实 Gate 4 integration runner 并产出 API、Agent/Workflow、插件 sandbox trace。',
              browserAcceptancePlan.executionLevel ===
              'real-local-browser-contract'
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
        executionLevel: this.resolveGate7CoverageExecutionLevel(
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
        requiredRealGateRunnerId: this.resolveGate7RequiredRealRunnerId(gateId),
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

  private resolveGate7SkeletonOnlyUpstreamGateIds(
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
      ...(browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
        ? []
        : ['gate-5']),
      ...(independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
        ? []
        : ['gate-6']),
    ];
  }

  private resolveGate7CoverageExecutionLevel(
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

  private resolveGate7RequiredRealRunnerId(gateId: string): string {
    const realRunnerIds: Record<string, string> = {
      'gate-3': 'gate-3-real-build-unit-runner',
      'gate-4': 'gate-4-real-integration-runner',
      'gate-5': 'gate-5-real-browser-acceptance-runner',
      'gate-6': 'gate-6-real-independent-verifier-runner',
      'gate-7': 'gate-7-real-publish-candidate-runner',
    };

    return (
      realRunnerIds[gateId] ?? 'not-required-for-current-deterministic-gate'
    );
  }

  private evaluateGate7PublishCandidatePlan(
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
    const checks = this.buildGate7Checks(
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
    const skeletonOnlyUpstreamGateIds =
      this.resolveGate7SkeletonOnlyUpstreamGateIds(
        buildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        independentVerificationPlan,
      );
    const gate7FailureIntro = this.buildGate7FailureIntro(
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
      summary: this.buildGate7FailureSummary(
        buildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        independentVerificationPlan,
      ),
      evidence,
      failure,
      repairInstructions: this.buildGate7RepairInstructions(
        buildUnitPlan,
        integrationPlan,
        browserAcceptancePlan,
        independentVerificationPlan,
      ),
    };
  }

  private buildGate7FailureIntro(
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  ): string {
    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      independentVerificationPlan.executionLevel ===
        'real-local-independent-verifier'
    ) {
      return 'Gate 7 publish-candidate guard skeleton 检测到 Gate 3-6 已有受控本地 real-local evidence，但 Gate 7 仍缺少真实 publish candidate runner、release manifest、artifact signoff 与 public-share signoff，不能形成 publish candidate。';
    }

    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
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

  private buildGate7FailureSummary(
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  ): string {
    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      independentVerificationPlan.executionLevel ===
        'real-local-independent-verifier'
    ) {
      return 'Gate 7 失败：publishCandidatePlan guard skeleton 已生成并保留；Gate 3 构建与单元层、Gate 4 受控本地 integration 层、Gate 5 受控本地 browser-contract 层和 Gate 6 受控本地 independent verifier 层已记录 real-local evidence，但 Gate 7 仍缺少真实 release manifest、artifact signoff、public-share signoff 和 publish candidate guard，不能形成 publish candidate 或启用公开分享。';
    }

    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
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

  private buildGate7CompletedRunSummary(
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  ): string {
    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      independentVerificationPlan.executionLevel ===
        'real-local-independent-verifier'
    ) {
      return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner、Gate 5 受控本地 browser-contract runner 和 Gate 6 受控本地 independent verifier runner；Gate 7 publish-candidate guard 仍缺少真实 release manifest、artifact signoff 与 public-share signoff，当前应用不能形成 publish candidate，保持不可发布。';
    }

    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
    ) {
      return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner、Gate 5 受控本地 browser-contract runner；Gate 6 independent verifier 仍为 skeleton 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
    }

    if (integrationPlan.executionLevel === 'real-local-integration') {
      return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器、Gate 4 受控本地 integration runner；Gate 5 browser acceptance 和 Gate 6 independent verifier 仍为 skeleton/fixture 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实浏览器/独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
    }

    return '门禁运行器完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 Generation Workspace 与构建/单元执行器；Gate 4 integration、Gate 5 browser acceptance 和 Gate 6 independent verifier 仍为 skeleton/fixture 完整性检查，Gate 7 publish-candidate guard 检测到缺少真实集成/浏览器/独立审查证据，当前应用不能形成 publish candidate，保持不可发布。';
  }

  private buildGate7RepairInstructions(
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: GeneratedAppIntegrationPlan,
    browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
  ): string {
    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      independentVerificationPlan.executionLevel ===
        'real-local-independent-verifier'
    ) {
      return '接入真实 Gate 7 publish candidate runner、release manifest、artifact signoff 和 public-share signoff 后，再重新评估 publish candidate；在 Gate 7 guard 失败期间 public token 必须保持禁用并清空。';
    }

    if (
      buildUnitPlan.executionLevel === 'real-local-command-plan' &&
      integrationPlan.executionLevel === 'real-local-integration' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
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

  private buildGate7Checks(
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
    if (!this.isRecord(publishCandidatePlan)) {
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
    const publishReadinessInputs = this.getRecord(
      publishCandidatePlan.publishReadinessInputs,
    );
    const artifactReleaseManifest = this.getRecordArray(
      publishCandidatePlan.artifactReleaseManifest,
    );
    const publicationBlockers = this.getRecordArray(
      publishCandidatePlan.publicationBlockers,
    );
    const rollbackShareControls = this.getRecord(
      publishCandidatePlan.rollbackShareControls,
    );
    const finalVerdict = this.getRecord(publishCandidatePlan.finalVerdict);
    const requirementCoverage = this.getRecordArray(
      publishCandidatePlan.requirementCoverage,
    );
    const gateCoverage = this.getRecordArray(publishCandidatePlan.gateCoverage);
    const artifactCoverage = this.getRecordArray(
      publishCandidatePlan.artifactCoverage,
    );
    const artifactIds = artifactReleaseManifest
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const knownArtifactIds = new Set(artifactIds);
    const blockerIds = publicationBlockers
      .map((blocker) => this.getNonEmptyString(blocker.blockerId))
      .filter((blockerId): blockerId is string => blockerId !== null);
    const knownBlockerIds = new Set(blockerIds);
    const allowedArtifactKinds = new Set<string>([
      ...GATE_7_ALLOWED_ARTIFACT_KINDS,
    ]);
    const requiredArtifactKinds = [...GATE_7_REQUIRED_ARTIFACT_KINDS];
    const artifactKinds = artifactReleaseManifest
      .map((artifact) => this.getNonEmptyString(artifact.kind))
      .filter((kind): kind is string => kind !== null);
    const blockerCategories = publicationBlockers
      .map((blocker) => this.getNonEmptyString(blocker.category))
      .filter((category): category is string => category !== null);
    const allowedBlockerCategories = new Set<string>([
      ...GATE_7_REQUIRED_BLOCKER_CATEGORIES,
    ]);
    const finalVerdictRequiredRealGateRunnerIds = this.getStringArray(
      finalVerdict?.requiredRealGateRunnerIds,
    );
    const publishCandidateAllowed =
      finalVerdict?.publishCandidateAllowed === true;
    const publishCandidatePlanExecutionLevel = this.getNonEmptyString(
      publishCandidatePlan.executionLevel,
    );
    const expectedArtifactSignoffStatus = publishCandidateAllowed
      ? 'contract-accepted'
      : publishCandidatePlanExecutionLevel ===
          'fixture-publish-candidate-contract'
        ? 'fixture-only'
        : 'not-executed';
    const allowedFinalVerdictRealGateRunnerIds = new Set<string>([
      ...GATE_7_REQUIRED_REAL_GATE_RUNNER_IDS,
    ]);
    const allowedGateCoverageRealGateRunnerIds = new Set<string>([
      ...GATE_7_REQUIRED_REAL_GATE_RUNNER_IDS,
      'not-required-for-current-deterministic-gate',
    ]);
    const finalVerdictBlockingReasons = this.getStringArray(
      finalVerdict?.blockingReasons,
    );
    const requiredBlockingReasonFragments =
      independentVerificationPlan.executionLevel ===
        'real-local-independent-verifier' &&
      browserAcceptancePlan.executionLevel === 'real-local-browser-contract' &&
      integrationPlan.executionLevel === 'real-local-integration'
        ? [
            'Gate 7',
            'release manifest',
            'artifact 签收',
            'public-share signoff',
          ]
        : browserAcceptancePlan.executionLevel === 'real-local-browser-contract'
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
      ...(publishCandidatePlan.planVersion === 1
        ? []
        : ['planVersion 必须为 1']),
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
      ...(publishCandidatePlan.buildUnitPlanVersion ===
      buildUnitPlan.planVersion
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
      ...(this.getStringArray([publishCandidatePlan.executionLevel]).some(
        (level) =>
          new Set<string>([...GATE_7_ALLOWED_EXECUTION_LEVELS]).has(level),
      )
        ? []
        : [
            `executionLevel 必须是 ${GATE_7_ALLOWED_EXECUTION_LEVELS.join(
              ' | ',
            )}`,
          ]),
      ...(!this.getNonEmptyString(publishCandidatePlan.skeletonDisclaimer)
        ? ['skeletonDisclaimer 缺失']
        : []),
      ...this.collectSensitiveTokenIssues(
        publishCandidatePlan,
        'publishCandidatePlan',
      ),
      ...this.requireRecord(publishReadinessInputs, 'publishReadinessInputs'),
      ...(this.getStringArray(publishReadinessInputs?.requiredGateIds)
        .length === 0
        ? ['publishReadinessInputs.requiredGateIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publishReadinessInputs.requiredGateIds',
        this.getStringArray(publishReadinessInputs?.requiredGateIds),
        requiredGateIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'publishReadinessInputs.requiredGateIds',
        this.getStringArray(publishReadinessInputs?.requiredGateIds),
        knownGateIds,
      ),
      ...this.buildDuplicateItemIssues(
        'publishReadinessInputs.requiredGateIds',
        this.getStringArray(publishReadinessInputs?.requiredGateIds),
      ),
      ...(this.getStringArray(publishReadinessInputs?.upstreamGateIds)
        .length === 0
        ? ['publishReadinessInputs.upstreamGateIds 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publishReadinessInputs.upstreamGateIds',
        this.getStringArray(publishReadinessInputs?.upstreamGateIds),
        upstreamGateIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'publishReadinessInputs.upstreamGateIds',
        this.getStringArray(publishReadinessInputs?.upstreamGateIds),
        upstreamGateIdSet,
      ),
      ...(this.getRecordArray(publishReadinessInputs?.upstreamEvidenceRefs)
        .length === 0
        ? ['publishReadinessInputs.upstreamEvidenceRefs 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publishReadinessInputs.upstreamEvidenceRefs.gateId',
        this.getRecordArray(publishReadinessInputs?.upstreamEvidenceRefs)
          .map((entry) => this.getNonEmptyString(entry.gateId))
          .filter((gateId): gateId is string => gateId !== null),
        upstreamGateIds,
      ),
      ...this.getRecordArray(
        publishReadinessInputs?.upstreamEvidenceRefs,
      ).flatMap((entry, index) => {
        const gateId = this.getNonEmptyString(entry.gateId);
        const evidenceIds = this.getStringArray(entry.evidenceIds);
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
                `publishReadinessInputs.upstreamEvidenceRefs[${index}].gateId 引用了未知 gate ${this.formatIssueValue(
                  gateId,
                )}`,
              ]
            : []),
          ...(evidenceIds.length === 0
            ? [
                `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds 不能为空`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds`,
            evidenceIds,
            knownEvidenceIds,
          ),
          ...this.buildMissingItemsIssues(
            `publishReadinessInputs.upstreamEvidenceRefs[${index}].evidenceIds`,
            evidenceIds,
            expectedEvidenceIds,
          ),
        ];
      }),
      ...upstreamGateIds.flatMap((gateId) =>
        gateResults.find((gate) => gate.gateId === gateId)?.status === 'passed'
          ? []
          : [`Gate 7 前置 ${gateId} 必须为 passed`],
      ),
      ...(this.getStringArray(publishReadinessInputs?.readinessPreconditions)
        .length === 0
        ? ['publishReadinessInputs.readinessPreconditions 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publishReadinessInputs.readinessPreconditions',
        this.getStringArray(publishReadinessInputs?.readinessPreconditions),
        [...GATE_7_REQUIRED_READINESS_PRECONDITIONS],
      ),
      ...(this.getStringArray(
        publishReadinessInputs?.requiredNonSkeletonEvidenceClasses,
      ).length === 0
        ? ['publishReadinessInputs.requiredNonSkeletonEvidenceClasses 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publishReadinessInputs.requiredNonSkeletonEvidenceClasses',
        this.getStringArray(
          publishReadinessInputs?.requiredNonSkeletonEvidenceClasses,
        ),
        [...GATE_7_REQUIRED_NON_SKELETON_EVIDENCE_CLASSES],
      ),
    ];
    const artifactIssues = [
      ...(artifactReleaseManifest.length === 0
        ? ['artifactReleaseManifest 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'artifactReleaseManifest.kind',
        artifactKinds,
        requiredArtifactKinds,
      ),
      ...this.buildDuplicateItemIssues(
        'artifactReleaseManifest.artifactId',
        artifactIds,
      ),
      ...artifactReleaseManifest.flatMap((artifact, index) => {
        const artifactId = this.getNonEmptyString(artifact.artifactId);
        const kind = this.getNonEmptyString(artifact.kind);
        const sourceGateId = this.getNonEmptyString(artifact.sourceGateId);
        const path = this.getNonEmptyString(artifact.path);
        const checksum = this.getRecord(artifact.checksum);
        const signature = this.getRecord(artifact.signature);

        return [
          ...(!artifactId
            ? [`artifactReleaseManifest[${index}].artifactId 缺失`]
            : []),
          ...(!kind ? [`artifactReleaseManifest[${index}].kind 缺失`] : []),
          ...(kind && !allowedArtifactKinds.has(kind)
            ? [
                `artifactReleaseManifest[${index}].kind 是非法 artifact kind ${this.formatIssueValue(
                  kind,
                )}`,
              ]
            : []),
          ...(!sourceGateId
            ? [`artifactReleaseManifest[${index}].sourceGateId 缺失`]
            : []),
          ...(sourceGateId && !knownGateIds.has(sourceGateId)
            ? [
                `artifactReleaseManifest[${index}].sourceGateId 引用了未知 gate ${this.formatIssueValue(
                  sourceGateId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(artifact.sourcePlan)
            ? [`artifactReleaseManifest[${index}].sourcePlan 缺失`]
            : []),
          ...(!path ? [`artifactReleaseManifest[${index}].path 缺失`] : []),
          ...this.buildSafeRelativePathIssues(
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
            : [
                `artifactReleaseManifest[${index}].containsSecrets 必须为 false`,
              ]),
          ...this.requireRecord(
            checksum,
            `artifactReleaseManifest[${index}].checksum`,
          ),
          ...(checksum?.algorithm === 'sha256'
            ? []
            : [
                `artifactReleaseManifest[${index}].checksum.algorithm 必须为 sha256`,
              ]),
          ...(this.getNonEmptyString(checksum?.value)?.startsWith(
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
          ...this.requireRecord(
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
          ...(this.getStringArray(artifact.evidenceIds).length === 0
            ? [`artifactReleaseManifest[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `artifactReleaseManifest[${index}].evidenceIds`,
            this.getStringArray(artifact.evidenceIds),
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
        : this.buildMissingItemsIssues(
            'publicationBlockers.category',
            blockerCategories,
            [...GATE_7_REQUIRED_BLOCKER_CATEGORIES],
          )),
      ...this.buildDuplicateItemIssues(
        'publicationBlockers.blockerId',
        blockerIds,
      ),
      ...publicationBlockers.flatMap((blocker, index) => {
        const blockerId = this.getNonEmptyString(blocker.blockerId);
        const category = this.getNonEmptyString(blocker.category);

        return [
          ...(!blockerId
            ? [`publicationBlockers[${index}].blockerId 缺失`]
            : []),
          ...(!category ? [`publicationBlockers[${index}].category 缺失`] : []),
          ...(category && !allowedBlockerCategories.has(category)
            ? [
                `publicationBlockers[${index}].category 是非法 blocker category ${this.formatIssueValue(
                  category,
                )}`,
              ]
            : []),
          ...(blocker.blocking === true
            ? []
            : [`publicationBlockers[${index}].blocking 必须为 true`]),
          ...(!this.getNonEmptyString(blocker.message)
            ? [`publicationBlockers[${index}].message 缺失`]
            : []),
          ...(this.getStringArray(blocker.gateIds).length === 0
            ? [`publicationBlockers[${index}].gateIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publicationBlockers[${index}].gateIds`,
            this.getStringArray(blocker.gateIds),
            knownGateIds,
          ),
          ...(this.getStringArray(blocker.evidenceIds).length === 0
            ? [`publicationBlockers[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publicationBlockers[${index}].evidenceIds`,
            this.getStringArray(blocker.evidenceIds),
            knownEvidenceIds,
          ),
          ...(this.getStringArray(blocker.artifactIds).length === 0
            ? [`publicationBlockers[${index}].artifactIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `publicationBlockers[${index}].artifactIds`,
            this.getStringArray(blocker.artifactIds),
            knownArtifactIds,
          ),
        ];
      }),
    ];
    const rollbackIssues = [
      ...this.requireRecord(rollbackShareControls, 'rollbackShareControls'),
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
        : [
            'rollbackShareControls.enableShareControl 必须引用启用公开分享接口',
          ]),
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
      ...this.requireRecord(finalVerdict, 'finalVerdict'),
      ...verdictFieldNames
        .filter(
          (field) =>
            !new Set<string>([...GATE_7_ALLOWED_FINAL_VERDICT_FIELDS]).has(
              field,
            ),
        )
        .map(
          (field) =>
            `finalVerdict 包含非法 verdict field ${this.formatIssueValue(
              field,
            )}`,
        ),
      ...this.buildMissingItemsIssues(
        'finalVerdict fields',
        verdictFieldNames,
        [...GATE_7_ALLOWED_FINAL_VERDICT_FIELDS],
      ),
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
      ...this.buildMissingItemsIssues(
        'finalVerdict.requiredRealGateRunnerIds',
        finalVerdictRequiredRealGateRunnerIds,
        [...GATE_7_REQUIRED_REAL_GATE_RUNNER_IDS],
      ),
      ...this.buildUnknownReferenceIssues(
        'finalVerdict.requiredRealGateRunnerIds',
        finalVerdictRequiredRealGateRunnerIds,
        allowedFinalVerdictRealGateRunnerIds,
      ),
      ...this.buildDuplicateItemIssues(
        'finalVerdict.requiredRealGateRunnerIds',
        finalVerdictRequiredRealGateRunnerIds,
      ),
      ...(this.getStringArray(finalVerdict?.evidenceIds).length === 0
        ? ['finalVerdict.evidenceIds 不能为空']
        : []),
      ...this.buildUnknownReferenceIssues(
        'finalVerdict.evidenceIds',
        this.getStringArray(finalVerdict?.evidenceIds),
        knownEvidenceIds,
      ),
      ...(this.getStringArray(finalVerdict?.repairSuggestions).length === 0
        ? ['finalVerdict.repairSuggestions 不能为空']
        : []),
    ];
    const requirementCoverageById = new Map(
      requirementCoverage
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
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
          const gateId = this.getNonEmptyString(entry.gateId);
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
          const artifactId = this.getNonEmptyString(entry.artifactId);
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
        const requirementId = this.getNonEmptyString(entry.requirementId);

        return [
          ...(!requirementId
            ? [`requirementCoverage[${index}].requirementId 缺失`]
            : []),
          ...(requirementId && !knownRequirementIds.has(requirementId)
            ? [
                `requirementCoverage[${index}].requirementId 引用了未知需求 ${this.formatIssueValue(
                  requirementId,
                )}`,
              ]
            : []),
          ...(this.getStringArray(entry.scenarioIds).length === 0
            ? [`requirementCoverage[${index}].scenarioIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...(this.getStringArray(entry.gateIds).length === 0
            ? [`requirementCoverage[${index}].gateIds 不能为空`]
            : []),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            requiredGateIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].gateIds`,
            this.getStringArray(entry.gateIds),
            knownGateIds,
          ),
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`requirementCoverage[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...(this.getStringArray(entry.artifactIds).length === 0
            ? [`requirementCoverage[${index}].artifactIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].artifactIds`,
            this.getStringArray(entry.artifactIds),
            knownArtifactIds,
          ),
          ...(!publishCandidateAllowed &&
          this.getStringArray(entry.blockerIds).length === 0
            ? [`requirementCoverage[${index}].blockerIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].blockerIds`,
            this.getStringArray(entry.blockerIds),
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
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            expectedScenarioIds,
          ),
        ];
      }),
      ...(gateCoverage.length === 0 ? ['gateCoverage 不能为空'] : []),
      ...gateCoverage.flatMap((entry, index) => {
        const gateId = this.getNonEmptyString(entry.gateId);
        const requiredRealGateRunnerId = this.getNonEmptyString(
          entry.requiredRealGateRunnerId,
        );
        const expectedRealGateRunnerId = gateId
          ? this.resolveGate7RequiredRealRunnerId(gateId)
          : null;

        return [
          ...(!gateId ? [`gateCoverage[${index}].gateId 缺失`] : []),
          ...(gateId && !knownGateIds.has(gateId)
            ? [
                `gateCoverage[${index}].gateId 引用了未知 gate ${this.formatIssueValue(
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
          ...(!this.getNonEmptyString(entry.executionLevel)
            ? [`gateCoverage[${index}].executionLevel 缺失`]
            : []),
          ...(!requiredRealGateRunnerId
            ? [`gateCoverage[${index}].requiredRealGateRunnerId 缺失`]
            : []),
          ...(requiredRealGateRunnerId &&
          !allowedGateCoverageRealGateRunnerIds.has(requiredRealGateRunnerId)
            ? [
                `gateCoverage[${index}].requiredRealGateRunnerId 引用了未知 real runner ${this.formatIssueValue(
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
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`gateCoverage[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `gateCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
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
        const artifactId = this.getNonEmptyString(entry.artifactId);
        const kind = this.getNonEmptyString(entry.kind);
        const manifestArtifact = artifactId
          ? artifactReleaseManifest.find(
              (artifact) =>
                this.getNonEmptyString(artifact.artifactId) === artifactId,
            )
          : undefined;

        return [
          ...(!artifactId
            ? [`artifactCoverage[${index}].artifactId 缺失`]
            : []),
          ...(artifactId && !knownArtifactIds.has(artifactId)
            ? [
                `artifactCoverage[${index}].artifactId 引用了未知 artifact ${this.formatIssueValue(
                  artifactId,
                )}`,
              ]
            : []),
          ...(!kind ? [`artifactCoverage[${index}].kind 缺失`] : []),
          ...(kind && !allowedArtifactKinds.has(kind)
            ? [
                `artifactCoverage[${index}].kind 是非法 artifact kind ${this.formatIssueValue(
                  kind,
                )}`,
              ]
            : []),
          ...(manifestArtifact &&
          kind &&
          this.getNonEmptyString(manifestArtifact.kind) !== kind
            ? [
                `artifactCoverage[${index}].kind 与 artifactReleaseManifest 不一致`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `artifactCoverage[${index}].sourceGateId`,
            this.getStringArray([entry.sourceGateId]),
            knownGateIds,
          ),
          ...(this.getStringArray(entry.evidenceIds).length === 0
            ? [`artifactCoverage[${index}].evidenceIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `artifactCoverage[${index}].evidenceIds`,
            this.getStringArray(entry.evidenceIds),
            knownEvidenceIds,
          ),
          ...(this.getStringArray(entry.requirementIds).length === 0
            ? [`artifactCoverage[${index}].requirementIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `artifactCoverage[${index}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.scenarioIds).length === 0
            ? [`artifactCoverage[${index}].scenarioIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `artifactCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
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
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(publishCandidatePlan.failureCaptureFields),
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

  private buildGate4Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: unknown,
  ): Gate4Check[] {
    if (!this.isRecord(integrationPlan)) {
      return [
        {
          id: 'integration-plan-object',
          label: 'IntegrationPlan JSON 对象',
          passed: false,
          summary:
            '检查 generationPlan.integrationPlan 是否为结构化 JSON 对象。',
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
    const expectedDependencyArtifactIds =
      buildUnitPlan.artifactExpectations.map((artifact) => artifact.artifactId);
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

    const testTenant = this.getRecord(integrationPlan.testTenant);
    const testResources = this.getRecord(integrationPlan.testResources);
    const publicRuntimeApiChecks = this.getRecordArray(
      integrationPlan.publicRuntimeApiChecks,
    );
    const creatorManagementApiChecks = this.getRecordArray(
      integrationPlan.creatorManagementApiChecks,
    );
    const dryRunExpectations = this.getRecord(
      integrationPlan.agentWorkflowDryRunExpectations,
    );
    const dryRunFixtures = this.getRecordArray(dryRunExpectations?.fixtures);
    const pluginSmokeExpectations = this.getRecord(
      integrationPlan.pluginSandboxSmokeExpectations,
    );
    const pluginSmokeTools = this.getRecordArray(
      pluginSmokeExpectations?.tools,
    );
    const dependencyArtifacts = this.getRecordArray(
      integrationPlan.dependencyArtifacts,
    );
    const acceptanceScenarioCoverage = this.getRecordArray(
      integrationPlan.acceptanceScenarioCoverage,
    );
    const requirementCoverage = this.getRecordArray(
      integrationPlan.requirementCoverage,
    );
    const orchestrationCoverage = this.getRecordArray(
      integrationPlan.orchestrationCoverage,
    );
    const traceArtifacts = this.getRecordArray(integrationPlan.traceArtifacts);

    const publicCheckIds = publicRuntimeApiChecks
      .map((check) => this.getNonEmptyString(check.checkId))
      .filter((checkId): checkId is string => checkId !== null);
    const creatorCheckIds = creatorManagementApiChecks
      .map((check) => this.getNonEmptyString(check.checkId))
      .filter((checkId): checkId is string => checkId !== null);
    const pluginSmokeCheckIds = pluginSmokeTools
      .map((tool) => this.getNonEmptyString(tool.smokeCheckId))
      .filter((checkId): checkId is string => checkId !== null);
    const dryRunFixtureIds = dryRunFixtures
      .map((fixture) => this.getNonEmptyString(fixture.fixtureId))
      .filter((fixtureId): fixtureId is string => fixtureId !== null);
    const dependencyArtifactIds = dependencyArtifacts
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const traceArtifactIds = traceArtifacts
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
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
      ...(!this.getNonEmptyString(integrationPlan.skeletonDisclaimer)
        ? ['skeletonDisclaimer 缺失']
        : []),
    ];
    const testTenantIssues = [
      ...this.requireRecord(testTenant, 'testTenant'),
      ...(testTenant?.tenantKind === 'synthetic'
        ? []
        : ['testTenant.tenantKind 必须为 synthetic']),
      ...(!this.getNonEmptyString(testTenant?.tenantAlias)
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
      ...this.collectSensitiveTokenIssues(integrationPlan),
    ];
    const testResourceIssues = [
      ...this.requireRecord(testResources, 'testResources'),
      ...(testResources?.resourceIsolation === 'ephemeral-test-resources-only'
        ? []
        : [
            'testResources.resourceIsolation 必须为 ephemeral-test-resources-only',
          ]),
      ...(testResources?.usesRealTokens === false
        ? []
        : ['testResources.usesRealTokens 必须为 false']),
      ...(!this.getNonEmptyString(testResources?.generatedAppWorkspacePath)
        ? ['testResources.generatedAppWorkspacePath 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'testResources.generatedAppWorkspacePath',
        this.getNonEmptyString(testResources?.generatedAppWorkspacePath),
      ),
      ...(!this.getNonEmptyString(testResources?.fixtureDirectory)
        ? ['testResources.fixtureDirectory 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'testResources.fixtureDirectory',
        this.getNonEmptyString(testResources?.fixtureDirectory),
      ),
      ...this.buildMissingItemsIssues(
        'testResources.requiredScenarioIds',
        this.getStringArray(testResources?.requiredScenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testResources.requiredScenarioIds',
        this.getStringArray(testResources?.requiredScenarioIds),
        knownScenarioIds,
      ),
    ];
    const publicRuntimeApiIssues = [
      ...(publicRuntimeApiChecks.length === 0
        ? ['publicRuntimeApiChecks 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publicRuntimeApiChecks.checkId',
        publicCheckIds,
        [...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'publicRuntimeApiChecks.checkId',
        publicCheckIds,
      ),
      ...publicRuntimeApiChecks.flatMap((check, index) => {
        const checkId = this.getNonEmptyString(check.checkId);
        const kind = this.getNonEmptyString(check.kind);
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
          ...(!checkId
            ? [`publicRuntimeApiChecks[${index}].checkId 缺失`]
            : []),
          ...(checkId && !expectedPublicCheckKinds.has(checkId)
            ? [
                `publicRuntimeApiChecks[${index}].checkId 引用了未知 API check ${this.formatIssueValue(
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
          ...(!this.getNonEmptyString(check.pathTemplate)
            ? [`publicRuntimeApiChecks[${index}].pathTemplate 缺失`]
            : []),
          ...(this.getNonEmptyString(check.pathTemplate) &&
          !this.getNonEmptyString(check.pathTemplate)!.startsWith(
            '/generated-apps/public/{token}',
          )
            ? [
                `publicRuntimeApiChecks[${index}].pathTemplate 必须停留在 public token runtime surface`,
              ]
            : []),
          ...(this.getNonEmptyString(check.pathTemplate)?.includes('{appId}') ||
          this.getNonEmptyString(check.pathTemplate)?.includes(
            '/generation-runs',
          ) ||
          this.getNonEmptyString(check.pathTemplate)?.includes('/gate-runs')
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
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            requiredStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].scenarioIds`,
            this.getStringArray(check.scenarioIds),
            scenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].scenarioIds`,
            this.getStringArray(check.scenarioIds),
            knownScenarioIds,
          ),
          ...(this.getStringArray(check.payloadContractRefs).length === 0
            ? [`publicRuntimeApiChecks[${index}].payloadContractRefs 不能为空`]
            : []),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].payloadContractRefs`,
            this.getStringArray(check.payloadContractRefs),
            requiredPayloadContractRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].payloadContractRefs`,
            this.getStringArray(check.payloadContractRefs),
            new Set([...GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS]),
          ),
        ];
      }),
    ];
    const creatorApiIssues = [
      ...(creatorManagementApiChecks.length === 0
        ? ['creatorManagementApiChecks 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'creatorManagementApiChecks.checkId',
        creatorCheckIds,
        [...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'creatorManagementApiChecks.checkId',
        creatorCheckIds,
      ),
      ...creatorManagementApiChecks.flatMap((check, index) => {
        const checkId = this.getNonEmptyString(check.checkId);
        const kind = this.getNonEmptyString(check.kind);
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
                `creatorManagementApiChecks[${index}].checkId 引用了未知 API check ${this.formatIssueValue(
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
          ...(!this.getNonEmptyString(check.pathTemplate)
            ? [`creatorManagementApiChecks[${index}].pathTemplate 缺失`]
            : []),
          ...(this.getNonEmptyString(check.pathTemplate) &&
          !this.getNonEmptyString(check.pathTemplate)!.startsWith(
            '/generated-apps/{appId}',
          )
            ? [
                `creatorManagementApiChecks[${index}].pathTemplate 必须停留在 creator app surface`,
              ]
            : []),
          ...(this.getNonEmptyString(check.pathTemplate)?.includes(
            '/public/{token}',
          )
            ? [
                `creatorManagementApiChecks[${index}].pathTemplate 不得串入 public token API boundary`,
              ]
            : []),
          ...(check.expectedStatus === 200
            ? []
            : [
                `creatorManagementApiChecks[${index}].expectedStatus 必须为 200`,
              ]),
          ...this.buildMissingItemsIssues(
            `creatorManagementApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            requiredStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildMissingItemsIssues(
            `creatorManagementApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const dryRunIssues = [
      ...this.requireRecord(
        dryRunExpectations,
        'agentWorkflowDryRunExpectations',
      ),
      ...(GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS.includes(
        this.getNonEmptyString(
          dryRunExpectations?.expectationLevel,
        ) as (typeof GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS)[number],
      )
        ? []
        : [
            `agentWorkflowDryRunExpectations.expectationLevel 必须为 ${GATE_4_ALLOWED_DRY_RUN_EXPECTATION_LEVELS.join(
              ' | ',
            )} 之一`,
          ]),
      ...this.buildMissingItemsIssues(
        'agentWorkflowDryRunExpectations.orchestrationNodeIds',
        this.getStringArray(dryRunExpectations?.orchestrationNodeIds),
        orchestrationNodeIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'agentWorkflowDryRunExpectations.orchestrationNodeIds',
        this.getStringArray(dryRunExpectations?.orchestrationNodeIds),
        knownOrchestrationNodeIds,
      ),
      ...this.buildMissingItemsIssues(
        'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
        this.getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
        orchestrationEdgeRefs,
      ),
      ...this.buildUnknownReferenceIssues(
        'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
        this.getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
        knownOrchestrationEdgeRefs,
      ),
      ...(dryRunFixtures.length === 0
        ? ['agentWorkflowDryRunExpectations.fixtures 不能为空']
        : []),
      ...this.buildDuplicateItemIssues(
        'agentWorkflowDryRunExpectations.fixtures.fixtureId',
        dryRunFixtureIds,
      ),
      ...scenarioIds.flatMap((scenarioId) =>
        dryRunFixtures.some(
          (fixture) =>
            this.getNonEmptyString(fixture.scenarioId) === scenarioId,
        )
          ? []
          : [`场景 ${scenarioId} 缺少 Agent/Workflow dry-run fixture`],
      ),
      ...dryRunFixtures.flatMap((fixture, index) => {
        const scenarioId = this.getNonEmptyString(fixture.scenarioId);
        const scenario = scenarioId
          ? appSpec.acceptanceScenarios.find(
              (candidate) => candidate.id === scenarioId,
            )
          : null;
        const inputMapping = this.getRecord(fixture.inputMapping);
        const outputMapping = this.getRecord(fixture.outputMapping);

        return [
          ...(!this.getNonEmptyString(fixture.fixtureId)
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
                `agentWorkflowDryRunExpectations.fixtures[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...(scenario
            ? this.buildMissingItemsIssues(
                `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
                this.getStringArray(fixture.requirementIds),
                scenario.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
            this.getStringArray(fixture.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
            this.getStringArray(fixture.orchestrationNodeIds),
            orchestrationNodeIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
            this.getStringArray(fixture.orchestrationNodeIds),
            knownOrchestrationNodeIds,
          ),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
            this.getStringArray(fixture.orchestrationEdgeRefs),
            orchestrationEdgeRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
            this.getStringArray(fixture.orchestrationEdgeRefs),
            knownOrchestrationEdgeRefs,
          ),
          ...this.requireRecord(
            inputMapping,
            `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping`,
          ),
          ...(inputMapping?.staticContractId ===
          'gate-2-public-runtime-contract'
            ? []
            : [
                `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
              ]),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.requiredFields`,
            this.getStringArray(inputMapping?.requiredFields),
            staticContracts.publicRuntime.input.requiredFields,
          ),
          ...this.requireRecord(
            outputMapping,
            `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping`,
          ),
          ...(outputMapping?.staticContractId ===
          'gate-2-public-runtime-contract'
            ? []
            : [
                `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
              ]),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.destinations`,
            this.getStringArray(outputMapping?.destinations),
            staticContracts.publicRuntime.output.destinations,
          ),
          ...(this.getStringArray(fixture.traceArtifactIds).length === 0
            ? [
                `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds 不能为空`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds`,
            this.getStringArray(fixture.traceArtifactIds),
            knownActualTraceArtifactIds,
          ),
        ];
      }),
    ];
    const pluginSmokeIssues = [
      ...this.requireRecord(
        pluginSmokeExpectations,
        'pluginSandboxSmokeExpectations',
      ),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      pluginSmokeTools.length > 0
        ? ['无插件计划时 pluginSandboxSmokeExpectations.tools 必须为空']
        : []),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginSmokeExpectations?.emptyReason)
        ? [
            '无插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须说明原因',
          ]
        : []),
      ...(generationPlan.pluginTools.tools.length > 0 &&
      pluginSmokeExpectations?.emptyReason !== null
        ? [
            '有插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须为 null',
          ]
        : []),
      ...generationPlan.pluginTools.tools
        .filter(
          (plannedTool) =>
            !pluginSmokeTools.some(
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少 Gate 4 sandbox smoke 期望`,
        ),
      ...(generationPlan.pluginTools.tools.length > 0
        ? [
            ...this.buildMissingItemsIssues(
              'pluginSandboxSmokeExpectations.tools.smokeCheckId',
              pluginSmokeCheckIds,
              expectedPluginSmokeCheckIds,
            ),
            ...this.buildDuplicateItemIssues(
              'pluginSandboxSmokeExpectations.tools.smokeCheckId',
              pluginSmokeCheckIds,
            ),
          ]
        : []),
      ...pluginSmokeTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
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
                `pluginSandboxSmokeExpectations.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.smokeCheckId)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 缺失`,
              ]
            : []),
          ...(expectedSmokeCheckId && tool.smokeCheckId !== expectedSmokeCheckId
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 必须为 ${expectedSmokeCheckId}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.artifactId)
            ? [`pluginSandboxSmokeExpectations.tools[${index}].artifactId 缺失`]
            : []),
          ...(expectedArtifactId && tool.artifactId !== expectedArtifactId
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].artifactId 必须引用 ${expectedArtifactId}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].artifactId`,
            this.getStringArray([tool.artifactId]),
            knownDependencyArtifactIds,
          ),
          ...(!this.getNonEmptyString(tool.fixturePath)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].fixturePath 缺失`,
              ]
            : []),
          ...this.buildSafeRelativePathIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].fixturePath`,
            this.getNonEmptyString(tool.fixturePath),
          ),
          ...(!this.getNonEmptyString(tool.expectedTraceArtifactId)
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
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId`,
            this.getStringArray([tool.expectedTraceArtifactId]),
            knownActualTraceArtifactIds,
          ),
          ...(tool.sandboxRuntime === 'wasm-extism'
            ? []
            : [
                `pluginSandboxSmokeExpectations.tools[${index}].sandboxRuntime 必须为 wasm-extism`,
              ]),
          ...(plannedTool
            ? this.buildMissingItemsIssues(
                `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
                this.getStringArray(tool.requirementIds),
                plannedTool.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const dependencyArtifactIssues = [
      ...(dependencyArtifacts.length === 0
        ? ['dependencyArtifacts 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
        expectedDependencyArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
        knownDependencyArtifactIds,
      ),
      ...this.buildDuplicateItemIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
      ),
      ...dependencyArtifacts.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`dependencyArtifacts[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`dependencyArtifacts[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !GATE_3_ARTIFACT_KINDS.includes(
          this.getNonEmptyString(
            artifact.kind,
          ) as (typeof GATE_3_ARTIFACT_KINDS)[number],
        )
          ? [
              `dependencyArtifacts[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(this.getNonEmptyString(artifact.artifactId) &&
        this.getNonEmptyString(artifact.kind) &&
        expectedArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== undefined &&
        expectedArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== this.getNonEmptyString(artifact.kind)
          ? [
              `dependencyArtifacts[${index}].kind 与 Gate 3 artifact ${this.formatIssueValue(
                this.getNonEmptyString(artifact.artifactId) ?? '',
              )} 不一致`,
            ]
          : []),
        ...(artifact.sourceGateId === 'gate-3'
          ? []
          : [`dependencyArtifacts[${index}].sourceGateId 必须为 gate-3`]),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`dependencyArtifacts[${index}].path 缺失`]
          : []),
        ...this.buildSafeRelativePathIssues(
          `dependencyArtifacts[${index}].path`,
          this.getNonEmptyString(artifact.path),
        ),
        ...(artifact.required === true
          ? []
          : [`dependencyArtifacts[${index}].required 必须为 true`]),
      ]),
    ];
    const scenarioCoverageById = new Map(
      acceptanceScenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
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
        const scenarioId = this.getNonEmptyString(entry.scenarioId);

        return [
          ...(!scenarioId
            ? [`acceptanceScenarioCoverage[${index}].scenarioId 缺失`]
            : []),
          ...(scenarioId && !knownScenarioIds.has(scenarioId)
            ? [
                `acceptanceScenarioCoverage[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            knownGate4CheckIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].fixtureIds`,
            this.getStringArray(entry.fixtureIds),
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
          ...this.buildMissingItemsIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            scenario?.requirementIds ?? [],
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [
                `acceptanceScenarioCoverage[${scenarioId}].coveredByCheckIds 不能为空`,
              ]
            : []),
          ...(this.getStringArray(entry.fixtureIds).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].fixtureIds 不能为空`]
            : []),
        ];
      }),
    ];
    const requirementCoverageById = new Map(
      requirementCoverage
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
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
        const requirementId = this.getNonEmptyString(entry.requirementId);

        return [
          ...(!requirementId
            ? [`requirementCoverage[${index}].requirementId 缺失`]
            : []),
          ...(requirementId && !knownRequirementIds.has(requirementId)
            ? [
                `requirementCoverage[${index}].requirementId 引用了未知需求 ${this.formatIssueValue(
                  requirementId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            knownGate4CheckIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].dependencyArtifactIds`,
            this.getStringArray(entry.dependencyArtifactIds),
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
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            expectedScenarioIds,
          ),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [
                `requirementCoverage[${requirementId}].coveredByCheckIds 不能为空`,
              ]
            : []),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            expectedGate4CheckIds,
          ),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].dependencyArtifactIds`,
            this.getStringArray(entry.dependencyArtifactIds),
            expectedDependencyArtifactIds,
          ),
        ];
      }),
    ];
    const orchestrationCoverageByNodeId = new Map(
      orchestrationCoverage
        .map((entry) => {
          const nodeId = this.getNonEmptyString(entry.nodeId);
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
        const nodeId = this.getNonEmptyString(entry.nodeId);

        return [
          ...(!nodeId ? [`orchestrationCoverage[${index}].nodeId 缺失`] : []),
          ...(nodeId && !knownOrchestrationNodeIds.has(nodeId)
            ? [
                `orchestrationCoverage[${index}].nodeId 引用了未知编排节点 ${this.formatIssueValue(
                  nodeId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].edgeRefs`,
            this.getStringArray(entry.edgeRefs),
            knownOrchestrationEdgeRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].coveredByFixtureIds`,
            this.getStringArray(entry.coveredByFixtureIds),
            knownDryRunFixtureIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
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
          ...this.buildMissingItemsIssues(
            `orchestrationCoverage[${nodeId}].edgeRefs`,
            this.getStringArray(entry.edgeRefs),
            orchestrationEdgeRefs,
          ),
          ...(this.getStringArray(entry.coveredByFixtureIds).length === 0
            ? [`orchestrationCoverage[${nodeId}].coveredByFixtureIds 不能为空`]
            : []),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [`orchestrationCoverage[${nodeId}].coveredByCheckIds 不能为空`]
            : []),
        ];
      }),
    ];
    const traceArtifactIssues = [
      ...(traceArtifacts.length === 0 ? ['traceArtifacts 不能为空'] : []),
      ...this.buildMissingItemsIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
        expectedTraceArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
        new Set(expectedTraceArtifactIds),
      ),
      ...this.buildDuplicateItemIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
      ),
      ...traceArtifacts.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`traceArtifacts[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`traceArtifacts[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !GATE_4_TRACE_ARTIFACT_KINDS.includes(
          this.getNonEmptyString(
            artifact.kind,
          ) as (typeof GATE_4_TRACE_ARTIFACT_KINDS)[number],
        )
          ? [
              `traceArtifacts[${index}].kind 必须是 ${GATE_4_TRACE_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(this.getNonEmptyString(artifact.artifactId) &&
        this.getNonEmptyString(artifact.kind) &&
        expectedTraceArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== undefined &&
        expectedTraceArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== this.getNonEmptyString(artifact.kind)
          ? [
              `traceArtifacts[${index}].kind 与 trace artifact ${this.formatIssueValue(
                this.getNonEmptyString(artifact.artifactId) ?? '',
              )} 不一致`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`traceArtifacts[${index}].path 缺失`]
          : []),
        ...this.buildSafeRelativePathIssues(
          `traceArtifacts[${index}].path`,
          this.getNonEmptyString(artifact.path),
        ),
        ...(this.getStringArray(artifact.producedByCheckIds).length === 0
          ? [`traceArtifacts[${index}].producedByCheckIds 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `traceArtifacts[${index}].producedByCheckIds`,
          this.getStringArray(artifact.producedByCheckIds),
          knownGate4CheckIds,
        ),
      ]),
    ];
    const failureCaptureIssues = [
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(integrationPlan.failureCaptureFields),
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
        passed:
          testTenantIssues.length === 0 && testResourceIssues.length === 0,
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

  private buildGate3Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: unknown,
  ): Gate3Check[] {
    if (!this.isRecord(buildUnitPlan)) {
      return [
        {
          id: 'build-unit-plan-object',
          label: 'BuildUnitPlan JSON 对象',
          passed: false,
          summary: '检查 generationPlan.buildUnitPlan 是否为结构化 JSON 对象。',
          issues: ['buildUnitPlan 不是对象'],
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
    const routeIds = staticContracts.frontendRoutes.map(
      (route) => route.pageId,
    );
    const knownRouteIds = new Set(routeIds);
    const knownStaticContractIds = new Set<string>([
      ...GATE_2_STATIC_CONTRACT_IDS,
    ]);
    const expectedArtifactIds = [
      ...GATE_3_CORE_ARTIFACT_IDS,
      ...generationPlan.pluginTools.tools.map(
        (tool) => `plugin-bundle-${tool.toolId}`,
      ),
    ];
    const expectedArtifactIdSet = new Set<string>(expectedArtifactIds);
    const knownArtifactKinds = new Set<string>(GATE_3_ARTIFACT_KINDS);
    const knownGate3CoverageIds = new Set<string>(GATE_3_COVERAGE_TARGET_IDS);
    const plannedToolIds = new Set(
      generationPlan.pluginTools.tools.map((tool) => tool.toolId),
    );
    const plannedToolById = new Map(
      generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
    );

    const frontendBuild = this.getRecord(buildUnitPlan.frontendBuild);
    const typecheck = this.getRecord(buildUnitPlan.typecheck);
    const unitTests = this.getRecord(buildUnitPlan.unitTests);
    const componentGoldenTests = this.getRecord(
      buildUnitPlan.componentGoldenTests,
    );
    const generationWorkspace = this.getRecord(
      buildUnitPlan.generationWorkspace,
    );
    const workspaceMaterializedFrom = this.getRecord(
      generationWorkspace?.materializedFrom,
    );
    const workspaceWritePolicy = this.getRecord(
      generationWorkspace?.writePolicy,
    );
    const workspaceFiles = this.getRecordArray(generationWorkspace?.files);
    const workspaceArtifactPaths = this.getRecord(
      generationWorkspace?.artifactPaths,
    );
    const commandPlan = this.getRecordArray(buildUnitPlan.commandPlan);
    const artifactExpectations = this.getRecordArray(
      buildUnitPlan.artifactExpectations,
    );
    const staticContractsCoverage = this.getRecordArray(
      buildUnitPlan.staticContractsCoverage,
    );
    const acceptanceScenarioCoverage = this.getRecordArray(
      buildUnitPlan.acceptanceScenarioCoverage,
    );
    const pluginBuildExpectations = this.getRecord(
      buildUnitPlan.pluginBuildExpectations,
    );
    const pluginBuildTools = this.getRecordArray(
      pluginBuildExpectations?.tools,
    );

    const artifactIds = artifactExpectations
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const coveredStaticContractIds = new Set(
      staticContractsCoverage
        .map((entry) => this.getNonEmptyString(entry.staticContractId))
        .filter((staticContractId): staticContractId is string => {
          return staticContractId !== null;
        }),
    );
    const scenarioCoverageById = new Map(
      acceptanceScenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
          return scenarioId ? ([scenarioId, entry] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, unknown>] =>
            entry !== null,
        ),
    );

    const versionIssues = [
      ...(buildUnitPlan.planVersion === 1 ? [] : ['planVersion 必须为 1']),
      ...(buildUnitPlan.appSpecVersion === appSpec.version
        ? []
        : [
            `appSpecVersion=${String(
              buildUnitPlan.appSpecVersion,
            )} 与 AppSpec version=${appSpec.version} 不一致`,
          ]),
      ...(buildUnitPlan.generationPlanVersion === generationPlan.planVersion
        ? []
        : [
            `generationPlanVersion=${String(
              buildUnitPlan.generationPlanVersion,
            )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
          ]),
      ...(buildUnitPlan.staticContractsVersion ===
      staticContracts.contractVersion
        ? []
        : [
            `staticContractsVersion=${String(
              buildUnitPlan.staticContractsVersion,
            )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
          ]),
      ...(typeof buildUnitPlan.executionLevel === 'string' &&
      GATE_3_ALLOWED_EXECUTION_LEVELS.includes(
        buildUnitPlan.executionLevel as (typeof GATE_3_ALLOWED_EXECUTION_LEVELS)[number],
      )
        ? []
        : [
            `executionLevel 必须为 ${GATE_3_ALLOWED_EXECUTION_LEVELS.join(
              ' | ',
            )} 之一`,
          ]),
    ];
    const workspaceRelativePath = this.getNonEmptyString(
      generationWorkspace?.relativePath,
    );
    const workspaceFilePaths = workspaceFiles
      .map((file) => this.getNonEmptyString(file.path))
      .filter((path): path is string => path !== null);
    const workspaceIssues = [
      ...this.requireRecord(generationWorkspace, 'generationWorkspace'),
      ...(generationWorkspace?.contractVersion === 1
        ? []
        : ['generationWorkspace.contractVersion 必须为 1']),
      ...(generationWorkspace?.storageKind ===
      'server-controlled-local-workspace'
        ? []
        : [
            'generationWorkspace.storageKind 必须为 server-controlled-local-workspace',
          ]),
      ...(generationWorkspace?.rootLabel === 'generated-app-workspaces'
        ? []
        : ['generationWorkspace.rootLabel 必须为 generated-app-workspaces']),
      ...(!this.getNonEmptyString(generationWorkspace?.workspaceId)
        ? ['generationWorkspace.workspaceId 缺失']
        : []),
      ...(!workspaceRelativePath
        ? ['generationWorkspace.relativePath 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'generationWorkspace.relativePath',
        workspaceRelativePath,
      ),
      ...(generationWorkspace?.scaffold === 'react-vite-typescript'
        ? []
        : ['generationWorkspace.scaffold 必须为 react-vite-typescript']),
      ...this.requireRecord(
        workspaceMaterializedFrom,
        'generationWorkspace.materializedFrom',
      ),
      ...(workspaceMaterializedFrom?.appSpecVersion === appSpec.version
        ? []
        : [
            `generationWorkspace.materializedFrom.appSpecVersion=${String(
              workspaceMaterializedFrom?.appSpecVersion,
            )} 与 AppSpec version=${appSpec.version} 不一致`,
          ]),
      ...(workspaceMaterializedFrom?.staticContractsVersion ===
      staticContracts.contractVersion
        ? []
        : [
            `generationWorkspace.materializedFrom.staticContractsVersion=${String(
              workspaceMaterializedFrom?.staticContractsVersion,
            )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
          ]),
      ...this.requireRecord(
        workspaceWritePolicy,
        'generationWorkspace.writePolicy',
      ),
      ...(workspaceWritePolicy?.arbitraryPathWriteAllowed === false
        ? []
        : [
            'generationWorkspace.writePolicy.arbitraryPathWriteAllowed 必须为 false',
          ]),
      ...(workspaceWritePolicy?.traversalGuard ===
      'resolve-inside-workspace-root'
        ? []
        : [
            'generationWorkspace.writePolicy.traversalGuard 必须为 resolve-inside-workspace-root',
          ]),
      ...(workspaceWritePolicy?.exposesAbsoluteHostPath === false
        ? []
        : [
            'generationWorkspace.writePolicy.exposesAbsoluteHostPath 必须为 false',
          ]),
      ...this.buildMissingItemsIssues(
        'generationWorkspace.files.path',
        workspaceFilePaths,
        [...GATE_3_REQUIRED_WORKSPACE_FILE_PATHS],
      ),
      ...workspaceFilePaths.flatMap((path, index) =>
        this.buildSafeRelativePathIssues(
          `generationWorkspace.files[${index}].path`,
          path,
        ),
      ),
      ...this.requireRecord(
        workspaceArtifactPaths,
        'generationWorkspace.artifactPaths',
      ),
      ...[
        'sourceManifest',
        'sourceArchive',
        'buildOutput',
        'buildManifest',
        'unitReport',
        'componentGoldenReport',
        'coverageSummary',
      ].flatMap((field) =>
        this.getNonEmptyString(workspaceArtifactPaths?.[field])
          ? this.buildSafeRelativePathIssues(
              `generationWorkspace.artifactPaths.${field}`,
              this.getNonEmptyString(workspaceArtifactPaths?.[field]),
            )
          : [`generationWorkspace.artifactPaths.${field} 缺失`],
      ),
    ];
    const commandIds = commandPlan
      .map((command) => this.getNonEmptyString(command.commandId))
      .filter((commandId): commandId is string => commandId !== null);
    const knownCommandIds = new Set<string>([...GATE_3_REQUIRED_COMMAND_IDS]);
    const commandPlanIssues = [
      ...(commandPlan.length === 0 ? ['commandPlan 不能为空'] : []),
      ...this.buildMissingItemsIssues('commandPlan.commandId', commandIds, [
        ...GATE_3_REQUIRED_COMMAND_IDS,
      ]),
      ...this.buildUnknownReferenceIssues(
        'commandPlan.commandId',
        commandIds,
        knownCommandIds,
      ),
      ...this.buildDuplicateItemIssues('commandPlan.commandId', commandIds),
      ...commandPlan.flatMap((command, index) => {
        const commandId = this.getNonEmptyString(command.commandId);
        const commandText = this.getNonEmptyString(command.command);
        const expectedCommand =
          commandId && commandId in GATE_3_ALLOWED_COMMAND_BY_ID
            ? GATE_3_ALLOWED_COMMAND_BY_ID[
                commandId as (typeof GATE_3_REQUIRED_COMMAND_IDS)[number]
              ]
            : null;
        const workingDirectory = this.getNonEmptyString(
          command.workingDirectory,
        );

        return [
          ...(!commandId ? [`commandPlan[${index}].commandId 缺失`] : []),
          ...(!commandText ? [`commandPlan[${index}].command 缺失`] : []),
          ...(expectedCommand && commandText !== expectedCommand
            ? [
                `commandPlan[${index}].command 必须为受控命令 ${expectedCommand}`,
              ]
            : []),
          ...(!workingDirectory
            ? [`commandPlan[${index}].workingDirectory 缺失`]
            : []),
          ...this.buildSafeRelativePathIssues(
            `commandPlan[${index}].workingDirectory`,
            workingDirectory,
          ),
          ...(workspaceRelativePath &&
          workingDirectory &&
          workingDirectory !== workspaceRelativePath
            ? [
                `commandPlan[${index}].workingDirectory 必须等于 generationWorkspace.relativePath`,
              ]
            : []),
          ...(this.getStringArray(command.producesArtifactIds).length === 0
            ? [`commandPlan[${index}].producesArtifactIds 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `commandPlan[${index}].requirementIds`,
            this.getStringArray(command.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `commandPlan[${index}].scenarioIds`,
            this.getStringArray(command.scenarioIds),
            knownScenarioIds,
          ),
        ];
      }),
    ];
    const frontendBuildIssues = [
      ...this.requireRecord(frontendBuild, 'frontendBuild'),
      ...this.buildControlledCommandIssues(
        'frontendBuild.command',
        this.getNonEmptyString(frontendBuild?.command),
        'gate-3-frontend-build-command',
      ),
      ...(!this.getNonEmptyString(frontendBuild?.workingDirectory)
        ? ['frontendBuild.workingDirectory 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'frontendBuild.workingDirectory',
        this.getNonEmptyString(frontendBuild?.workingDirectory),
      ),
      ...(workspaceRelativePath &&
      this.getNonEmptyString(frontendBuild?.workingDirectory) &&
      this.getNonEmptyString(frontendBuild?.workingDirectory) !==
        workspaceRelativePath
        ? [
            'frontendBuild.workingDirectory 必须等于 generationWorkspace.relativePath',
          ]
        : []),
      ...this.buildMissingItemsIssues(
        'frontendBuild.routeIds',
        this.getStringArray(frontendBuild?.routeIds),
        routeIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.routeIds',
        this.getStringArray(frontendBuild?.routeIds),
        knownRouteIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.requirementIds',
        this.getStringArray(frontendBuild?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.requirementIds',
        this.getStringArray(frontendBuild?.requirementIds),
        knownRequirementIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.scenarioIds',
        this.getStringArray(frontendBuild?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.scenarioIds',
        this.getStringArray(frontendBuild?.scenarioIds),
        knownScenarioIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.expectedArtifacts',
        this.getStringArray(frontendBuild?.expectedArtifacts),
        ['dist/index.html', 'dist/assets/manifest.json'],
      ),
    ];
    const typecheckIssues = [
      ...this.requireRecord(typecheck, 'typecheck'),
      ...this.buildControlledCommandIssues(
        'typecheck.command',
        this.getNonEmptyString(typecheck?.command),
        'gate-3-typecheck-command',
      ),
      ...(!this.getNonEmptyString(typecheck?.tsconfigPath)
        ? ['typecheck.tsconfigPath 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'typecheck.tsconfigPath',
        this.getNonEmptyString(typecheck?.tsconfigPath),
      ),
      ...this.buildMissingItemsIssues(
        'typecheck.requirementIds',
        this.getStringArray(typecheck?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'typecheck.requirementIds',
        this.getStringArray(typecheck?.requirementIds),
        knownRequirementIds,
      ),
    ];
    const unitTestIssues = [
      ...this.requireRecord(unitTests, 'unitTests'),
      ...this.buildControlledCommandIssues(
        'unitTests.command',
        this.getNonEmptyString(unitTests?.command),
        'gate-3-unit-test-command',
      ),
      ...(!this.getNonEmptyString(unitTests?.entry)
        ? ['unitTests.entry 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'unitTests.entry',
        this.getNonEmptyString(unitTests?.entry),
      ),
      ...this.buildMissingItemsIssues(
        'unitTests.requirementIds',
        this.getStringArray(unitTests?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'unitTests.requirementIds',
        this.getStringArray(unitTests?.requirementIds),
        knownRequirementIds,
      ),
      ...this.buildMissingItemsIssues(
        'unitTests.scenarioIds',
        this.getStringArray(unitTests?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'unitTests.scenarioIds',
        this.getStringArray(unitTests?.scenarioIds),
        knownScenarioIds,
      ),
    ];
    const componentGoldenIssues = [
      ...this.requireRecord(componentGoldenTests, 'componentGoldenTests'),
      ...this.buildControlledCommandIssues(
        'componentGoldenTests.command',
        this.getNonEmptyString(componentGoldenTests?.command),
        'gate-3-component-golden-test-entry',
      ),
      ...(!this.getNonEmptyString(componentGoldenTests?.entry)
        ? ['componentGoldenTests.entry 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'componentGoldenTests.entry',
        this.getNonEmptyString(componentGoldenTests?.entry),
      ),
      ...(!this.getNonEmptyString(componentGoldenTests?.goldenArtifactPath)
        ? ['componentGoldenTests.goldenArtifactPath 缺失']
        : []),
      ...this.buildSafeRelativePathIssues(
        'componentGoldenTests.goldenArtifactPath',
        this.getNonEmptyString(componentGoldenTests?.goldenArtifactPath),
      ),
      ...this.buildMissingItemsIssues(
        'componentGoldenTests.scenarioIds',
        this.getStringArray(componentGoldenTests?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'componentGoldenTests.scenarioIds',
        this.getStringArray(componentGoldenTests?.scenarioIds),
        knownScenarioIds,
      ),
    ];
    const artifactIssues = [
      ...(artifactExpectations.length === 0
        ? ['artifactExpectations 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'artifactExpectations.artifactId',
        artifactIds,
        expectedArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'artifactExpectations.artifactId',
        artifactIds,
        expectedArtifactIdSet,
      ),
      ...this.buildDuplicateItemIssues(
        'artifactExpectations.artifactId',
        artifactIds,
      ),
      ...artifactExpectations.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`artifactExpectations[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`artifactExpectations[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !knownArtifactKinds.has(this.getNonEmptyString(artifact.kind) ?? '')
          ? [
              `artifactExpectations[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`artifactExpectations[${index}].path 缺失`]
          : []),
        ...this.buildSafeRelativePathIssues(
          `artifactExpectations[${index}].path`,
          this.getNonEmptyString(artifact.path),
        ),
        ...(artifact.required === true
          ? []
          : [`artifactExpectations[${index}].required 必须为 true`]),
      ]),
    ];
    const staticCoverageIssues = [
      ...(staticContractsCoverage.length === 0
        ? ['staticContractsCoverage 不能为空']
        : []),
      ...[...GATE_2_STATIC_CONTRACT_IDS]
        .filter(
          (staticContractId) => !coveredStaticContractIds.has(staticContractId),
        )
        .map(
          (staticContractId) =>
            `staticContractsCoverage 缺少 ${staticContractId}`,
        ),
      ...staticContractsCoverage.flatMap((entry, index) => [
        ...(!this.getNonEmptyString(entry.staticContractId)
          ? [`staticContractsCoverage[${index}].staticContractId 缺失`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `staticContractsCoverage[${index}].staticContractId`,
          this.getStringArray([entry.staticContractId]),
          knownStaticContractIds,
        ),
        ...(this.getStringArray(entry.coveredBy).length === 0
          ? [`staticContractsCoverage[${index}].coveredBy 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `staticContractsCoverage[${index}].coveredBy`,
          this.getStringArray(entry.coveredBy),
          knownGate3CoverageIds,
        ),
      ]),
    ];
    const scenarioCoverageUnknownScenarioIssues = acceptanceScenarioCoverage
      .map((entry, index) => ({
        index,
        scenarioId: this.getNonEmptyString(entry.scenarioId),
      }))
      .filter(
        (entry): entry is { index: number; scenarioId: string } =>
          entry.scenarioId !== null && !knownScenarioIds.has(entry.scenarioId),
      )
      .map(
        (entry) =>
          `acceptanceScenarioCoverage[${entry.index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
            entry.scenarioId,
          )}`,
      );
    const scenarioCoverageIssues = [
      ...(acceptanceScenarioCoverage.length === 0
        ? ['acceptanceScenarioCoverage 不能为空']
        : []),
      ...scenarioCoverageUnknownScenarioIssues,
      ...scenarioIds.flatMap((scenarioId) => {
        const entry = scenarioCoverageById.get(scenarioId);

        if (!entry) {
          return [`场景 ${scenarioId} 缺少 Gate 3 覆盖声明`];
        }

        const expectedRequirementIds =
          appSpec.acceptanceScenarios.find(
            (scenario) => scenario.id === scenarioId,
          )?.requirementIds ?? [];

        return [
          ...this.buildMissingItemsIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            expectedRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.coveredBy).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].coveredBy 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].coveredBy`,
            this.getStringArray(entry.coveredBy),
            knownGate3CoverageIds,
          ),
        ];
      }),
    ];
    const pluginBuildIssues = [
      ...this.requireRecord(pluginBuildExpectations, 'pluginBuildExpectations'),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      pluginBuildTools.length > 0
        ? ['无插件计划时 pluginBuildExpectations.tools 必须为空']
        : []),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginBuildExpectations?.emptyReason)
        ? ['无插件计划时 pluginBuildExpectations.emptyReason 必须说明原因']
        : []),
      ...(generationPlan.pluginTools.tools.length > 0 &&
      pluginBuildExpectations?.emptyReason !== null
        ? ['有插件计划时 pluginBuildExpectations.emptyReason 必须为 null']
        : []),
      ...generationPlan.pluginTools.tools
        .filter(
          (plannedTool) =>
            !pluginBuildTools.some(
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少 Gate 3 构建期望`,
        ),
      ...pluginBuildTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
        const plannedTool = toolId ? plannedToolById.get(toolId) : null;

        return [
          ...(!toolId
            ? [`pluginBuildExpectations.tools[${index}].toolId 缺失`]
            : []),
          ...(toolId && !plannedToolIds.has(toolId)
            ? [
                `pluginBuildExpectations.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.command)
            ? [`pluginBuildExpectations.tools[${index}].command 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.manifestPath)
            ? [`pluginBuildExpectations.tools[${index}].manifestPath 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.artifactPath)
            ? [`pluginBuildExpectations.tools[${index}].artifactPath 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.goldenTestCommand)
            ? [`pluginBuildExpectations.tools[${index}].goldenTestCommand 缺失`]
            : []),
          ...(plannedTool
            ? this.buildMissingItemsIssues(
                `pluginBuildExpectations.tools[${index}].requirementIds`,
                this.getStringArray(tool.requirementIds),
                plannedTool.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginBuildExpectations.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const failureCaptureIssues = [
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(buildUnitPlan.failureCaptureFields),
        [...GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS],
      ),
    ];

    return [
      {
        id: 'build-unit-plan-version',
        label: 'BuildUnitPlan 版本绑定',
        passed: versionIssues.length === 0,
        summary:
          '检查 buildUnitPlan 是否绑定当前 AppSpec、generationPlan 和 staticContracts。',
        issues: versionIssues,
      },
      {
        id: 'generation-workspace-contract',
        label: 'Generation Workspace 契约',
        passed: workspaceIssues.length === 0,
        summary:
          '检查 Gate 3 是否使用受控 React/Vite/TypeScript workspace 契约、相对路径和 artifact 路径。',
        issues: workspaceIssues,
      },
      {
        id: 'command-plan',
        label: 'Gate 3 命令计划',
        passed: commandPlanIssues.length === 0,
        summary:
          '检查 Gate 3 build/typecheck/unit/component-golden 命令计划、工作目录、产物和需求/场景覆盖。',
        issues: commandPlanIssues,
      },
      {
        id: 'frontend-build-command',
        label: '前端构建命令',
        passed: frontendBuildIssues.length === 0,
        summary:
          '检查 frontend build command、工作目录、页面路由覆盖和预期构建产物。',
        issues: frontendBuildIssues,
      },
      {
        id: 'typecheck-command',
        label: '类型检查命令',
        passed: typecheckIssues.length === 0,
        summary: '检查 TypeScript typecheck command、tsconfig 和需求覆盖。',
        issues: typecheckIssues,
      },
      {
        id: 'unit-test-command',
        label: '单元测试命令',
        passed: unitTestIssues.length === 0,
        summary: '检查 unit test command、测试入口、需求和场景覆盖。',
        issues: unitTestIssues,
      },
      {
        id: 'component-golden-test-entry',
        label: '组件/golden 测试入口',
        passed: componentGoldenIssues.length === 0,
        summary: '检查组件/golden 测试命令、入口、报告 artifact 和场景覆盖。',
        issues: componentGoldenIssues,
      },
      {
        id: 'artifact-expectations',
        label: '构建与测试产物期望',
        passed: artifactIssues.length === 0,
        summary: '检查 Gate 3 期望产出的 build/test/coverage artifacts。',
        issues: artifactIssues,
      },
      {
        id: 'static-contracts-coverage',
        label: 'staticContracts 覆盖',
        passed: staticCoverageIssues.length === 0,
        summary: '检查 Gate 3 skeleton 是否覆盖 Gate 2 静态合约面。',
        issues: staticCoverageIssues,
      },
      {
        id: 'acceptance-scenario-coverage',
        label: 'acceptance scenario 覆盖',
        passed: scenarioCoverageIssues.length === 0,
        summary:
          '检查每条 acceptance scenario 是否连接到 Gate 3 单元或组件/golden 测试入口。',
        issues: scenarioCoverageIssues,
      },
      {
        id: 'plugin-build-expectations',
        label: '插件构建期望',
        passed: pluginBuildIssues.length === 0,
        summary:
          '检查插件构建、manifest、.alp artifact 和 golden test 期望；无插件时必须说明空原因。',
        issues: pluginBuildIssues,
      },
      {
        id: 'failure-capture-fields',
        label: '失败捕获字段',
        passed: failureCaptureIssues.length === 0,
        summary:
          '检查后续真实 build/unit runner 失败时必须捕获 command、exitCode、stdout、stderr、durationMs 和 artifactPath。',
        issues: failureCaptureIssues,
      },
    ];
  }

  private buildGate2Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: unknown,
  ): Gate2Check[] {
    if (!this.isRecord(staticContracts)) {
      return [
        {
          id: 'static-contracts-object',
          label: 'StaticContracts JSON 对象',
          passed: false,
          summary:
            '检查 generationPlan.staticContracts 是否为结构化 JSON 对象。',
          issues: ['staticContracts 不是对象'],
        },
      ];
    }

    const requirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const pageIds = appSpec.pages.map((page) => page.id);
    const scenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const knownRequirementIds = new Set(requirementIds);
    const knownPageIds = new Set(pageIds);
    const knownScenarioIds = new Set(scenarioIds);
    const plannedPageIds = new Set(
      generationPlan.frontend.pages.map((page) => page.pageId),
    );
    const plannedPageById = new Map(
      generationPlan.frontend.pages.map((page) => [page.pageId, page]),
    );
    const plannedStepIds = new Set(
      generationPlan.orchestration.steps.map((step) => step.stepId),
    );
    const plannedStepById = new Map(
      generationPlan.orchestration.steps.map((step) => [step.stepId, step]),
    );
    const plannedToolIds = new Set(
      generationPlan.pluginTools.tools.map((tool) => tool.toolId),
    );
    const plannedToolById = new Map(
      generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
    );
    const requiredFutureGateIds = [
      'gate-3',
      'gate-4',
      'gate-5',
      'gate-6',
      'gate-7',
    ];
    const knownStaticContractIds = new Set<string>([
      ...GATE_2_STATIC_CONTRACT_IDS,
    ]);

    const publicRuntime = this.getRecord(staticContracts.publicRuntime);
    const publicRuntimeInput = this.getRecord(publicRuntime?.input);
    const publicRuntimeOutput = this.getRecord(publicRuntime?.output);
    const frontendRoutes = this.getRecordArray(staticContracts.frontendRoutes);
    const orchestration = this.getRecord(staticContracts.orchestration);
    const orchestrationNodes = this.getRecordArray(orchestration?.nodes);
    const orchestrationEdges = this.getRecordArray(orchestration?.edges);
    const pluginToolPermissions = this.getRecord(
      staticContracts.pluginToolPermissions,
    );
    const pluginTools = this.getRecordArray(pluginToolPermissions?.tools);
    const submissionPersistence = this.getRecord(
      staticContracts.submissionPersistence,
    );
    const testEntry = this.getRecord(staticContracts.testEntry);
    const traceability = this.getRecordArray(staticContracts.traceability);

    const routePageIds = new Set(
      frontendRoutes
        .map((route) => this.getNonEmptyString(route.pageId))
        .filter((pageId): pageId is string => pageId !== null),
    );
    const nodeIds = orchestrationNodes
      .map((node) => this.getNonEmptyString(node.nodeId))
      .filter((nodeId): nodeId is string => nodeId !== null);
    const nodeIdsSet = new Set(nodeIds);
    const stepIdsInNodes = new Set(
      orchestrationNodes
        .map((node) => this.getNonEmptyString(node.stepId))
        .filter((stepId): stepId is string => stepId !== null),
    );
    const graphEdges = orchestrationEdges.map((edge) => ({
      fromNodeId: this.getNonEmptyString(edge.fromNodeId),
      toNodeId: this.getNonEmptyString(edge.toNodeId),
    }));
    const traceabilityByRequirementId = new Map(
      traceability
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
          return requirementId ? ([requirementId, entry] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, unknown>] =>
            entry !== null,
        ),
    );

    const versionIssues = [
      ...(staticContracts.contractVersion === 1
        ? []
        : ['contractVersion 必须为 1']),
      ...(staticContracts.appSpecVersion === appSpec.version
        ? []
        : [
            `appSpecVersion=${String(
              staticContracts.appSpecVersion,
            )} 与 AppSpec version=${appSpec.version} 不一致`,
          ]),
      ...(staticContracts.generationPlanVersion === generationPlan.planVersion
        ? []
        : [
            `generationPlanVersion=${String(
              staticContracts.generationPlanVersion,
            )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
          ]),
    ];
    const publicRuntimeIssues = [
      ...this.requireRecord(publicRuntime, 'publicRuntime'),
      ...this.requireRecord(publicRuntimeInput, 'publicRuntime.input'),
      ...this.requireRecord(publicRuntimeOutput, 'publicRuntime.output'),
      ...(publicRuntimeInput?.source ===
      generationPlan.orchestration.inputContract.source
        ? []
        : ['publicRuntime.input.source 与 orchestration inputContract 不一致']),
      ...this.buildMissingItemsIssues(
        'publicRuntime.input.requiredFields',
        this.getStringArray(publicRuntimeInput?.requiredFields),
        generationPlan.orchestration.inputContract.requiredFields,
      ),
      ...(this.getStringArray(publicRuntimeInput?.requiredFields).length > 0
        ? []
        : ['publicRuntime.input.requiredFields 不能为空']),
      ...this.buildMissingItemsIssues(
        'publicRuntime.input.scenarioIds',
        this.getStringArray(publicRuntimeInput?.scenarioIds),
        generationPlan.orchestration.inputContract.scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'publicRuntime.input.scenarioIds',
        this.getStringArray(publicRuntimeInput?.scenarioIds),
        knownScenarioIds,
      ),
      ...(publicRuntimeInput?.dataUseNoticeRequired ===
      appSpec.dataPolicy.publicSubmissionsPersisted
        ? []
        : [
            'publicRuntime.input.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
          ]),
      ...(publicRuntimeInput?.anonymousSessionRequired === true
        ? []
        : ['publicRuntime.input.anonymousSessionRequired 必须为 true']),
      ...(publicRuntimeInput?.endUserLoginRequired ===
      appSpec.dataPolicy.endUserLoginRequired
        ? []
        : [
            'publicRuntime.input.endUserLoginRequired 与 AppSpec 登录策略不一致',
          ]),
      ...this.buildMissingItemsIssues(
        'publicRuntime.output.destinations',
        this.getStringArray(publicRuntimeOutput?.destinations),
        generationPlan.orchestration.outputContract.destinations,
      ),
      ...(this.getStringArray(publicRuntimeOutput?.destinations).length > 0
        ? []
        : ['publicRuntime.output.destinations 不能为空']),
      ...(publicRuntimeOutput?.reportRequired ===
      generationPlan.orchestration.outputContract.reportRequired
        ? []
        : [
            'publicRuntime.output.reportRequired 与 orchestration outputContract 不一致',
          ]),
      ...(publicRuntimeOutput?.errorStateRequired === true
        ? []
        : ['publicRuntime.output.errorStateRequired 必须为 true']),
    ];
    const frontendRouteIssues = [
      ...(frontendRoutes.length === 0 ? ['frontendRoutes 不能为空'] : []),
      ...generationPlan.frontend.pages
        .filter((page) => !routePageIds.has(page.pageId))
        .map((page) => `页面 ${page.pageId} 缺少 frontend route contract`),
      ...frontendRoutes.flatMap((route, index) => {
        const issues: string[] = [];
        const pageId = this.getNonEmptyString(route.pageId);
        const routePath = this.getNonEmptyString(route.route);
        const plannedPage = pageId ? plannedPageById.get(pageId) : null;

        if (!pageId) {
          issues.push(`frontendRoutes[${index}].pageId 缺失`);
        } else if (!plannedPageIds.has(pageId) || !knownPageIds.has(pageId)) {
          issues.push(
            `frontendRoutes[${index}].pageId 引用了未知页面 ${this.formatIssueValue(
              pageId,
            )}`,
          );
        }

        if (!routePath) {
          issues.push(`frontendRoutes[${index}].route 缺失`);
        }

        issues.push(
          ...this.buildUnknownReferenceIssues(
            `frontendRoutes[${index}].requirementIds`,
            this.getStringArray(route.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `frontendRoutes[${index}].scenarioIds`,
            this.getStringArray(route.scenarioIds),
            knownScenarioIds,
          ),
          ...(plannedPage
            ? [
                ...this.buildMissingItemsIssues(
                  `frontendRoutes[${index}].requirementIds`,
                  this.getStringArray(route.requirementIds),
                  plannedPage.requirementIds,
                ),
                ...this.buildMissingItemsIssues(
                  `frontendRoutes[${index}].scenarioIds`,
                  this.getStringArray(route.scenarioIds),
                  plannedPage.scenarioIds,
                ),
              ]
            : []),
        );

        return issues;
      }),
    ];
    const orchestrationIssues = [
      ...this.requireRecord(orchestration, 'orchestration'),
      ...(orchestration?.target === generationPlan.orchestration.target
        ? []
        : ['orchestration.target 与 generationPlan 不一致']),
      ...(orchestration?.strategy === generationPlan.orchestration.strategy
        ? []
        : ['orchestration.strategy 与 generationPlan 不一致']),
      ...(orchestrationNodes.length === 0
        ? ['orchestration.nodes 不能为空']
        : []),
      ...generationPlan.orchestration.steps
        .filter((step) => !stepIdsInNodes.has(step.stepId))
        .map((step) => `编排步骤 ${step.stepId} 缺少 orchestration node`),
      ...orchestrationNodes.flatMap((node, index) => [
        ...(!this.getNonEmptyString(node.nodeId)
          ? [`orchestration.nodes[${index}].nodeId 缺失`]
          : []),
        ...(!this.getNonEmptyString(node.stepId)
          ? [`orchestration.nodes[${index}].stepId 缺失`]
          : []),
        ...(this.getNonEmptyString(node.stepId) &&
        !plannedStepIds.has(this.getNonEmptyString(node.stepId) ?? '')
          ? [
              `orchestration.nodes[${index}].stepId 引用了未知编排步骤 ${this.formatIssueValue(
                this.getNonEmptyString(node.stepId) ?? '',
              )}`,
            ]
          : []),
        ...(!this.getNonEmptyString(node.inputHandle)
          ? [`orchestration.nodes[${index}].inputHandle 缺失`]
          : []),
        ...(!this.getNonEmptyString(node.outputHandle)
          ? [`orchestration.nodes[${index}].outputHandle 缺失`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `orchestration.nodes[${index}].requirementIds`,
          this.getStringArray(node.requirementIds),
          knownRequirementIds,
        ),
        ...this.buildUnknownReferenceIssues(
          `orchestration.nodes[${index}].scenarioIds`,
          this.getStringArray(node.scenarioIds),
          knownScenarioIds,
        ),
        ...(this.getNonEmptyString(node.stepId) &&
        plannedStepById.has(this.getNonEmptyString(node.stepId) ?? '')
          ? [
              ...this.buildMissingItemsIssues(
                `orchestration.nodes[${index}].requirementIds`,
                this.getStringArray(node.requirementIds),
                plannedStepById.get(this.getNonEmptyString(node.stepId) ?? '')
                  ?.requirementIds ?? [],
              ),
              ...this.buildMissingItemsIssues(
                `orchestration.nodes[${index}].scenarioIds`,
                this.getStringArray(node.scenarioIds),
                plannedStepById.get(this.getNonEmptyString(node.stepId) ?? '')
                  ?.scenarioIds ?? [],
              ),
            ]
          : []),
      ]),
      ...this.buildDuplicateItemIssues('orchestration.nodes.nodeId', nodeIds),
      ...graphEdges.flatMap((edge, index) => [
        ...(!edge.fromNodeId || !nodeIdsSet.has(edge.fromNodeId)
          ? [`orchestration.edges[${index}].fromNodeId 引用了未知节点`]
          : []),
        ...(!edge.toNodeId || !nodeIdsSet.has(edge.toNodeId)
          ? [`orchestration.edges[${index}].toNodeId 引用了未知节点`]
          : []),
      ]),
      ...(this.isAcyclicGraph(nodeIds, graphEdges)
        ? []
        : ['orchestration.edges 必须形成 DAG，不能存在环']),
    ];
    const pluginPermissionIssues = [
      ...this.requireRecord(pluginToolPermissions, 'pluginToolPermissions'),
      ...(pluginToolPermissions?.implicitPermissionsAllowed === false
        ? []
        : ['implicitPermissionsAllowed 必须为 false']),
      ...(this.getStringArray(pluginToolPermissions?.permissionPolicy).length >
      0
        ? []
        : ['permissionPolicy 不能为空']),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginToolPermissions?.emptyReason)
        ? ['插件/工具为空时必须保留 emptyReason']
        : []),
      ...generationPlan.pluginTools.tools
        .filter(
          (plannedTool) =>
            !pluginTools.some(
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少权限合约`,
        ),
      ...pluginTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
        const plannedTool = toolId ? plannedToolById.get(toolId) : null;

        return [
          ...(!toolId
            ? [`pluginToolPermissions.tools[${index}].toolId 缺失`]
            : []),
          ...(toolId && !plannedToolIds.has(toolId)
            ? [
                `pluginToolPermissions.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.purpose)
            ? [`pluginToolPermissions.tools[${index}].purpose 缺失`]
            : []),
          ...(this.getStringArray(tool.permissions).length === 0
            ? [`pluginToolPermissions.tools[${index}].permissions 不能为空`]
            : []),
          ...(tool.manifestRequired === true
            ? []
            : [
                `pluginToolPermissions.tools[${index}].manifestRequired 必须为 true`,
              ]),
          ...(tool.sandboxSmokeTestRequired === true
            ? []
            : [
                `pluginToolPermissions.tools[${index}].sandboxSmokeTestRequired 必须为 true`,
              ]),
          ...this.buildUnknownReferenceIssues(
            `pluginToolPermissions.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
          ...(plannedTool
            ? [
                ...this.buildMissingItemsIssues(
                  `pluginToolPermissions.tools[${index}].requirementIds`,
                  this.getStringArray(tool.requirementIds),
                  plannedTool.requirementIds,
                ),
                ...this.buildMissingItemsIssues(
                  `pluginToolPermissions.tools[${index}].permissions`,
                  this.getStringArray(tool.permissions),
                  plannedTool.permissionNotes,
                ),
              ]
            : []),
        ];
      }),
    ];
    const submissionPersistenceIssues = [
      ...this.requireRecord(submissionPersistence, 'submissionPersistence'),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'publicSubmissionsPersisted',
        generationPlan.dataPersistence.publicSubmissionsPersisted,
      ),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'creatorCanDeleteSubmissions',
        generationPlan.dataPersistence.creatorCanDeleteSubmissions,
      ),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'endUserLoginRequired',
        generationPlan.dataPersistence.endUserLoginRequired,
      ),
      ...[
        'tenantScoped',
        'tokenSnapshotRequired',
        'softDeleteRequired',
      ].flatMap((field) =>
        this.buildBooleanMirrorIssue(submissionPersistence, field, true),
      ),
      ...this.buildMissingItemsIssues(
        'submissionPersistence.fields',
        this.getStringArray(submissionPersistence?.fields),
        [
          'input',
          'result',
          'report',
          'errorMessage',
          'anonymousSessionId',
          'publicShareToken',
        ],
      ),
    ];
    const testEntryIssues = [
      ...this.requireRecord(testEntry, 'testEntry'),
      ...[
        'staticCheckCommand',
        'buildGateCommand',
        'unitGateCommand',
        'integrationGateCommand',
        'browserGateCommand',
        'verifierGateCommand',
        'publishCandidateGateCommand',
      ].flatMap((field) =>
        this.getNonEmptyString(testEntry?.[field])
          ? []
          : [`testEntry.${field} 缺失`],
      ),
      ...this.buildMissingItemsIssues(
        'testEntry.blockingGateIds',
        this.getStringArray(testEntry?.blockingGateIds),
        requiredFutureGateIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testEntry.blockingGateIds',
        this.getStringArray(testEntry?.blockingGateIds),
        new Set(requiredFutureGateIds),
      ),
      ...this.buildMissingItemsIssues(
        'testEntry.acceptanceScenarioIds',
        this.getStringArray(testEntry?.acceptanceScenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testEntry.acceptanceScenarioIds',
        this.getStringArray(testEntry?.acceptanceScenarioIds),
        knownScenarioIds,
      ),
    ];
    const traceabilityUnknownRequirementIssues = traceability
      .map((entry, index) => ({
        index,
        requirementId: this.getNonEmptyString(entry.requirementId),
      }))
      .filter(
        (entry): entry is { index: number; requirementId: string } =>
          entry.requirementId !== null &&
          !knownRequirementIds.has(entry.requirementId),
      )
      .map(
        (entry) =>
          `traceability[${entry.index}].requirementId 引用了未知需求 ${this.formatIssueValue(
            entry.requirementId,
          )}`,
      );
    const traceabilityIssues = [
      ...traceabilityUnknownRequirementIssues,
      ...requirementIds.flatMap((requirementId) => {
        const entry = traceabilityByRequirementId.get(requirementId);
        const plannedTraceability = generationPlan.traceability.find(
          (candidate) => candidate.requirementId === requirementId,
        );
        const expectedNodeIds =
          plannedTraceability?.orchestrationStepIds.map(
            (stepId) => `node-${this.buildPlanSegment(stepId)}`,
          ) ?? [];

        if (!entry) {
          return [`需求 ${requirementId} 缺少 static contract traceability`];
        }

        return [
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            plannedTraceability?.scenarioIds ?? [],
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].pageIds`,
            this.getStringArray(entry.pageIds),
            plannedTraceability?.pageIds ?? [],
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].orchestrationNodeIds`,
            this.getStringArray(entry.orchestrationNodeIds),
            expectedNodeIds,
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            [...GATE_2_STATIC_CONTRACT_IDS],
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].pageIds`,
            this.getStringArray(entry.pageIds),
            routePageIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].orchestrationNodeIds`,
            this.getStringArray(entry.orchestrationNodeIds),
            nodeIdsSet,
          ),
        ];
      }),
    ];

    return [
      {
        id: 'version-binding',
        label: '静态合约版本绑定',
        passed: versionIssues.length === 0,
        summary:
          '检查 staticContracts 是否绑定当前 AppSpec 和 generationPlan。',
        issues: versionIssues,
      },
      {
        id: 'public-runtime-contract',
        label: 'public runtime 输入输出合约',
        passed: publicRuntimeIssues.length === 0,
        summary: '检查公开运行输入、输出、数据用途提示和匿名提交约束。',
        issues: publicRuntimeIssues,
      },
      {
        id: 'frontend-route-contract',
        label: 'frontend route/page 合约',
        passed: frontendRouteIssues.length === 0,
        summary: `检查 ${generationPlan.frontend.pages.length} 个页面是否都有 route/page contract。`,
        issues: frontendRouteIssues,
      },
      {
        id: 'orchestration-contract',
        label: 'Workflow/Agent 编排合约',
        passed: orchestrationIssues.length === 0,
        summary: `检查 ${generationPlan.orchestration.steps.length} 个编排步骤是否有节点、边和输入输出合约。`,
        issues: orchestrationIssues,
      },
      {
        id: 'plugin-permission-contract',
        label: '插件/工具权限合约',
        passed: pluginPermissionIssues.length === 0,
        summary:
          '检查插件/工具 manifest、权限策略和 sandbox smoke test 硬门槛。',
        issues: pluginPermissionIssues,
      },
      {
        id: 'submission-persistence-contract',
        label: 'submission persistence 合约',
        passed: submissionPersistenceIssues.length === 0,
        summary: '检查公开提交持久化、租户归属、token 快照和软删除字段。',
        issues: submissionPersistenceIssues,
      },
      {
        id: 'test-entry-contract',
        label: '测试入口合约',
        passed: testEntryIssues.length === 0,
        summary: '检查 Gate 3-7 后续测试入口和 acceptance scenario 覆盖。',
        issues: testEntryIssues,
      },
      {
        id: 'traceability-contract',
        label: '静态合约 traceability',
        passed: traceabilityIssues.length === 0,
        summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否连接到静态合约证据。`,
        issues: traceabilityIssues,
      },
    ];
  }

  private evaluateGate1GenerationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
  ): Gate1Evaluation {
    const checks = this.buildGate1Checks(appSpec, generationPlan);
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-1-${check.id}`,
      label: check.label,
      kind: 'plan' as const,
      url: null,
      summary:
        check.issues.length === 0
          ? check.summary
          : `${check.summary} 缺口：${check.issues.join('；')}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'generation-plan-incomplete',
        message: `GenerationPlan 架构计划检查失败：${failedChecks
          .map((check) => check.label)
          .join('、')}。`,
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
          'Gate 1 失败：generationPlan 未完整覆盖 AppSpec 的页面、编排、插件/工具、数据、测试门禁或 traceability。',
        evidence,
        failure,
        repairInstructions:
          '修复 generationPlan，使其覆盖 AppSpec 版本、页面计划、Agent/Workflow 编排计划、插件/工具策略、数据持久化策略、Gate 2-7 测试计划和每条核心需求 traceability。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildGate1Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
  ): Gate1Check[] {
    const requirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const pageIds = appSpec.pages.map((page) => page.id);
    const scenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const plannedPageIds = new Set(
      generationPlan.frontend.pages.map((page) => page.pageId),
    );
    const knownScenarioIds = new Set(scenarioIds);
    const knownRequirementIds = new Set(requirementIds);
    const plannedScenarioIds = new Set(
      generationPlan.testGates.acceptanceScenarioIds,
    );
    const plannedBlockingGateIds = new Set(
      generationPlan.testGates.blockingGateIds,
    );
    const plannedGateIds = new Set(
      generationPlan.testGates.gatePlan.map((gate) => gate.gateId),
    );
    const plannedStepIds = new Set(
      generationPlan.orchestration.steps.map((step) => step.stepId),
    );
    const plannedRequirementIds = new Set(
      generationPlan.orchestration.steps.flatMap((step) => step.requirementIds),
    );
    const planEvidenceIds = new Set([
      'gate-1-app-spec-version',
      'gate-1-frontend-plan',
      'gate-1-orchestration-plan',
      'gate-1-plugin-tool-plan',
      'gate-1-data-persistence-plan',
      'gate-1-test-gate-plan',
      'gate-1-traceability',
    ]);
    const traceabilityByRequirementId = new Map(
      generationPlan.traceability.map((entry) => [entry.requirementId, entry]),
    );

    const versionIssues =
      generationPlan.appSpecVersion === appSpec.version
        ? []
        : [
            `appSpecVersion=${generationPlan.appSpecVersion} 与 AppSpec version=${appSpec.version} 不一致`,
          ];
    const frontendIssues = [
      ...pageIds
        .filter((pageId) => !plannedPageIds.has(pageId))
        .map((pageId) => `页面 ${pageId} 未进入 frontend.pages`),
      ...generationPlan.frontend.pages.flatMap((page, index) => {
        const issues: string[] = [];

        if (page.route.trim().length === 0) {
          issues.push(`frontend.pages[${index}].route 缺失`);
        }

        if (page.requirementIds.length === 0) {
          issues.push(`frontend.pages[${index}].requirementIds 不能为空`);
        }

        for (const requirementId of page.requirementIds) {
          if (!knownRequirementIds.has(requirementId)) {
            issues.push(
              `frontend.pages[${index}].requirementIds 引用了未知需求 ${requirementId}`,
            );
          }
        }

        if (page.scenarioIds.length === 0) {
          issues.push(`frontend.pages[${index}].scenarioIds 不能为空`);
        }

        for (const scenarioId of page.scenarioIds) {
          if (!knownScenarioIds.has(scenarioId)) {
            issues.push(
              `frontend.pages[${index}].scenarioIds 引用了未知场景 ${scenarioId}`,
            );
          }
        }

        return issues;
      }),
      ...(generationPlan.frontend.runtimeSurface.dataUseNoticeRequired ===
      appSpec.dataPolicy.publicSubmissionsPersisted
        ? []
        : [
            'runtimeSurface.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
          ]),
    ];
    const orchestrationIssues = [
      ...(generationPlan.orchestration.steps.length === 0
        ? ['orchestration.steps 不能为空']
        : []),
      ...requirementIds
        .filter((requirementId) => !plannedRequirementIds.has(requirementId))
        .map(
          (requirementId) =>
            `需求 ${requirementId} 未映射到 orchestration step`,
        ),
      ...generationPlan.orchestration.steps.flatMap((step, index) => {
        const issues: string[] = [];

        for (const requirementId of step.requirementIds) {
          if (!knownRequirementIds.has(requirementId)) {
            issues.push(
              `orchestration.steps[${index}].requirementIds 引用了未知需求 ${requirementId}`,
            );
          }
        }

        for (const scenarioId of step.scenarioIds) {
          if (!knownScenarioIds.has(scenarioId)) {
            issues.push(
              `orchestration.steps[${index}].scenarioIds 引用了未知场景 ${scenarioId}`,
            );
          }
        }

        return issues;
      }),
      ...(generationPlan.orchestration.inputContract.scenarioIds.length === 0
        ? ['inputContract.scenarioIds 不能为空']
        : []),
      ...generationPlan.orchestration.inputContract.scenarioIds
        .filter((scenarioId) => !knownScenarioIds.has(scenarioId))
        .map(
          (scenarioId) =>
            `inputContract.scenarioIds 引用了未知场景 ${scenarioId}`,
        ),
      ...(generationPlan.orchestration.outputContract.destinations.length === 0
        ? ['outputContract.destinations 不能为空']
        : []),
    ];
    const pluginToolIssues = [
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !generationPlan.pluginTools.emptyReason
        ? ['插件/工具计划为空时必须给出 emptyReason']
        : []),
      ...(generationPlan.pluginTools.permissionPolicy.length === 0
        ? ['permissionPolicy 不能为空']
        : []),
    ];
    const dataIssues = [
      ...(generationPlan.dataPersistence.publicSubmissionsPersisted ===
      appSpec.dataPolicy.publicSubmissionsPersisted
        ? []
        : ['dataPersistence.publicSubmissionsPersisted 与 AppSpec 不一致']),
      ...(generationPlan.dataPersistence.creatorCanDeleteSubmissions ===
      appSpec.dataPolicy.creatorCanDeleteSubmissions
        ? []
        : ['dataPersistence.creatorCanDeleteSubmissions 与 AppSpec 不一致']),
      ...(generationPlan.dataPersistence.endUserLoginRequired ===
      appSpec.dataPolicy.endUserLoginRequired
        ? []
        : ['dataPersistence.endUserLoginRequired 与 AppSpec 不一致']),
      ...(generationPlan.dataPersistence.tenantScoped
        ? []
        : ['dataPersistence.tenantScoped 必须为 true']),
      ...(generationPlan.dataPersistence.tokenSnapshotRequired
        ? []
        : ['dataPersistence.tokenSnapshotRequired 必须为 true']),
      ...(generationPlan.dataPersistence.softDeleteRequired
        ? []
        : ['dataPersistence.softDeleteRequired 必须为 true']),
    ];
    const requiredFutureGateIds = [
      'gate-2',
      'gate-3',
      'gate-4',
      'gate-5',
      'gate-6',
      'gate-7',
    ];
    const testGateIssues = [
      ...requiredFutureGateIds
        .filter((gateId) => !plannedBlockingGateIds.has(gateId))
        .map((gateId) => `${gateId} 缺少 blocking gate 声明`),
      ...requiredFutureGateIds
        .filter((gateId) => !plannedGateIds.has(gateId))
        .map((gateId) => `${gateId} 缺少 test gate plan`),
      ...scenarioIds
        .filter((scenarioId) => !plannedScenarioIds.has(scenarioId))
        .map(
          (scenarioId) =>
            `场景 ${scenarioId} 未进入 testGates.acceptanceScenarioIds`,
        ),
    ];
    const traceabilityIssues = requirementIds.flatMap((requirementId) => {
      const entry = traceabilityByRequirementId.get(requirementId);

      if (!entry) {
        return [`需求 ${requirementId} 缺少 plan traceability`];
      }

      const issues: string[] = [];

      if (entry.scenarioIds.length === 0) {
        issues.push(`需求 ${requirementId} 缺少 scenarioIds`);
      }

      for (const scenarioId of entry.scenarioIds) {
        if (!knownScenarioIds.has(scenarioId)) {
          issues.push(`需求 ${requirementId} 引用了未知场景 ${scenarioId}`);
        }
      }

      if (entry.pageIds.length === 0) {
        issues.push(`需求 ${requirementId} 缺少 pageIds`);
      }

      for (const pageId of entry.pageIds) {
        if (!plannedPageIds.has(pageId)) {
          issues.push(`需求 ${requirementId} 引用了未知页面 ${pageId}`);
        }
      }

      if (entry.orchestrationStepIds.length === 0) {
        issues.push(`需求 ${requirementId} 缺少 orchestrationStepIds`);
      }

      for (const stepId of entry.orchestrationStepIds) {
        if (!plannedStepIds.has(stepId)) {
          issues.push(`需求 ${requirementId} 引用了未知编排步骤 ${stepId}`);
        }
      }

      if (entry.planEvidenceIds.length === 0) {
        issues.push(`需求 ${requirementId} 缺少 planEvidenceIds`);
      }

      for (const evidenceId of entry.planEvidenceIds) {
        if (!planEvidenceIds.has(evidenceId)) {
          issues.push(`需求 ${requirementId} 引用了未知计划证据 ${evidenceId}`);
        }
      }

      return issues;
    });

    return [
      {
        id: 'app-spec-version',
        label: 'AppSpec 版本绑定',
        passed: versionIssues.length === 0,
        summary: '检查 generationPlan.appSpecVersion 是否绑定当前 AppSpec。',
        issues: versionIssues,
      },
      {
        id: 'frontend-plan',
        label: '前端页面计划',
        passed: frontendIssues.length === 0,
        summary: `检查 ${appSpec.pages.length} 个 AppSpec 页面是否进入 frontend plan。`,
        issues: frontendIssues,
      },
      {
        id: 'orchestration-plan',
        label: 'Agent/Workflow 编排计划',
        passed: orchestrationIssues.length === 0,
        summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否映射到 orchestration steps。`,
        issues: orchestrationIssues,
      },
      {
        id: 'plugin-tool-plan',
        label: '插件/工具计划',
        passed: pluginToolIssues.length === 0,
        summary: '检查插件/工具计划为空时是否说明原因，并固定权限策略。',
        issues: pluginToolIssues,
      },
      {
        id: 'data-persistence-plan',
        label: '数据持久化计划',
        passed: dataIssues.length === 0,
        summary: '检查数据保存、租户归属、token 快照和软删除策略。',
        issues: dataIssues,
      },
      {
        id: 'test-gate-plan',
        label: 'Gate 2-7 测试计划',
        passed: testGateIssues.length === 0,
        summary: '检查 Gate 2-7 和 acceptance scenarios 是否都有后续验证计划。',
        issues: testGateIssues,
      },
      {
        id: 'traceability',
        label: '需求到计划证据 traceability',
        passed: traceabilityIssues.length === 0,
        summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否连接到场景、页面、编排步骤和计划证据。`,
        issues: traceabilityIssues,
      },
    ];
  }

  private evaluateGate0AppSpec(appSpec: GeneratedAppSpec): Gate0Evaluation {
    const checks = this.buildGate0Checks(appSpec);
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-0-${check.id}`,
      label: check.label,
      kind: 'app_spec' as const,
      url: null,
      summary:
        check.issues.length === 0
          ? check.summary
          : `${check.summary} 缺口：${check.issues.join('；')}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'app-spec-incomplete',
        message: `AppSpec 完整性检查失败：${failedChecks
          .map((check) => check.label)
          .join('、')}。`,
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
          'Gate 0 失败：AppSpec 缺少可验证生成所需的结构化字段或需求覆盖证据。',
        evidence,
        failure,
        repairInstructions:
          '补齐 AppSpec 的核心需求、页面/流程、数据策略、acceptance scenarios 与 traceability 后重新启动门禁运行器。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildGate0Checks(appSpec: unknown): Gate0Check[] {
    if (!this.isRecord(appSpec)) {
      return [
        {
          id: 'app-spec-object',
          label: 'AppSpec JSON 对象',
          passed: false,
          summary: 'AppSpec 必须是结构化 JSON 对象。',
          issues: ['appSpec 不是对象'],
        },
      ];
    }

    const coreRequirements = this.getRecordArray(appSpec.coreRequirements);
    const requirementIds = coreRequirements
      .map((requirement) => this.getNonEmptyString(requirement.id))
      .filter((id): id is string => id !== null);
    const pages = this.getRecordArray(appSpec.pages);
    const acceptanceScenarios = this.getRecordArray(
      appSpec.acceptanceScenarios,
    );
    const scenarioIds = new Set(
      acceptanceScenarios
        .map((scenario) => this.getNonEmptyString(scenario.id))
        .filter((id): id is string => id !== null),
    );
    const coveredRequirementIds = new Set<string>();

    for (const scenario of acceptanceScenarios) {
      for (const requirementId of this.getStringArray(
        scenario.requirementIds,
      )) {
        coveredRequirementIds.add(requirementId);
      }
    }

    const traceability = this.getRecordArray(appSpec.traceability);
    const traceabilityRequirementIds = new Set(
      traceability
        .filter((entry) => {
          const scenarioRefs = this.getStringArray(entry.scenarioIds);
          const evidenceRefs = this.getStringArray(entry.evidenceIds);
          return (
            scenarioRefs.length > 0 &&
            scenarioRefs.every((scenarioId) => scenarioIds.has(scenarioId)) &&
            evidenceRefs.length > 0
          );
        })
        .map((entry) => this.getNonEmptyString(entry.requirementId))
        .filter((id): id is string => id !== null),
    );

    const textIssues = ['appName', 'summary', 'userGoal'].filter(
      (field) => this.getNonEmptyString(appSpec[field]) === null,
    );
    const actorIssues =
      this.getStringArray(appSpec.actors).length === 0
        ? ['actors 至少需要一个角色']
        : [];
    const requirementIssues = [
      ...(coreRequirements.length === 0 ? ['coreRequirements 不能为空'] : []),
      ...coreRequirements.flatMap((requirement, index) => {
        const issues: string[] = [];

        if (this.getNonEmptyString(requirement.id) === null) {
          issues.push(`coreRequirements[${index}].id 缺失`);
        }

        if (this.getNonEmptyString(requirement.text) === null) {
          issues.push(`coreRequirements[${index}].text 缺失`);
        }

        return issues;
      }),
    ];
    const pageIssues = [
      ...(pages.length === 0 ? ['pages 不能为空'] : []),
      ...pages.flatMap((page, index) => {
        const issues: string[] = [];

        for (const field of ['id', 'name', 'purpose']) {
          if (this.getNonEmptyString(page[field]) === null) {
            issues.push(`pages[${index}].${field} 缺失`);
          }
        }

        return issues;
      }),
    ];
    const policyIssues = this.buildDataPolicyIssues(appSpec);
    const scenarioIssues = [
      ...(acceptanceScenarios.length === 0
        ? ['acceptanceScenarios 不能为空']
        : []),
      ...acceptanceScenarios.flatMap((scenario, index) =>
        this.buildScenarioIssues(scenario, index),
      ),
    ];
    const uncoveredRequirementIds = requirementIds.filter(
      (requirementId) => !coveredRequirementIds.has(requirementId),
    );
    const traceabilityIssues = [
      ...(traceability.length === 0 ? ['traceability 不能为空'] : []),
      ...requirementIds
        .filter(
          (requirementId) => !traceabilityRequirementIds.has(requirementId),
        )
        .map((requirementId) => `需求 ${requirementId} 缺少有效 traceability`),
    ];

    return [
      {
        id: 'identity',
        label: 'AppSpec 基本摘要',
        passed: textIssues.length === 0 && actorIssues.length === 0,
        summary: '检查 appName、summary、userGoal 与 actors 是否完整。',
        issues: [...textIssues.map((field) => `${field} 缺失`), ...actorIssues],
      },
      {
        id: 'core-requirements',
        label: '核心需求列表',
        passed: requirementIssues.length === 0,
        summary: `检查 ${coreRequirements.length} 条核心需求是否具备 id 和 text。`,
        issues: requirementIssues,
      },
      {
        id: 'pages',
        label: '页面/流程定义',
        passed: pageIssues.length === 0,
        summary: `检查 ${pages.length} 个页面或流程是否具备 id、name 和 purpose。`,
        issues: pageIssues,
      },
      {
        id: 'risk-boundary',
        label: '数据策略与范围边界',
        passed: policyIssues.length === 0,
        summary:
          '检查 dataPolicy 和 nonGoals 是否能表达数据保存、登录要求与初始风险/范围边界。',
        issues: policyIssues,
      },
      {
        id: 'acceptance-scenarios',
        label: '验收场景结构',
        passed: scenarioIssues.length === 0,
        summary: `检查 ${acceptanceScenarios.length} 条 acceptance scenario 是否可执行。`,
        issues: scenarioIssues,
      },
      {
        id: 'requirement-coverage',
        label: '需求到验收场景覆盖',
        passed:
          uncoveredRequirementIds.length === 0 && requirementIds.length > 0,
        summary: `检查 ${requirementIds.length} 条核心需求是否至少被一个 acceptance scenario 覆盖。`,
        issues:
          requirementIds.length === 0
            ? ['没有可覆盖的核心需求 id']
            : uncoveredRequirementIds.map(
                (requirementId) =>
                  `需求 ${requirementId} 未被 acceptance scenario 引用`,
              ),
      },
      {
        id: 'traceability',
        label: '需求证据 traceability',
        passed: traceabilityIssues.length === 0 && requirementIds.length > 0,
        summary: `检查 ${traceability.length} 条 traceability 是否连接需求、场景和证据。`,
        issues: traceabilityIssues,
      },
    ];
  }

  private buildDataPolicyIssues(appSpec: Record<string, unknown>): string[] {
    const dataPolicy = appSpec.dataPolicy;
    const issues: string[] = [];

    if (!this.isRecord(dataPolicy)) {
      issues.push('dataPolicy 缺失');
    } else {
      for (const field of [
        'publicSubmissionsPersisted',
        'creatorCanDeleteSubmissions',
        'endUserLoginRequired',
      ]) {
        if (typeof dataPolicy[field] !== 'boolean') {
          issues.push(`dataPolicy.${field} 必须是 boolean`);
        }
      }
    }

    if (this.getStringArray(appSpec.nonGoals).length === 0) {
      issues.push('nonGoals 至少需要一条范围边界');
    }

    return issues;
  }

  private buildScenarioIssues(
    scenario: Record<string, unknown>,
    index: number,
  ): string[] {
    const issues: string[] = [];

    for (const field of ['id', 'title']) {
      if (this.getNonEmptyString(scenario[field]) === null) {
        issues.push(`acceptanceScenarios[${index}].${field} 缺失`);
      }
    }

    if (this.getStringArray(scenario.requirementIds).length === 0) {
      issues.push(`acceptanceScenarios[${index}].requirementIds 不能为空`);
    }

    for (const field of ['given', 'when', 'then']) {
      if (this.getStringArray(scenario[field]).length === 0) {
        issues.push(`acceptanceScenarios[${index}].${field} 不能为空`);
      }
    }

    return issues;
  }

  private async resolveNextGenerationRunNumber(
    tenantId: string,
    appId: string,
  ): Promise<number> {
    const [latestRun] = await this.tenantDb
      .select({ runNumber: schema.generatedAppGenerationRuns.runNumber })
      .from(schema.generatedAppGenerationRuns)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .orderBy(desc(schema.generatedAppGenerationRuns.runNumber))
      .limit(1);

    return (latestRun?.runNumber ?? 0) + 1;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getRecord(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private getRecordArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter((item) => this.isRecord(item))
      : [];
  }

  private getStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private getNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private requireRecord(
    value: Record<string, unknown> | null,
    label: string,
  ): string[] {
    return value ? [] : [`${label} 必须是对象`];
  }

  private buildMissingItemsIssues(
    label: string,
    actual: string[],
    expected: string[],
  ): string[] {
    return expected
      .filter((item) => !actual.includes(item))
      .map((item) => `${label} 缺少 ${item}`);
  }

  private buildUnknownReferenceIssues(
    label: string,
    values: string[],
    knownValues: ReadonlySet<string>,
  ): string[] {
    return values
      .filter((value) => !knownValues.has(value))
      .map(
        (value) => `${label} 引用了未知对象 ${this.formatIssueValue(value)}`,
      );
  }

  private buildDuplicateItemIssues(label: string, values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
      if (seen.has(value)) {
        duplicates.add(value);
      } else {
        seen.add(value);
      }
    }

    return [...duplicates].map(
      (value) => `${label} 存在重复值 ${this.formatIssueValue(value)}`,
    );
  }

  private buildSafeRelativePathIssues(
    label: string,
    value: string | null,
  ): string[] {
    if (!value) {
      return [];
    }

    if (
      value.startsWith('/') ||
      value.startsWith('\\') ||
      value.includes('\0') ||
      value.includes('\\') ||
      /^[a-zA-Z]:/.test(value)
    ) {
      return [`${label} 必须是 workspace 相对路径且不能是绝对路径`];
    }

    const segments = value.split('/');

    if (
      segments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      return [`${label} 不能包含空路径段、. 或 .. traversal`];
    }

    return [];
  }

  private buildControlledCommandIssues(
    label: string,
    value: string | null,
    commandId: (typeof GATE_3_REQUIRED_COMMAND_IDS)[number],
  ): string[] {
    if (!value) {
      return [`${label} 缺失`];
    }

    const expected = GATE_3_ALLOWED_COMMAND_BY_ID[commandId];

    return value === expected ? [] : [`${label} 必须为受控命令 ${expected}`];
  }

  private collectSensitiveTokenIssues(
    value: unknown,
    path = 'integrationPlan',
    depth = 0,
  ): string[] {
    if (depth > 8) {
      return [];
    }

    if (typeof value === 'string') {
      return this.isSensitiveTokenLike(value)
        ? [
            `${path} 含有疑似真实 token/secret，必须改为合成测试占位且不得写入 evidence`,
          ]
        : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.collectSensitiveTokenIssues(item, `${path}[${index}]`, depth + 1),
      );
    }

    if (!this.isRecord(value)) {
      return [];
    }

    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nextPath = `${path}.${key}`;
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hasSensitiveKey =
        normalizedKey === 'token' ||
        normalizedKey.endsWith('token') ||
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('bearer');
      const sensitiveKeyIssue =
        hasSensitiveKey &&
        nestedValue !== null &&
        nestedValue !== undefined &&
        nestedValue !== false &&
        (!Array.isArray(nestedValue) || nestedValue.length > 0) &&
        (!this.isRecord(nestedValue) || Object.keys(nestedValue).length > 0)
          ? [
              `${nextPath} 不能包含真实 token/secret 字段；门禁测试资源必须使用合成无密钥上下文`,
            ]
          : [];

      return [
        ...sensitiveKeyIssue,
        ...this.collectSensitiveTokenIssues(nestedValue, nextPath, depth + 1),
      ];
    });
  }

  private isSensitiveTokenLike(value: string): boolean {
    const trimmed = value.trim();

    return (
      /\b[a-f0-9]{64}\b/i.test(trimmed) ||
      /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(trimmed) ||
      /\bbearer\s+\S+/i.test(trimmed)
    );
  }

  private formatIssueValue(value: string): string {
    if (/\b[a-f0-9]{64}\b/i.test(value)) {
      return '[REDACTED_TOKEN]';
    }

    if (/\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(value)) {
      return '[REDACTED_SECRET]';
    }

    if (/\bbearer\s+\S+/i.test(value)) {
      return '[REDACTED_SECRET]';
    }

    return value;
  }

  private buildBooleanMirrorIssue(
    source: Record<string, unknown> | null,
    field: string,
    expected: boolean,
  ): string[] {
    return source?.[field] === expected
      ? []
      : [`${field} 必须为 ${String(expected)}`];
  }

  private isAcyclicGraph(
    nodeIds: string[],
    edges: Array<{ fromNodeId: string | null; toNodeId: string | null }>,
  ): boolean {
    const nodeSet = new Set(nodeIds);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const adjacency = new Map<string, string[]>(
      nodeIds.map((nodeId) => [nodeId, []]),
    );

    for (const edge of edges) {
      if (
        edge.fromNodeId &&
        edge.toNodeId &&
        nodeSet.has(edge.fromNodeId) &&
        nodeSet.has(edge.toNodeId)
      ) {
        adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
      }
    }

    const visit = (nodeId: string): boolean => {
      if (visited.has(nodeId)) {
        return true;
      }

      if (visiting.has(nodeId)) {
        return false;
      }

      visiting.add(nodeId);

      for (const nextNodeId of adjacency.get(nodeId) ?? []) {
        if (!visit(nextNodeId)) {
          return false;
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      return true;
    };

    return nodeIds.every((nodeId) => visit(nodeId));
  }

  private buildGateResultsUpdatePayload(
    userId: string,
    gateResults: GeneratedAppGateResult[],
    options: {
      generationPlan?: GeneratedApp['generationPlan'];
      currentGenerationPlan?: GeneratedApp['generationPlan'];
      preview?: GeneratedAppPreview;
    } = {},
  ): Partial<schema.NewGeneratedApp> {
    const guardedGateResults = this.applyPublishCandidateEvidenceGuard(
      gateResults,
      options.currentGenerationPlan ?? options.generationPlan,
    );
    const readiness = evaluateGeneratedAppReadiness(guardedGateResults);
    const status = getGeneratedAppStatusForReadiness(readiness);
    const updatePayload: Partial<schema.NewGeneratedApp> = {
      gateResults: guardedGateResults,
      readiness,
      status,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (options.generationPlan !== undefined) {
      updatePayload.generationPlan = options.generationPlan;
    }

    if (options.preview !== undefined) {
      updatePayload.preview = options.preview;
    }

    if (!readiness.canCreatePublicShare || status === 'publish_candidate') {
      updatePayload.publicShareToken = null;
      updatePayload.publicShareEnabled = false;
      updatePayload.publicShareDisabledAt = new Date();
    }

    return updatePayload;
  }

  private applyPublishCandidateEvidenceGuard(
    gateResults: GeneratedAppGateResult[],
    generationPlan: GeneratedApp['generationPlan'] | undefined,
  ): GeneratedAppGateResult[] {
    const readiness = evaluateGeneratedAppReadiness(gateResults);

    if (readiness.state !== 'publish_candidate') {
      return gateResults;
    }

    const guardIssues = this.collectPublishCandidateEvidenceGuardIssues(
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

  private collectPublishCandidateEvidenceGuardIssues(
    gateResults: GeneratedAppGateResult[],
    generationPlan: GeneratedApp['generationPlan'] | undefined,
  ): string[] {
    const gateResultsById = new Map(
      gateResults.map((gate) => [gate.gateId, gate]),
    );
    const plan = this.getRecord(generationPlan);
    const buildUnitPlan = this.getRecord(plan?.buildUnitPlan);
    const integrationPlan = this.getRecord(plan?.integrationPlan);
    const browserAcceptancePlan = this.getRecord(plan?.browserAcceptancePlan);
    const independentVerificationPlan = this.getRecord(
      plan?.independentVerificationPlan,
    );
    const publishCandidatePlan = this.getRecord(plan?.publishCandidatePlan);
    const finalVerdict = this.getRecord(publishCandidatePlan?.finalVerdict);
    const rollbackShareControls = this.getRecord(
      publishCandidatePlan?.rollbackShareControls,
    );
    const artifactReleaseManifest = this.getRecordArray(
      publishCandidatePlan?.artifactReleaseManifest,
    );
    const gate7 = gateResultsById.get('gate-7');
    const gate7EvidenceIds = new Set(
      gate7?.evidence.map((evidence) => evidence.id) ?? [],
    );
    const hasTrustedGate7RunnerEvidence =
      gate7?.evidence.some((evidence) => {
        const details = this.getRecord(evidence.details);

        return (
          details?.runnerId === 'gate-7-real-publish-candidate-runner' &&
          details.executionLevel === 'real-local-publish-candidate-contract' &&
          details.executed === true &&
          details.publicShareTokenCreated === false &&
          details.createdPublicShareToken === null
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
      'real-local-browser-contract'
        ? []
        : [
            'generationPlan.browserAcceptancePlan.executionLevel 必须为 real-local-browser-contract',
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
      ...(this.getStringArray(finalVerdict?.blockingReasons).length === 0
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
        ...(this.getRecord(artifact.signature)?.status === 'not-signed'
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

  private async activatePublicShare(
    tenantId: string,
    userId: string,
    app: GeneratedApp,
    options: { forceNewToken: boolean },
  ): Promise<GeneratedAppResponseDto> {
    this.assertCanEnablePublicShare(app);

    const currentPublicShareToken = app.publicShareEnabled
      ? app.publicShareToken
      : null;
    const shouldReuseCurrentToken =
      !options.forceNewToken && currentPublicShareToken !== null;
    const publicShareToken = shouldReuseCurrentToken
      ? currentPublicShareToken
      : crypto.randomBytes(32).toString('hex');
    const now = new Date();

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        status: 'published',
        publicShareToken,
        publicShareEnabled: true,
        publicShareCreatedAt: shouldReuseCurrentToken
          ? (app.publicShareCreatedAt ?? now)
          : now,
        publicShareDisabledAt: null,
        updatedBy: userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.generatedApps.id, app.id),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(app.id);
    }

    return this.toResponseDto(updated);
  }

  private async findGeneratedAppRecord(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedApp> {
    const [app] = await this.tenantDb
      .select()
      .from(schema.generatedApps)
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!app) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return app;
  }

  private async findGenerationRunRecord(
    tenantId: string,
    appId: string,
    runId: string,
  ): Promise<GeneratedAppGenerationRun> {
    const [run] = await this.tenantDb
      .select()
      .from(schema.generatedAppGenerationRuns)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .limit(1);

    if (!run) {
      throw new GeneratedAppGenerationRunNotFoundException(runId);
    }

    return run;
  }

  private async findRepairAttemptRecord(
    tenantId: string,
    appId: string,
    repairAttemptId: string,
  ): Promise<GeneratedAppRepairAttempt> {
    const [attempt] = await this.tenantDb
      .select()
      .from(schema.generatedAppRepairAttempts)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
        ),
      )
      .limit(1);

    if (!attempt) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }

    return attempt;
  }

  private async findPublicGeneratedAppRecord(
    token: string,
  ): Promise<GeneratedApp> {
    const [app] = await this.db
      .select()
      .from(schema.generatedApps)
      .where(
        and(
          eq(schema.generatedApps.publicShareToken, token),
          eq(schema.generatedApps.publicShareEnabled, true),
          eq(schema.generatedApps.status, 'published'),
        ),
      )
      .limit(1);

    if (!app) {
      throw new GeneratedAppNotFoundException('公开链接');
    }

    this.assertCanEnablePublicShare(app);

    return app;
  }

  private async findSubmissionRecord(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmission> {
    const [submission] = await this.tenantDb
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return submission;
  }

  private toResponseDto(app: GeneratedApp): GeneratedAppResponseDto {
    const publicShareUrl =
      app.publicShareEnabled && app.publicShareToken
        ? `${this.getBaseUrl()}/generated-apps/public/${app.publicShareToken}`
        : null;

    return {
      id: app.id,
      tenantId: app.tenantId,
      prompt: app.prompt,
      appName: app.appName,
      description: app.description,
      status: app.status,
      appSpec: app.appSpec,
      generationPlan: app.generationPlan,
      gateResults: app.gateResults,
      readiness: app.readiness,
      preview: app.preview,
      agentDefinitionId: app.agentDefinitionId,
      workflowDefinitionId: app.workflowDefinitionId,
      pluginIds: app.pluginIds,
      publicShareEnabled: app.publicShareEnabled,
      publicShareToken: app.publicShareToken,
      publicShareUrl,
      publicShareCreatedAt: app.publicShareCreatedAt,
      publicShareDisabledAt: app.publicShareDisabledAt,
      publicViewCount: app.publicViewCount,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  private toSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): GeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      tenantId: submission.tenantId,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      publicShareToken: submission.publicShareToken,
      anonymousSessionId: submission.anonymousSessionId,
      status: submission.status,
      input: submission.input,
      result: submission.result,
      report: submission.report,
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      deletedAt: submission.deletedAt,
    };
  }

  private toPublicSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): PublicGeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      status: submission.status,
      anonymousSessionId: submission.anonymousSessionId,
      input: submission.input,
      result: submission.result,
      report: submission.report,
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    };
  }

  private toGateRunResponseDto(
    gateRun: GeneratedAppGateRun,
  ): GeneratedAppGateRunResponseDto {
    return {
      id: gateRun.id,
      tenantId: gateRun.tenantId,
      appId: gateRun.generatedAppId,
      generationRunId: gateRun.generationRunId,
      repairAttemptId: gateRun.repairAttemptId,
      gateId: gateRun.gateId,
      gateOrder: gateRun.gateOrder,
      gateName: gateRun.gateName,
      blocking: gateRun.blocking,
      attemptNumber: gateRun.attemptNumber,
      status: gateRun.status,
      summary: gateRun.summary,
      evidence: gateRun.evidence,
      failure: gateRun.failure,
      repairInstructions: gateRun.repairInstructions,
      startedAt: gateRun.startedAt,
      completedAt: gateRun.completedAt,
      createdBy: gateRun.createdBy,
      createdAt: gateRun.createdAt,
      updatedAt: gateRun.updatedAt,
    };
  }

  private toGenerationRunResponseDto(
    run: GeneratedAppGenerationRun,
  ): GeneratedAppGenerationRunResponseDto {
    return {
      id: run.id,
      tenantId: run.tenantId,
      appId: run.generatedAppId,
      runNumber: run.runNumber,
      status: run.status,
      triggerSource: run.triggerSource,
      maxRepairAttempts: run.maxRepairAttempts,
      maxRuntimeSeconds: run.maxRuntimeSeconds,
      summary: run.summary,
      failureReason: run.failureReason,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdBy: run.createdBy,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private toRepairAttemptResponseDto(
    attempt: GeneratedAppRepairAttempt,
  ): GeneratedAppRepairAttemptResponseDto {
    return {
      id: attempt.id,
      tenantId: attempt.tenantId,
      appId: attempt.generatedAppId,
      generationRunId: attempt.generationRunId,
      attemptNumber: attempt.attemptNumber,
      targetGateId: attempt.targetGateId,
      status: attempt.status,
      failureSummary: attempt.failureSummary,
      changeSummary: attempt.changeSummary,
      verificationSummary: attempt.verificationSummary,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdBy: attempt.createdBy,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  private buildInitialAppSpec(prompt: string): GeneratedAppSpec {
    const appName = this.buildAppName(prompt);

    return {
      version: 1,
      appName,
      summary: `围绕“${prompt}”生成的 AppSpec 初稿。`,
      userGoal: prompt,
      actors: ['创建者', '终端用户'],
      coreRequirements: [
        {
          id: 'req-1',
          text: prompt,
        },
        {
          id: 'req-2',
          text: '公开应用提交内容默认持久化，并提供给创建者查看。',
        },
      ],
      pages: [
        {
          id: 'page-creator-workbench',
          name: '创建者工作台',
          purpose: '查看生成记录、门禁结果、预览状态和发布状态。',
        },
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '让终端用户在不登录的情况下使用通过门禁的定制业务界面。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: [
        '第一阶段不生成自定义后端服务、数据库 schema 或部署资产。',
        '第一阶段不绕过 AgentLoom 鉴权、租户隔离、资源配额或 API 权限模型。',
      ],
      acceptanceScenarios: [
        {
          id: 'scenario-1',
          title: '创建者可以从一句话进入可验证生成流程',
          requirementIds: ['req-1'],
          given: ['创建者已登录 AgentLoom Studio'],
          when: [`创建者提交需求“${prompt}”`],
          then: [
            '系统生成结构化 AppSpec 初稿',
            '系统初始化 Gate 0-7 门禁结果',
            '系统在阻断门禁未全绿时不允许创建正式公开链接',
          ],
        },
        {
          id: 'scenario-2',
          title: '终端用户数据保存策略可追踪',
          requirementIds: ['req-2'],
          given: ['生成应用进入公开运行面'],
          when: ['终端用户提交业务输入'],
          then: [
            '公开页面展示数据用途提示',
            '提交内容和运行结果归属创建者租户',
          ],
        },
      ],
      traceability: [
        {
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          evidenceIds: ['app-spec-draft'],
        },
        {
          requirementId: 'req-2',
          scenarioIds: ['scenario-2'],
          evidenceIds: ['app-spec-draft'],
        },
      ],
    };
  }

  private buildAppName(prompt: string): string {
    const compact = prompt.replace(/\s+/g, ' ').trim();
    const firstSentence = compact.split(/[。！？!?]/)[0]?.trim() ?? compact;
    const baseName = firstSentence.length > 0 ? firstSentence : '定制化应用';
    return baseName.length > 48 ? `${baseName.slice(0, 48)}...` : baseName;
  }

  private buildPlanRoute(pageId: string): string {
    return `/${this.buildPlanSegment(pageId)}`;
  }

  private buildPlanSegment(value: string): string {
    const segment = value
      .trim()
      .toLowerCase()
      .replace(/^page-/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return segment.length > 0 ? segment : 'generated-app';
  }

  private getPublicRuntimePages(
    appSpec: GeneratedAppSpec,
  ): GeneratedAppSpec['pages'] {
    return appSpec.pages.filter((page) => {
      const id = page.id.toLowerCase();
      const name = page.name.toLowerCase();
      const purpose = page.purpose.toLowerCase();

      return (
        id.includes('public') ||
        id.includes('runtime') ||
        name.includes('公开') ||
        name.includes('终端') ||
        purpose.includes('终端用户')
      );
    });
  }

  private resolveStatusForShareDisabled(
    readiness: GeneratedAppReadiness,
  ): GeneratedAppStatus {
    if (readiness.canCreatePublicShare) {
      return 'publish_candidate';
    }

    return getGeneratedAppStatusForReadiness(readiness);
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      this.configService.get<string>('APP_BASE_URL') ??
      process.env.APP_FRONTEND_URL ??
      'http://localhost:5173';

    return baseUrl.replace(/\/+$/, '');
  }
}
