/**
 * 工作流导入来源解析器：仅通过调用方传入的事务 client 读取源 Agent、模型及目标模型。
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DomainException } from '../../common/exceptions/domain.exception';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { AgentRuntimeMode } from '../../database/schema/agent-definitions.schema';

export type WorkflowImportDbClient = Pick<
  DrizzleDB,
  'execute' | 'insert' | 'select' | 'update'
>;

export interface ImportedWorkflowAgentSourceRecord {
  agentDefinitionId: string;
  sourceTenantId: string;
  sourceVersionId: string;
  name: string;
  description: string | null;
  icon: string | null;
  runtimeMode: AgentRuntimeMode;
  sandboxConfig: schema.SandboxConfig | null;
  workspaceSnapshotId: string | null;
  snapshot: schema.AgentVersionSnapshot;
}

export interface ImportedWorkflowModelRecord {
  config: schema.LlmModelConfig;
  provider: schema.LlmProvider;
}

export interface WorkflowImportSourceContext {
  sourceModels: Map<string, ImportedWorkflowModelRecord | null>;
  targetModels: ImportedWorkflowModelRecord[] | null;
}

@Injectable()
export class WorkflowImportSourceResolverService {
  async loadAgentSource(params: {
    sourceTenantId: string;
    sourceAgentDefinitionId: string;
    sourceAgentVersionId?: string;
    dbClient: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowAgentSourceRecord> {
    const [definition] = await params.dbClient
      .select({
        id: schema.agentDefinitions.id,
        tenantId: schema.agentDefinitions.tenantId,
        name: schema.agentDefinitions.name,
        description: schema.agentDefinitions.description,
        icon: schema.agentDefinitions.icon,
        runtimeMode: schema.agentDefinitions.runtimeMode,
        sandboxConfig: schema.agentDefinitions.sandboxConfig,
        workspaceSnapshotId: schema.agentDefinitions.workspaceSnapshotId,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.id, params.sourceAgentDefinitionId),
          eq(schema.agentDefinitions.tenantId, params.sourceTenantId),
        ),
      );

    if (!definition) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-agent-not-found',
        title: '工作流依赖 Agent 不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到依赖 Agent ${params.sourceAgentDefinitionId}`,
      });
    }

    const versionId =
      params.sourceAgentVersionId ?? definition.publishedVersionId ?? undefined;
    if (!versionId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-agent-not-published',
        title: '工作流依赖 Agent 尚未发布',
        status: HttpStatus.CONFLICT,
        detail: `依赖 Agent「${definition.name}」没有可执行的发布版本`,
      });
    }

    const [version] = await params.dbClient
      .select({
        id: schema.agentVersions.id,
        snapshot: schema.agentVersions.snapshot,
      })
      .from(schema.agentVersions)
      .where(
        and(
          eq(schema.agentVersions.id, versionId),
          eq(schema.agentVersions.agentDefinitionId, definition.id),
          eq(schema.agentVersions.tenantId, params.sourceTenantId),
        ),
      );

    if (!version) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-agent-version-not-found',
        title: '工作流依赖 Agent 版本不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `依赖 Agent「${definition.name}」的版本 ${versionId} 不存在`,
      });
    }

    return {
      agentDefinitionId: definition.id,
      sourceTenantId: definition.tenantId,
      sourceVersionId: version.id,
      name: definition.name,
      description: definition.description ?? null,
      icon: definition.icon ?? null,
      runtimeMode: definition.runtimeMode,
      sandboxConfig: definition.sandboxConfig ?? null,
      workspaceSnapshotId: definition.workspaceSnapshotId ?? null,
      snapshot: version.snapshot,
    };
  }

  async loadSourceModel(params: {
    sourceTenantId: string;
    sourceModelBindingId: string;
    context: WorkflowImportSourceContext;
    dbClient: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowModelRecord> {
    const cached = params.context.sourceModels.get(params.sourceModelBindingId);
    if (cached) {
      return cached;
    }

    const [row] = await params.dbClient
      .select({
        config: schema.llmModelConfigs,
        provider: schema.llmProviders,
      })
      .from(schema.llmModelConfigs)
      .innerJoin(
        schema.llmProviders,
        eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
      )
      .where(
        and(
          eq(schema.llmModelConfigs.id, params.sourceModelBindingId),
          eq(schema.llmModelConfigs.tenantId, params.sourceTenantId),
        ),
      );

    if (!row) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-source-model-not-found',
        title: '依赖模型配置不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到源租户模型配置 ${params.sourceModelBindingId}`,
      });
    }

    params.context.sourceModels.set(params.sourceModelBindingId, row);
    return row;
  }

  async resolveTargetModel(params: {
    sourceModel: ImportedWorkflowModelRecord;
    runtimeNodeData: Record<string, unknown>;
    targetTenantId: string;
    context: WorkflowImportSourceContext;
    dbClient: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowModelRecord | null> {
    if (params.context.targetModels === null) {
      params.context.targetModels = await params.dbClient
        .select({
          config: schema.llmModelConfigs,
          provider: schema.llmProviders,
        })
        .from(schema.llmModelConfigs)
        .innerJoin(
          schema.llmProviders,
          eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
        )
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, params.targetTenantId),
            eq(schema.llmModelConfigs.isEnabled, true),
          ),
        );
    }

    const sourceBaseUrl = this.normalizeOptionalText(
      params.sourceModel.provider.baseUrl ??
        params.sourceModel.provider.defaultBaseUrl ??
        this.readFirstString(
          params.runtimeNodeData.endpointUrl,
          params.runtimeNodeData.endpoint_url,
        ),
    );
    const exactMatches = params.context.targetModels.filter((candidate) => {
      if (
        candidate.provider.slug !== params.sourceModel.provider.slug ||
        candidate.config.modelId !== params.sourceModel.config.modelId ||
        candidate.config.modelType !== params.sourceModel.config.modelType
      ) {
        return false;
      }

      const candidateBaseUrl = this.normalizeOptionalText(
        candidate.provider.baseUrl ??
          candidate.provider.defaultBaseUrl ??
          undefined,
      );
      return candidateBaseUrl === sourceBaseUrl;
    });

    if (exactMatches.length > 0) {
      return this.pickTargetModel(
        exactMatches,
        params.sourceModel.config.name,
      );
    }

    const looseMatches = params.context.targetModels.filter(
      (candidate) =>
        candidate.provider.slug === params.sourceModel.provider.slug &&
        candidate.config.modelId === params.sourceModel.config.modelId &&
        candidate.config.modelType === params.sourceModel.config.modelType,
    );

    if (looseMatches.length > 0) {
      return this.pickTargetModel(
        looseMatches,
        params.sourceModel.config.name,
      );
    }

    return null;
  }

  private pickTargetModel(
    candidates: ImportedWorkflowModelRecord[],
    sourceModelName: string,
  ): ImportedWorkflowModelRecord {
    const byName = candidates.find(
      (candidate) => candidate.config.name === sourceModelName,
    );
    if (byName) {
      return byName;
    }

    const byDefault = candidates.find(
      (candidate) => candidate.config.isDefault,
    );
    return byDefault ?? candidates[0];
  }

  private readFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private normalizeOptionalText(value?: string): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }
}
