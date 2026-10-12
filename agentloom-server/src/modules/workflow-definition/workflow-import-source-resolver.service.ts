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
  /**
   * 读取源租户（作者）的 Agent。`sourceDb` 必须是不受目标租户 RLS 约束的根连接：
   * 导入事务以目标租户身份运行，在事务里读源租户的行永远为空。查询条件显式限定了源租户。
   */
  async loadAgentSource(params: {
    sourceTenantId: string;
    sourceAgentDefinitionId: string;
    sourceAgentVersionId?: string;
    sourceDb: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowAgentSourceRecord> {
    const [definition] = await params.sourceDb
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

    const [version] = await params.sourceDb
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

  /**
   * 读取源租户的模型配置；`sourceDb` 的要求同 loadAgentSource。
   * 作者删掉了这条配置时返回 null：目标租户本来就只用它找同款模型，调用方改用备用模型。
   */
  async loadSourceModel(params: {
    sourceTenantId: string;
    sourceModelBindingId: string;
    context: WorkflowImportSourceContext;
    sourceDb: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowModelRecord | null> {
    const cached = params.context.sourceModels.get(params.sourceModelBindingId);
    if (cached) {
      return cached;
    }

    const [row] = await params.sourceDb
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
      return null;
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
    const targetModels = await this.loadTargetModels(params);

    const sourceBaseUrl = this.normalizeOptionalText(
      params.sourceModel.provider.baseUrl ??
        params.sourceModel.provider.defaultBaseUrl ??
        this.readFirstString(
          params.runtimeNodeData.endpointUrl,
          params.runtimeNodeData.endpoint_url,
        ),
    );
    const exactMatches = targetModels.filter((candidate) => {
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
      return this.pickTargetModel(exactMatches, params.sourceModel.config.name);
    }

    const looseMatches = targetModels.filter(
      (candidate) =>
        candidate.provider.slug === params.sourceModel.provider.slug &&
        candidate.config.modelId === params.sourceModel.config.modelId &&
        candidate.config.modelType === params.sourceModel.config.modelType,
    );

    if (looseMatches.length > 0) {
      return this.pickTargetModel(looseMatches, params.sourceModel.config.name);
    }

    return null;
  }

  /**
   * 选出替代模型：模板里的 Agent 没有来源模型，Marketplace/分享导入时来源模型在目标租户里
   * 也可能不存在，这两种情况都落到这里。
   *
   * 调用方显式指定了模型时只认这一个，不可用就报错——静默换成别的模型会让用户以为用的是自己选的；
   * 未指定时依次取租户默认对话模型、最早添加的可用对话模型。没有任何可用对话模型返回 null。
   */
  async resolveFallbackModel(params: {
    preferredModelConfigId?: string;
    targetTenantId: string;
    context: WorkflowImportSourceContext;
    dbClient: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowModelRecord | null> {
    const chatModels = (await this.loadTargetModels(params))
      .filter(
        (candidate) =>
          candidate.config.modelType === 'chat' && candidate.provider.isEnabled,
      )
      .sort(
        (left, right) =>
          left.config.createdAt.getTime() - right.config.createdAt.getTime(),
      );

    if (params.preferredModelConfigId) {
      const preferred = chatModels.find(
        (candidate) => candidate.config.id === params.preferredModelConfigId,
      );
      if (!preferred) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-import-model-unavailable',
          title: '所选模型不可用',
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          detail: `模型配置 ${params.preferredModelConfigId} 不存在、已停用或不是对话模型`,
        });
      }
      return preferred;
    }

    return (
      chatModels.find((candidate) => candidate.config.isDefault) ??
      chatModels[0] ??
      null
    );
  }

  private async loadTargetModels(params: {
    targetTenantId: string;
    context: WorkflowImportSourceContext;
    dbClient: WorkflowImportDbClient;
  }): Promise<ImportedWorkflowModelRecord[]> {
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
    return params.context.targetModels;
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
