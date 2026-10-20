// 生成应用运行时绑定（ADR-0007 §3）：解析公开提交实际执行的工作流与固定版本、
// 为 Agent 绑定构建并发布包装工作流、提供运行时绑定就绪度。

import { Injectable, Optional } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { GeneratedApp } from '../../database/schema';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import { workflowInputSchemaSchema } from '../workflow/dto/workflow-input-schema.dto';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import type { GeneratedAppRuntimeBindingReadinessResponseDto } from './dto';
import {
  GeneratedAppBindingTargetNotFoundException,
  GeneratedAppNotFoundException,
} from './generated-app.exceptions';
import { GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE } from './generated-app.internal';
import { isRecord } from './generated-app.plan-validation.util';
import { GeneratedAppRepository } from './generated-app.repository';
import {
  buildAgentWrapperWorkflowGraph,
  extractGeneratedAppRuntimeResult,
  isAgentWrapperSnapshotCurrent,
  mapGeneratedAppSubmission,
  type GeneratedAppAgentWrapperGraph,
} from './generated-app.runtime-binding.util';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type { GeneratedAppRuntimeBindingAdapter } from './types/generation-v2.ports';
import { isAppSpecV2 } from './types/generated-app.types';

/** Agent 包装工作流 metadata.bindingKind；工作流绑定不创建任何工作流 */
export const GENERATED_APP_AGENT_WRAPPER_BINDING_KIND = 'agent-wrapper';
/** 查找与当前 AppSpec 一致的包装工作流版本时最多回看的版本数 */
const AGENT_WRAPPER_VERSION_LOOKBACK = 20;

/** 公开提交可以执行的运行时目标 */
export interface GeneratedAppRuntimeTarget {
  available: true;
  workflowDefinitionId: string;
  /** 固定版本：工作流绑定取 AppSpec，Agent 绑定取与 AppSpec 指纹一致的包装工作流版本 */
  workflowVersionId: string;
  inputSchemaVersion: number | undefined;
  workflowStatus: string;
  publishedVersionId: string | null;
  /** 工作流当前发布版本已不是固定版本（提示，不阻断） */
  drifted: boolean;
}

export interface GeneratedAppRuntimeUnavailable {
  available: false;
  state: 'runtime_not_bound' | 'workflow_not_found' | 'workflow_not_published';
  workflowDefinitionId: string | null;
  workflowStatus: string | null;
  publishedVersionId: string | null;
  summary: string;
}

@Injectable()
export class GeneratedAppRuntimeBindingService implements GeneratedAppRuntimeBindingAdapter {
  constructor(
    private readonly repository: GeneratedAppRepository,
    @Optional()
    private readonly workflowVersionService?: WorkflowVersionService,
  ) {}

  async getRuntimeBindingReadiness(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppRuntimeBindingReadinessResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);

    if (!app.appSpec || !isAppSpecV2(app.appSpec)) {
      return {
        state: 'runtime_not_bound',
        workflowDefinitionId: null,
        workflowStatus: null,
        publishedVersionId: null,
        pinnedVersionId: null,
        canStartWorkflowExecution: false,
        summary: '应用还没有可执行的 AppSpec。',
        notice: '生成运行通过 Gate 0 后，公开页才会调用绑定的工作流或 Agent。',
        updatedAt: app.updatedAt,
      };
    }

    const target = await this.resolveRuntimeTarget(
      this.repository.tenantDb,
      app,
      app.appSpec,
    );

    if (!target.available) {
      return {
        state: target.state,
        workflowDefinitionId: target.workflowDefinitionId,
        workflowStatus: target.workflowStatus,
        publishedVersionId: target.publishedVersionId,
        pinnedVersionId: null,
        canStartWorkflowExecution: false,
        summary: target.summary,
        notice: '公开提交会失败，不会启动执行；重新运行生成后恢复。',
        updatedAt: app.updatedAt,
      };
    }

