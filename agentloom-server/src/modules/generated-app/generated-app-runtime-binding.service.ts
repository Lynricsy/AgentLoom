// 本文件负责 Workflow runtime 发布绑定与租户私有生成插件注册激活。

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
  GENERATED_APP_WORKFLOW_HANDOFF_METADATA_SOURCE,
  GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
  GENERATED_APP_WORKFLOW_RUNTIME_BINDING_KIND,
} from './generated-app.internal';

import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppArtifactService } from './generated-app-artifact.service';

@Injectable()
export class GeneratedAppRuntimeBindingService {
  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly artifactService: GeneratedAppArtifactService,
    @Optional() private readonly pluginService?: PluginService,
  ) {}

  async getRuntimeBindingReadiness(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppRuntimeBindingReadinessResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);

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

    const [workflow] = await this.repository.tenantDb
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

  public buildRuntimeBindingReadinessResponse(
    response: GeneratedAppRuntimeBindingReadinessResponseDto,
  ): GeneratedAppRuntimeBindingReadinessResponseDto {
    return response;
  }

  public async ensureGeneratedWorkflowRuntimeBinding(
    tenantId: string,
    userId: string,
    app: GeneratedAppResponseDto,
    generationRunId: string,
  ): Promise<GeneratedAppResponseDto> {
    if (app.workflowDefinitionId) {
      const [boundWorkflow] = await this.repository.tenantDb
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

    const [updated] = await this.repository.tenantDb
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

    return this.repository.toResponseDto(updated);
  }

  public async ensureGeneratedPrivatePluginBindings(
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

      const pluginBundle =
        await this.artifactService.loadAndVerifyGeneratedPrivatePlugin({
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
        await this.artifactService.persistGeneratedPrivatePluginArtifacts({
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
        await this.artifactService.persistGeneratedPrivatePluginArtifacts({
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

    const [updated] = await this.repository.tenantDb
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

    return this.repository.toResponseDto(updated);
  }

  public mustRefreshGeneratedPrivatePluginRegistration(
    app: { id: string; appSpec: { version: number } },
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

  public async findGeneratedWorkflowRuntimeBinding(
    tenantId: string,
    appId: string,
  ): Promise<{ id: string } | null> {
    const [workflow] = await this.repository.tenantDb
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

  public async createGeneratedWorkflowRuntimeBinding(
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
        const [workflow] = await this.repository.tenantDb
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

  public async publishGeneratedWorkflowRuntimeBinding(params: {
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
    const [version] = await this.repository.tenantDb
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

    const [workflow] = await this.repository.tenantDb
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

  public isGeneratedAppEditorHandoffWorkflowMetadata(
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
  mustRefreshPrivatePluginRegistration(
    app: { id: string; appSpec: { version: number } },
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
    return this.mustRefreshGeneratedPrivatePluginRegistration(
      app,
      toolId,
      pluginRecord,
      pluginBundle,
      wasmBundleUrl,
    );
  }
}
