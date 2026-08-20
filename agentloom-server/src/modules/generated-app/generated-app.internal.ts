// 本文件集中 Generated App 拆分服务共享的常量与内部类型；不包含持久化或业务流程。

import * as crypto from 'crypto';

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  computeContentHash as computePluginArchiveContentHash,
  readArchiveManifest,
  validateManifest as validatePluginManifest,
  verifyArchiveSignature as verifyPluginArchiveSignature,
} from '@agentloom/plugin-sdk';
import JSZip from 'jszip';

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
  GeneratedAppGenerationRepairContext,
  GeneratedAppGenerationRun,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
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
  type GeneratedAppArtifactContentResponseDto,
  type GeneratedAppArtifactKind,
  type GeneratedAppArtifactManifestResponseDto,
  type GeneratedAppArtifactSummaryDto,
  type GeneratedAppGenerationRunResponseDto,
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
  type GeneratedAppRuntimeBindingReadinessResponseDto,
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
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';
import {
  GeneratedAppGate3WorkspaceRunner,
  type GeneratedAppGate3CommandPlan,
  type GeneratedAppGate3RepairResult,
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
import {
  buildGenerationPlan,
  buildStaticContracts,
  evaluateGate2StaticContracts,
  buildBuildUnitPlan,
  evaluateGate3BuildUnitPlan,
  evaluateGate1GenerationPlan,
  GATE_3_REQUIRED_COMMAND_IDS,
  GENERATED_APP_BUILD_UNIT_EXECUTION_LEVELS,
} from './plan-builders/generation-plan.builder';
import {
  buildIntegrationPlan,
  evaluateGate4IntegrationPlan,
} from './plan-builders/integration-plan.builder';
import {
  buildBrowserAcceptancePlan,
  evaluateGate5BrowserAcceptancePlan,
  GATE_5_REAL_BROWSER_E2E_COMMAND,
} from './plan-builders/browser-acceptance-plan.builder';
import {
  buildIndependentVerificationPlan,
  evaluateGate6IndependentVerificationPlan,
} from './plan-builders/independent-verification-plan.builder';
import {
  buildPublishCandidatePlan,
  applyPublishCandidateEvidenceGuard,
  evaluateGate7PublishCandidatePlan,
  buildGate7CompletedRunSummary,
  GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON,
  GATE_7_REQUIRED_GATE_IDS,
} from './plan-builders/publish-candidate-plan.builder';
import {
  isRecord,
  getRecord,
  getRecordArray,
  getStringArray,
  getNonEmptyString,
  isNonEmptyString,
} from './generated-app.plan-validation.util';
import {
  sanitizePublicSubmissionValue,
  sanitizePublicWorkflowOutputValue,
  limitPublicWorkflowOutputText,
  buildPublicWorkflowOutputReportItems,
  getWorkflowExecutionPublicStatusLabel,
  limitRepairAttemptText,
  GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_LIMIT,
  PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN,
  PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN,
} from './generated-app.public-sanitizer.util';
import {
  buildGeneratedWorkflowRuntimeNodes,
  buildGeneratedWorkflowRuntimeEdges,
  buildGeneratedPrivatePluginRegistrationManifest,
  buildGeneratedWorkflowRuntimeInputSchema,
} from './generated-app.runtime-binding.util';
import type { GeneratedAppPrivatePluginBuildReport } from './generated-app.runtime-binding.util';
import {
  buildInitialAppSpec,
  getPublicRuntimePages,
  resolveStatusForShareDisabled,
  evaluateGate0AppSpec,
} from './generated-app.app-spec.util';
import type { Gate0Evaluation } from './generated-app.app-spec.util';
import type {
  Gate1Evaluation,
  Gate2Evaluation,
  Gate3Evaluation,
} from './plan-builders/generation-plan.builder';
import type { Gate4Evaluation } from './plan-builders/integration-plan.builder';
import type { Gate5Evaluation } from './plan-builders/browser-acceptance-plan.builder';
import type { Gate6Evaluation } from './plan-builders/independent-verification-plan.builder';
import type { Gate7Evaluation } from './plan-builders/publish-candidate-plan.builder';
import type {
  InternalRunWorkflowRequest,
  ExecutionTriggerType,
} from '../execution/dto/run-workflow.dto';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { ExecutionService } from '../execution/execution.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import { PluginAlreadyExistsException } from '../plugin/plugin.exceptions';
import { PluginService } from '../plugin/plugin.service';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';

export const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

export const GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE =
  'generated-app-editor-handoff';
export const GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE =
  'generated-app-runtime-workflow';
export const GENERATED_APP_WORKFLOW_RUNTIME_BINDING_KIND = 'public-runtime-workflow';
export const GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY =
  'async-workflow-execution-created';
export const GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY =
  'async-workflow-execution-completed';
export const GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY =
  'async-workflow-execution-failed';
export const GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY =
  'async-workflow-execution-cancelled';
export const GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY =
  'local-deterministic-report-only';
export const GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID =
  'workflow-execution-status';
export const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES = 256 * 1024;
export const GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID = 'gate-3-build-output-html';
export const GENERATED_APP_PUBLIC_PREVIEW_PATH_PREFIX =
  '/api/v1/generated-apps/public';

export type GeneratedAppArtifactDefinition = {
  artifactId: string;
  label: string;
  kind: GeneratedAppArtifactKind;
  path: string;
  contentType: string;
};

export const GENERATED_APP_WORKSPACE_SOURCE_ARTIFACTS = [
  {
    artifactId: 'source-package-json',
    label: 'package.json',
    kind: 'workspace_source_file',
    path: 'package.json',
    contentType: 'application/json',
  },
  {
    artifactId: 'source-index-html',
    label: 'index.html',
    kind: 'workspace_source_file',
    path: 'index.html',
    contentType: 'text/html',
  },
  {
    artifactId: 'source-app-tsx',
    label: 'src/App.tsx',
    kind: 'workspace_source_file',
    path: 'src/App.tsx',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'source-main-tsx',
    label: 'src/main.tsx',
    kind: 'workspace_source_file',
    path: 'src/main.tsx',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'source-app-spec-ts',
    label: 'src/generated-app/app-spec.ts',
    kind: 'workspace_source_file',
    path: 'src/generated-app/app-spec.ts',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'source-static-contracts-ts',
    label: 'src/generated-app/static-contracts.ts',
    kind: 'workspace_source_file',
    path: 'src/generated-app/static-contracts.ts',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'source-runtime-form-ts',
    label: 'src/generated-app/runtime-form.ts',
    kind: 'workspace_source_file',
    path: 'src/generated-app/runtime-form.ts',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'source-runtime-ts',
    label: 'src/generated-app/runtime.ts',
    kind: 'workspace_source_file',
    path: 'src/generated-app/runtime.ts',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'test-runtime-contract-spec',
    label: 'src/generated-app/__tests__/runtime.contract.spec.ts',
    kind: 'workspace_test_file',
    path: 'src/generated-app/__tests__/runtime.contract.spec.ts',
    contentType: 'text/typescript',
  },
  {
    artifactId: 'test-runtime-golden-spec',
    label: 'src/generated-app/__tests__/runtime.golden.spec.tsx',
    kind: 'workspace_test_file',
    path: 'src/generated-app/__tests__/runtime.golden.spec.tsx',
    contentType: 'text/typescript',
  },
] as const satisfies ReadonlyArray<{
  artifactId: string;
  label: string;
  kind: Extract<
    GeneratedAppArtifactKind,
    'workspace_source_file' | 'workspace_test_file'
  >;
  path: string;
  contentType: string;
}>;

export const GENERATED_APP_WORKSPACE_ARTIFACT_PATH_FIELDS = [
  {
    field: 'sourceManifest',
    artifactId: 'gate-3-source-manifest',
    label: 'Gate 3 source manifest',
    kind: 'source_manifest',
    contentType: 'application/json',
  },
  {
    field: 'sourceArchive',
    artifactId: 'gate-3-source-artifact-manifest',
    label: 'Gate 3 source artifact manifest',
    kind: 'source_artifact_manifest',
    contentType: 'application/json',
  },
  {
    field: 'buildOutput',
    artifactId: GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
    label: 'Gate 3 build output',
    kind: 'build_output',
    contentType: 'text/html',
  },
  {
    field: 'buildManifest',
    artifactId: 'gate-3-build-manifest',
    label: 'Gate 3 build manifest',
    kind: 'build_manifest',
    contentType: 'application/json',
  },
  {
    field: 'unitReport',
    artifactId: 'gate-3-unit-test-report',
    label: 'Gate 3 unit test report',
    kind: 'unit_test_report',
    contentType: 'application/json',
  },
  {
    field: 'componentGoldenReport',
    artifactId: 'gate-3-component-golden-report',
    label: 'Gate 3 component/golden report',
    kind: 'component_golden_report',
    contentType: 'application/json',
  },
  {
    field: 'coverageSummary',
    artifactId: 'gate-3-coverage-summary',
    label: 'Gate 3 coverage summary',
    kind: 'coverage_summary',
    contentType: 'application/json',
  },
] as const satisfies ReadonlyArray<{
  field: keyof GeneratedAppGenerationWorkspaceContract['artifactPaths'];
  artifactId: string;
  label: string;
  kind: Exclude<
    GeneratedAppArtifactKind,
    'workspace_source_file' | 'workspace_test_file' | 'typecheck_report'
  >;
  contentType: string;
}>;

export const GENERATED_APP_DERIVED_GATE_3_ARTIFACTS = [
  {
    artifactId: 'gate-3-typecheck-report',
    label: 'Gate 3 typecheck report',
    kind: 'typecheck_report',
    path: 'artifacts/gate-3/typecheck-report.json',
    contentType: 'application/json',
  },
] as const satisfies ReadonlyArray<{
  artifactId: string;
  label: string;
  kind: Extract<GeneratedAppArtifactKind, 'typecheck_report'>;
  path: string;
  contentType: string;
}>;

export const GENERATED_APP_PLUGIN_ARTIFACT_DEFINITIONS = [
  {
    suffix: 'manifest',
    labelSuffix: 'manifest',
    kind: 'plugin_manifest',
    path: (toolId: string) => `plugins/${toolId}/agentloom.plugin.json`,
    contentType: 'application/json',
  },
  {
    suffix: 'node-definitions',
    labelSuffix: 'node definitions',
    kind: 'plugin_node_definitions',
    path: (toolId: string) => `plugins/${toolId}/node-definitions.json`,
    contentType: 'application/json',
  },
  {
    suffix: 'source',
    labelSuffix: 'source',
    kind: 'plugin_source_file',
    path: (toolId: string) => `plugins/${toolId}/src/index.ts`,
    contentType: 'text/typescript',
  },
  {
    suffix: 'smoke-fixture',
    labelSuffix: 'smoke fixture',
    kind: 'plugin_smoke_fixture',
    path: (toolId: string) => `plugins/${toolId}/smoke-fixture.json`,
    contentType: 'application/json',
  },
  {
    suffix: 'build-report',
    labelSuffix: 'build report',
    kind: 'plugin_build_report',
    path: (toolId: string) =>
      `artifacts/gate-3/plugins/${toolId}-build-report.json`,
    contentType: 'application/json',
  },
  {
    suffix: 'bundle',
    labelSuffix: '.alp bundle',
    kind: 'plugin_bundle',
    path: (toolId: string) => `artifacts/gate-3/plugins/${toolId}.alp`,
    contentType: 'application/zip',
  },
] as const satisfies ReadonlyArray<{
  suffix: string;
  labelSuffix: string;
  kind: Extract<
    GeneratedAppArtifactKind,
    | 'plugin_manifest'
    | 'plugin_node_definitions'
    | 'plugin_source_file'
    | 'plugin_smoke_fixture'
    | 'plugin_build_report'
    | 'plugin_bundle'
  >;
  path: (toolId: string) => string;
  contentType: string;
}>;

export type GeneratedAppWorkflowExecutionNotStartedReason =
  | 'no-workflow-bound'
  | 'workflow-not-published'
  | 'workflow-execution-unavailable'
  | 'workflow-execution-blocked';

export interface GeneratedAppWorkflowExecutionHandoff {
  workflowExecution: boolean;
  workflowDefinitionId: string | null;
  executionId: string | null;
  executionStatus: schema.WorkflowExecution['status'] | null;
  executionBoundary:
    | typeof GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY
    | typeof GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY
    | typeof GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY
    | typeof GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY
    | typeof GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY;
  notStartedReason: GeneratedAppWorkflowExecutionNotStartedReason | null;
  notice: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  summary?: Record<string, unknown>;
}

