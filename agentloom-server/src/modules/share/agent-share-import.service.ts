import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { DomainException } from '../../common/exceptions/domain.exception';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { AgentRuntimeMode } from '../../database/schema/agent-definitions.schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DocumentService } from '../knowledge/document.service';
import type {
  KnowledgeQueryOrchestrationStrategy,
  KnowledgeRerankerStrategy,
} from '../knowledge/knowledge-base-config';
import { SkillService } from '../skill/skill.service';
import { SkillStorageService } from '../skill/skill-storage.service';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import { migrateAgentCanvasGraph } from '../agent-definition/agent-input-node-migration.util';
import { cloneDefinitionWithNewIds } from '../workflow-definition/utils/clone-template.utils';
import {
  ResourceSourceService,
  type ImportedResourceSourceRecordInput,
} from '../resource-source/resource-source.service';
import type {
  AgentShareImportReportItem,
  ImportAgentShareResponse,
} from './dto/import-agent-share-response.dto';
import {
  ShareExpiredException,
  ShareNotFoundException,
  ShareRevokedException,
} from './share.exceptions';

const DEFAULT_VIEWPORT: schema.ReactFlowViewport = { x: 0, y: 0, zoom: 1 };
const MAX_SLUG_RETRIES = 3;

interface SourceAgentShareRecord {
  shareId: string;
  shareToken: string;
  shareType: schema.AgentShare['shareType'];
  expiresAt: Date | null;
  isRevoked: boolean;
  sourceTenantId: string;
  agentDefinitionId: string;
  agentName: string;
  agentDescription: string | null;
  agentIcon: string | null;
  runtimeMode: AgentRuntimeMode;
  publishedVersionId: string | null;
}

interface SourceAgentSnapshotRecord {
  agentDefinitionId: string;
  sourceTenantId: string;
  sourceVersionId: string;
  name: string;
  description: string | null;
  icon: string | null;
  runtimeMode: AgentRuntimeMode;
  snapshot: schema.AgentVersionSnapshot;
}

interface ClonedAgentRecord {
  agentDefinitionId: string;
  publishedVersionId: string;
  name: string;
}

interface ClonedMcpConfigRecord {
  configId: string;
  toolIdMap: Map<string, string>;
}

interface ImportSessionContext {
  targetTenantId: string;
  targetUserId: string;
  targetOrganizationId: string;
  sourceShareId: string;
  sourceShareToken: string;
  clonedAgents: Map<string, ClonedAgentRecord | null>;
  clonedKnowledgeBases: Map<string, string | null>;
  clonedMemoryInstances: Map<string, string | null>;
  clonedMcpConfigs: Map<string, ClonedMcpConfigRecord | null>;
  clonedSkills: Map<string, string | null>;
  rebuildingKnowledgeBaseIds: Set<string>;
  reports: AgentShareImportReportItem[];
  reportKeys: Set<string>;
  sourceRecords: ImportedResourceSourceRecordInput[];
  activeAgentCloneStack: Set<string>;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveNodeType(
  node: schema.ReactFlowNode | null | undefined,
): string {
  const data = asRecord(node?.data);
  const nodeType = readString(data?.nodeType);
  if (nodeType) {
    return nodeType;
  }

  return typeof node?.type === 'string' ? node.type : '';
}

function getNodeData(node: schema.ReactFlowNode): Record<string, unknown> {
  const data = asRecord(node.data) ?? {};
  const config = asRecord(data.config) ?? {};

  return {
    ...config,
    ...data,
  };
}

function setNodeConfigField(
  node: schema.ReactFlowNode,
  key: string,
  value: unknown,
): void {
  const data = (asRecord(node.data) ?? {}) as Record<string, unknown>;
  const config = (asRecord(data.config) ?? {}) as Record<string, unknown>;

  data[key] = value;
  config[key] = value;
  data.config = config;
  node.data = data;
}

function clearNodeConfigField(node: schema.ReactFlowNode, key: string): void {
  const data = (asRecord(node.data) ?? {}) as Record<string, unknown>;
  const config = (asRecord(data.config) ?? {}) as Record<string, unknown>;

  delete data[key];
  delete config[key];
  data.config = config;
  node.data = data;
}

@Injectable()
export class AgentShareImportService {
  private readonly logger = new Logger(AgentShareImportService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    private readonly documentService: DocumentService,
    private readonly skillService: SkillService,
    private readonly skillStorageService: SkillStorageService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async importFromShare(
    token: string,
    targetTenantId: string,
    targetUserId: string,
  ): Promise<ImportAgentShareResponse> {
    const share = await this.getAccessibleShareOrThrow(token);

    if (share.shareType !== 'copyable') {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-copy-not-allowed',
        title: '分享链接不支持导入',
        status: HttpStatus.CONFLICT,
        detail: `分享链接 ${token} 不支持导入`,
      });
    }

