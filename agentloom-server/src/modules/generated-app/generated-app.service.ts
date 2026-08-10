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

const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

const GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE =
  'generated-app-editor-handoff';
const GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE =
  'generated-app-runtime-workflow';
const GENERATED_APP_WORKFLOW_RUNTIME_BINDING_KIND = 'public-runtime-workflow';
const GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY =
  'async-workflow-execution-created';
const GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY =
  'async-workflow-execution-completed';
const GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY =
  'async-workflow-execution-failed';
const GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY =
  'async-workflow-execution-cancelled';
const GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY =
  'local-deterministic-report-only';
const GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID =
  'workflow-execution-status';
const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES = 256 * 1024;
const GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID = 'gate-3-build-output-html';
const GENERATED_APP_PUBLIC_PREVIEW_PATH_PREFIX =
  '/api/v1/generated-apps/public';

type GeneratedAppArtifactDefinition = {
  artifactId: string;
  label: string;
  kind: GeneratedAppArtifactKind;
  path: string;
  contentType: string;
};

const GENERATED_APP_WORKSPACE_SOURCE_ARTIFACTS = [
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

const GENERATED_APP_WORKSPACE_ARTIFACT_PATH_FIELDS = [
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

const GENERATED_APP_DERIVED_GATE_3_ARTIFACTS = [
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

const GENERATED_APP_PLUGIN_ARTIFACT_DEFINITIONS = [
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

type GeneratedAppWorkflowExecutionNotStartedReason =
  | 'no-workflow-bound'
  | 'workflow-not-published'
  | 'workflow-execution-unavailable'
  | 'workflow-execution-blocked';

interface GeneratedAppWorkflowExecutionHandoff {
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
    @Optional()
    private readonly pluginService?: PluginService,
    @Optional()
    private readonly executionService?: ExecutionService,
    @Optional()
    private readonly storageService?: StorageService,
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

  private resolveWorkspaceRoot(): string {
    const configuredRoot =
      this.configService.get<string>('GENERATED_APP_WORKSPACE_ROOT') ??
      this.configService.get<string>('APP_GENERATED_APP_WORKSPACE_ROOT');

    return resolve(
      configuredRoot && configuredRoot.trim().length > 0
        ? configuredRoot
        : join(tmpdir(), 'agentloom-generated-app-workspaces'),
    );
  }

  private resolveArtifactWorkspaceContext(app: GeneratedApp): {
    workspace: GeneratedAppGenerationWorkspaceContract;
    workspacePath: string;
    executionLevel: GeneratedAppBuildUnitPlan['executionLevel'];
  } | null {
    const buildUnitPlan = this.resolveArtifactBuildUnitPlan(app);
    const workspace = buildUnitPlan?.generationWorkspace;

    if (!workspace) {
      return null;
    }

    try {
      const workspacePath = this.resolveSafeRelativePathInside(
        this.resolveWorkspaceRoot(),
        workspace.relativePath,
      );

      return {
        workspace,
        workspacePath,
        executionLevel: buildUnitPlan.executionLevel,
      };
    } catch {
      return null;
    }
  }

  private resolveArtifactBuildUnitPlan(
    app: GeneratedApp,
  ): GeneratedAppBuildUnitPlan | null {
    const generationPlan = app.generationPlan;

    if (!isRecord(generationPlan)) {
      return null;
    }

    const buildUnitPlan = generationPlan.buildUnitPlan;

    if (!isRecord(buildUnitPlan)) {
      return null;
    }

    if (
      !GENERATED_APP_BUILD_UNIT_EXECUTION_LEVELS.includes(
        buildUnitPlan.executionLevel as GeneratedAppBuildUnitPlan['executionLevel'],
      )
    ) {
      return null;
    }

    const workspace = buildUnitPlan.generationWorkspace;

    if (!isRecord(workspace) || !isRecord(workspace.artifactPaths)) {
      return null;
    }

    const artifactPaths = workspace.artifactPaths;

    if (
      !isNonEmptyString(workspace.workspaceId) ||
      !isNonEmptyString(workspace.rootLabel) ||
      !isNonEmptyString(workspace.relativePath) ||
      !isNonEmptyString(workspace.scaffold) ||
      !GENERATED_APP_WORKSPACE_ARTIFACT_PATH_FIELDS.every((definition) =>
        isNonEmptyString(artifactPaths[definition.field]),
      )
    ) {
      return null;
    }

    return buildUnitPlan as unknown as GeneratedAppBuildUnitPlan;
  }

  private buildArtifactDefinitions(
    workspace: GeneratedAppGenerationWorkspaceContract,
  ): GeneratedAppArtifactDefinition[] {
    return [
      ...GENERATED_APP_WORKSPACE_SOURCE_ARTIFACTS,
      ...GENERATED_APP_WORKSPACE_ARTIFACT_PATH_FIELDS.map((definition) => ({
        artifactId: definition.artifactId,
        label: definition.label,
        kind: definition.kind,
        path: workspace.artifactPaths[definition.field],
        contentType: definition.contentType,
      })),
      ...GENERATED_APP_DERIVED_GATE_3_ARTIFACTS,
      ...this.extractPluginToolIdsFromWorkspace(workspace).flatMap((toolId) =>
        GENERATED_APP_PLUGIN_ARTIFACT_DEFINITIONS.map((definition) => ({
          artifactId: `plugin-${toolId}-${definition.suffix}`,
          label: `Plugin ${toolId} ${definition.labelSuffix}`,
          kind: definition.kind,
          path: definition.path(toolId),
          contentType: definition.contentType,
        })),
      ),
    ];
  }

  private extractPluginToolIdsFromWorkspace(
    workspace: GeneratedAppGenerationWorkspaceContract,
  ): string[] {
    return [
      ...new Set(
        workspace.files
          .map((file) => {
            const match = file.path.match(
              /^plugins\/(tool-[a-z0-9-]+)\/agentloom\.plugin\.json$/,
            );

            return match?.[1] ?? null;
          })
          .filter((toolId): toolId is string => toolId !== null),
      ),
    ];
  }

  private async toArtifactSummaryDto(
    workspacePath: string,
    definition: GeneratedAppArtifactDefinition,
  ): Promise<GeneratedAppArtifactSummaryDto> {
    let materialized = false;
    let sizeBytes: number | null = null;
    let updatedAt: Date | null = null;

    try {
      const filePath = this.resolveArtifactFilePath(
        workspacePath,
        definition.path,
      );
      const fileStat = await stat(filePath);

      if (fileStat.isFile()) {
        materialized = true;
        sizeBytes = fileStat.size;
        updatedAt = fileStat.mtime;
      }
    } catch {
      materialized = false;
      sizeBytes = null;
      updatedAt = null;
    }

    return {
      artifactId: definition.artifactId,
      label: definition.label,
      kind: definition.kind,
      path: definition.path,
      materialized,
      sizeBytes,
      contentType: definition.contentType,
      readable:
        materialized &&
        sizeBytes !== null &&
        sizeBytes <= GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES &&
        definition.contentType !== 'application/zip',
      updatedAt,
    };
  }

  private resolveArtifactFilePath(
    workspacePath: string,
    relativePath: string,
  ): string {
    return this.resolveSafeRelativePathInside(workspacePath, relativePath);
  }

  private async resolveArtifactContentForApp(
    app: GeneratedApp,
    artifactId: string,
  ): Promise<GeneratedAppArtifactContentResponseDto> {
    const workspaceContext = this.resolveArtifactWorkspaceContext(app);

    if (!workspaceContext) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    const definition = this.buildArtifactDefinitions(
      workspaceContext.workspace,
    ).find((artifact) => artifact.artifactId === artifactId);

    if (!definition) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    const summary = await this.toArtifactSummaryDto(
      workspaceContext.workspacePath,
      definition,
    );

    if (!summary.materialized) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    if (
      summary.sizeBytes !== null &&
      summary.sizeBytes > GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES
    ) {
      throw new GeneratedAppArtifactTooLargeException(
        artifactId,
        GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
      );
    }

    if (!summary.readable) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    const filePath = this.resolveArtifactFilePath(
      workspaceContext.workspacePath,
      definition.path,
    );
    const content = await readFile(filePath, 'utf8');

    return {
      artifact: summary,
      content,
      truncated: false,
    };
  }

  private async hasReadableArtifactForApp(
    app: GeneratedApp,
    artifactId: string,
  ): Promise<boolean> {
    try {
      const artifact = await this.resolveArtifactContentForApp(app, artifactId);

      return artifact.artifact.readable;
    } catch {
      return false;
    }
  }

  private buildPublicBuildPreviewUrl(token: string): string {
    return `${GENERATED_APP_PUBLIC_PREVIEW_PATH_PREFIX}/${encodeURIComponent(
      token,
    )}/preview`;
  }

  private async resolvePublicRuntimePreviewUrl(
    app: GeneratedApp,
    token: string,
  ): Promise<string | null> {
    const hasBuildPreview = await this.hasReadableArtifactForApp(
      app,
      GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
    );

    if (hasBuildPreview) {
      return this.buildPublicBuildPreviewUrl(token);
    }

    return app.preview.previewUrl;
  }

  private resolveSafeRelativePathInside(root: string, relativePath: string) {
    const trimmedPath = relativePath.trim();

    if (
      trimmedPath.length === 0 ||
      trimmedPath.startsWith('/') ||
      trimmedPath.startsWith('\\') ||
      trimmedPath.includes('\0') ||
      trimmedPath.includes('\\')
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }

    const segments = trimmedPath.split('/');

    if (
      segments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }

    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(resolvedRoot, trimmedPath);

    if (
      resolvedPath !== resolvedRoot &&
      !resolvedPath.startsWith(`${resolvedRoot}${sep}`)
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }

    return resolvedPath;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const prompt = dto.prompt.trim();
    const appSpec = buildInitialAppSpec(prompt);
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

  async getRuntimeBindingReadiness(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppRuntimeBindingReadinessResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);

    if (!app.workflowDefinitionId) {
      return this.buildRuntimeBindingReadinessResponse({
        state: 'deterministic_only',
        workflowDefinitionId: null,
        workflowStatus: null,
        publishedVersionId: null,
        canStartWorkflowExecution: false,
        summary: '当前 Generated App 没有绑定 Workflow。',
        notice:
          '公开提交只会返回本地 deterministic report，不会创建 Workflow execution。',
        updatedAt: app.updatedAt,
      });
    }

    const [workflow] = await this.tenantDb
      .select({
        id: schema.workflowDefinitions.id,
        status: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        metadata: schema.workflowDefinitions.metadata,
        updatedAt: schema.workflowDefinitions.updatedAt,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, app.workflowDefinitionId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!workflow) {
      return this.buildRuntimeBindingReadinessResponse({
        state: 'workflow_not_found',
        workflowDefinitionId: app.workflowDefinitionId,
        workflowStatus: null,
        publishedVersionId: null,
        canStartWorkflowExecution: false,
        summary: '绑定 Workflow 不存在或当前租户不可访问。',
        notice:
          '公开提交不会创建 Workflow execution；请重新绑定或发布一个可访问的 Workflow。',
        updatedAt: app.updatedAt,
      });
    }

    if (this.isGeneratedAppEditorHandoffWorkflowMetadata(workflow.metadata)) {
      return this.buildRuntimeBindingReadinessResponse({
        state: 'editor_handoff_draft',
        workflowDefinitionId: workflow.id,
        workflowStatus: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
        canStartWorkflowExecution: false,
        summary: '绑定 Workflow 是 Generated App 专业编辑器草稿。',
        notice:
          'Gate 7 创建的专业编辑器草稿只用于创建者精修，不会被公开提交自动执行；需要精修并发布真正 Workflow 后，公开提交才可启动 Workflow execution。',
        updatedAt: workflow.updatedAt,
      });
    }

    if (workflow.status !== 'published' || !workflow.publishedVersionId) {
      return this.buildRuntimeBindingReadinessResponse({
        state: 'workflow_not_published',
        workflowDefinitionId: workflow.id,
        workflowStatus: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
        canStartWorkflowExecution: false,
        summary: '绑定 Workflow 尚未发布。',
        notice:
          '公开提交不会启动未发布 Workflow；请发布绑定 Workflow 后再将其作为 runtime 执行目标。',
        updatedAt: workflow.updatedAt,
      });
    }

    return this.buildRuntimeBindingReadinessResponse({
      state: 'workflow_published',
      workflowDefinitionId: workflow.id,
      workflowStatus: workflow.status,
      publishedVersionId: workflow.publishedVersionId,
      canStartWorkflowExecution: true,
      summary: '绑定 Workflow 已发布，可由公开提交创建异步执行。',
      notice:
        '公开提交会先保存本地 deterministic report，并尝试创建异步 Workflow execution。',
      updatedAt: workflow.updatedAt,
    });
  }

  async getArtifactManifest(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppArtifactManifestResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const workspaceContext = this.resolveArtifactWorkspaceContext(app);

    if (!workspaceContext) {
      return {
        workspace: null,
        artifacts: [],
        updatedAt: app.updatedAt,
      };
    }

    const artifacts = await Promise.all(
      this.buildArtifactDefinitions(workspaceContext.workspace).map(
        (definition) =>
          this.toArtifactSummaryDto(workspaceContext.workspacePath, definition),
      ),
    );

    return {
      workspace: {
        workspaceId: workspaceContext.workspace.workspaceId,
        rootLabel: workspaceContext.workspace.rootLabel,
        relativePath: workspaceContext.workspace.relativePath,
        scaffold: workspaceContext.workspace.scaffold,
        executionLevel: workspaceContext.executionLevel,
        materialized: artifacts.some((artifact) => artifact.materialized),
      },
      artifacts,
      updatedAt: app.updatedAt,
    };
  }

  async getArtifactContent(
    tenantId: string,
    appId: string,
    artifactId: string,
  ): Promise<GeneratedAppArtifactContentResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);

    return this.resolveArtifactContentForApp(app, artifactId);
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
    const retryRepairContext =
      parsed.triggerSource === 'retry'
        ? await this.resolveLatestFailedRepairContext(tenantId, appId)
        : null;

    const gate0Evaluation = evaluateGate0AppSpec(app.appSpec);
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
    const automaticRepairGateRunIdsToExclude = new Set<string>();
    let latestApp = gateRunResult.app;
    let finalFailureReason: string | null =
      gate0Evaluation.failure?.message ??
      'Gate 0 AppSpec 完整性检查失败，不能继续执行 Gate 1 架构计划门禁。';
    let completedSummary =
      '门禁运行器骨架在 Gate 0 AppSpec 完整性检查失败；当前应用保持不可发布。';
    let completedAt = gateCompletedAt;
    let completedStatus: schema.GeneratedAppGenerationRunStatus = 'failed';

    if (gate0Evaluation.status === 'passed') {
      const generationPlan = buildGenerationPlan(
        app.appSpec,
        retryRepairContext,
      );
      const gate1Evaluation = evaluateGate1GenerationPlan(
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
        const staticContracts = buildStaticContracts(
          app.appSpec,
          generationPlan,
        );
        const generationPlanWithStaticContracts: GeneratedAppGenerationPlan = {
          ...generationPlan,
          staticContracts,
        };
        const gate2Evaluation = evaluateGate2StaticContracts(
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
          const buildUnitPlan = buildBuildUnitPlan(
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
          let gate3Evaluation = evaluateGate3BuildUnitPlan(
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

          if (
            gate3Evaluation.status === 'failed' &&
            parsed.maxRepairAttempts > 0 &&
            buildUnitPlan.executionLevel === 'real-local-command-plan'
          ) {
            const repairAttempt = await this.createRunningGate3RepairAttempt({
              tenantId,
              userId,
              appId,
              generationRunId: run.id,
              failedGateRun: gate3RunResult.gateRun,
            });
            const repairResult =
              await this.gate3WorkspaceRunner.applyRepairPatchAndRun({
                tenantId,
                appId,
                generationRunId: run.id,
                appSpec: app.appSpec,
                generationPlan,
                staticContracts,
                buildUnitPlan,
                workspace: gate3Workspace,
                commandPlan: gate3CommandPlan,
                repairPlan: repairAttempt.repairPlan!,
                reverificationPlan: repairAttempt.reverificationPlan!,
              });
            const repairStartedAt = new Date();
            const repairCompletedAt = new Date();
            const gate3RepairRunResult = await this.createGateRunAndUpdateApp(
              tenantId,
              userId,
              {
                ...app,
                gateResults: latestApp.gateResults,
                generationPlan: latestApp.generationPlan,
              },
              {
                gateId: 'gate-3',
                generationRunId: run.id,
                repairAttemptId: repairAttempt.id,
                attemptNumber: 2,
                status: repairResult.status,
                summary: repairResult.summary,
                evidence: repairResult.evidence,
                failure: repairResult.failure,
                repairInstructions: repairResult.repairInstructions,
                startedAt: repairStartedAt.toISOString(),
                completedAt: repairCompletedAt.toISOString(),
              },
              {
                generationPlan: generationPlanWithBuildUnitPlan,
                buildGateResults: (gate3RepairResult, nowIso) =>
                  this.buildRunnerGateResults(
                    app,
                    [
                      ...(gate0Result ? [gate0Result] : []),
                      ...(gate1Result ? [gate1Result] : []),
                      ...(gate2Result ? [gate2Result] : []),
                      gate3RepairResult,
                    ],
                    nowIso,
                  ),
              },
            );

            await this.completeGate3RepairAttempt({
              tenantId,
              appId,
              repairAttemptId: repairAttempt.id,
              repairResult,
            });

            producedGateRuns.push(gate3RepairRunResult.gateRun);
            latestApp = gate3RepairRunResult.app;
            completedAt = repairCompletedAt;
            automaticRepairGateRunIdsToExclude.add(gate3RunResult.gateRun.id);
            automaticRepairGateRunIdsToExclude.add(
              gate3RepairRunResult.gateRun.id,
            );
            gate3Evaluation = repairResult;
          }

          if (gate3Evaluation.status === 'failed') {
            finalFailureReason =
              gate3Evaluation.failure?.message ??
              'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。';
            completedSummary = automaticRepairGateRunIdsToExclude.has(
              gate3RunResult.gateRun.id,
            )
              ? '门禁运行器完成 Gate 0、Gate 1 和 Gate 2；Gate 3 自动修复补丁已尝试并重新验证，但 Gate 3 仍失败；Gate 4-7 未执行，当前应用保持不可发布。'
              : '门禁运行器完成 Gate 0、Gate 1 和 Gate 2，但 Gate 3 Generation Workspace、构建/单元执行或 buildUnitPlan 检查失败；Gate 4-7 未执行，当前应用保持不可发布。';
          } else {
            const integrationPlan = buildIntegrationPlan(
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
            let gate4Evaluation = evaluateGate4IntegrationPlan(
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
              const browserAcceptancePlan = buildBrowserAcceptancePlan(
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
              let gate5Evaluation = evaluateGate5BrowserAcceptancePlan(
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
                  buildIndependentVerificationPlan(
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
                let gate6Evaluation = evaluateGate6IndependentVerificationPlan(
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
                  const publishCandidatePlan = buildPublishCandidatePlan(
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
                  let gate7Evaluation = evaluateGate7PublishCandidatePlan(
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
                    latestApp = await this.ensureGeneratedPrivatePluginBindings(
                      tenantId,
                      userId,
                      latestApp,
                    );
                    latestApp =
                      await this.ensureGeneratedWorkflowRuntimeBinding(
                        tenantId,
                        userId,
                        latestApp,
                        run.id,
                      );
                    completedStatus = 'passed';
                    finalFailureReason = null;
                    completedSummary =
                      '门禁运行器完成 Gate 0-7；Gate 7 real-local publish candidate contract runner 已签收 release manifest contract、artifact checksum placeholders、Gate 0-6 evidence citations 和 deferred public-share controls，并创建或复用已发布 Generated App runtime Workflow，注册/激活通过硬门槛的租户私有生成插件；当前应用进入 publish_candidate，但不会自动创建 public share token。';
                  } else {
                    finalFailureReason =
                      gate7Evaluation.failure?.message ??
                      GATE_7_RUNNER_INCOMPLETE_FAILURE_REASON;
                    completedSummary = buildGate7CompletedRunSummary(
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

    if (completedStatus === 'failed') {
      await this.recordAutomaticRepairAttemptForFailedRun({
        tenantId,
        userId,
        appId,
        generationRunId: run.id,
        maxRepairAttempts: parsed.maxRepairAttempts,
        gateRuns: producedGateRuns,
        excludeGateRunIds: [...automaticRepairGateRunIdsToExclude],
      });
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

  private async recordAutomaticRepairAttemptForFailedRun(params: {
    tenantId: string;
    userId: string;
    appId: string;
    generationRunId: string;
    maxRepairAttempts: number;
    gateRuns: GeneratedAppGateRunResponseDto[];
    excludeGateRunIds?: string[];
  }): Promise<GeneratedAppRepairAttemptResponseDto | null> {
    if (params.maxRepairAttempts <= 0) {
      return null;
    }

    const excludedGateRunIds = new Set(params.excludeGateRunIds ?? []);
    const failedGateRun = params.gateRuns.find(
      (gateRun) =>
        gateRun.status === 'failed' && !excludedGateRunIds.has(gateRun.id),
    );

    if (!failedGateRun) {
      return null;
    }

    const now = new Date();
    const failureMessage =
      failedGateRun.failure?.message ?? failedGateRun.summary;
    const failureSummary = limitRepairAttemptText(
      `${failedGateRun.gateId} ${failedGateRun.gateName} 失败：${failureMessage}`,
    );
    const changeSummary = limitRepairAttemptText(
      failedGateRun.repairInstructions
        ? `自动修复循环已读取失败证据和修复建议：${failedGateRun.repairInstructions} 当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。`
        : '自动修复循环已读取失败证据。当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。',
    );
    const verificationSummary = limitRepairAttemptText(
      `本次修复尝试未形成可执行补丁，${failedGateRun.gateId} 仍为 failed；重新运行前必须修复对应证据缺口。`,
    );
    const repairPlan = this.buildFailedGateRepairPlan(failedGateRun, now);
    const reverificationPlan = this.buildFailedGateReverificationPlan(
      failedGateRun,
      now,
    );

    const [attempt] = await this.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId: params.tenantId,
        generatedAppId: params.appId,
        generationRunId: params.generationRunId,
        attemptNumber: 1,
        targetGateId: failedGateRun.gateId,
        status: 'failed',
        failureSummary,
        changeSummary,
        verificationSummary,
        repairPlan,
        reverificationPlan,
        startedAt: now,
        completedAt: now,
        createdBy: params.userId,
      })
      .returning();

    return this.toRepairAttemptResponseDto(attempt);
  }

  private async createRunningGate3RepairAttempt(params: {
    tenantId: string;
    userId: string;
    appId: string;
    generationRunId: string;
    failedGateRun: GeneratedAppGateRunResponseDto;
  }): Promise<GeneratedAppRepairAttemptResponseDto> {
    const now = new Date();
    const repairPlan = this.buildFailedGateRepairPlan(
      params.failedGateRun,
      now,
    );
    const reverificationPlan = this.buildFailedGateReverificationPlan(
      params.failedGateRun,
      now,
    );
    const failureMessage =
      params.failedGateRun.failure?.message ?? params.failedGateRun.summary;
    const [attempt] = await this.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId: params.tenantId,
        generatedAppId: params.appId,
        generationRunId: params.generationRunId,
        attemptNumber: 1,
        targetGateId: params.failedGateRun.gateId,
        status: 'running',
        failureSummary: limitRepairAttemptText(
          `${params.failedGateRun.gateId} ${params.failedGateRun.gateName} 失败：${failureMessage}`,
        ),
        changeSummary: null,
        verificationSummary: null,
        repairPlan,
        reverificationPlan,
        startedAt: now,
        completedAt: null,
        createdBy: params.userId,
      })
      .returning();

    return this.toRepairAttemptResponseDto(attempt);
  }

  private async completeGate3RepairAttempt(params: {
    tenantId: string;
    appId: string;
    repairAttemptId: string;
    repairResult: GeneratedAppGate3RepairResult;
  }): Promise<GeneratedAppRepairAttemptResponseDto> {
    const completedAt = new Date();
    const [attempt] = await this.tenantDb
      .update(schema.generatedAppRepairAttempts)
      .set({
        status:
          params.repairResult.status === 'passed' ? 'completed' : 'failed',
        changeSummary: limitRepairAttemptText(
          params.repairResult.changeSummary,
        ),
        verificationSummary: limitRepairAttemptText(
          params.repairResult.verificationSummary,
        ),
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, params.repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, params.tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, params.appId),
        ),
      )
      .returning();

    if (!attempt) {
      throw new GeneratedAppRepairAttemptNotFoundException(
        params.repairAttemptId,
      );
    }

    return this.toRepairAttemptResponseDto(attempt);
  }

  private buildFailedGateRepairPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppRepairPlan {
    const gateDefinition = getGeneratedAppGateDefinition(failedGateRun.gateId);
    const evidenceIds = failedGateRun.evidence.map((item) => item.id);
    const evidenceSummaries = failedGateRun.evidence
      .map((item) => limitRepairAttemptText(item.summary))
      .filter((summary) => summary.length > 0)
      .slice(0, 12);

    const basePlan: GeneratedAppRepairPlan = {
      planVersion: 1,
      source: 'automatic-failed-gate-work-order',
      targetGateId: failedGateRun.gateId,
      targetGateName: gateDefinition?.name ?? failedGateRun.gateName,
      failureCode: failedGateRun.failure?.code ?? null,
      failureSummary: limitRepairAttemptText(
        failedGateRun.failure?.message ?? failedGateRun.summary,
      ),
      repairInstructions: failedGateRun.repairInstructions
        ? limitRepairAttemptText(failedGateRun.repairInstructions)
        : null,
      evidenceIds,
      evidenceSummaries,
      allowedChangeScopes: this.resolveRepairAllowedChangeScopes(
        failedGateRun.gateId,
      ),
      forbiddenChangeScopes: [
        'tenant-boundary',
        'public-share-token',
        'host-absolute-path',
        'production-credentials',
        'external-network-without-permission',
        'unrelated-gate-rewrite',
      ],
      patchTargets: this.resolveRepairPatchTargets(failedGateRun.gateId),
      requiredTraceability: [
        'repair-plan-target-gate',
        'failed-evidence-citation',
        'patch-target-to-reverification-command',
        'post-patch-gate-evidence',
        ...(failedGateRun.gateId === 'gate-5'
          ? [
              'public-runtime-journey-to-acceptance-scenario',
              'browser-e2e-failure-to-runtime-form-or-preview-handoff',
            ]
          : []),
      ],
      generatedAt: generatedAt.toISOString(),
    };

    return failedGateRun.gateId === 'gate-5'
      ? {
          ...basePlan,
          browserRepairTargets: [
            {
              targetId: 'public-runtime-form',
              path: 'generationWorkspace.files.src/generated-app/runtime-form.ts',
              reason:
                'Gate 5 open/fill/submit failures often come from missing generated fields, invalid required validation, or unsectioned runtimeForm fields.',
            },
            {
              targetId: 'public-preview-html',
              path: 'generationWorkspace.files.dist/index.html',
              reason:
                'Public build preview must derive token only from the preview route and submit/poll through same-origin public APIs.',
            },
            {
              targetId: 'public-submission-handoff',
              path: 'publicPreviewSubmissionHandoff',
              reason:
                'The generated frontend must hand off public submissions to POST/GET /generated-apps/public/:token/submissions without creator APIs.',
            },
            {
              targetId: 'workflow-output-summary',
              path: 'workflowRuntimeBinding.outputSummaryMapping',
              reason:
                'Public report/detail views may only use sanitized workflow output summaries, not snapshots, raw steps or checkpoint data.',
            },
            {
              targetId: 'plugin-output-summary',
              path: 'pluginTools.publicOutputSummaryMapping',
              reason:
                'Generated private plugin output may surface only as sanitized business summary, never plugin ids or raw tool data.',
            },
          ],
          e2eRunnerContract: {
            mode: 'real-browser-e2e',
            command: GATE_5_REAL_BROWSER_E2E_COMMAND,
            journey: 'open -> fill -> submit -> detail/report',
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
            requiredFailureEvidence: [
              'redacted console summary',
              'redacted network summary',
              'journey/action trace without token values',
              'generated-run relative screenshot/video/trace refs when captured',
              'assertionId/journeyId/viewportId/scenarioIds/requirementIds',
            ],
            forbiddenEvidenceFields: [
              'publicShareToken',
              'pluginIds',
              'workflowSnapshots',
              'stepData',
              'checkpointData',
              'rawToolData',
              'hostAbsolutePath',
              'apiKey',
              'secret',
            ],
          },
        }
      : basePlan;
  }

  private buildFailedGateReverificationPlan(
    failedGateRun: GeneratedAppGateRunResponseDto,
    generatedAt: Date,
  ): GeneratedAppReverificationPlan {
    return {
      planVersion: 1,
      targetGateId: failedGateRun.gateId,
      requiredGateIds: this.resolveReverificationGateIds(failedGateRun.gateId),
      requiredCommandIds: this.resolveReverificationCommandIds(
        failedGateRun.gateId,
      ),
      requiredEvidenceIds: failedGateRun.evidence.map((item) => item.id),
      successCriteria: [
        `${failedGateRun.gateId} must be recorded as passed before later gates can run.`,
        'All new gate evidence must cite the failed evidence or command output that drove the patch.',
        'No host absolute paths, public share tokens, production credentials, or unrelated gate rewrites may appear in repair evidence.',
        ...(failedGateRun.gateId === 'gate-5'
          ? [
              'Gate 5 real-browser-e2e evidence must not be replaced by fixture or local contract evidence when true E2E was requested.',
              'Public runtime open -> fill -> submit -> detail/report journey must pass against only public token endpoints.',
              'Repair evidence must redact public token values, plugin ids, workflow snapshots, raw steps, checkpoints and tool data.',
            ]
          : []),
      ],
      blockedUntilPatchApplied: true,
      generatedAt: generatedAt.toISOString(),
    };
  }

  private resolveRepairAllowedChangeScopes(
    gateId: string,
  ): GeneratedAppRepairPlan['allowedChangeScopes'] {
    switch (gateId) {
      case 'gate-0':
        return ['app-spec', 'test-contracts'];
      case 'gate-1':
        return ['generation-plan', 'test-contracts'];
      case 'gate-2':
        return [
          'static-contracts',
          'generation-plan',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-3':
        return [
          'frontend-workspace',
          'static-contracts',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-4':
        return [
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-5':
        return [
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-6':
        return [
          'app-spec',
          'generation-plan',
          'static-contracts',
          'frontend-workspace',
          'workflow-orchestration',
          'plugin-tools',
          'test-contracts',
        ];
      case 'gate-7':
        return ['publish-contract', 'test-contracts'];
      default:
        return ['test-contracts'];
    }
  }

  private resolveRepairPatchTargets(gateId: string): string[] {
    switch (gateId) {
      case 'gate-0':
        return ['generated_apps.app_spec'];
      case 'gate-1':
        return ['generated_apps.generation_plan'];
      case 'gate-2':
        return ['generated_apps.generation_plan.staticContracts'];
      case 'gate-3':
        return [
          'generationWorkspace.files',
          'generationWorkspace.commandPlan',
          'generationWorkspace.artifactPaths',
          'generated_apps.generation_plan.buildUnitPlan',
        ];
      case 'gate-4':
        return ['generated_apps.generation_plan.integrationPlan'];
      case 'gate-5':
        return [
          'generated_apps.generation_plan.browserAcceptancePlan',
          'generationWorkspace.files.src/App.tsx',
          'generationWorkspace.files.src/generated-app/runtime-form.ts',
          'generationWorkspace.files.src/generated-app/runtime.ts',
          'generationWorkspace.files.src/generated-app/static-contracts.ts',
          'generationWorkspace.files.dist/index.html',
          'publicPreviewSubmissionHandoff',
          'publicRuntimeSubmissionDetailHandoff',
          'workflowRuntimeBinding.outputSummaryMapping',
          'pluginTools.publicOutputSummaryMapping',
        ];
      case 'gate-6':
        return ['generated_apps.generation_plan.independentVerificationPlan'];
      case 'gate-7':
        return ['generated_apps.generation_plan.publishCandidatePlan'];
      default:
        return ['generated_apps.generation_plan'];
    }
  }

  private resolveReverificationGateIds(gateId: string): string[] {
    const gateDefinition = getGeneratedAppGateDefinition(gateId);

    if (!gateDefinition) {
      return [gateId];
    }

    return [`gate-${gateDefinition.order}`];
  }

  private resolveReverificationCommandIds(gateId: string): string[] {
    switch (gateId) {
      case 'gate-3':
        return [...GATE_3_REQUIRED_COMMAND_IDS];
      case 'gate-4':
        return ['agentloom generated-app gate-4 local-integration'];
      case 'gate-5':
        return [
          'agentloom generated-app gate-5 local-browser-contract',
          'agentloom generated-app gate-5 real-browser-e2e',
        ];
      case 'gate-6':
        return ['agentloom generated-app gate-6 local-independent-verifier'];
      case 'gate-7':
        return ['agentloom generated-app gate-7 publish-candidate'];
      default:
        return [];
    }
  }

  private async resolveLatestFailedRepairContext(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppGenerationRepairContext | null> {
    const [attempt] = await this.tenantDb
      .select()
      .from(schema.generatedAppRepairAttempts)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
          eq(schema.generatedAppRepairAttempts.status, 'failed'),
        ),
      )
      .orderBy(desc(schema.generatedAppRepairAttempts.createdAt))
      .limit(1);

    if (!attempt) {
      return null;
    }

    return {
      source: 'previous-failed-repair-attempt',
      sourceGenerationRunId: attempt.generationRunId,
      sourceRepairAttemptId: attempt.id,
      targetGateId: attempt.targetGateId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      failureSummary: limitRepairAttemptText(attempt.failureSummary),
      changeSummary: attempt.changeSummary
        ? limitRepairAttemptText(attempt.changeSummary)
        : null,
      verificationSummary: attempt.verificationSummary
        ? limitRepairAttemptText(attempt.verificationSummary)
        : null,
      repairPlan: this.getRepairPlanOrNull(attempt.repairPlan),
      reverificationPlan: this.getReverificationPlanOrNull(
        attempt.reverificationPlan,
      ),
      capturedAt: new Date().toISOString(),
    };
  }

  private getRepairPlanOrNull(value: unknown): GeneratedAppRepairPlan | null {
    return isRecord(value)
      ? (value as unknown as GeneratedAppRepairPlan)
      : null;
  }

  private getReverificationPlanOrNull(
    value: unknown,
  ): GeneratedAppReverificationPlan | null {
    return isRecord(value)
      ? (value as unknown as GeneratedAppReverificationPlan)
      : null;
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
        repairPlan:
          (parsed.repairPlan as schema.NewGeneratedAppRepairAttempt['repairPlan']) ??
          null,
        reverificationPlan:
          (parsed.reverificationPlan as schema.NewGeneratedAppRepairAttempt['reverificationPlan']) ??
          null,
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

    if (parsed.repairPlan !== undefined) {
      updatePayload.repairPlan =
        parsed.repairPlan as schema.NewGeneratedAppRepairAttempt['repairPlan'];
    }

    if (parsed.reverificationPlan !== undefined) {
      updatePayload.reverificationPlan =
        parsed.reverificationPlan as schema.NewGeneratedAppRepairAttempt['reverificationPlan'];
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
    const status = resolveStatusForShareDisabled(app.readiness);

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
      pages: getPublicRuntimePages(app.appSpec),
    });
    const publicDescription = buildPublicGeneratedAppRuntimeDescription({
      appSpec: app.appSpec,
      description: app.description,
    });
    const previewUrl = await this.resolvePublicRuntimePreviewUrl(app, token);

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
        previewUrl,
      },
      runtimeForm: buildGeneratedAppRuntimeForm({
        appSpec: app.appSpec,
        generationPlan: app.generationPlan,
        description: app.description,
      }),
      createdAt: app.createdAt,
    };
  }

  async getPublicBuildPreviewHtml(token: string): Promise<string> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const artifact = await this.resolveArtifactContentForApp(
      app,
      GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
    );

    return artifact.content;
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
    const workflowExecutionHandoff =
      evaluation.status === 'completed'
        ? await this.createPublicWorkflowExecutionHandoff({
            app,
            input: evaluation.input,
            anonymousSessionId,
            submittedAt: now,
          })
        : null;
    const result = workflowExecutionHandoff
      ? this.attachWorkflowExecutionHandoff(
          evaluation.result,
          workflowExecutionHandoff,
        )
      : evaluation.result;
    const report = workflowExecutionHandoff
      ? this.attachWorkflowExecutionHandoff(
          evaluation.report,
          workflowExecutionHandoff,
        )
      : evaluation.report;

    const submissionStatus = workflowExecutionHandoff
      ? this.getPublicSubmissionStatusForWorkflowExecutionStatus(
          evaluation.status,
          workflowExecutionHandoff.executionStatus,
        )
      : evaluation.status;

    const [submission] = await this.db
      .insert(schema.generatedAppSubmissions)
      .values({
        tenantId: app.tenantId,
        generatedAppId: app.id,
        appSpecVersion: app.appSpec.version,
        publicShareToken: token,
        anonymousSessionId,
        status: submissionStatus,
        input: evaluation.input,
        result,
        report,
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

    const refreshedSubmission =
      await this.refreshPublicSubmissionWorkflowHandoff(app, submission);

    return this.toPublicSubmissionResponseDto(refreshedSubmission);
  }

  private async refreshPublicSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): Promise<GeneratedAppSubmission> {
    return this.refreshSubmissionWorkflowHandoff(app, submission, {
      requireGeneratedAppMetadata: false,
    });
  }

  private async refreshCreatorSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): Promise<GeneratedAppSubmission> {
    return this.refreshSubmissionWorkflowHandoff(app, submission, {
      requireGeneratedAppMetadata: true,
    });
  }

  private async refreshSubmissionWorkflowHandoff(
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
    options: { requireGeneratedAppMetadata: boolean },
  ): Promise<GeneratedAppSubmission> {
    const handoff = this.extractPublicWorkflowExecutionHandoff(submission);

    if (!handoff) {
      return submission;
    }

    try {
      const [execution] = await this.db
        .select({
          id: schema.workflowExecutions.id,
          tenantId: schema.workflowExecutions.tenantId,
          workflowDefinitionId: schema.workflowExecutions.workflowDefinitionId,
          status: schema.workflowExecutions.status,
          completedAt: schema.workflowExecutions.completedAt,
          failedAt: schema.workflowExecutions.failedAt,
          cancelledAt: schema.workflowExecutions.cancelledAt,
          totalSteps: schema.workflowExecutions.totalSteps,
          completedSteps: schema.workflowExecutions.completedSteps,
          updatedAt: schema.workflowExecutions.updatedAt,
          inputParams: schema.workflowExecutions.inputParams,
        })
        .from(schema.workflowExecutions)
        .where(
          and(
            eq(schema.workflowExecutions.id, handoff.executionId),
            eq(schema.workflowExecutions.tenantId, app.tenantId),
          ),
        )
        .limit(1);
      const expectedWorkflowDefinitionId =
        handoff.workflowDefinitionId ?? app.workflowDefinitionId ?? null;

      if (
        !execution ||
        !expectedWorkflowDefinitionId ||
        execution.workflowDefinitionId !== expectedWorkflowDefinitionId ||
        (options.requireGeneratedAppMetadata &&
          !this.isWorkflowExecutionForGeneratedAppSubmission(
            execution.inputParams,
            app,
            submission,
          ))
      ) {
        return this.persistRefreshedSubmissionWorkflowHandoff(
          submission,
          this.buildWorkflowExecutionNotStartedHandoff(
            handoff.workflowDefinitionId ?? app.workflowDefinitionId,
            'workflow-execution-unavailable',
          ),
        );
      }

      const safeSummary =
        execution.status === 'completed'
          ? await this.buildPublicWorkflowExecutionSummary(
              execution.id,
              app.tenantId,
            )
          : undefined;

      return this.persistRefreshedSubmissionWorkflowHandoff(
        submission,
        this.buildRefreshedWorkflowExecutionHandoff({
          workflowDefinitionId: execution.workflowDefinitionId,
          executionId: execution.id,
          status: execution.status,
          updatedAt: execution.updatedAt,
          completedAt:
            execution.completedAt ??
            execution.failedAt ??
            execution.cancelledAt ??
            null,
          completedSteps: execution.completedSteps,
          totalSteps: execution.totalSteps,
          summary: safeSummary,
        }),
      );
    } catch {
      return this.persistRefreshedSubmissionWorkflowHandoff(
        submission,
        this.buildWorkflowExecutionNotStartedHandoff(
          handoff.workflowDefinitionId ?? app.workflowDefinitionId,
          'workflow-execution-unavailable',
        ),
      );
    }
  }

  private isWorkflowExecutionForGeneratedAppSubmission(
    inputParams: Record<string, unknown> | null,
    app: GeneratedApp,
    submission: GeneratedAppSubmission,
  ): boolean {
    const metadata = getRecord(inputParams?._meta);

    if (!metadata) {
      return false;
    }

    const submissionMetadata = getRecord(metadata.submission);
    const submittedAt = getNonEmptyString(submissionMetadata?.submittedAt);
    const submittedAtTime = submittedAt ? Date.parse(submittedAt) : Number.NaN;

    return (
      getNonEmptyString(metadata.generatedAppId) === app.id &&
      getNonEmptyString(metadata.submissionSource) ===
        'generated-app-public-submission' &&
      Number(metadata.appSpecVersion) === submission.appSpecVersion &&
      getNonEmptyString(submissionMetadata?.anonymousSessionId) ===
        submission.anonymousSessionId &&
      Number.isFinite(submittedAtTime) &&
      submittedAtTime === submission.createdAt.getTime()
    );
  }

  private shouldRefreshSubmissionWorkflowHandoff(
    submission: GeneratedAppSubmission,
  ): boolean {
    const handoff = this.extractPublicWorkflowExecutionHandoff(submission);

    if (!handoff) {
      return false;
    }

    const reportStatus = this.getWorkflowExecutionStatusFromPayload(
      submission.report,
    );

    if (reportStatus) {
      return this.isRefreshableWorkflowExecutionStatus(reportStatus);
    }

    const resultStatus = this.getWorkflowExecutionStatusFromPayload(
      submission.result,
    );

    return resultStatus
      ? this.isRefreshableWorkflowExecutionStatus(resultStatus)
      : true;
  }

  private getWorkflowExecutionStatusFromPayload(
    payload: Record<string, unknown> | null,
  ): schema.WorkflowExecution['status'] | null {
    const record = getRecord(payload);
    const status = getNonEmptyString(record?.executionStatus);

    return this.isWorkflowExecutionStatus(status) ? status : null;
  }

  private isWorkflowExecutionStatus(
    status: string | null | undefined,
  ): status is schema.WorkflowExecution['status'] {
    return (
      status === 'pending' ||
      status === 'running' ||
      status === 'paused' ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
    );
  }

  private isRefreshableWorkflowExecutionStatus(
    status: schema.WorkflowExecution['status'],
  ): boolean {
    return status === 'pending' || status === 'running' || status === 'paused';
  }

  private extractPublicWorkflowExecutionHandoff(
    submission: GeneratedAppSubmission,
  ): { executionId: string; workflowDefinitionId: string | null } | null {
    const reportHandoff = this.extractPublicWorkflowExecutionHandoffFromPayload(
      submission.report,
    );

    if (reportHandoff) {
      return reportHandoff;
    }

    return this.extractPublicWorkflowExecutionHandoffFromPayload(
      submission.result,
    );
  }

  private extractPublicWorkflowExecutionHandoffFromPayload(
    payload: Record<string, unknown> | null,
  ): { executionId: string; workflowDefinitionId: string | null } | null {
    const record = getRecord(payload);

    if (!record || record.workflowExecution !== true) {
      return null;
    }

    const executionId = getNonEmptyString(record.executionId);

    if (!executionId || !UUID_LIKE_PATTERN.test(executionId)) {
      return null;
    }

    const workflowDefinitionId = getNonEmptyString(record.workflowDefinitionId);

    if (workflowDefinitionId && !UUID_LIKE_PATTERN.test(workflowDefinitionId)) {
      return null;
    }

    return { executionId, workflowDefinitionId };
  }

  private buildRefreshedWorkflowExecutionHandoff(params: {
    workflowDefinitionId: string;
    executionId: string;
    status: schema.WorkflowExecution['status'];
    updatedAt: Date;
    completedAt: Date | null;
    completedSteps: number;
    totalSteps: number;
    summary?: Record<string, unknown>;
  }): GeneratedAppWorkflowExecutionHandoff {
    const completedAt = params.completedAt?.toISOString() ?? null;
    const updatedAt = params.updatedAt.toISOString();
    const progress =
      params.totalSteps > 0
        ? `${Math.min(params.completedSteps, params.totalSteps)}/${params.totalSteps}`
        : null;

    switch (params.status) {
      case 'completed':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_COMPLETED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 已完成；公开页面仅展示安全执行摘要，并继续保留本地 deterministic report。',
          updatedAt,
          completedAt,
          summary: params.summary,
        };
      case 'failed':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_FAILED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 未完成；公开页面继续保留本地 deterministic report fallback，不展示内部错误细节。',
          updatedAt,
          completedAt,
        };
      case 'cancelled':
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_CANCELLED_BOUNDARY,
          notStartedReason: null,
          notice:
            'Workflow execution 已取消；公开页面继续保留本地 deterministic report fallback。',
          updatedAt,
          completedAt,
        };
      case 'running':
      case 'pending':
      case 'paused':
      default:
        return {
          workflowExecution: true,
          workflowDefinitionId: params.workflowDefinitionId,
          executionId: params.executionId,
          executionStatus: params.status,
          executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY,
          notStartedReason: null,
          notice: progress
            ? `Workflow execution 仍在执行中（${progress}）；公开页面会继续轮询安全状态。`
            : 'Workflow execution 仍在执行中；公开页面会继续轮询安全状态。',
          updatedAt,
          completedAt: null,
        };
    }
  }

  private async buildPublicWorkflowExecutionSummary(
    executionId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const steps = await this.db
      .select({
        nodeId: schema.executionSteps.nodeId,
        nodeType: schema.executionSteps.nodeType,
        status: schema.executionSteps.status,
        completedAt: schema.executionSteps.completedAt,
        result: schema.executionSteps.result,
      })
      .from(schema.executionSteps)
      .innerJoin(
        schema.workflowExecutions,
        eq(schema.workflowExecutions.id, schema.executionSteps.executionId),
      )
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          eq(schema.workflowExecutions.tenantId, tenantId),
        ),
      );

    const completedCount = steps.filter(
      (step) => step.status === 'completed',
    ).length;
    const failedCount = steps.filter((step) => step.status === 'failed').length;
    const cancelledCount = steps.filter(
      (step) => step.status === 'cancelled',
    ).length;
    const latestCompletedAt = steps
      .map((step) => step.completedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const publicOutputs = steps
      .filter((step) => step.status === 'completed')
      .flatMap((step) =>
        this.extractPublicWorkflowStepOutputs({
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          result: step.result,
        }),
      )
      .slice(0, GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_LIMIT);

    return {
      summary:
        publicOutputs.length > 0
          ? 'Workflow execution 已完成；公开页面展示经过白名单过滤的业务输出摘要，并继续隐藏内部执行快照。'
          : 'Workflow execution 已完成。出于公开链接安全边界，仅展示步骤计数摘要，不展开节点输出或内部执行快照。',
      completedSteps: completedCount,
      failedSteps: failedCount,
      cancelledSteps: cancelledCount,
      totalSteps: steps.length,
      latestStepCompletedAt: latestCompletedAt?.toISOString() ?? null,
      publicOutputs,
    };
  }

  private extractPublicWorkflowStepOutputs(params: {
    nodeId: string;
    nodeType: string | null;
    result: Record<string, unknown> | null;
  }): Array<Record<string, unknown>> {
    const result = getRecord(params.result);

    if (!result) {
      return [];
    }

    const analysis =
      getRecord(result.analysis) ?? getRecord(result['analysis-out']);

    if (analysis) {
      return [
        {
          kind: 'analysis',
          title:
            params.nodeType === 'plugin'
              ? '私有工具分析摘要'
              : '结构化分析摘要',
          nodeId: params.nodeId,
          nodeType: params.nodeType,
          value: sanitizePublicWorkflowOutputValue(analysis),
        },
      ];
    }

    if (params.nodeType === 'text-output') {
      const content = getNonEmptyString(result.content);

      return content
        ? [
            {
              kind: 'text',
              title: 'Workflow 文本输出',
              nodeId: params.nodeId,
              nodeType: params.nodeType,
              value: limitPublicWorkflowOutputText(content),
            },
          ]
        : [];
    }

    if (params.nodeType === 'json-output') {
      const json = getRecord(result.json);

      return json
        ? [
            {
              kind: 'json',
              title: 'Workflow JSON 输出',
              nodeId: params.nodeId,
              nodeType: params.nodeType,
              value: sanitizePublicWorkflowOutputValue(json),
            },
          ]
        : [];
    }

    return [];
  }

  private withRefreshedWorkflowHandoff(
    submission: GeneratedAppSubmission,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): GeneratedAppSubmission {
    const result = this.attachWorkflowExecutionHandoff(
      this.sanitizePublicSubmissionResultReport(submission.result),
      handoff,
    );
    const report = this.attachWorkflowExecutionHandoff(
      this.removeWorkflowExecutionStatusSection(
        this.sanitizePublicSubmissionResultReport(submission.report),
      ),
      handoff,
    );

    return {
      ...submission,
      status: this.getPublicSubmissionStatusForWorkflowHandoff(
        submission.status,
        handoff,
      ),
      result,
      report: this.appendWorkflowExecutionReportSection(report, handoff),
      updatedAt: new Date(),
    };
  }

  private async persistRefreshedSubmissionWorkflowHandoff(
    submission: GeneratedAppSubmission,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): Promise<GeneratedAppSubmission> {
    const refreshed = this.withRefreshedWorkflowHandoff(submission, handoff);
    const [updated] = await this.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        status: refreshed.status,
        result: refreshed.result,
        report: refreshed.report,
        errorMessage: refreshed.errorMessage,
        updatedAt: refreshed.updatedAt,
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submission.id),
          eq(schema.generatedAppSubmissions.tenantId, submission.tenantId),
          eq(
            schema.generatedAppSubmissions.generatedAppId,
            submission.generatedAppId,
          ),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning();

    return updated ?? refreshed;
  }

  private getPublicSubmissionStatusForWorkflowHandoff(
    currentStatus: schema.GeneratedAppSubmissionStatus,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): schema.GeneratedAppSubmissionStatus {
    if (handoff.workflowExecution === false) {
      return 'failed';
    }

    return this.getPublicSubmissionStatusForWorkflowExecutionStatus(
      currentStatus,
      handoff.executionStatus,
    );
  }

  private getPublicSubmissionStatusForWorkflowExecutionStatus(
    currentStatus: schema.GeneratedAppSubmissionStatus,
    executionStatus: schema.WorkflowExecution['status'] | null,
  ): schema.GeneratedAppSubmissionStatus {
    switch (executionStatus) {
      case 'pending':
        return 'received';
      case 'running':
      case 'paused':
        return 'running';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
        return 'failed';
      default:
        return currentStatus;
    }
  }

  private async createPublicWorkflowExecutionHandoff(params: {
    app: GeneratedApp;
    input: Record<string, unknown>;
    anonymousSessionId: string;
    submittedAt: Date;
  }): Promise<GeneratedAppWorkflowExecutionHandoff> {
    if (!params.app.workflowDefinitionId) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        null,
        'no-workflow-bound',
      );
    }

    const workflowDefinitionId = params.app.workflowDefinitionId;
    const [workflow] = await this.db
      .select({
        id: schema.workflowDefinitions.id,
        status: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        metadata: schema.workflowDefinitions.metadata,
        inputSchema: schema.workflowDefinitions.inputSchema,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowDefinitionId),
          eq(schema.workflowDefinitions.tenantId, params.app.tenantId),
        ),
      )
      .limit(1);

    if (
      !workflow ||
      this.isGeneratedAppEditorHandoffWorkflowMetadata(workflow.metadata) ||
      workflow.status !== 'published' ||
      !workflow.publishedVersionId
    ) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        'workflow-not-published',
      );
    }

    if (!this.executionService) {
      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        'workflow-execution-unavailable',
      );
    }

    try {
      const workflowInputSchema = workflow.inputSchema
        ? workflowInputSchemaSchema.parse(workflow.inputSchema)
        : null;
      const execution = await this.executionService.runWorkflow(
        workflowDefinitionId,
        this.buildGeneratedAppPublicRunRequest({
          app: params.app,
          input: params.input,
          anonymousSessionId: params.anonymousSessionId,
          submittedAt: params.submittedAt,
          workflowInputSchemaVersion: workflowInputSchema?.version,
        }),
        params.app.tenantId,
        params.app.createdBy,
      );

      return {
        workflowExecution: true,
        workflowDefinitionId,
        executionId: execution.id,
        executionStatus: execution.status,
        executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_EXECUTION_BOUNDARY,
        notStartedReason: null,
        notice:
          '已创建异步 Workflow execution；公开提交响应只展示 execution id/status/boundary，不等待执行完成，也不伪造最终 Workflow 输出。',
      };
    } catch (error) {
      const reason =
        error instanceof WorkflowNotPublishedException
          ? 'workflow-not-published'
          : 'workflow-execution-blocked';

      return this.buildWorkflowExecutionNotStartedHandoff(
        workflowDefinitionId,
        reason,
      );
    }
  }

  private buildGeneratedAppPublicRunRequest(params: {
    app: GeneratedApp;
    input: Record<string, unknown>;
    anonymousSessionId: string;
    submittedAt: Date;
    workflowInputSchemaVersion?: number;
  }): InternalRunWorkflowRequest {
    const inputParams: Record<string, unknown> = {
      ...params.input,
      _meta: {
        launchSource: 'api',
        generatedAppId: params.app.id,
        appSpecVersion: params.app.appSpec.version,
        submissionSource: 'generated-app-public-submission',
        submission: {
          source: 'generated-app-public-submission',
          anonymousSessionId: params.anonymousSessionId,
          submittedAt: params.submittedAt.toISOString(),
        },
        runtime: {
          kind: 'generated-app-public-runtime',
          boundary: 'public-generated-app-async-workflow-handoff',
        },
        executionBoundary:
          'public submission creates async Workflow execution only',
      },
    };

    return {
      inputParams,
      launchSource: 'api',
      schemaVersion: params.workflowInputSchemaVersion,
      triggerType: 'api' satisfies ExecutionTriggerType,
    };
  }

  private buildWorkflowExecutionNotStartedHandoff(
    workflowDefinitionId: string | null,
    reason: GeneratedAppWorkflowExecutionNotStartedReason,
  ): GeneratedAppWorkflowExecutionHandoff {
    return {
      workflowExecution: false,
      workflowDefinitionId,
      executionId: null,
      executionStatus: null,
      executionBoundary: GENERATED_APP_PUBLIC_WORKFLOW_NOT_STARTED_BOUNDARY,
      notStartedReason: reason,
      notice: this.getWorkflowExecutionNotStartedNotice(reason),
    };
  }

  private getWorkflowExecutionNotStartedNotice(
    reason: GeneratedAppWorkflowExecutionNotStartedReason,
  ): string {
    switch (reason) {
      case 'workflow-not-published':
        return '未创建 Workflow execution：绑定 Workflow 尚未发布，公开提交继续返回本地 deterministic report。';
      case 'workflow-execution-unavailable':
        return 'Workflow execution 当前不可用：公开提交继续返回本地 deterministic report。';
      case 'workflow-execution-blocked':
        return '未创建 Workflow execution：执行启动被平台安全或治理边界阻止，公开提交继续返回本地 deterministic report。';
      case 'no-workflow-bound':
      default:
        return '未创建 Workflow execution：当前 Generated App 没有绑定可执行 Workflow，公开提交继续返回本地 deterministic report。';
    }
  }

  private isGeneratedAppEditorHandoffWorkflowMetadata(
    metadata: unknown,
  ): boolean {
    if (!isRecord(metadata)) {
      return false;
    }

    return (
      metadata.source === GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE ||
      metadata.bindingKind === 'editor-handoff-draft'
    );
  }

  private buildRuntimeBindingReadinessResponse(
    response: GeneratedAppRuntimeBindingReadinessResponseDto,
  ): GeneratedAppRuntimeBindingReadinessResponseDto {
    return response;
  }

  private attachWorkflowExecutionHandoff<T extends Record<string, unknown>>(
    payload: T | null,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): T | null {
    if (!payload) {
      return payload;
    }

    return {
      ...payload,
      workflowExecution: handoff.workflowExecution,
      executionId: handoff.executionId,
      executionStatus: handoff.executionStatus,
      workflowDefinitionId: handoff.workflowDefinitionId,
      executionBoundary: handoff.executionBoundary,
      workflowExecutionNotStartedReason: handoff.notStartedReason,
      workflowExecutionNotice: handoff.notice,
      workflowExecutionUpdatedAt: handoff.updatedAt ?? null,
      workflowExecutionCompletedAt: handoff.completedAt ?? null,
      workflowExecutionSummary: handoff.summary ?? null,
    };
  }

  private removeWorkflowExecutionStatusSection(
    report: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!report) {
      return report;
    }

    const sections = getRecordArray(report.sections).filter(
      (section) =>
        getNonEmptyString(section.id) !==
        GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID,
    );

    if (!Array.isArray(report.sections)) {
      return report;
    }

    return {
      ...report,
      sections,
    };
  }

  private appendWorkflowExecutionReportSection(
    report: Record<string, unknown> | null,
    handoff: GeneratedAppWorkflowExecutionHandoff,
  ): Record<string, unknown> | null {
    if (!report || handoff.workflowExecution !== true) {
      return report;
    }

    const sections = getRecordArray(report.sections);
    const statusLabel = getWorkflowExecutionPublicStatusLabel(
      handoff.executionStatus,
    );
    const items = [
      `执行状态：${statusLabel}`,
      handoff.completedAt ? `完成时间：${handoff.completedAt}` : null,
      handoff.updatedAt ? `更新时间：${handoff.updatedAt}` : null,
      handoff.summary
        ? `安全摘要：${getNonEmptyString(handoff.summary.summary) ?? '执行已完成，公开页面仅展示步骤计数摘要。'}`
        : null,
      ...buildPublicWorkflowOutputReportItems(handoff.summary),
    ].filter((item): item is string => Boolean(item));

    return {
      ...report,
      sections: [
        ...sections,
        {
          id: GENERATED_APP_PUBLIC_WORKFLOW_STATUS_SECTION_ID,
          title: 'Workflow 执行状态',
          body: handoff.notice,
          items,
        },
      ],
    };
  }

  private sanitizePublicSubmissionResultReport<
    T extends Record<string, unknown>,
  >(payload: T | null): T | null {
    if (!payload) {
      return payload;
    }

    return sanitizePublicSubmissionValue(payload) as T;
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
    const app = submissions.some((submission) =>
      this.shouldRefreshSubmissionWorkflowHandoff(submission),
    )
      ? await this.findGeneratedAppRecord(tenantId, appId)
      : null;
    const refreshedSubmissions = app
      ? await Promise.all(
          submissions.map((submission) =>
            this.shouldRefreshSubmissionWorkflowHandoff(submission)
              ? this.refreshCreatorSubmissionWorkflowHandoff(app, submission)
              : submission,
          ),
        )
      : submissions;

    return {
      data: refreshedSubmissions.map((submission) =>
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
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const submission = await this.findSubmissionRecord(
      tenantId,
      appId,
      submissionId,
    );
    const refreshedSubmission =
      await this.refreshCreatorSubmissionWorkflowHandoff(app, submission);

    return this.toSubmissionResponseDto(refreshedSubmission);
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

  private async ensureGeneratedWorkflowRuntimeBinding(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
    generationRunId: string,
  ): Promise<GeneratedAppResponseDto> {
    if (app.workflowDefinitionId) {
      const [boundWorkflow] = await this.tenantDb
        .select({
          id: schema.workflowDefinitions.id,
          metadata: schema.workflowDefinitions.metadata,
        })
        .from(schema.workflowDefinitions)
        .where(
          and(
            eq(schema.workflowDefinitions.id, app.workflowDefinitionId),
            eq(schema.workflowDefinitions.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (
        boundWorkflow &&
        !this.isGeneratedAppEditorHandoffWorkflowMetadata(
          boundWorkflow.metadata,
        )
      ) {
        return app;
      }
    }

    const existingWorkflow = await this.findGeneratedWorkflowRuntimeBinding(
      tenantId,
      app.id,
    );
    const workflowDefinitionId =
      existingWorkflow?.id ??
      (await this.createGeneratedWorkflowRuntimeBinding(
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

  private async ensureGeneratedPrivatePluginBindings(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
  ): Promise<GeneratedAppResponseDto> {
    const generationPlan =
      app.generationPlan as GeneratedAppGenerationPlan | null;
    const pluginTools = generationPlan?.pluginTools.tools ?? [];

    if (pluginTools.length === 0) {
      return app;
    }

    if (!this.pluginService) {
      throw new Error(
        'Generated App 私有插件自动激活需要 PluginService，但当前模块未提供。',
      );
    }

    const workspace = generationPlan?.buildUnitPlan?.generationWorkspace;
    if (!workspace?.relativePath) {
      throw new Error('Generated App 私有插件缺少 Gate 3 workspace。');
    }

    const activatedPluginDbIds: string[] = [];
    for (const tool of pluginTools) {
      const toolId = getNonEmptyString(tool.toolId);
      if (!toolId) {
        throw new Error('Generated App 私有插件 toolId 缺失。');
      }

      const pluginBundle = await this.loadAndVerifyGeneratedPrivatePlugin({
        app,
        toolId,
        workspaceRelativePath: workspace.relativePath,
      });
      const wasmBundleUrl =
        pluginBundle.wasmBuffer && pluginBundle.wasmEntry
          ? `generated-apps/${app.id}/plugins/${toolId}.wasm`
          : undefined;
      let pluginRecord = await this.pluginService.findByPluginId(
        pluginBundle.pluginId,
        undefined,
        tenantId,
      );

      const registrationManifest =
        buildGeneratedPrivatePluginRegistrationManifest({
          app,
          toolId,
          pluginBundle,
          wasmBundleUrl,
        });

      if (!pluginRecord) {
        await this.persistGeneratedPrivatePluginArtifacts({
          archiveStorageKey: pluginBundle.storageKey,
          archiveBuffer: pluginBundle.archiveBuffer,
          wasmBundleUrl,
          wasmBuffer: pluginBundle.wasmBuffer,
        });

        try {
          pluginRecord = await this.pluginService.register(
            tenantId,
            undefined,
            userId,
            registrationManifest,
            pluginBundle.nodeDefinitions,
            pluginBundle.storageKey,
            {
              signature: pluginBundle.signature,
              contentHash: pluginBundle.contentHash,
              wasmBundleUrl,
            },
          );
        } catch (error) {
          if (!(error instanceof PluginAlreadyExistsException)) {
            throw error;
          }

          pluginRecord = await this.pluginService.findByPluginId(
            pluginBundle.pluginId,
            undefined,
            tenantId,
          );
        }
      } else if (
        this.mustRefreshGeneratedPrivatePluginRegistration(
          app,
          toolId,
          pluginRecord,
          pluginBundle,
          wasmBundleUrl,
        )
      ) {
        await this.persistGeneratedPrivatePluginArtifacts({
          archiveStorageKey: pluginBundle.storageKey,
          archiveBuffer: pluginBundle.archiveBuffer,
          wasmBundleUrl,
          wasmBuffer: pluginBundle.wasmBuffer,
        });

        pluginRecord = await this.pluginService.updateRegistrationArtifacts(
          pluginRecord.id,
          tenantId,
          pluginRecord.occVersion,
          registrationManifest,
          pluginBundle.nodeDefinitions,
          pluginBundle.storageKey,
          {
            signature: pluginBundle.signature,
            contentHash: pluginBundle.contentHash,
            wasmBundleUrl,
          },
        );
      }

      if (!pluginRecord) {
        throw new Error(
          `Generated App 私有插件 ${pluginBundle.pluginId} 注册后未找到记录。`,
        );
      }

      if (pluginRecord.status !== 'active') {
        pluginRecord = await this.pluginService.updateStatus(
          pluginRecord.id,
          tenantId,
          'active',
          pluginRecord.occVersion,
        );
      }

      activatedPluginDbIds.push(pluginRecord.id);
    }

    const pluginIds = [...new Set([...app.pluginIds, ...activatedPluginDbIds])];
    if (
      pluginIds.length === app.pluginIds.length &&
      pluginIds.every((pluginId, index) => pluginId === app.pluginIds[index])
    ) {
      return app;
    }

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        pluginIds,
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

  private mustRefreshGeneratedPrivatePluginRegistration(
    app: GeneratedAppResponseDto,
    toolId: string,
    pluginRecord: {
      storageKey: string | null;
      signature: string | null;
      contentHash: string | null;
      wasmBundleUrl: string | null;
      metadata: Record<string, unknown> | null;
    },
    pluginBundle: {
      storageKey: string;
      signature: string;
      contentHash: string;
      wasmEntry: string | null;
    },
    wasmBundleUrl: string | undefined,
  ): boolean {
    const metadata = pluginRecord.metadata ?? {};

    return (
      pluginRecord.storageKey !== pluginBundle.storageKey ||
      pluginRecord.signature !== pluginBundle.signature ||
      pluginRecord.contentHash !== pluginBundle.contentHash ||
      pluginRecord.wasmBundleUrl !== (wasmBundleUrl ?? null) ||
      metadata.source !== 'generated-app-private-plugin' ||
      metadata.activationScope !== 'tenant-private' ||
      metadata.generatedAppId !== app.id ||
      metadata.appSpecVersion !== app.appSpec.version ||
      metadata.toolId !== toolId ||
      metadata.wasmEntry !== (pluginBundle.wasmEntry ?? null) ||
      metadata.wasmBundleUrl !== (wasmBundleUrl ?? null)
    );
  }

  private async loadAndVerifyGeneratedPrivatePlugin(params: {
    app: GeneratedAppResponseDto;
    toolId: string;
    workspaceRelativePath: string;
  }): Promise<{
    pluginId: string;
    manifest: Record<string, unknown>;
    nodeDefinitions: Array<Record<string, unknown>>;
    artifactPath: string;
    buildReportPath: string;
    storageKey: string;
    archiveBuffer: Buffer;
    wasmEntry: string | null;
    wasmBuffer: Buffer | null;
    signature: string;
    contentHash: string;
    buildReport: GeneratedAppPrivatePluginBuildReport;
  }> {
    const workspaceRoot = this.resolveWorkspaceRoot();
    const workspacePath = this.resolveSafeRelativePathInside(
      workspaceRoot,
      params.workspaceRelativePath,
    );
    const artifactPath = `artifacts/gate-3/plugins/${params.toolId}.alp`;
    const buildReportPath = `artifacts/gate-3/plugins/${params.toolId}-build-report.json`;
    const artifactAbsolutePath = this.resolveSafeRelativePathInside(
      workspacePath,
      artifactPath,
    );
    const buildReportAbsolutePath = this.resolveSafeRelativePathInside(
      workspacePath,
      buildReportPath,
    );
    const [archiveBuffer, buildReport] = await Promise.all([
      readFile(artifactAbsolutePath),
      this.readJsonFile<GeneratedAppPrivatePluginBuildReport>(
        buildReportAbsolutePath,
      ),
    ]);
    const manifest =
      await readArchiveManifest<Record<string, unknown>>(archiveBuffer);
    const validation = validatePluginManifest(manifest);

    if (!validation.valid) {
      throw new Error(
        `Generated App 私有插件 manifest 校验失败：${validation.errors.join('；')}`,
      );
    }

    const pluginId = getNonEmptyString(manifest.id);
    const signature = getNonEmptyString(manifest.signature);
    const contentHash = getNonEmptyString(manifest.contentHash);
    const publicKeyPem = getNonEmptyString(
      buildReport.generatedSigningPublicKeyPem,
    );

    if (!pluginId || !signature || !contentHash || !publicKeyPem) {
      throw new Error(
        `Generated App 私有插件 ${params.toolId} 缺少签名、内容哈希或生成公钥。`,
      );
    }

    if (
      !Array.isArray(manifest.permissions) ||
      manifest.permissions.length > 0
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} 不允许声明隐式权限。`,
      );
    }

    const computedContentHash =
      await computePluginArchiveContentHash(archiveBuffer);
    const signatureValid = await verifyPluginArchiveSignature(
      archiveBuffer,
      signature,
      publicKeyPem,
    );

    if (
      computedContentHash !== contentHash ||
      contentHash !== buildReport.contentHash ||
      buildReport.signature !== signature ||
      buildReport.signingVerification.verified !== true ||
      !signatureValid
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} 签名或内容哈希验证失败。`,
      );
    }

    this.assertGeneratedPrivatePluginHardGates(params.toolId, buildReport);

    const wasmEntry = getNonEmptyString(manifest.wasmEntry);
    const wasmBuffer = wasmEntry
      ? await this.extractGeneratedPrivatePluginWasm(
          archiveBuffer,
          wasmEntry,
          pluginId,
        )
      : null;

    if (
      wasmEntry &&
      buildReport.wasmEntry &&
      buildReport.wasmEntry !== wasmEntry
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} build report wasmEntry 与 manifest 不一致。`,
      );
    }

    if (
      wasmBuffer &&
      typeof buildReport.wasmSizeBytes === 'number' &&
      buildReport.wasmSizeBytes !== wasmBuffer.length
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} WASM bundle 大小与 build report 不一致。`,
      );
    }

    if (
      wasmBuffer &&
      buildReport.wasmSha256 &&
      crypto.createHash('sha256').update(wasmBuffer).digest('hex') !==
        buildReport.wasmSha256
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} WASM bundle 哈希与 build report 不一致。`,
      );
    }

    const nodeDefinitions = await this.readJsonFile<
      Array<Record<string, unknown>>
    >(
      this.resolveSafeRelativePathInside(
        workspacePath,
        `plugins/${params.toolId}/node-definitions.json`,
      ),
    );

    if (
      !Array.isArray(nodeDefinitions) ||
      !nodeDefinitions.some(
        (definition) => getNonEmptyString(definition.type) === params.toolId,
      )
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} 节点定义未覆盖 ${params.toolId}。`,
      );
    }

    return {
      pluginId,
      manifest,
      nodeDefinitions,
      artifactPath,
      buildReportPath,
      storageKey: `generated-apps/${params.app.id}/plugins/${params.toolId}.alp`,
      archiveBuffer,
      wasmEntry: wasmEntry ?? null,
      wasmBuffer,
      signature,
      contentHash,
      buildReport,
    };
  }

  private async persistGeneratedPrivatePluginArtifacts(params: {
    archiveStorageKey: string;
    archiveBuffer: Buffer;
    wasmBundleUrl: string | undefined;
    wasmBuffer: Buffer | null;
  }): Promise<void> {
    if (!this.storageService) {
      throw new Error(
        'Generated App 私有插件自动激活需要 StorageService 才能持久化插件 artifact。',
      );
    }

    await this.storageService.upload(
      params.archiveStorageKey,
      params.archiveBuffer,
      params.archiveBuffer.length,
      'application/zip',
    );

    if (params.wasmBundleUrl && params.wasmBuffer) {
      await this.storageService.upload(
        params.wasmBundleUrl,
        params.wasmBuffer,
        params.wasmBuffer.length,
        'application/wasm',
      );
    }
  }

  private async extractGeneratedPrivatePluginWasm(
    archiveBuffer: Buffer,
    wasmEntry: string,
    pluginId: string,
  ): Promise<Buffer> {
    this.assertSafeGeneratedPrivatePluginWasmEntry(wasmEntry, pluginId);

    const archive = await JSZip.loadAsync(archiveBuffer);
    const wasmFile = archive.file(wasmEntry);

    if (!wasmFile) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} manifest 声明的 WASM 入口 ${wasmEntry} 不存在。`,
      );
    }

    const wasmBuffer = Buffer.from(await wasmFile.async('uint8array'));
    if (
      wasmBuffer.length < 8 ||
      wasmBuffer.subarray(0, 4).toString('hex') !== '0061736d'
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} WASM bundle 不是有效 WebAssembly 模块。`,
      );
    }

    return wasmBuffer;
  }

  private assertSafeGeneratedPrivatePluginWasmEntry(
    wasmEntry: string,
    pluginId: string,
  ): void {
    const parts = wasmEntry.split('/');
    if (
      wasmEntry.trim() !== wasmEntry ||
      !wasmEntry.endsWith('.wasm') ||
      wasmEntry.startsWith('/') ||
      /^[A-Za-z]:/.test(wasmEntry) ||
      wasmEntry.includes('\\') ||
      parts.some((part) => part.length === 0 || part === '.' || part === '..')
    ) {
      throw new Error(
        `Generated App 私有插件 ${pluginId} WASM 入口路径不安全。`,
      );
    }
  }

  private assertGeneratedPrivatePluginHardGates(
    toolId: string,
    buildReport: GeneratedAppPrivatePluginBuildReport,
  ): void {
    if (
      buildReport.toolId !== toolId ||
      buildReport.passed !== true ||
      buildReport.manifestValid !== true ||
      buildReport.nodeDefinitionsValid !== true ||
      buildReport.signingVerification.requiredBeforePrivateActivation !==
        true ||
      buildReport.signingVerification.status !==
        'self-verified-generated-signature' ||
      buildReport.signingVerification.contentHashMatches !== true ||
      buildReport.signingVerification.verified !== true ||
      buildReport.declaredPermissions.length > 0
    ) {
      throw new Error(
        `Generated App 私有插件 ${toolId} 未通过自动激活硬门槛。`,
      );
    }
  }

  private async readJsonFile<T>(path: string): Promise<T> {
    const content = await readFile(path, 'utf8');

    return JSON.parse(content) as T;
  }

  private async findGeneratedWorkflowRuntimeBinding(
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
            GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
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

  private async createGeneratedWorkflowRuntimeBinding(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
    generationRunId: string,
  ): Promise<string> {
    const nodes = buildGeneratedWorkflowRuntimeNodes(app);
    const edges = buildGeneratedWorkflowRuntimeEdges(app);
    const viewport = { x: 0, y: 0, zoom: 0.85 };
    const inputSchema = buildGeneratedWorkflowRuntimeInputSchema();
    const metadata = {
      source: GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
      generatedAppId: app.id,
      generationRunId,
      appSpecVersion: app.appSpec.version,
      bindingKind: GENERATED_APP_WORKFLOW_RUNTIME_BINDING_KIND,
      publishBoundary:
        'published-runtime: public submissions may create async Workflow executions after public share is explicitly enabled',
      publicRuntimeBoundary:
        'Generated App public runtime exposes only execution handoff ids/status and never exposes workflow graph internals',
      createdFromGate: 'gate-7',
      createdAt: new Date().toISOString(),
    };
    let slug = generateSlug(`${app.appName}-generated-runtime-workflow`);

    for (let attempt = 0; attempt <= 5; attempt += 1) {
      try {
        const [workflow] = await this.tenantDb
          .insert(schema.workflowDefinitions)
          .values({
            tenantId,
            name: `${app.appName} - 生成应用运行时`,
            slug,
            description:
              '由 Generated App Gate 7 自动生成并发布的运行时 Workflow，用于公开提交的异步执行入口；公开端只暴露安全 execution handoff。',
            icon: 'WandSparkles',
            nodes,
            edges,
            viewport,
            metadata,
            inputSchema,
            status: 'draft',
            createdBy: userId,
            updatedBy: userId,
          })
          .returning({ id: schema.workflowDefinitions.id });

        if (!workflow) {
          throw new Error(
            'Generated workflow runtime binding insert returned no row',
          );
        }

        await this.publishGeneratedWorkflowRuntimeBinding({
          tenantId,
          userId,
          workflowDefinitionId: workflow.id,
          nodes,
          edges,
          viewport,
          inputSchema,
        });

        return workflow.id;
      } catch (error: unknown) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === 5) {
          throw error;
        }

        const existingWorkflow = await this.findGeneratedWorkflowRuntimeBinding(
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

  private async publishGeneratedWorkflowRuntimeBinding(params: {
    tenantId: string;
    userId: string;
    workflowDefinitionId: string;
    nodes: schema.ReactFlowNode[];
    edges: schema.ReactFlowEdge[];
    viewport: schema.ReactFlowViewport;
    inputSchema: WorkflowInputSchema | null;
  }): Promise<string> {
    const snapshot: schema.WorkflowVersionSnapshot = {
      nodes: params.nodes,
      edges: params.edges,
      viewport: params.viewport,
      inputSchema: params.inputSchema,
      metadata: {
        nodeCount: params.nodes.length,
        edgeCount: params.edges.length,
        createdFromVersion: 1,
        releaseNotes: 'Generated App Gate 7 runtime workflow initial publish.',
        releaseNumber: 1,
      },
    };
    const publishedAt = new Date();
    const [version] = await this.tenantDb
      .insert(schema.workflowVersions)
      .values({
        workflowDefinitionId: params.workflowDefinitionId,
        tenantId: params.tenantId,
        versionNumber: 1,
        label: 'Generated App runtime v1',
        snapshot,
        publishedAt,
        archivedAt: null,
        createdBy: params.userId,
      })
      .returning({ id: schema.workflowVersions.id });

    if (!version) {
      throw new Error(
        'Generated workflow runtime version insert returned no row',
      );
    }

    const [workflow] = await this.tenantDb
      .update(schema.workflowDefinitions)
      .set({
        status: 'published',
        publishedVersionId: version.id,
        updatedBy: params.userId,
        updatedAt: publishedAt,
      })
      .where(
        and(
          eq(schema.workflowDefinitions.id, params.workflowDefinitionId),
          eq(schema.workflowDefinitions.tenantId, params.tenantId),
        ),
      )
      .returning({ id: schema.workflowDefinitions.id });

    if (!workflow) {
      throw new Error('Generated workflow runtime publish update failed');
    }

    return version.id;
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

  private buildGateResultsUpdatePayload(
    userId: string,
    gateResults: GeneratedAppGateResult[],
    options: {
      generationPlan?: GeneratedApp['generationPlan'];
      currentGenerationPlan?: GeneratedApp['generationPlan'];
      preview?: GeneratedAppPreview;
    } = {},
  ): Partial<schema.NewGeneratedApp> {
    const guardedGateResults = applyPublishCandidateEvidenceGuard(
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
      result: this.sanitizePublicSubmissionResultReport(submission.result),
      report: this.sanitizePublicSubmissionResultReport(submission.report),
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
      repairPlan: this.getRepairPlanOrNull(attempt.repairPlan),
      reverificationPlan: this.getReverificationPlanOrNull(
        attempt.reverificationPlan,
      ),
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdBy: attempt.createdBy,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
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
