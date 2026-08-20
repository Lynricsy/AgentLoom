// 本文件负责 workspace artifact 与 plugin artifact 的受控读取、校验和持久化。

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

import {
  GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
  GENERATED_APP_BUILD_OUTPUT_ARTIFACT_ID,
  GENERATED_APP_PUBLIC_PREVIEW_PATH_PREFIX,
  GeneratedAppArtifactDefinition,
  GENERATED_APP_WORKSPACE_SOURCE_ARTIFACTS,
  GENERATED_APP_WORKSPACE_ARTIFACT_PATH_FIELDS,
  GENERATED_APP_DERIVED_GATE_3_ARTIFACTS,
  GENERATED_APP_PLUGIN_ARTIFACT_DEFINITIONS,
} from './generated-app.internal';

import { GeneratedAppRepository } from './generated-app.repository';

@Injectable()
export class GeneratedAppArtifactService {
  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly configService: ConfigService,
    @Optional() private readonly storageService?: StorageService,
  ) {}



  public resolveWorkspaceRoot(): string {
    const configuredRoot =
      this.configService.get<string>('GENERATED_APP_WORKSPACE_ROOT') ??
      this.configService.get<string>('APP_GENERATED_APP_WORKSPACE_ROOT');

    return resolve(
      configuredRoot && configuredRoot.trim().length > 0
        ? configuredRoot
        : join(tmpdir(), 'agentloom-generated-app-workspaces'),
    );
  }


  public resolveArtifactWorkspaceContext(app: GeneratedApp): {
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


  public resolveArtifactBuildUnitPlan(
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


  public buildArtifactDefinitions(
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


  public extractPluginToolIdsFromWorkspace(
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


  public async toArtifactSummaryDto(
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


  public resolveArtifactFilePath(
    workspacePath: string,
    relativePath: string,
  ): string {
    return this.resolveSafeRelativePathInside(workspacePath, relativePath);
  }


  public async resolveArtifactContentForApp(
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


  public async hasReadableArtifactForApp(
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


  public buildPublicBuildPreviewUrl(token: string): string {
    return `${GENERATED_APP_PUBLIC_PREVIEW_PATH_PREFIX}/${encodeURIComponent(
      token,
    )}/preview`;
  }


  public async resolvePublicRuntimePreviewUrl(
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


  public resolveSafeRelativePathInside(root: string, relativePath: string) {
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


  async getArtifactManifest(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppArtifactManifestResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
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
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);

    return this.resolveArtifactContentForApp(app, artifactId);
  }


  public async loadAndVerifyGeneratedPrivatePlugin(params: {
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


  public async persistGeneratedPrivatePluginArtifacts(params: {
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


  public async extractGeneratedPrivatePluginWasm(
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


  public assertSafeGeneratedPrivatePluginWasmEntry(
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


  public assertGeneratedPrivatePluginHardGates(
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


  public async readJsonFile<T>(path: string): Promise<T> {
    const content = await readFile(path, 'utf8');

    return JSON.parse(content) as T;
  }
}