    if (!share.publishedVersionId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-agent-not-published',
        title: 'Agent 尚未发布',
        status: HttpStatus.CONFLICT,
        detail: `Agent ${share.agentDefinitionId} 尚未发布，无法导入`,
      });
    }

    const sourceSnapshot = await this.loadSourceAgentSnapshot({
      agentDefinitionId: share.agentDefinitionId,
      sourceTenantId: share.sourceTenantId,
      sourceVersionId: share.publishedVersionId,
    });

    const targetOrganizationId =
      await this.resolveTargetOrganizationId(targetTenantId);
    const context: ImportSessionContext = {
      targetTenantId,
      targetUserId,
      targetOrganizationId,
      sourceShareId: share.shareId,
      sourceShareToken: share.shareToken,
      clonedAgents: new Map(),
      clonedKnowledgeBases: new Map(),
      clonedMemoryInstances: new Map(),
      clonedMcpConfigs: new Map(),
      clonedSkills: new Map(),
      rebuildingKnowledgeBaseIds: new Set(),
      reports: [],
      reportKeys: new Set(),
      sourceRecords: [],
      activeAgentCloneStack: new Set(),
    };

    const clonedRootAgent = await this.cloneAgentFromSourceSnapshot(
      sourceSnapshot,
      context,
      { useShareTitle: true },
    );

    if (!clonedRootAgent) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/agent-share-import-failed',
        title: 'Agent 导入失败',
        status: HttpStatus.CONFLICT,
        detail: `分享链接 ${token} 对应的 Agent 无法导入`,
      });
    }

    await this.resourceSourceService.recordImportedResources(
      targetTenantId,
      targetUserId,
      context.sourceRecords,
    );

    for (const knowledgeBaseId of context.rebuildingKnowledgeBaseIds) {
      await this.documentService.rebuildKnowledgeBase(
        knowledgeBaseId,
        targetTenantId,
      );
    }

    await this.db
      .update(schema.agentShares)
      .set({
        copyCount: sql`${schema.agentShares.copyCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentShares.id, share.shareId));

    return {
      agentDefinitionId: clonedRootAgent.agentDefinitionId,
      name: clonedRootAgent.name,
      publishedVersionId: clonedRootAgent.publishedVersionId,
      report: context.reports,
      summary: this.buildSummary(context.reports),
    };
  }

  private buildSummary(report: AgentShareImportReportItem[]) {
    return report.reduce(
      (acc, item) => {
        switch (item.outcome) {
          case 'cloned':
            acc.cloned += 1;
            break;
          case 'cleared':
            acc.cleared += 1;
            break;
          case 'needs_rebind':
            acc.needsRebind += 1;
            break;
          case 'skipped_ephemeral':
            acc.skippedEphemeral += 1;
            break;
        }
        return acc;
      },
      {
        cloned: 0,
        cleared: 0,
        needsRebind: 0,
        skippedEphemeral: 0,
      },
    );
  }

  private async getAccessibleShareOrThrow(
    token: string,
  ): Promise<SourceAgentShareRecord> {
    const [share] = await this.db
      .select({
        shareId: schema.agentShares.id,
        shareToken: schema.agentShares.shareToken,
        shareType: schema.agentShares.shareType,
        expiresAt: schema.agentShares.expiresAt,
        isRevoked: schema.agentShares.isRevoked,
        sourceTenantId: schema.agentShares.tenantId,
        agentDefinitionId: schema.agentDefinitions.id,
        agentName: schema.agentDefinitions.name,
        agentDescription: schema.agentDefinitions.description,
        agentIcon: schema.agentDefinitions.icon,
        runtimeMode: schema.agentDefinitions.runtimeMode,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentShares)
      .innerJoin(
        schema.agentDefinitions,
        eq(schema.agentShares.agentDefinitionId, schema.agentDefinitions.id),
      )
      .where(eq(schema.agentShares.shareToken, token));

    if (!share) {
      throw new ShareNotFoundException(token);
    }

    if (share.isRevoked) {
      throw new ShareRevokedException(token);
    }

    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      throw new ShareExpiredException(token);
    }

    return share;
  }

  private async loadSourceAgentSnapshot(params: {
    agentDefinitionId: string;
    sourceTenantId: string;
    sourceVersionId?: string;
  }): Promise<SourceAgentSnapshotRecord> {
    const [definition] = await this.db
      .select({
        id: schema.agentDefinitions.id,
        tenantId: schema.agentDefinitions.tenantId,
        name: schema.agentDefinitions.name,
        description: schema.agentDefinitions.description,
        icon: schema.agentDefinitions.icon,
        runtimeMode: schema.agentDefinitions.runtimeMode,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.id, params.agentDefinitionId),
          eq(schema.agentDefinitions.tenantId, params.sourceTenantId),
        ),
      );

    if (!definition) {
      throw new ShareNotFoundException(params.agentDefinitionId);
    }

    const versionId = params.sourceVersionId ?? definition.publishedVersionId;
    if (!versionId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-agent-not-published',
        title: 'Agent 尚未发布',
        status: HttpStatus.CONFLICT,
        detail: `Agent ${params.agentDefinitionId} 尚未发布，无法读取可导入快照`,
      });
    }

    const [version] = await this.db
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
      throw new ShareNotFoundException(versionId);
    }

    return {
      agentDefinitionId: definition.id,
      sourceTenantId: definition.tenantId,
      sourceVersionId: version.id,
      name: definition.name,
      description: definition.description ?? null,
      icon: definition.icon ?? null,
      runtimeMode: definition.runtimeMode,
      snapshot: version.snapshot,
    };
  }

  private async resolveTargetOrganizationId(tenantId: string): Promise<string> {
    const [organization] = await this.tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId));

    if (!organization) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/organization-not-found',
        title: '组织不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `租户 ${tenantId} 未找到所属组织`,
      });
    }

    return organization.id;
  }

  private async cloneAgentFromSourceSnapshot(
    source: SourceAgentSnapshotRecord,
    context: ImportSessionContext,
    options?: {
      useShareTitle?: boolean;
    },
  ): Promise<ClonedAgentRecord | null> {
    const cached = context.clonedAgents.get(source.agentDefinitionId);
    if (cached !== undefined) {
      return cached;
    }

    if (context.activeAgentCloneStack.has(source.agentDefinitionId)) {
      this.pushReport(context, `agent-cycle:${source.agentDefinitionId}`, {
        resourceType: 'agent_definition',
        sourceResourceId: source.agentDefinitionId,
        targetResourceId: null,
        title: source.name,
        outcome: 'needs_rebind',
        message: '检测到子 Agent 循环引用，已清空该引用并等待重新绑定',
      });
      return null;
    }

    context.activeAgentCloneStack.add(source.agentDefinitionId);

    try {
      const clonedDefinition = cloneDefinitionWithNewIds({
        nodes: cloneJson(source.snapshot.nodes),
        edges: cloneJson(source.snapshot.edges),
        viewport: cloneJson(source.snapshot.viewport ?? DEFAULT_VIEWPORT),
      });

      const nodes = clonedDefinition.nodes;
      const edges = clonedDefinition.edges;
      const originalMetadata = asRecord(source.snapshot.metadata) ?? {};
      const importedAt = new Date().toISOString();

      const modelRebindMessages: string[] = [];
      const clonedMemoryIds = new Set<string>();
      let clearedWorkspaceRef = false;

      for (const node of nodes) {
        const nodeType = resolveNodeType(node);
        const nodeData = getNodeData(node);

        switch (nodeType) {
          case 'knowledge-base': {
            const sourceKnowledgeBaseId = readString(
              nodeData.knowledgeBaseId ?? nodeData.knowledge_base_id,
            );
            if (!sourceKnowledgeBaseId) {
              continue;
            }

            const clonedKnowledgeBaseId = await this.cloneKnowledgeBase(
              source.sourceTenantId,
              sourceKnowledgeBaseId,
              context,
            );

            if (clonedKnowledgeBaseId) {
              setNodeConfigField(
                node,
                'knowledgeBaseId',
                clonedKnowledgeBaseId,
              );
              clearNodeConfigField(node, 'knowledge_base_id');
            } else {
              clearNodeConfigField(node, 'knowledgeBaseId');
              clearNodeConfigField(node, 'knowledge_base_id');
            }
            break;
          }

          case 'memory': {
            const sourceMemoryInstanceId = readString(
              nodeData.memoryInstanceId ?? nodeData.memory_instance_id,
            );
            if (!sourceMemoryInstanceId) {
              continue;
            }

            const clonedMemoryInstanceId = await this.cloneMemoryInstance(
              source.sourceTenantId,
              sourceMemoryInstanceId,
              context,
            );

            if (clonedMemoryInstanceId) {
              clonedMemoryIds.add(clonedMemoryInstanceId);
              setNodeConfigField(
                node,
                'memoryInstanceId',
                clonedMemoryInstanceId,
              );
              clearNodeConfigField(node, 'memory_instance_id');
            } else {
              clearNodeConfigField(node, 'memoryInstanceId');
              clearNodeConfigField(node, 'memory_instance_id');
            }
            break;
          }

          case 'mcp-tool': {
            const sourceMcpServerConfigId = readString(
              nodeData.mcpServerConfigId ?? nodeData.mcp_server_config_id,
            );
            const sourceMcpToolDefinitionId = readString(
              nodeData.mcpToolDefinitionId ?? nodeData.mcp_tool_definition_id,
            );

            if (!sourceMcpServerConfigId) {
              continue;
            }

            const clonedMcpConfig = await this.cloneMcpServerConfig(
              source.sourceTenantId,
              sourceMcpServerConfigId,
              context,
            );

            if (clonedMcpConfig) {
              setNodeConfigField(
                node,
                'mcpServerConfigId',
                clonedMcpConfig.configId,
              );
              clearNodeConfigField(node, 'mcp_server_config_id');

              if (
                sourceMcpToolDefinitionId &&
                clonedMcpConfig.toolIdMap.has(sourceMcpToolDefinitionId)
              ) {
                setNodeConfigField(
                  node,
                  'mcpToolDefinitionId',
                  clonedMcpConfig.toolIdMap.get(sourceMcpToolDefinitionId),
                );
                clearNodeConfigField(node, 'mcp_tool_definition_id');
              } else if (sourceMcpToolDefinitionId) {
                clearNodeConfigField(node, 'mcpToolDefinitionId');
                clearNodeConfigField(node, 'mcp_tool_definition_id');
                this.pushReport(
                  context,
                  `mcp-tool-rebind:${sourceMcpToolDefinitionId}`,
                  {
                    resourceType: 'mcp_server_config',
                    sourceResourceId: sourceMcpToolDefinitionId,
                    targetResourceId: clonedMcpConfig.configId,
                    title:
                      readString(nodeData.toolName ?? nodeData.tool_name) ??
                      'MCP 工具',
                    outcome: 'needs_rebind',
                    message:
                      'MCP 工具绑定未能完整迁移，需要在导入后重新选择工具',
                  },
                );
              }
            } else {
              clearNodeConfigField(node, 'mcpServerConfigId');
              clearNodeConfigField(node, 'mcp_server_config_id');
              clearNodeConfigField(node, 'mcpToolDefinitionId');
              clearNodeConfigField(node, 'mcp_tool_definition_id');
            }
            break;
          }

          case 'sub-agent': {
            const sourceSubAgentDefinitionId = readString(
              nodeData.agentDefinitionId ?? nodeData.agent_definition_id,
            );
            const sourceSubAgentVersionId = readString(
              nodeData.agentVersionId ?? nodeData.agent_version_id,
            );
            if (!sourceSubAgentDefinitionId) {
              continue;
            }

            const sourceSubAgent = await this.loadSourceAgentSnapshot({
              agentDefinitionId: sourceSubAgentDefinitionId,
              sourceTenantId: source.sourceTenantId,
              sourceVersionId: sourceSubAgentVersionId ?? undefined,
            });
            const clonedSubAgent = await this.cloneAgentFromSourceSnapshot(
              sourceSubAgent,
              context,
            );

            if (clonedSubAgent) {
              setNodeConfigField(
                node,
                'agentDefinitionId',
                clonedSubAgent.agentDefinitionId,
              );
              setNodeConfigField(
                node,
                'agentVersionId',
                clonedSubAgent.publishedVersionId,
              );
              clearNodeConfigField(node, 'agent_definition_id');
              clearNodeConfigField(node, 'agent_version_id');
            } else {
              clearNodeConfigField(node, 'agentDefinitionId');
              clearNodeConfigField(node, 'agent_definition_id');
              clearNodeConfigField(node, 'agentVersionId');
              clearNodeConfigField(node, 'agent_version_id');
            }
            break;
          }

          case 'workspace': {
            const sourceWorkspaceId = readString(
              nodeData.workspaceId ?? nodeData.workspace_id,
            );
            if (sourceWorkspaceId) {
              clearedWorkspaceRef = true;
              clearNodeConfigField(node, 'workspaceId');
              clearNodeConfigField(node, 'workspace_id');
            }
            break;
          }

          case 'sandbox': {
            const sourceRestoreWorkspaceId = readString(
              nodeData.restoreWorkspaceId ?? nodeData.restore_workspace_id,
            );
            if (sourceRestoreWorkspaceId) {
              clearedWorkspaceRef = true;
              clearNodeConfigField(node, 'restoreWorkspaceId');
              clearNodeConfigField(node, 'restore_workspace_id');
            }
            break;
          }

          case 'llm-model': {
            const sourceModelBindingId = readString(
              nodeData.llmConfigId ??
                nodeData.llm_config_id ??
                nodeData.modelConfigId ??
                nodeData.model_config_id ??
                nodeData.modelId ??
                nodeData.model_id,
            );
            if (sourceModelBindingId) {
              clearNodeConfigField(node, 'llmConfigId');
              clearNodeConfigField(node, 'llm_config_id');
              clearNodeConfigField(node, 'modelConfigId');
              clearNodeConfigField(node, 'model_config_id');
              clearNodeConfigField(node, 'modelId');
              clearNodeConfigField(node, 'model_id');
              modelRebindMessages.push('LLM 模型绑定已清空，需要重新绑定');
            }
            break;
          }

          case 'skill': {
            const sourceSkillId = readString(
              nodeData.skillId ?? nodeData.skill_id,
            );
            if (!sourceSkillId) {
              continue;
            }

            const clonedSkillId = await this.cloneSkill(sourceSkillId, context);
            if (clonedSkillId) {
              setNodeConfigField(node, 'skillId', clonedSkillId);
              clearNodeConfigField(node, 'skill_id');
            } else {
              clearNodeConfigField(node, 'skillId');
              clearNodeConfigField(node, 'skill_id');
            }
            break;
          }

          default:
            break;
        }
      }

      const sanitizedSandboxConfig =
        source.runtimeMode === 'sandbox' && source.snapshot.sandboxConfig
          ? this.sanitizeSandboxConfig(source.snapshot.sandboxConfig, () => {
              clearedWorkspaceRef = true;
            })
          : null;

      const sanitizedInputSchema =
        asRecord(originalMetadata.inputSchema) ?? null;
      const sanitizedMemoryInstanceIds =
        clonedMemoryIds.size > 0 ? Array.from(clonedMemoryIds) : [];
      const sandboxLifecycle =
        originalMetadata.sandboxLifecycle === 'session' ||
        originalMetadata.sandboxLifecycle === 'persistent'
          ? originalMetadata.sandboxLifecycle
          : null;

      const rootMetadata: Record<string, unknown> = {
        importedFromShare: {
          shareToken: context.sourceShareToken,
          importedAt,
          sourceAgentDefinitionId: source.agentDefinitionId,
          sourceVersionId: source.sourceVersionId,
        },
        ...(sanitizedInputSchema ? { inputSchema: sanitizedInputSchema } : {}),
        ...(sanitizedMemoryInstanceIds.length > 0
          ? { memoryInstanceIds: sanitizedMemoryInstanceIds }
          : {}),
        ...(sandboxLifecycle ? { sandboxLifecycle } : {}),
      };

      if (clearedWorkspaceRef) {
        this.pushReport(
          context,
          `workspace-cleared:${source.agentDefinitionId}`,
          {
            resourceType: 'workspace',
            sourceResourceId: source.snapshot.workspaceSnapshotId ?? null,
            targetResourceId: null,
            title: `${source.name} 工作区`,
            outcome: 'cleared',
            message: '工作区资源不会随分享导入复制，相关工作区绑定已清空',
          },
        );
      }

      if (modelRebindMessages.length > 0) {
        this.pushReport(
          context,
          `agent-model-rebind:${source.agentDefinitionId}`,
          {
            resourceType: 'agent_definition',
            sourceResourceId: source.agentDefinitionId,
            targetResourceId: null,
            title: source.name,
            outcome: 'needs_rebind',
            message: Array.from(new Set(modelRebindMessages)).join('；'),
          },
        );
      }

      const importedName =
        options?.useShareTitle === true ? source.name : `${source.name} 副本`;
      const { agentDefinitionId, publishedVersionId, name } =
        await this.insertImportedAgentDefinition(
          {
            name: importedName,
            description: source.description,
            icon: source.icon,
            runtimeMode: source.runtimeMode,
            nodes,
            edges,
            viewport: source.snapshot.viewport ?? DEFAULT_VIEWPORT,
            systemPrompt: source.snapshot.systemPrompt ?? null,
            workspaceSnapshotId: null,
            sandboxConfig: sanitizedSandboxConfig,
            metadata: rootMetadata,
          },
          context,
        );

      context.clonedAgents.set(source.agentDefinitionId, {
        agentDefinitionId,
        publishedVersionId,
        name,
      });
      context.sourceRecords.push({
        resourceType: 'agent_definition',
        resourceId: agentDefinitionId,
        sourceShareType: 'agent',
        sourceShareId: context.sourceShareId,
        sourceShareToken: context.sourceShareToken,
        sourceResourceType: 'agent_definition',
        sourceResourceId: source.agentDefinitionId,
        sourceResourceTitle: source.name,
      });
      this.pushReport(context, `agent-cloned:${source.agentDefinitionId}`, {
        resourceType: 'agent_definition',
        sourceResourceId: source.agentDefinitionId,
        targetResourceId: agentDefinitionId,
        title: source.name,
        outcome: 'cloned',
        message:
          options?.useShareTitle === true
            ? '已导入为可直接使用的已发布 Agent'
            : '子 Agent 已深拷贝并重新绑定到导入后的副本',
      });

      return {
        agentDefinitionId,
        publishedVersionId,
        name,
      };
    } finally {
      context.activeAgentCloneStack.delete(source.agentDefinitionId);
    }
  }

  private sanitizeSandboxConfig(
    sandboxConfig: schema.SandboxConfig,
    onClearedWorkspace: () => void,
  ): schema.SandboxConfig {
    const next = cloneJson(sandboxConfig);

    if (next.restoreWorkspaceId) {
      delete next.restoreWorkspaceId;
      onClearedWorkspace();
    }

    return next;
  }

  private async insertImportedAgentDefinition(
    input: {
      name: string;
      description: string | null;
      icon: string | null;
      runtimeMode: AgentRuntimeMode;
      nodes: schema.ReactFlowNode[];
      edges: schema.ReactFlowEdge[];
      viewport: schema.ReactFlowViewport | null;
      systemPrompt: string | null;
      sandboxConfig: schema.SandboxConfig | null;
      workspaceSnapshotId: string | null;
      metadata: Record<string, unknown>;
    },
    context: ImportSessionContext,
  ): Promise<ClonedAgentRecord> {
    let slug = generateSlug(input.name);
    const migratedCanvas = migrateAgentCanvasGraph({
      nodes: input.nodes,
      edges: input.edges,
      systemPrompt: input.systemPrompt,
    });
    const rawInputSchema = input.metadata['inputSchema'];
    const rawMemoryInstanceIds = input.metadata['memoryInstanceIds'];
    const rawSandboxLifecycle = input.metadata['sandboxLifecycle'];
    const snapshotMetadata: schema.AgentVersionSnapshot['metadata'] = {
      nodeCount: migratedCanvas.nodes.length,
      edgeCount: migratedCanvas.edges.length,
      createdFromVersion: 1,
      releaseNotes: '由分享链接导入',
      ...(asRecord(rawInputSchema)
        ? { inputSchema: rawInputSchema as Record<string, unknown> }
        : {}),
      ...(Array.isArray(rawMemoryInstanceIds) &&
      rawMemoryInstanceIds.every(
        (memoryInstanceId): memoryInstanceId is string =>
          typeof memoryInstanceId === 'string',
      )
        ? { memoryInstanceIds: rawMemoryInstanceIds }
        : {}),
      ...(rawSandboxLifecycle === 'session' ||
      rawSandboxLifecycle === 'persistent'
        ? { sandboxLifecycle: rawSandboxLifecycle }
        : {}),
    };

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt += 1) {
      try {
        return await this.tenantDb.transaction(async (tx) => {
          const [createdAgent] = await tx
            .insert(schema.agentDefinitions)
            .values({
              tenantId: context.targetTenantId,
              name: input.name,
              slug,
              description: input.description,
              icon: input.icon,
              runtimeMode: input.runtimeMode,
              systemPrompt: migratedCanvas.systemPrompt ?? null,
              nodes: migratedCanvas.nodes,
              edges: migratedCanvas.edges,
              viewport: input.viewport,
              metadata: input.metadata,
              sandboxConfig:
                input.runtimeMode === 'sandbox' ? input.sandboxConfig : null,
              workspaceSnapshotId: input.workspaceSnapshotId,
              version: 1,
              status: 'draft',
              createdBy: context.targetUserId,
              updatedBy: context.targetUserId,
            })
            .returning();

          const [createdVersion] = await tx
            .insert(schema.agentVersions)
            .values({
              agentDefinitionId: createdAgent.id,
              tenantId: context.targetTenantId,
              versionNumber: 1,
              label: 'v1 (imported)',
              snapshot: {
                runtimeMode: input.runtimeMode,
                nodes: cloneJson(migratedCanvas.nodes),
                edges: cloneJson(migratedCanvas.edges),
                viewport: cloneJson(input.viewport),
                systemPrompt: migratedCanvas.systemPrompt ?? null,
                sandboxConfig:
                  input.runtimeMode === 'sandbox' ? input.sandboxConfig : null,
                workspaceSnapshotId: null,
                metadata: snapshotMetadata,
              },
              publishedAt: new Date(),
              createdBy: context.targetUserId,
            })
            .returning();

          await tx
            .update(schema.agentDefinitions)
            .set({
              status: 'published',
              publishedVersionId: createdVersion.id,
              updatedBy: context.targetUserId,
              updatedAt: new Date(),
            })
            .where(eq(schema.agentDefinitions.id, createdAgent.id));

          return {
            agentDefinitionId: createdAgent.id,
            publishedVersionId: createdVersion.id,
            name: createdAgent.name,
          };
        });
      } catch (error) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === MAX_SLUG_RETRIES) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable');
  }

  private async cloneKnowledgeBase(
    sourceTenantId: string,
    sourceKnowledgeBaseId: string,
    context: ImportSessionContext,
  ): Promise<string | null> {
    const cached = context.clonedKnowledgeBases.get(sourceKnowledgeBaseId);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const [sourceKnowledgeBase] = await this.db
        .select()
        .from(schema.knowledgeBases)
        .where(
          and(
            eq(schema.knowledgeBases.id, sourceKnowledgeBaseId),
            eq(schema.knowledgeBases.tenantId, sourceTenantId),
          ),
        );

      if (!sourceKnowledgeBase) {
        throw new Error('source knowledge base not found');
      }

      const sanitizedKnowledgeBase: schema.KnowledgeBase =
        cloneJson(sourceKnowledgeBase);
      const metadataMessages: string[] = [];

      if (sanitizedKnowledgeBase.embeddingModelConfigId) {
        sanitizedKnowledgeBase.embeddingModelConfigId = null;
        metadataMessages.push('嵌入模型绑定已清空');
      }

      const reranking = sanitizedKnowledgeBase.rerankingStrategy;
      if (reranking.type === 'cohere' && reranking.apiKeyId) {
        sanitizedKnowledgeBase.rerankingStrategy = {
          ...reranking,
          apiKeyId: null,
        } satisfies KnowledgeRerankerStrategy;
        metadataMessages.push('重排 API Key 已清空');
      }

      const orchestration = sanitizedKnowledgeBase.queryOrchestration;
      if (orchestration.type === 'hyde' && orchestration.modelConfigId) {
        sanitizedKnowledgeBase.queryOrchestration = {
          ...orchestration,
          modelConfigId: null,
        } satisfies KnowledgeQueryOrchestrationStrategy;
        metadataMessages.push('HyDE 模型绑定已清空');
      }

      const [createdKnowledgeBase] = await this.tenantDb
        .insert(schema.knowledgeBases)
        .values({
          tenantId: context.targetTenantId,
          name: sourceKnowledgeBase.name,
          description: sourceKnowledgeBase.description,
          visibility: sourceKnowledgeBase.visibility,
          chunkingStrategy: sanitizedKnowledgeBase.chunkingStrategy,
          retrievalStrategy: sanitizedKnowledgeBase.retrievalStrategy,
          rerankingStrategy: sanitizedKnowledgeBase.rerankingStrategy,
          queryOrchestration: sanitizedKnowledgeBase.queryOrchestration,
          embeddingModel: sanitizedKnowledgeBase.embeddingModel,
          embeddingModelConfigId: sanitizedKnowledgeBase.embeddingModelConfigId,
          createdBy: context.targetUserId,
        })
        .returning({
          id: schema.knowledgeBases.id,
          name: schema.knowledgeBases.name,
        });

      const sourceDocuments = await this.db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.knowledgeBaseId, sourceKnowledgeBaseId),
            eq(schema.documents.tenantId, sourceTenantId),
          ),
        );

      for (const document of sourceDocuments) {
        const newDocumentId = uuidv7();
        const newStorageKey = this.storageService.buildStorageKey(
          context.targetTenantId,
          createdKnowledgeBase.id,
          newDocumentId,
          document.fileName,
        );

        const stream = await this.storageService.download(document.storageKey);
        await this.storageService.upload(
          newStorageKey,
          stream,
          document.sizeBytes,
          document.mimeType,
        );

        await this.tenantDb.insert(schema.documents).values({
          id: newDocumentId,
          knowledgeBaseId: createdKnowledgeBase.id,
          tenantId: context.targetTenantId,
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          storageKey: newStorageKey,
          status: 'uploaded',
          errorMessage: null,
          uploadedBy: context.targetUserId,
        });
      }

      context.clonedKnowledgeBases.set(
        sourceKnowledgeBaseId,
        createdKnowledgeBase.id,
      );
      context.rebuildingKnowledgeBaseIds.add(createdKnowledgeBase.id);
      context.sourceRecords.push({
        resourceType: 'knowledge_base',
        resourceId: createdKnowledgeBase.id,
        sourceShareType: 'agent',
        sourceShareId: context.sourceShareId,
        sourceShareToken: context.sourceShareToken,
        sourceResourceType: 'knowledge_base',
        sourceResourceId: sourceKnowledgeBase.id,
        sourceResourceTitle: sourceKnowledgeBase.name,
      });
      this.pushReport(context, `kb-cloned:${sourceKnowledgeBaseId}`, {
        resourceType: 'knowledge_base',
        sourceResourceId: sourceKnowledgeBase.id,
        targetResourceId: createdKnowledgeBase.id,
        title: sourceKnowledgeBase.name,
        outcome: 'cloned',
        message:
          sourceDocuments.length > 0
            ? '知识库与文档已复制，并已安排重建向量索引'
            : '知识库已复制',
      });

      if (metadataMessages.length > 0) {
        this.pushReport(context, `kb-rebind:${sourceKnowledgeBaseId}`, {
          resourceType: 'knowledge_base',
          sourceResourceId: sourceKnowledgeBase.id,
          targetResourceId: createdKnowledgeBase.id,
          title: sourceKnowledgeBase.name,
          outcome: 'needs_rebind',
          message: `${metadataMessages.join('；')}，导入后请重新绑定相关配置`,
        });
      }

      return createdKnowledgeBase.id;
    } catch (error) {
      this.logger.warn(
        `知识库复制失败 ${sourceKnowledgeBaseId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      context.clonedKnowledgeBases.set(sourceKnowledgeBaseId, null);
      this.pushReport(context, `kb-needs-rebind:${sourceKnowledgeBaseId}`, {
        resourceType: 'knowledge_base',
        sourceResourceId: sourceKnowledgeBaseId,
        targetResourceId: null,
        title: '知识库',
        outcome: 'needs_rebind',
        message: '知识库复制失败，导入后的 Agent 需要重新绑定该知识库',
      });
      return null;
    }
  }

  private async cloneMemoryInstance(
    sourceTenantId: string,
    sourceMemoryInstanceId: string,
    context: ImportSessionContext,
  ): Promise<string | null> {
    const cached = context.clonedMemoryInstances.get(sourceMemoryInstanceId);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const [sourceInstance] = await this.db
        .select()
        .from(schema.agentMemoryInstances)
        .where(
          and(
            eq(schema.agentMemoryInstances.id, sourceMemoryInstanceId),
            eq(schema.agentMemoryInstances.tenantId, sourceTenantId),
          ),
        );

      if (!sourceInstance) {
        throw new Error('source memory instance not found');
      }

      const [createdInstance] = await this.tenantDb
        .insert(schema.agentMemoryInstances)
        .values({
          tenantId: context.targetTenantId,
          name: sourceInstance.name,
          description: sourceInstance.description,
          config: sourceInstance.config,
          systemPromptOverride: sourceInstance.systemPromptOverride,
          validDomains: sourceInstance.validDomains,
          coreMemoryUris: sourceInstance.coreMemoryUris,
          status: sourceInstance.status,
          createdBy: context.targetUserId,
        })
        .returning({
          id: schema.agentMemoryInstances.id,
          name: schema.agentMemoryInstances.name,
        });

      const sourceNodes = await this.db
        .select()
        .from(schema.memoryNodes)
        .where(
          and(
            eq(schema.memoryNodes.instanceId, sourceMemoryInstanceId),
            eq(schema.memoryNodes.tenantId, sourceTenantId),
          ),
        );
      const nodeIdMap = new Map<string, string>(
        sourceNodes.map((node) => [node.id, uuidv7()]),
      );

      if (sourceNodes.length > 0) {
        await this.tenantDb.insert(schema.memoryNodes).values(
          sourceNodes.map((node) => ({
            id: nodeIdMap.get(node.id)!,
            instanceId: createdInstance.id,
            tenantId: context.targetTenantId,
            contentType: node.contentType,
            metadata: node.metadata,
            disclosureLevel: node.disclosureLevel,
          })),
        );
      }

      const sourceEdges = await this.db
        .select()
        .from(schema.memoryEdges)
        .where(
          and(
            eq(schema.memoryEdges.instanceId, sourceMemoryInstanceId),
            eq(schema.memoryEdges.tenantId, sourceTenantId),
          ),
        );
      const edgeIdMap = new Map<string, string>(
        sourceEdges.map((edge) => [edge.id, uuidv7()]),
      );

      if (sourceEdges.length > 0) {
        await this.tenantDb.insert(schema.memoryEdges).values(
          sourceEdges.map((edge) => ({
            id: edgeIdMap.get(edge.id)!,
            instanceId: createdInstance.id,
            tenantId: context.targetTenantId,
            parentNodeId: nodeIdMap.get(edge.parentNodeId)!,
            childNodeId: nodeIdMap.get(edge.childNodeId)!,
            name: edge.name,
            priority: edge.priority,
            disclosure: edge.disclosure,
          })),
        );
      }

      const sourcePaths = await this.db
        .select()
        .from(schema.memoryPaths)
        .where(
          and(
            eq(schema.memoryPaths.instanceId, sourceMemoryInstanceId),
            eq(schema.memoryPaths.tenantId, sourceTenantId),
          ),
        );

      if (sourcePaths.length > 0) {
        await this.tenantDb.insert(schema.memoryPaths).values(
          sourcePaths.map((path) => ({
            id: uuidv7(),
            instanceId: createdInstance.id,
            tenantId: context.targetTenantId,
            domain: path.domain,
            pathString: path.pathString,
            edgeId: path.edgeId ? (edgeIdMap.get(path.edgeId) ?? null) : null,
            nodeId: nodeIdMap.get(path.nodeId)!,
          })),
        );
      }

      const sourceVersions = sourceNodes.length
        ? await this.db
            .select()
            .from(schema.memoryVersions)
            .where(
              and(
                eq(schema.memoryVersions.tenantId, sourceTenantId),
                inArray(
                  schema.memoryVersions.nodeId,
                  sourceNodes.map((node) => node.id),
                ),
              ),
            )
        : [];
      const versionIdMap = new Map<string, string>(
        sourceVersions.map((version) => [version.id, uuidv7()]),
      );

      if (sourceVersions.length > 0) {
        await this.tenantDb.insert(schema.memoryVersions).values(
          sourceVersions.map((version) => ({
            id: versionIdMap.get(version.id)!,
            nodeId: nodeIdMap.get(version.nodeId)!,
            tenantId: context.targetTenantId,
            content: version.content,
            version: version.version,
            deprecated: version.deprecated,
            migratedTo: version.migratedTo
              ? (versionIdMap.get(version.migratedTo) ?? null)
              : null,
            reviewStatus: version.reviewStatus,
            patchSummary: version.patchSummary,
            createdBy: context.targetUserId,
          })),
        );
      }

      const sourceGlossaryKeywords = sourceNodes.length
        ? await this.db
            .select()
            .from(schema.memoryGlossaryKeywords)
            .where(
              and(
                eq(
                  schema.memoryGlossaryKeywords.instanceId,
                  sourceMemoryInstanceId,
                ),
                eq(schema.memoryGlossaryKeywords.tenantId, sourceTenantId),
              ),
            )
        : [];

      if (sourceGlossaryKeywords.length > 0) {
        await this.tenantDb.insert(schema.memoryGlossaryKeywords).values(
          sourceGlossaryKeywords.map((keyword) => ({
            id: uuidv7(),
            instanceId: createdInstance.id,
            tenantId: context.targetTenantId,
            keyword: keyword.keyword,
            nodeId: nodeIdMap.get(keyword.nodeId)!,
          })),
        );
      }

      context.clonedMemoryInstances.set(
        sourceMemoryInstanceId,
        createdInstance.id,
      );
      context.sourceRecords.push({
        resourceType: 'memory_instance',
        resourceId: createdInstance.id,
        sourceShareType: 'agent',
        sourceShareId: context.sourceShareId,
        sourceShareToken: context.sourceShareToken,
        sourceResourceType: 'memory_instance',
        sourceResourceId: sourceInstance.id,
        sourceResourceTitle: sourceInstance.name,
      });
      this.pushReport(context, `memory-cloned:${sourceMemoryInstanceId}`, {
        resourceType: 'memory_instance',
        sourceResourceId: sourceInstance.id,
        targetResourceId: createdInstance.id,
        title: sourceInstance.name,
        outcome: 'cloned',
        message: '记忆实例及其��点、边、路径、版本与词汇表已复制',
      });

      return createdInstance.id;
    } catch (error) {
      this.logger.warn(
        `记忆实例复制失败 ${sourceMemoryInstanceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      context.clonedMemoryInstances.set(sourceMemoryInstanceId, null);
      this.pushReport(
        context,
        `memory-needs-rebind:${sourceMemoryInstanceId}`,
        {
          resourceType: 'memory_instance',
          sourceResourceId: sourceMemoryInstanceId,
          targetResourceId: null,
          title: '记忆实例',
          outcome: 'needs_rebind',
          message: '记忆实例复制失败，导入后的 Agent 需要重新绑定该记忆实例',
        },
      );
      return null;
    }
  }

  private async cloneMcpServerConfig(
    sourceTenantId: string,
    sourceMcpServerConfigId: string,
    context: ImportSessionContext,
  ): Promise<ClonedMcpConfigRecord | null> {
    const cached = context.clonedMcpConfigs.get(sourceMcpServerConfigId);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const [sourceConfig] = await this.db
        .select()
        .from(schema.mcpServerConfigs)
        .where(
          and(
            eq(schema.mcpServerConfigs.id, sourceMcpServerConfigId),
            eq(schema.mcpServerConfigs.tenantId, sourceTenantId),
          ),
        );

      if (!sourceConfig) {
        throw new Error('source mcp server config not found');
      }

      const [createdConfig] = await this.tenantDb
        .insert(schema.mcpServerConfigs)
        .values({
          tenantId: context.targetTenantId,
          organizationId: context.targetOrganizationId,
          createdBy: context.targetUserId,
          name: sourceConfig.name,
          description: sourceConfig.description,
          transportType: sourceConfig.transportType,
          command: sourceConfig.command,
          args: sourceConfig.args,
          url: sourceConfig.url,
          connectionFingerprint: null,
          encryptedData: sourceConfig.encryptedData,
          encryptedDek: sourceConfig.encryptedDek,
          iv: sourceConfig.iv,
          authTag: sourceConfig.authTag,
          status: sourceConfig.status,
          lastTestedAt: sourceConfig.lastTestedAt,
        })
        .returning({
          id: schema.mcpServerConfigs.id,
          name: schema.mcpServerConfigs.name,
        });

      const sourceTools = await this.db
        .select()
        .from(schema.toolDefinitions)
        .where(eq(schema.toolDefinitions.mcpServerConfigId, sourceConfig.id));

      const toolIdMap = new Map<string, string>();
      if (sourceTools.length > 0) {
        const insertedTools = await this.tenantDb
          .insert(schema.toolDefinitions)
          .values(
            sourceTools.map((tool) => ({
              tenantId: context.targetTenantId,
              organizationId: context.targetOrganizationId,
              mcpServerConfigId: createdConfig.id,
              source: tool.source,
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
              portMappingMetadata: tool.portMappingMetadata,
              annotations: tool.annotations,
              isActive: tool.isActive,
              importedAt: tool.importedAt ?? new Date(),
            })),
          )
          .returning({
            id: schema.toolDefinitions.id,
            name: schema.toolDefinitions.name,
          });

        for (let index = 0; index < sourceTools.length; index += 1) {
          toolIdMap.set(sourceTools[index].id, insertedTools[index].id);
        }
      }

      const result: ClonedMcpConfigRecord = {
        configId: createdConfig.id,
        toolIdMap,
      };
      context.clonedMcpConfigs.set(sourceMcpServerConfigId, result);
      context.sourceRecords.push({
        resourceType: 'mcp_server_config',
        resourceId: createdConfig.id,
        sourceShareType: 'agent',
        sourceShareId: context.sourceShareId,
        sourceShareToken: context.sourceShareToken,
        sourceResourceType: 'mcp_server_config',
        sourceResourceId: sourceConfig.id,
        sourceResourceTitle: sourceConfig.name,
      });
      this.pushReport(context, `mcp-cloned:${sourceMcpServerConfigId}`, {
        resourceType: 'mcp_server_config',
        sourceResourceId: sourceConfig.id,
        targetResourceId: createdConfig.id,
        title: sourceConfig.name,
        outcome: 'cloned',
        message: 'MCP 服务器配置及其已导入工具已复制',
      });

      return result;
    } catch (error) {
      this.logger.warn(
        `MCP 服务器复制失败 ${sourceMcpServerConfigId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      context.clonedMcpConfigs.set(sourceMcpServerConfigId, null);
      this.pushReport(context, `mcp-needs-rebind:${sourceMcpServerConfigId}`, {
        resourceType: 'mcp_server_config',
        sourceResourceId: sourceMcpServerConfigId,
        targetResourceId: null,
        title: 'MCP 服务器',
        outcome: 'needs_rebind',
        message:
          'MCP 服务器配置��制失败，导入后的 Agent 需要重新绑定该 MCP 配置',
      });
      return null;
    }
  }

  private async cloneSkill(
    sourceSkillId: string,
    context: ImportSessionContext,
  ): Promise<string | null> {
    const cached = context.clonedSkills.get(sourceSkillId);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const [sourceSkill] = await this.db
        .select()
        .from(schema.skills)
        .where(
          and(
            eq(schema.skills.id, sourceSkillId),
            or(
              eq(schema.skills.tenantId, context.targetTenantId),
              eq(schema.skills.isBuiltin, true),
            ),
          ),
        );

      if (!sourceSkill) {
        const [crossTenantSkill] = await this.db
          .select()
          .from(schema.skills)
          .where(eq(schema.skills.id, sourceSkillId));

        if (!crossTenantSkill) {
          throw new Error('source skill not found');
        }

        return this.insertClonedSkill(crossTenantSkill, context);
      }

      return this.insertClonedSkill(sourceSkill, context);
    } catch (error) {
      this.logger.warn(
        `Skill 复制失败 ${sourceSkillId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      context.clonedSkills.set(sourceSkillId, null);
      this.pushReport(context, `skill-needs-rebind:${sourceSkillId}`, {
        resourceType: 'skill',
        sourceResourceId: sourceSkillId,
        targetResourceId: null,
        title: 'Skill',
        outcome: 'needs_rebind',
        message: 'Skill 复制失败，导入后的 Agent 需要重新选择对应 Skill',
      });
      return null;
    }
  }

  private async insertClonedSkill(
    sourceSkill: schema.SkillRecord,
    context: ImportSessionContext,
  ): Promise<string> {
    const cached = context.clonedSkills.get(sourceSkill.id);
    if (cached) {
      return cached;
    }

    const fileMap = await this.skillService.getSkillFileMap(
      sourceSkill.tenantId,
      sourceSkill.id,
      sourceSkill.content,
      {
        isBuiltin: sourceSkill.isBuiltin,
        slug: sourceSkill.slug,
      },
    );

    let slug = generateSlug(sourceSkill.name);
    let name = sourceSkill.name;

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt += 1) {
      try {
        const createdSkill = await this.tenantDb.transaction(async (tx) => {
          const [row] = await tx
            .insert(schema.skills)
            .values({
              tenantId: context.targetTenantId,
              name,
              slug,
              description: sourceSkill.description,
              content: fileMap['SKILL.md'] ?? sourceSkill.content,
              frontmatter: sourceSkill.frontmatter,
              isBuiltin: false,
              status: sourceSkill.status,
              fileCount: Object.keys(fileMap).length || sourceSkill.fileCount,
              totalSizeBytes:
                Object.values(fileMap).reduce(
                  (sum, value) => sum + Buffer.byteLength(value, 'utf-8'),
                  0,
                ) || sourceSkill.totalSizeBytes,
              version: 1,
              createdBy: context.targetUserId,
              updatedBy: context.targetUserId,
            })
            .returning({ id: schema.skills.id, name: schema.skills.name });

          return row;
        });

        await Promise.all(
          Object.entries(fileMap).map(([fileName, content]) =>
            this.skillStorageService.uploadSkillFile(
              context.targetTenantId,
              createdSkill.id,
              fileName,
              Buffer.from(content, 'utf-8'),
              'text/markdown',
            ),
          ),
        );

        context.clonedSkills.set(sourceSkill.id, createdSkill.id);
        context.sourceRecords.push({
          resourceType: 'skill',
          resourceId: createdSkill.id,
          sourceShareType: 'agent',
          sourceShareId: context.sourceShareId,
          sourceShareToken: context.sourceShareToken,
          sourceResourceType: 'skill',
          sourceResourceId: sourceSkill.id,
          sourceResourceTitle: sourceSkill.name,
        });
        this.pushReport(context, `skill-cloned:${sourceSkill.id}`, {
          resourceType: 'skill',
          sourceResourceId: sourceSkill.id,
          targetResourceId: createdSkill.id,
          title: sourceSkill.name,
          outcome: 'cloned',
          message: 'Skill 及其文件内容已复制',
        });

        return createdSkill.id;
      } catch (error) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === MAX_SLUG_RETRIES) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
        name = `${sourceSkill.name} 副本`;
      }
    }

    throw new Error('Unreachable');
  }

  private pushReport(
    context: ImportSessionContext,
    key: string,
    item: AgentShareImportReportItem,
  ): void {
    if (context.reportKeys.has(key)) {
      return;
    }

    context.reportKeys.add(key);
    context.reports.push(item);
  }
}