    return {
      state: target.drifted ? 'workflow_version_drift' : 'workflow_published',
      workflowDefinitionId: target.workflowDefinitionId,
      workflowStatus: target.workflowStatus,
      publishedVersionId: target.publishedVersionId,
      pinnedVersionId: target.workflowVersionId,
      canStartWorkflowExecution: true,
      summary: target.drifted
        ? '绑定的工作流已发布新版本，应用仍执行生成时固定的版本。'
        : '公开提交会执行绑定工作流的固定版本。',
      notice: target.drifted
        ? '要采用新版本，请重新运行生成；重新生成会再次校验输入输出映射。'
        : '公开提交创建异步执行，结束后按结果视图展示答案。',
      updatedAt: app.updatedAt,
    };
  }

  /**
   * 解析公开提交要执行的工作流与固定版本。只读，不修复：不可用时返回原因，
   * 由调用方决定是拒绝提交还是展示就绪度。
   */
  async resolveRuntimeTarget(
    db: DrizzleDB,
    app: Pick<GeneratedApp, 'id' | 'tenantId' | 'workflowDefinitionId'>,
    appSpec: GeneratedAppSpecV2,
  ): Promise<GeneratedAppRuntimeTarget | GeneratedAppRuntimeUnavailable> {
    const binding = appSpec.binding;
    const workflowDefinitionId =
      binding.kind === 'workflow'
        ? binding.workflowDefinitionId
        : app.workflowDefinitionId;

    if (!workflowDefinitionId) {
      return {
        available: false,
        state: 'runtime_not_bound',
        workflowDefinitionId: null,
        workflowStatus: null,
        publishedVersionId: null,
        summary: 'Agent 绑定的包装工作流尚未创建。',
      };
    }

    const [workflow] = await db
      .select({
        id: schema.workflowDefinitions.id,
        status: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        metadata: schema.workflowDefinitions.metadata,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowDefinitionId),
          eq(schema.workflowDefinitions.tenantId, app.tenantId),
        ),
      )
      .limit(1);

    if (!workflow || workflow.status === 'archived') {
      return {
        available: false,
        state: 'workflow_not_found',
        workflowDefinitionId,
        workflowStatus: workflow?.status ?? null,
        publishedVersionId: workflow?.publishedVersionId ?? null,
        summary: '绑定的工作流不存在或已归档。',
      };
    }

    if (
      binding.kind === 'agent' &&
      !this.isAgentWrapperOfApp(workflow.metadata, app.id)
    ) {
      return {
        available: false,
        state: 'runtime_not_bound',
        workflowDefinitionId,
        workflowStatus: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
        summary: 'Agent 绑定的包装工作流尚未创建。',
      };
    }

    if (workflow.status !== 'published' || !workflow.publishedVersionId) {
      return {
        available: false,
        state: 'workflow_not_published',
        workflowDefinitionId,
        workflowStatus: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
        summary: '绑定的工作流当前未发布。',
      };
    }

    const versions = await db
      .select({
        id: schema.workflowVersions.id,
        snapshot: schema.workflowVersions.snapshot,
      })
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.workflowDefinitionId, workflow.id),
          eq(schema.workflowVersions.tenantId, app.tenantId),
          binding.kind === 'workflow'
            ? eq(schema.workflowVersions.id, binding.workflowVersionId)
            : sql`true`,
        ),
      )
      .orderBy(desc(schema.workflowVersions.versionNumber))
      .limit(binding.kind === 'workflow' ? 1 : AGENT_WRAPPER_VERSION_LOOKBACK);
    const pinnedVersion =
      binding.kind === 'workflow'
        ? versions[0]
        : versions.find((version) =>
            isAgentWrapperSnapshotCurrent(appSpec, version.snapshot.nodes),
          );

    if (!pinnedVersion) {
      return {
        available: false,
        state:
          binding.kind === 'workflow'
            ? 'workflow_not_found'
            : 'runtime_not_bound',
        workflowDefinitionId,
        workflowStatus: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
        summary:
          binding.kind === 'workflow'
            ? '生成时固定的工作流版本已不存在。'
            : '包装工作流没有与当前 AppSpec 一致的版本，需要重新运行生成。',
      };
    }

    return {
      available: true,
      workflowDefinitionId: workflow.id,
      workflowVersionId: pinnedVersion.id,
      inputSchemaVersion: pinnedVersion.snapshot.inputSchema
        ? workflowInputSchemaSchema.parse(pinnedVersion.snapshot.inputSchema)
            .version
        : undefined,
      workflowStatus: workflow.status,
      publishedVersionId: workflow.publishedVersionId,
      drifted: workflow.publishedVersionId !== pinnedVersion.id,
    };
  }

  /**
   * 工作流绑定：直接使用被绑定工作流与 AppSpec 中的固定版本，不创建任何工作流。
   * Agent 绑定：创建（或复用）本应用的包装工作流，图与当前 AppSpec 一致的已发布版本存在时
   * 原样返回，否则更新画布并经发布校验链发布新版本。同一 AppSpec 重复调用结果相同。
   * 两种绑定都把运行时工作流写入 generated_apps.workflow_definition_id。
   */
  async ensureRuntimeWorkflow(params: {
    tenantId: string;
    userId: string;
    appId: string;
    appSpec: GeneratedAppSpecV2;
    generationRunId: string;
  }): Promise<{ workflowDefinitionId: string; workflowVersionId: string }> {
    return runInTenantTransaction(
      this.repository.globalDb,
      params.tenantId,
      async (db) => {
        const binding = params.appSpec.binding;
        const runtime =
          binding.kind === 'workflow'
            ? await this.assertBoundWorkflowVersion(db, params.tenantId, {
                workflowDefinitionId: binding.workflowDefinitionId,
                workflowVersionId: binding.workflowVersionId,
              })
            : await this.ensureAgentWrapperWorkflow(db, params);

        const [updated] = await db
          .update(schema.generatedApps)
          .set({
            workflowDefinitionId: runtime.workflowDefinitionId,
            agentDefinitionId:
              binding.kind === 'agent' ? binding.agentDefinitionId : null,
            updatedBy: params.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.generatedApps.id, params.appId),
              eq(schema.generatedApps.tenantId, params.tenantId),
            ),
          )
          .returning({ id: schema.generatedApps.id });

        if (!updated) {
          throw new GeneratedAppNotFoundException(params.appId);
        }

        return runtime;
      },
    );
  }

  mapSubmission: GeneratedAppRuntimeBindingAdapter['mapSubmission'] =
    mapGeneratedAppSubmission;

  extractResult: GeneratedAppRuntimeBindingAdapter['extractResult'] =
    extractGeneratedAppRuntimeResult;

  buildAgentWrapperWorkflowGraph = buildAgentWrapperWorkflowGraph;

  /** 该应用自动创建且尚未归档的运行时工作流（删除应用时一并归档） */
  public async listActiveGeneratedWorkflowRuntimeIds(
    tenantId: string,
    appId: string,
  ): Promise<string[]> {
    const workflows = await this.repository.tenantDb
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.tenantId, tenantId),
          ne(schema.workflowDefinitions.status, 'archived'),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'source'`,
            GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
          ),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'generatedAppId'`,
            appId,
          ),
        ),
      );

    return workflows.map((workflow) => workflow.id);
  }

  private async assertBoundWorkflowVersion(
    db: DrizzleDB,
    tenantId: string,
    target: { workflowDefinitionId: string; workflowVersionId: string },
  ): Promise<{ workflowDefinitionId: string; workflowVersionId: string }> {
    const [version] = await db
      .select({ id: schema.workflowVersions.id })
      .from(schema.workflowVersions)
      .innerJoin(
        schema.workflowDefinitions,
        eq(
          schema.workflowDefinitions.id,
          schema.workflowVersions.workflowDefinitionId,
        ),
      )
      .where(
        and(
          eq(schema.workflowVersions.id, target.workflowVersionId),
          eq(
            schema.workflowVersions.workflowDefinitionId,
            target.workflowDefinitionId,
          ),
          eq(schema.workflowVersions.tenantId, tenantId),
          ne(schema.workflowDefinitions.status, 'archived'),
        ),
      )
      .limit(1);

    if (!version) {
      throw new GeneratedAppBindingTargetNotFoundException(
        'workflow',
        target.workflowDefinitionId,
      );
    }

    return target;
  }

  private async ensureAgentWrapperWorkflow(
    db: DrizzleDB,
    params: {
      tenantId: string;
      userId: string;
      appId: string;
      appSpec: GeneratedAppSpecV2;
      generationRunId: string;
    },
  ): Promise<{ workflowDefinitionId: string; workflowVersionId: string }> {
    const binding = params.appSpec.binding;
    if (binding.kind !== 'agent') {
      throw new Error('只有 Agent 绑定需要包装工作流');
    }

    const graph = buildAgentWrapperWorkflowGraph(params.appSpec, {
      appId: params.appId,
    });
    const metadata = {
      source: GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
      bindingKind: GENERATED_APP_AGENT_WRAPPER_BINDING_KIND,
      generatedAppId: params.appId,
      generationRunId: params.generationRunId,
      agentDefinitionId: binding.agentDefinitionId,
      agentVersionId: binding.agentVersionId,
    };
    const [existing] = await db
      .select({
        id: schema.workflowDefinitions.id,
        status: schema.workflowDefinitions.status,
        inputSchema: schema.workflowDefinitions.inputSchema,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.tenantId, params.tenantId),
          ne(schema.workflowDefinitions.status, 'archived'),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'source'`,
            GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE,
          ),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'generatedAppId'`,
            params.appId,
          ),
          eq(
            sql`${schema.workflowDefinitions.metadata}->>'bindingKind'`,
            GENERATED_APP_AGENT_WRAPPER_BINDING_KIND,
          ),
        ),
      )
      .orderBy(asc(schema.workflowDefinitions.createdAt))
      .limit(1);

    if (existing?.status === 'published' && existing.publishedVersionId) {
      const [publishedVersion] = await db
        .select({ snapshot: schema.workflowVersions.snapshot })
        .from(schema.workflowVersions)
        .where(eq(schema.workflowVersions.id, existing.publishedVersionId))
        .limit(1);

      if (
        publishedVersion &&
        isAgentWrapperSnapshotCurrent(
          params.appSpec,
          publishedVersion.snapshot.nodes,
        )
      ) {
        return {
          workflowDefinitionId: existing.id,
          workflowVersionId: existing.publishedVersionId,
        };
      }
    }

    let workflowDefinitionId: string;
    if (existing) {
      // 输入契约修订号沿用已存值并在内容变化时加 1，与工作流 PATCH 的规则一致
      const currentInputSchema = existing.inputSchema
        ? workflowInputSchemaSchema.parse(existing.inputSchema)
        : null;
      const inputSchemaChanged =
        JSON.stringify(currentInputSchema?.fields ?? null) !==
        JSON.stringify(graph.inputSchema.fields);
      await db
        .update(schema.workflowDefinitions)
        .set({
          nodes: graph.nodes,
          edges: graph.edges,
          inputSchema: {
            ...graph.inputSchema,
            version: currentInputSchema
              ? currentInputSchema.version + (inputSchemaChanged ? 1 : 0)
              : 1,
          },
          metadata,
          updatedBy: params.userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.workflowDefinitions.id, existing.id));
      workflowDefinitionId = existing.id;
    } else {
      workflowDefinitionId = await this.insertAgentWrapperWorkflow(db, {
        tenantId: params.tenantId,
        userId: params.userId,
        appName: params.appSpec.appName,
        graph,
        metadata,
      });
    }

    if (!this.workflowVersionService) {
      throw new Error(
        '发布 Agent 包装工作流需要 WorkflowVersionService，当前模块未提供',
      );
    }
    const published = await this.workflowVersionService.publish(
      workflowDefinitionId,
      {
        label: `生成应用运行时 ${params.generationRunId.slice(0, 8)}`,
        releaseNotes: '生成应用按 AppSpec 自动发布的 Agent 包装工作流。',
      },
      params.userId,
    );

    return { workflowDefinitionId, workflowVersionId: published.data.id };
  }

  private async insertAgentWrapperWorkflow(
    db: DrizzleDB,
    params: {
      tenantId: string;
      userId: string;
      appName: string;
      graph: GeneratedAppAgentWrapperGraph;
      metadata: Record<string, unknown>;
    },
  ): Promise<string> {
    let slug = generateSlug(`${params.appName}-generated-runtime`);

    for (let attempt = 0; ; attempt += 1) {
      try {
        // slug 冲突会让租户事务 aborted：insert 放进 savepoint，冲突只回滚到 savepoint
        const [workflow] = await db.transaction((tx) =>
          tx
            .insert(schema.workflowDefinitions)
            .values({
              tenantId: params.tenantId,
              name: `${params.appName} - 生成应用运行时`,
              slug,
              description:
                '生成应用自动创建的 Agent 包装工作流：表单值作为用户消息调用绑定的 Agent，回复作为结果。',
              icon: 'WandSparkles',
              nodes: params.graph.nodes,
              edges: params.graph.edges,
              viewport: { x: 0, y: 0, zoom: 0.85 },
              metadata: params.metadata,
              inputSchema: params.graph.inputSchema,
              status: 'draft',
              createdBy: params.userId,
              updatedBy: params.userId,
            })
            .returning({ id: schema.workflowDefinitions.id }),
        );

        if (!workflow) {
          throw new Error('Agent 包装工作流写入没有返回记录');
        }

        return workflow.id;
      } catch (error: unknown) {
        if (!hasPostgresErrorCode(error, '23505') || attempt === 5) {
          throw error;
        }
        slug = appendSlugSuffix(slug);
      }
    }
  }

  private isAgentWrapperOfApp(metadata: unknown, appId: string): boolean {
    return (
      isRecord(metadata) &&
      metadata.source === GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE &&
      metadata.generatedAppId === appId &&
      metadata.bindingKind === GENERATED_APP_AGENT_WRAPPER_BINDING_KIND
    );
  }
}
