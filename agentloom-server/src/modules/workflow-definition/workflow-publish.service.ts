/**
 * 工作流发布服务：负责发布校验、版本落库、写锁与发布缓存失效。
 */
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  max,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';

import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { transactionStorage } from '../../common/interceptors/tenant-transaction.interceptor';
import { RedisDomain, redisKey } from '../../common/redis/redis-key.util';
import { DomainException } from '../../common/exceptions/domain.exception';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import type { AgentRuntimeMode } from '../../database/schema/agent-definitions.schema';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { TemplateService } from '../template/template.service';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { getWorkflowAgentDefinitionId } from '../execution/workflow-runtime-input.util';
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';
import { generateSlug, appendSlugSuffix } from '../organization/slug.utils';
import { cloneDefinitionWithNewIds } from './utils/clone-template.utils';
import { normalizeWorkflowNodesAndEdges } from './utils/normalize-workflow-graph.utils';
import { findLegacyLlmAgentNodeIds } from './utils/legacy-llm-agent-node.utils';
import { sanitizeDefinition } from './utils/sanitize-export.utils';
import type { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import type { CreateVersionDto } from './dto/create-version.dto';
import type { ImportWorkflowDto } from './dto/workflow-import.dto';
import type { ListVersionsQueryDto } from './dto/list-versions-query.dto';
import type { ListWorkflowDefinitionsQueryDto } from './dto/list-workflow-definitions-query.dto';
import type { PublishWorkflowDto } from './dto/publish-workflow.dto';
import type { UpdateWorkflowDefinitionDto } from './dto/update-workflow-definition.dto';
import {
  WORKFLOW_EXPORT_VERSION,
  type WorkflowExportDto,
} from './dto/workflow-export.dto';
import type {
  VersionResponseDto,
  PublishWarning,
  PublishResult,
} from './dto/version-response.dto';
import {
  serializeWorkflowDefinition,
  serializeWorkflowDefinitionDetail,
  type WorkflowDefinitionResponseDto,
  type WorkflowDefinitionDetailResponseDto,
  type WorkflowDefinitionListResponseDto,
} from './dto/workflow-definition-response.dto';
import {
  WorkflowArchivedException,
  WorkflowPublishAutonomyCapException,
  WorkflowPublishAgentBindingException,
  WorkflowPublishLegacyLlmAgentException,
  WorkflowNotFoundException,
  WorkflowPublishValidationException,
  WorkflowVersionConflictException,
  WorkflowVersionNotFoundException,
} from './workflow-version.exceptions';
import { MarketplaceListingNotFoundException } from '../marketplace/marketplace.exceptions';
import {
  ShareService,
  type AccessibleWorkflowShareTokenRecord,
} from '../share/share.service';
import { validateImportFile } from './utils/validate-import.utils';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import { buildWorkspaceStorageKey } from '../workspace/workspace.constants';

/** 发布版本缓存 TTL（秒） */
const PUBLISHED_VERSION_TTL = 300;
/** 空值缓存 TTL（秒），防止缓存穿透 */
const NULL_CACHE_TTL = 60;
/** 空值缓存标记 */
const NULL_SENTINEL = '__NULL__';
const DEFAULT_VIEWPORT: schema.ReactFlowViewport = { x: 0, y: 0, zoom: 1 };

type WorkflowDbClient = Pick<
  DrizzleDB,
  'execute' | 'insert' | 'select' | 'update'
>;

interface VersionListResult {
  data: VersionResponseDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ImportedWorkflowAgentCloneResult {
  agentDefinitionId: string;
  publishedVersionId: string;
  name: string;
  runtimeMode: AgentRuntimeMode;
}

interface ImportedWorkflowAgentSourceRecord {
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

interface ImportedWorkflowModelRecord {
  config: schema.LlmModelConfig;
  provider: schema.LlmProvider;
}

interface ImportedWorkflowAgentCloneContext {
  importSource: 'marketplace' | 'share';
  importReference: string;
  targetTenantId: string;
  targetUserId: string;
  clonedAgents: Map<string, ImportedWorkflowAgentCloneResult>;
  sourceModels: Map<string, ImportedWorkflowModelRecord | null>;
  targetModels: ImportedWorkflowModelRecord[] | null;
  activeAgentCloneStack: Set<string>;
}

interface ImportedWorkflowWorkspaceCloneResult {
  workspaceId: string;
  name: string;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function setNodeConfigField(
  node: schema.ReactFlowNode,
  key: string,
  value: unknown,
): void {
  const nodeData = (asRecord(node.data) ?? {}) as Record<string, unknown>;
  const config = (asRecord(nodeData.config) ?? {}) as Record<string, unknown>;

  nodeData[key] = value;
  config[key] = value;
  nodeData.config = config;
  node.data = nodeData;
}

function clearNodeConfigField(node: schema.ReactFlowNode, key: string): void {
  const nodeData = (asRecord(node.data) ?? {}) as Record<string, unknown>;
  const config = (asRecord(nodeData.config) ?? {}) as Record<string, unknown>;

  delete nodeData[key];
  delete config[key];
  nodeData.config = config;
  node.data = nodeData;
}

function createDefaultWorkflowInputSchema(): WorkflowInputSchema {
  return workflowInputSchemaSchema.parse({});
}

function stripWorkflowInputSchemaVersion(schema: WorkflowInputSchema) {
  const { version: _version, ...rest } = schema;

  return rest;
}

function normalizeWorkflowInputSchemaForUpdate(
  currentInputSchema: WorkflowInputSchema | null,
  nextInputSchema: WorkflowInputSchema,
): WorkflowInputSchema {
  const currentSchema =
    currentInputSchema ?? createDefaultWorkflowInputSchema();
  const parsedCurrentSchema = workflowInputSchemaSchema.parse(currentSchema);
  const parsedNextSchema = workflowInputSchemaSchema.parse(nextInputSchema);
  const schemaChanged =
    JSON.stringify(stripWorkflowInputSchemaVersion(parsedCurrentSchema)) !==
    JSON.stringify(stripWorkflowInputSchemaVersion(parsedNextSchema));

  return {
    ...parsedNextSchema,
    version: schemaChanged
      ? parsedCurrentSchema.version + 1
      : parsedCurrentSchema.version,
  };
}

@Injectable()
export class WorkflowPublishService {
  private readonly logger = new Logger(WorkflowPublishService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly redisCacheService: RedisCacheService,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
  ) {}

  async publish(
    workflowId: string,
    dto: PublishWorkflowDto,
    userId: string,
  ): Promise<PublishResult> {
    const publishResult = await this.withWorkflowWriteLock(
      workflowId,
      async (dbClient) => {
        const workflow = await this.findWorkflowOrThrow(dbClient, workflowId);

        if (workflow.status === 'archived') {
          throw new WorkflowArchivedException(workflowId);
        }

        const nodes: schema.ReactFlowNode[] = Array.isArray(workflow.nodes)
          ? workflow.nodes
          : [];
        if (nodes.length === 0) {
          throw new WorkflowPublishValidationException([
            '工作流必须包含至少一个节点才能发布',
          ]);
        }

        // 必须先看 raw 画布，否则 normalize 会把 llm-agent alias 成 agent 并丢失准确的迁移诊断。
        const legacyLlmAgentNodeIds = findLegacyLlmAgentNodeIds(nodes);
        if (legacyLlmAgentNodeIds.length > 0) {
          throw new WorkflowPublishLegacyLlmAgentException(
            legacyLlmAgentNodeIds,
          );
        }
        const edges: schema.ReactFlowEdge[] = Array.isArray(workflow.edges)
          ? workflow.edges
          : [];
        const normalizedGraph = normalizeWorkflowNodesAndEdges(nodes, edges);
        const warnings = this.validateEdgeTypeCompatibility(
          normalizedGraph.nodes,
          normalizedGraph.edges,
        );
        this.assertWorkflowAgentBindings(normalizedGraph.nodes);
        await this.assertNoSandboxWorkflowMcpConstraints(
          dbClient,
          workflow.tenantId,
          normalizedGraph.nodes,
          normalizedGraph.edges,
        );
        const autonomyPolicyInspection =
          await this.organizationAutonomyPolicyService.inspectWorkflowNodesAgainstPolicy(
            {
              tenantId: workflow.tenantId,
              workflowId: workflow.id,
              workflowName: workflow.name,
              nodes: normalizedGraph.nodes,
            },
          );

        if (autonomyPolicyInspection.violations.length > 0) {
          throw new WorkflowPublishAutonomyCapException(
            autonomyPolicyInspection.autonomyCap,
            autonomyPolicyInspection.violations,
          );
        }

        const publishedAt = new Date();
        const normalizedReleaseNotes = this.normalizeOptionalText(
          dto.releaseNotes,
        );
        const nextReleaseNumber = await this.getNextReleaseNumber(
          dbClient,
          workflowId,
        );

        await dbClient
          .update(schema.workflowVersions)
          .set({ publishedAt: null })
          .where(
            and(
              eq(schema.workflowVersions.workflowDefinitionId, workflowId),
              sql`${schema.workflowVersions.publishedAt} IS NOT NULL`,
            ),
          );

        let publishedVersion: typeof schema.workflowVersions.$inferSelect;

        if (dto.versionId) {
          const existingVersion = await this.findVersionOrThrow(
            dbClient,
            dto.versionId,
            workflowId,
          );
          const releaseNumber =
            this.extractReleaseNumber(
              existingVersion.snapshot,
              existingVersion.publishedAt,
            ) ?? nextReleaseNumber;

          const [updatedVersion] = await dbClient
            .update(schema.workflowVersions)
            .set({
              publishedAt,
              label: dto.label ?? existingVersion.label,
              snapshot: {
                ...existingVersion.snapshot,
                metadata: {
                  ...existingVersion.snapshot.metadata,
                  releaseNotes:
                    normalizedReleaseNotes ??
                    existingVersion.snapshot.metadata.releaseNotes ??
                    null,
                  releaseNumber,
                },
              },
            })
            .where(eq(schema.workflowVersions.id, dto.versionId))
            .returning();

          publishedVersion = updatedVersion;
        } else {
          const releaseNumber = nextReleaseNumber;

          const [createdVersion] = await dbClient
            .insert(schema.workflowVersions)
            .values({
              workflowDefinitionId: workflowId,
              tenantId: workflow.tenantId,
              versionNumber: await this.getNextVersionNumber(
                dbClient,
                workflowId,
              ),
              label: dto.label ?? null,
              snapshot: this.buildSnapshot(
                workflow,
                normalizedReleaseNotes,
                releaseNumber,
              ),
              publishedAt,
              createdBy: userId,
            })
            .returning();

          publishedVersion = createdVersion;
        }

        await dbClient
          .update(schema.workflowDefinitions)
          .set({
            status: 'published',
            publishedVersionId: publishedVersion.id,
            updatedBy: userId,
            updatedAt: publishedAt,
          })
          .where(eq(schema.workflowDefinitions.id, workflowId));

        return {
          tenantId: workflow.tenantId,
          version: publishedVersion,
          warnings,
        };
      },
    );

    await this.invalidatePublishedCache(publishResult.tenantId, workflowId);

    this.logger.log(
      JSON.stringify({
        action: 'workflow_published',
        workflowId,
        versionId: publishResult.version.id,
        versionNumber: publishResult.version.versionNumber,
        userId,
      }),
    );

    return {
      data: this.toResponseDto(publishResult.version),
      warnings: publishResult.warnings,
    };
  }

  private async findWorkflowOrThrow(
    dbClient: WorkflowDbClient,
    workflowId: string,
  ) {
    const [workflow] = await dbClient
      .select()
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    return workflow;
  }

  private async findVersionOrThrow(
    dbClient: WorkflowDbClient,
    versionId: string,
    workflowId: string,
  ) {
    const [version] = await dbClient
      .select()
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, versionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
      );

    if (!version) {
      throw new WorkflowVersionNotFoundException(versionId);
    }

    return version;
  }

  private async withWorkflowWriteLock<T>(
    workflowId: string,
    operation: (dbClient: WorkflowDbClient) => Promise<T>,
  ): Promise<T> {
    const currentTransaction = transactionStorage.getStore();

    if (currentTransaction) {
      const dbClient = currentTransaction.db as unknown as WorkflowDbClient;
      await this.lockWorkflowVersions(dbClient, workflowId);
      return operation(dbClient);
    }

    return this.db.transaction(async (tx) => {
      const dbClient = tx as unknown as WorkflowDbClient;
      await this.lockWorkflowVersions(dbClient, workflowId);
      return operation(dbClient);
    });
  }

  private async lockWorkflowVersions(
    dbClient: WorkflowDbClient,
    workflowId: string,
  ): Promise<void> {
    await dbClient.execute(
      sql`select pg_advisory_xact_lock(hashtext('workflow_versions'), hashtext(${workflowId}))`,
    );
  }

  private async getNextVersionNumber(
    dbClient: WorkflowDbClient,
    workflowId: string,
  ): Promise<number> {
    const [maxResult] = await dbClient
      .select({ maxVersion: max(schema.workflowVersions.versionNumber) })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowDefinitionId, workflowId));

    return (maxResult?.maxVersion ?? 0) + 1;
  }

  private async getNextReleaseNumber(
    dbClient: WorkflowDbClient,
    workflowId: string,
  ): Promise<number> {
    const versions = await dbClient
      .select({
        snapshot: schema.workflowVersions.snapshot,
        publishedAt: schema.workflowVersions.publishedAt,
      })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowDefinitionId, workflowId));

    const maxReleaseNumber = versions.reduce((currentMax, version) => {
      const releaseNumber = this.extractReleaseNumber(
        version.snapshot,
        version.publishedAt,
      );
      return Math.max(currentMax, releaseNumber ?? 0);
    }, 0);

    return maxReleaseNumber + 1;
  }

  private buildSnapshot(
    workflow: typeof schema.workflowDefinitions.$inferSelect,
    releaseNotes: string | null = null,
    releaseNumber: number | null = null,
  ): WorkflowVersionSnapshot {
    const normalizedGraph = normalizeWorkflowNodesAndEdges(
      workflow.nodes ?? [],
      workflow.edges ?? [],
    );

    return {
      nodes: normalizedGraph.nodes,
      edges: normalizedGraph.edges,
      viewport: workflow.viewport ?? null,
      inputSchema: workflow.inputSchema ?? null,
      metadata: {
        nodeCount: normalizedGraph.nodes.length,
        edgeCount: normalizedGraph.edges.length,
        createdFromVersion: workflow.version,
        releaseNotes,
        releaseNumber,
      },
    };
  }

  private validateEdgeTypeCompatibility(
    nodes: schema.ReactFlowNode[],
    edges: schema.ReactFlowEdge[],
  ): PublishWarning[] {
    const warnings: PublishWarning[] = [];

    for (const edge of edges) {
      if (!edge.sourceHandle || !edge.targetHandle) continue;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) continue;

      const sourcePortMeta = sourceNode.data?.portMappingMetadata as
        | { outputs?: Array<{ name: string; dataType: string }> }
        | undefined;
      const targetPortMeta = targetNode.data?.portMappingMetadata as
        | { inputs?: Array<{ name: string; dataType: string }> }
        | undefined;

      const sourcePort = sourcePortMeta?.outputs?.find(
        (p) => p.name === edge.sourceHandle,
      );
      const targetPort = targetPortMeta?.inputs?.find(
        (p) => p.name === edge.targetHandle,
      );
      if (!sourcePort?.dataType || !targetPort?.dataType) continue;

      if (sourcePort.dataType === targetPort.dataType) continue;
      if (targetPort.dataType === 'json') continue;

      warnings.push({
        code: 'PORT_TYPE_INCOMPATIBLE',
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePort: {
          name: sourcePort.name,
          dataType: sourcePort.dataType,
        },
        targetPort: {
          name: targetPort.name,
          dataType: targetPort.dataType,
        },
        message: `输出端口 "${sourcePort.name}" (${sourcePort.dataType}) 与输入端口 "${targetPort.name}" (${targetPort.dataType}) 类型不兼容`,
      });
    }

    return warnings;
  }

  /**
   * 发布前校验：每个 agent 节点都必须绑定一个已发布的 Agent Definition。
   *
   * 判据直接复用调度器的 `getWorkflowAgentDefinitionId()`，这是「节点是否可执行」的
   * 单一事实源。**不要**在这里另写一套字段列表：`agentVersionId` 不被调度器认作绑定，
   * 把它算进来会放行一个发布得掉、却在运行时判定未绑定而失败的节点。
   */
  private assertWorkflowAgentBindings(nodes: schema.ReactFlowNode[]): void {
    const violations = nodes.flatMap((node) => {
      if (node.type !== 'agent' && node.type !== 'chat-agent') {
        return [];
      }

      if (getWorkflowAgentDefinitionId(node.data ?? {})) {
        return [];
      }

      return [
        {
          nodeId: node.id,
          nodeLabel: this.getWorkflowNodeLabel(node) ?? node.id,
        },
      ];
    });

    if (violations.length > 0) {
      throw new WorkflowPublishAgentBindingException(violations);
    }
  }

  private async assertNoSandboxWorkflowMcpConstraints(
    dbClient: WorkflowDbClient,
    tenantId: string,
    nodes: schema.ReactFlowNode[],
    edges: schema.ReactFlowEdge[],
  ): Promise<void> {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const noSandboxAgentSources = new Map<
      string,
      { agentLabel: string; mcpServerConfigIds: Set<string> }
    >();

    for (const edge of edges) {
      const targetHandle = this.readEdgeHandle(edge, 'target');
      if (targetHandle !== 'tools-in' && targetHandle !== 'tools_in') {
        continue;
      }

      const targetNode = nodeMap.get(edge.target);
      if (
        !targetNode ||
        this.getWorkflowNodeType(targetNode) !== 'agent' ||
        this.getWorkflowAgentRuntimeMode(targetNode) !== 'no_sandbox'
      ) {
        continue;
      }

      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode || this.getWorkflowNodeType(sourceNode) !== 'mcp-tool') {
        continue;
      }

      const mcpServerConfigIds = this.getMcpToolNodeConfigIds(sourceNode);
      if (mcpServerConfigIds.length === 0) {
        continue;
      }

      const current =
        noSandboxAgentSources.get(targetNode.id) ??
        ({
          agentLabel: this.getWorkflowNodeLabel(targetNode) ?? targetNode.id,
          mcpServerConfigIds: new Set<string>(),
        } as const);

      for (const mcpServerConfigId of mcpServerConfigIds) {
        current.mcpServerConfigIds.add(mcpServerConfigId);
      }

      noSandboxAgentSources.set(targetNode.id, {
        agentLabel: current.agentLabel,
        mcpServerConfigIds: current.mcpServerConfigIds,
      });
    }

    if (noSandboxAgentSources.size === 0) {
      return;
    }

    const mcpServerConfigIds = Array.from(
      new Set(
        Array.from(noSandboxAgentSources.values()).flatMap((entry) =>
          Array.from(entry.mcpServerConfigIds),
        ),
      ),
    );

    if (mcpServerConfigIds.length === 0) {
      return;
    }

    const configs = await dbClient
      .select({
        id: schema.mcpServerConfigs.id,
        name: schema.mcpServerConfigs.name,
        transportType: schema.mcpServerConfigs.transportType,
      })
      .from(schema.mcpServerConfigs)
      .where(
        and(
          eq(schema.mcpServerConfigs.tenantId, tenantId),
          inArray(schema.mcpServerConfigs.id, mcpServerConfigIds),
        ),
      );

    const stdioConfigMap = new Map(
      configs
        .filter((config) => config.transportType === 'stdio')
        .map((config) => [config.id, config.name]),
    );

    if (stdioConfigMap.size === 0) {
      return;
    }

    const errors = Array.from(noSandboxAgentSources.values())
      .map((entry) => {
        const serverNames = Array.from(entry.mcpServerConfigIds)
          .map((id) => stdioConfigMap.get(id))
          .filter((name): name is string => typeof name === 'string');

        if (serverNames.length === 0) {
          return null;
        }

        return `无 sandbox Agent 节点「${entry.agentLabel}」不能连接 stdio MCP server：${serverNames.join('、')}`;
      })
      .filter((message): message is string => message !== null);

    if (errors.length > 0) {
      throw new WorkflowPublishValidationException(errors);
    }
  }

  private getWorkflowNodeType(node: schema.ReactFlowNode): string {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);

    return (
      this.readFirstString(
        runtimeNodeData.nodeType,
        runtimeNodeData.node_type,
        node.type,
      ) ?? ''
    );
  }

  private getWorkflowNodeLabel(node: schema.ReactFlowNode): string | undefined {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);

    return this.readFirstString(runtimeNodeData.label, runtimeNodeData.name);
  }

  private getWorkflowAgentRuntimeMode(
    node: schema.ReactFlowNode,
  ): 'sandbox' | 'no_sandbox' {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);
    const runtimeMode = this.readFirstString(
      runtimeNodeData.agentRuntimeMode,
      runtimeNodeData.agent_runtime_mode,
      runtimeNodeData.runtimeMode,
      runtimeNodeData.runtime_mode,
    );

    return runtimeMode === 'no_sandbox' ? 'no_sandbox' : 'sandbox';
  }

  private getMcpToolNodeConfigIds(node: schema.ReactFlowNode): string[] {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);
    const mcpServerConfigId = this.readFirstString(
      runtimeNodeData.mcpServerConfigId,
      runtimeNodeData.mcp_server_config_id,
    );

    return mcpServerConfigId ? [mcpServerConfigId] : [];
  }

  private getRuntimeNodeData(
    nodeData: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const safeNodeData =
      nodeData && typeof nodeData === 'object' ? nodeData : {};
    const config =
      'config' in safeNodeData &&
      safeNodeData.config &&
      typeof safeNodeData.config === 'object'
        ? (safeNodeData.config as Record<string, unknown>)
        : {};

    return { ...config, ...safeNodeData };
  }

  private readEdgeHandle(
    edge: schema.ReactFlowEdge,
    handleKind: 'source' | 'target',
  ): string | undefined {
    const rawEdge = edge as unknown as Record<string, unknown>;

    return this.readFirstString(
      handleKind === 'source' ? edge.sourceHandle : edge.targetHandle,
      rawEdge[`${handleKind}_handle`],
    );
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

  private extractReleaseNumber(
    snapshot?: WorkflowVersionSnapshot | null,
    publishedAt?: Date | null,
  ): number | null {
    const releaseNumber = snapshot?.metadata?.releaseNumber;

    if (
      typeof releaseNumber === 'number' &&
      Number.isInteger(releaseNumber) &&
      releaseNumber > 0
    ) {
      return releaseNumber;
    }

    if (publishedAt) {
      return 1;
    }

    return null;
  }


  private getPublishedCacheKey(tenantId: string, workflowId: string): string {
    return redisKey(tenantId, RedisDomain.CACHE, `wf:published:${workflowId}`);
  }

  private async invalidatePublishedCache(
    tenantId: string,
    workflowId: string,
  ): Promise<void> {
    const cacheKey = this.getPublishedCacheKey(tenantId, workflowId);
    await this.redisCacheService.del(cacheKey);
  }

  private toResponseDto(
    version: typeof schema.workflowVersions.$inferSelect,
  ): VersionResponseDto {
    const releaseNumber = this.extractReleaseNumber(
      version.snapshot,
      version.publishedAt,
    );
    const normalizedGraph = normalizeWorkflowNodesAndEdges(
      version.snapshot.nodes,
      version.snapshot.edges,
    );

    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      releaseNumber,
      label: version.label ?? null,
      snapshot: {
        ...version.snapshot,
        nodes: normalizedGraph.nodes,
        edges: normalizedGraph.edges,
      },
      publishedAt: version.publishedAt?.toISOString() ?? null,
      archivedAt: version.archivedAt?.toISOString() ?? null,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
