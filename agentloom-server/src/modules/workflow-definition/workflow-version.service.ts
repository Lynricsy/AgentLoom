import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  max,
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
import type { AgentRuntimeMode } from '../../database/schema/agent-definitions.schema';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { TemplateService } from '../template/template.service';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';
import { generateSlug, appendSlugSuffix } from '../organization/slug.utils';
import { cloneDefinitionWithNewIds } from './utils/clone-template.utils';
import { normalizeWorkflowNodesAndEdges } from './utils/normalize-workflow-graph.utils';
import { sanitizeDefinition } from './utils/sanitize-export.utils';
import type { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import type { WorkflowInstallBindings } from './dto/workflow-install-bindings.dto';
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

interface ImportedWorkflowModelCacheContext {
  sourceModels: Map<string, ImportedWorkflowModelRecord | null>;
  targetModels: ImportedWorkflowModelRecord[] | null;
}

interface ImportedWorkflowAgentCloneContext
  extends ImportedWorkflowModelCacheContext {
  importSource: 'marketplace' | 'share';
  importReference: string;
  targetTenantId: string;
  targetUserId: string;
  clonedAgents: Map<string, ImportedWorkflowAgentCloneResult>;
  activeAgentCloneStack: Set<string>;
  installBindings: WorkflowInstallBindings;
}

interface WorkflowInstallLlmDependency {
  dependencyId: string;
  nodeId: string;
  nodeType: 'llm-model';
  nodeLabel: string | null;
  location: string;
  provider: string;
  modelId: string;
  modelName: string;
  modelType: schema.LlmModelConfig['modelType'];
  baseUrl: string | null;
  defaultModelConfigId: string | null;
}

interface WorkflowInstallWorkspaceDependency {
  dependencyId: string;
  nodeId: string;
  nodeType: 'workspace';
  nodeLabel: string | null;
  location: string;
}

interface WorkflowInstallSandboxDependency {
  dependencyId: string;
  nodeId: string;
  nodeType: 'sandbox';
  nodeLabel: string | null;
  location: string;
  linkedWorkspaceDependencyId: string | null;
  required: boolean;
}

interface WorkflowInstallBlocker {
  code: string;
  location: string;
  message: string;
}

interface WorkflowImportPreflightResult {
  llmModels: WorkflowInstallLlmDependency[];
  workspaces: WorkflowInstallWorkspaceDependency[];
  sandboxes: WorkflowInstallSandboxDependency[];
  blockers: WorkflowInstallBlocker[];
}

interface WorkflowImportDependencyContext
  extends ImportedWorkflowModelCacheContext {
  sourceTenantId: string;
  targetTenantId: string;
  visitedAgents: Set<string>;
  activeAgentStack: Set<string>;
}

interface ImportedWorkflowModelDescriptor {
  sourceModel: ImportedWorkflowModelRecord | null;
  providerSlug: string | null;
  providerName: string | null;
  providerApiProtocol: string | null;
  modelId: string | null;
  modelName: string | null;
  modelType: schema.LlmModelConfig['modelType'];
  baseUrl: string | null;
}

interface ImportedWorkflowSourceDefinition {
  nodes: schema.ReactFlowNode[];
  edges: schema.ReactFlowEdge[];
  viewport: schema.ReactFlowViewport;
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

function clearNodeConfigField(
  node: schema.ReactFlowNode,
  key: string,
): void {
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
export class WorkflowVersionService {
  private readonly logger = new Logger(WorkflowVersionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly redisCacheService: RedisCacheService,
    private readonly templateService: TemplateService,
    private readonly shareService: ShareService,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  // ─── 查询工作流定义（列表 / 详情） ───────────────────────────────

  /**
   * 列表页/详情页专用列选择（排除 nodes/edges/viewport 大字段）
   */
  private get definitionListColumns() {
    return {
      id: schema.workflowDefinitions.id,
      tenantId: schema.workflowDefinitions.tenantId,
      name: schema.workflowDefinitions.name,
      slug: schema.workflowDefinitions.slug,
      description: schema.workflowDefinitions.description,
      icon: schema.workflowDefinitions.icon,
      status: schema.workflowDefinitions.status,
      version: schema.workflowDefinitions.version,
      publishedVersionId: schema.workflowDefinitions.publishedVersionId,
      metadata: schema.workflowDefinitions.metadata,
      createdBy: schema.workflowDefinitions.createdBy,
      updatedBy: schema.workflowDefinitions.updatedBy,
      createdAt: schema.workflowDefinitions.createdAt,
      updatedAt: schema.workflowDefinitions.updatedAt,
    };
  }

  async findAllDefinitions(
    query: ListWorkflowDefinitionsQueryDto,
  ): Promise<WorkflowDefinitionListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { status, search, sourceKind, sort, order } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (status) {
      conditions.push(eq(schema.workflowDefinitions.status, status));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(schema.workflowDefinitions.name, searchTerm),
          ilike(schema.workflowDefinitions.description, searchTerm),
        ),
      );
    }

    if (sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'workflow_definition',
          resourceIdColumn: schema.workflowDefinitions.id,
        });

      conditions.push(
        sourceKind === 'share_imported'
          ? importedExistsCondition
          : not(importedExistsCondition),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumnMap = {
      updatedAt: schema.workflowDefinitions.updatedAt,
      createdAt: schema.workflowDefinitions.createdAt,
      name: schema.workflowDefinitions.name,
    } as const;
    const sortColumn = sortColumnMap[sort ?? 'updatedAt'];
    const orderFn = order === 'asc' ? asc : desc;

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select({
          ...this.definitionListColumns,
          publishedSnapshot: schema.workflowVersions.snapshot,
          publishedAt: schema.workflowVersions.publishedAt,
        })
        .from(schema.workflowDefinitions)
        .leftJoin(
          schema.workflowVersions,
          eq(
            schema.workflowDefinitions.publishedVersionId,
            schema.workflowVersions.id,
          ),
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowDefinitions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'workflow_definition',
      data.map((row) => row.id),
    );

    return {
      data: data.map(({ publishedSnapshot, publishedAt, ...workflow }) =>
        serializeWorkflowDefinition(
          {
            ...workflow,
            publishedReleaseNumber: this.extractReleaseNumber(
              publishedSnapshot,
              publishedAt ?? null,
            ),
          },
          {
            resourceSourceKind: sourceKindMap.get(workflow.id) ?? 'manual',
          },
        ),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findDefinitionById(
    workflowId: string,
  ): Promise<WorkflowDefinitionResponseDto> {
    const [workflow] = await this.tenantDb
      .select(this.definitionListColumns)
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    const publishedReleaseNumber = await this.getPublishedReleaseNumber(
      workflowId,
      workflow.publishedVersionId,
    );
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'workflow_definition',
      [workflowId],
    );

    return serializeWorkflowDefinition(
      {
        ...workflow,
        publishedReleaseNumber,
      },
      {
        resourceSourceKind: sourceKindMap.get(workflowId) ?? 'manual',
      },
    );
  }

  async findDefinitionDetailById(
    workflowId: string,
  ): Promise<WorkflowDefinitionDetailResponseDto> {
    const workflow = await this.findWorkflowOrThrow(this.tenantDb, workflowId);
    const publishedReleaseNumber = await this.getPublishedReleaseNumber(
      workflowId,
      workflow.publishedVersionId,
    );
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'workflow_definition',
      [workflowId],
    );

    return serializeWorkflowDefinitionDetail(
      {
        ...workflow,
        publishedReleaseNumber,
      },
      {
        resourceSourceKind: sourceKindMap.get(workflowId) ?? 'manual',
      },
    );
  }

  async getInputSchema(
    workflowId: string,
    tenantId: string,
  ): Promise<WorkflowInputSchema> {
    void tenantId;

    const workflow = await this.findWorkflowOrThrow(this.tenantDb, workflowId);

    if (workflow.status !== 'published') {
      throw new WorkflowNotPublishedException(workflowId);
    }

    if (workflow.inputSchema == null) {
      return createDefaultWorkflowInputSchema();
    }

    return workflowInputSchemaSchema.parse(workflow.inputSchema);
  }

  async exportWorkflow(
    tenantId: string,
    workflowId: string,
  ): Promise<WorkflowExportDto> {
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      );

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    let definition = {
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
      viewport: workflow.viewport ?? DEFAULT_VIEWPORT,
    };
    let inputSchema = workflow.inputSchema ?? null;

    if (workflow.status === 'published' && workflow.publishedVersionId) {
      const [publishedVersion] = await this.tenantDb
        .select({ snapshot: schema.workflowVersions.snapshot })
        .from(schema.workflowVersions)
        .where(
          and(
            eq(schema.workflowVersions.id, workflow.publishedVersionId),
            eq(schema.workflowVersions.workflowDefinitionId, workflowId),
            eq(schema.workflowVersions.tenantId, tenantId),
          ),
        );

      if (publishedVersion) {
        definition = {
          nodes: publishedVersion.snapshot.nodes ?? [],
          edges: publishedVersion.snapshot.edges ?? [],
          viewport: publishedVersion.snapshot.viewport ?? DEFAULT_VIEWPORT,
        };
        inputSchema = publishedVersion.snapshot.inputSchema ?? inputSchema;
      }
    }

    const normalizedDefinition = normalizeWorkflowNodesAndEdges(
      definition.nodes,
      definition.edges,
    );

    return {
      schema_version: WORKFLOW_EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      workflow: {
        name: workflow.name,
        description: workflow.description,
        definition: sanitizeDefinition({
          nodes: normalizedDefinition.nodes,
          edges: normalizedDefinition.edges,
          viewport: definition.viewport,
        }),
        input_schema: inputSchema,
      },
    };
  }

  // ─── 创建工作流定义 ─────────────────────────────────────────────

  private static readonly MAX_SLUG_RETRIES = 3;

  async create(
    tenantId: string,
    userId: string,
    dto: CreateWorkflowDefinitionDto,
  ): Promise<WorkflowDefinition> {
    let nodes: schema.ReactFlowNode[] = [];
    let edges: schema.ReactFlowEdge[] = [];
    let viewport: schema.ReactFlowViewport = {
      x: 0,
      y: 0,
      zoom: 1,
    };
    let inputSchema: WorkflowInputSchema | null = null;
    let metadata: Record<string, unknown> = {};
    let shareImportRecord: AccessibleWorkflowShareTokenRecord | null = null;
    let importedSourceDefinition: ImportedWorkflowSourceDefinition | null = null;
    let importSourceTenantId: string | null = null;
    let importSourceType: 'marketplace' | 'share' | null = null;
    let importSourceReference: string | null = null;

    if (dto.template_slug) {
      const template = await this.templateService.findBySlug(dto.template_slug);
      const cloned = cloneDefinitionWithNewIds({
        nodes: template.definition.nodes,
        edges: template.definition.edges,
        viewport: template.definition.viewport,
      });
      nodes = cloned.nodes;
      edges = cloned.edges;
      viewport = cloned.viewport;
      inputSchema = template.definition.inputSchema
        ? workflowInputSchemaSchema.parse(template.definition.inputSchema)
        : null;
      metadata = {
        cloned_from_template: {
          templateSlug: dto.template_slug,
          templateName: template.name,
          clonedAt: new Date().toISOString(),
        },
      };
    } else if (dto.marketplace_listing_id) {
      const [listing] = await this.db
        .select({
          id: schema.marketplaceListings.id,
          title: schema.marketplaceListings.title,
          sourceTenantId: schema.workflowDefinitions.tenantId,
          snapshot: schema.workflowVersions.snapshot,
        })
        .from(schema.marketplaceListings)
        .innerJoin(
          schema.workflowVersions,
          eq(
            schema.marketplaceListings.workflowVersionId,
            schema.workflowVersions.id,
          ),
        )
        .innerJoin(
          schema.workflowDefinitions,
          eq(
            schema.workflowVersions.workflowDefinitionId,
            schema.workflowDefinitions.id,
          ),
        )
        .where(
          and(
            eq(schema.marketplaceListings.id, dto.marketplace_listing_id),
            eq(schema.marketplaceListings.status, 'listed'),
          ),
        );

      if (!listing) {
        throw new MarketplaceListingNotFoundException(
          dto.marketplace_listing_id,
        );
      }

      const snapshot = listing.snapshot;
      importedSourceDefinition = {
        nodes: cloneJson(snapshot.nodes),
        edges: cloneJson(snapshot.edges),
        viewport: cloneJson(snapshot.viewport ?? DEFAULT_VIEWPORT),
      };
      importSourceTenantId = listing.sourceTenantId;
      importSourceType = 'marketplace';
      importSourceReference = listing.id;
      inputSchema = snapshot.inputSchema
        ? workflowInputSchemaSchema.parse(snapshot.inputSchema)
        : null;
      metadata = {
        cloned_from_marketplace: {
          listingId: listing.id,
          listingTitle: listing.title,
          clonedAt: new Date().toISOString(),
        },
      };
    } else if (dto.share_token) {
      const share = await this.shareService.getShareByToken(dto.share_token);
      shareImportRecord = share;

      if (share.shareType !== 'copyable') {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/share-copy-not-allowed',
          title: '分享链接不支持复制',
          status: HttpStatus.CONFLICT,
          detail: `分享链接 ${dto.share_token} 不支持复制`,
        });
      }

      const snapshot = share.snapshot;
      importedSourceDefinition = {
        nodes: cloneJson(snapshot.nodes),
        edges: cloneJson(snapshot.edges),
        viewport: cloneJson(snapshot.viewport ?? DEFAULT_VIEWPORT),
      };
      importSourceTenantId = share.tenantId;
      importSourceType = 'share';
      importSourceReference = share.shareToken;
      inputSchema = snapshot.inputSchema
        ? workflowInputSchemaSchema.parse(snapshot.inputSchema)
        : null;
      metadata = {
        cloned_from_share: {
          shareToken: dto.share_token,
          workflowName: share.workflowName,
          clonedAt: new Date().toISOString(),
        },
      };
    }

    let slug = generateSlug(dto.name);

    for (
      let attempt = 0;
      attempt <= WorkflowVersionService.MAX_SLUG_RETRIES;
      attempt++
    ) {
      try {
        const created = await this.tenantDb.transaction(async (tx) => {
          let nextNodes = nodes;
          let nextEdges = edges;
          let nextViewport = viewport;

          if (
            importedSourceDefinition &&
            importSourceTenantId &&
            importSourceType &&
            importSourceReference
          ) {
            const prepared =
              await this.prepareImportedWorkflowDefinitionForCreate({
                sourceDefinition: importedSourceDefinition,
                sourceTenantId: importSourceTenantId,
                targetTenantId: tenantId,
                targetUserId: userId,
                importSource: importSourceType,
                importReference: importSourceReference,
                installBindings: this.normalizeInstallBindings(
                  dto.installBindings,
                ),
                dbClient: tx,
              });

            nextNodes = prepared.nodes;
            nextEdges = prepared.edges;
            nextViewport = prepared.viewport;
          }

          const [row] = await tx
            .insert(schema.workflowDefinitions)
            .values({
              tenantId,
              name: dto.name,
              slug,
              description: dto.description ?? null,
              icon: dto.icon ?? null,
              nodes: nextNodes,
              edges: nextEdges,
              viewport: nextViewport,
              inputSchema,
              metadata,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();

          return row;
        });

        if (dto.share_token) {
          await this.shareService.incrementCopyCount(dto.share_token);
        }

        if (shareImportRecord) {
          await this.resourceSourceService.recordImportedResources(
            tenantId,
            userId,
            [
              {
                resourceType: 'workflow_definition',
                resourceId: created.id,
                sourceShareType: 'workflow',
                sourceShareId: shareImportRecord.id,
                sourceShareToken: shareImportRecord.shareToken,
                sourceResourceType: 'workflow_definition',
                sourceResourceId: shareImportRecord.workflowDefinitionId,
                sourceResourceTitle: shareImportRecord.workflowName,
              },
            ],
          );
        }

        this.logger.log(
          JSON.stringify({
            action: 'workflow_created',
            workflowId: created.id,
            slug,
            fromTemplate: dto.template_slug ?? null,
            fromMarketplace: dto.marketplace_listing_id ?? null,
            fromShare: dto.share_token ?? null,
          }),
        );

        return created;
      } catch (error: unknown) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (
          !isUniqueViolation ||
          attempt === WorkflowVersionService.MAX_SLUG_RETRIES
        ) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: slug retry loop exhausted');
  }

  async buildImportPreflight(params: {
    sourceDefinition: ImportedWorkflowSourceDefinition;
    sourceTenantId: string;
    targetTenantId: string;
  }): Promise<WorkflowImportPreflightResult> {
    const result: WorkflowImportPreflightResult = {
      llmModels: [],
      workspaces: [],
      sandboxes: [],
      blockers: [],
    };
    const context: WorkflowImportDependencyContext = {
      sourceTenantId: params.sourceTenantId,
      targetTenantId: params.targetTenantId,
      sourceModels: new Map(),
      targetModels: null,
      visitedAgents: new Set(),
      activeAgentStack: new Set(),
    };
    const sourceNodes = cloneJson(params.sourceDefinition.nodes);
    const workspaceDependencyIdsBySourceWorkspaceId =
      this.collectWorkflowWorkspacePreflightDependencies(sourceNodes, result);
    const linkedWorkspaceDependencyIdsBySandboxNodeId =
      this.buildWorkflowSandboxLinkedWorkspaceDependencyMap(
        sourceNodes,
        params.sourceDefinition.edges,
      );

    for (const node of sourceNodes) {
      const nodeType = this.getWorkflowNodeType(node);
      const location = this.buildWorkflowNodeLocation(node);

      switch (nodeType) {
        case 'llm-model': {
          try {
            const dependency = await this.buildWorkflowModelInstallDependency({
              node,
              dependencyId: this.buildWorkflowModelDependencyId(node.id),
              location,
              sourceTenantId: params.sourceTenantId,
              targetTenantId: params.targetTenantId,
              context,
              dbClient: this.db,
            });
            if (dependency) {
              result.llmModels.push(dependency);
            }
          } catch (error) {
            if (error instanceof DomainException) {
              result.blockers.push({
                code: 'WORKFLOW_IMPORT_MODEL_UNRESOLVABLE',
                location,
                message: error.detail,
              });
              break;
            }

            throw error;
          }
          break;
        }

        case 'sandbox':
          this.collectWorkflowSandboxPreflightDependency(
            node,
            workspaceDependencyIdsBySourceWorkspaceId,
            linkedWorkspaceDependencyIdsBySandboxNodeId,
            result,
          );
          break;

        case 'agent': {
          const runtimeNodeData = this.getRuntimeNodeData(node.data);
          const sourceAgentDefinitionId = this.readFirstString(
            runtimeNodeData.agentDefinitionId,
            runtimeNodeData.agent_definition_id,
            runtimeNodeData.selectedAgentId,
            runtimeNodeData.selected_agent_id,
          );
          if (!sourceAgentDefinitionId) {
            result.blockers.push({
              code: 'WORKFLOW_AGENT_BINDING_MISSING',
              location,
              message: `节点「${this.getNodeDisplayName(node)}」缺少已发布 Agent 绑定，当前无法直接安装。`,
            });
            break;
          }

          await this.collectImportedWorkflowAgentDependencies({
            sourceTenantId: params.sourceTenantId,
            sourceAgentDefinitionId,
            sourceAgentVersionId: this.readFirstString(
              runtimeNodeData.agentVersionId,
              runtimeNodeData.agent_version_id,
            ),
            agentPath: [this.getNodeDisplayName(node)],
            result,
            context,
          });
          break;
        }

        default:
          break;
      }
    }

    return result;
  }

  private normalizeInstallBindings(
    bindings?: WorkflowInstallBindings | null,
  ): WorkflowInstallBindings {
    return {
      llmModels: bindings?.llmModels ?? {},
      workspaces: bindings?.workspaces ?? {},
      sandboxes: bindings?.sandboxes ?? {},
    };
  }

  private buildWorkflowModelDependencyId(nodeId: string): string {
    return `workflow:llm:${nodeId}`;
  }

  private buildWorkflowWorkspaceDependencyId(nodeId: string): string {
    return `workflow:workspace:${nodeId}`;
  }

  private buildWorkflowRestoreWorkspaceDependencyId(
    sourceWorkspaceId: string,
  ): string {
    return `workflow:workspace-restore:${sourceWorkspaceId}`;
  }

  private buildWorkflowSandboxDependencyId(nodeId: string): string {
    return `workflow:sandbox:${nodeId}`;
  }

  private buildImportedAgentModelDependencyId(
    agentDefinitionId: string,
    sourceVersionId: string,
    nodeId: string,
  ): string {
    return `agent:${agentDefinitionId}:${sourceVersionId}:llm:${nodeId}`;
  }

  private getNodeDisplayName(node: schema.ReactFlowNode): string {
    return this.getWorkflowNodeLabel(node) ?? this.getWorkflowNodeType(node) ?? node.id;
  }

  private buildWorkflowNodeLocation(node: schema.ReactFlowNode): string {
    return `工作流 / ${this.getNodeDisplayName(node)}`;
  }

  private buildImportedAgentNodeLocation(
    agentPath: string[],
    node: schema.ReactFlowNode,
  ): string {
    return ['工作流', ...agentPath, this.getNodeDisplayName(node)].join(' / ');
  }

  private setNodeLabel(node: schema.ReactFlowNode, label: string): void {
    const nodeData = (asRecord(node.data) ?? {}) as Record<string, unknown>;
    nodeData.label = label;
    node.data = nodeData;
  }

  private collectWorkflowWorkspacePreflightDependencies(
    nodes: schema.ReactFlowNode[],
    result: WorkflowImportPreflightResult,
  ): Map<string, string> {
    const workspaceDependencyIdsBySourceWorkspaceId = new Map<string, string>();

    for (const node of nodes) {
      if (this.getWorkflowNodeType(node) !== 'workspace') {
        continue;
      }

      const dependencyId = this.buildWorkflowWorkspaceDependencyId(node.id);
      result.workspaces.push({
        dependencyId,
        nodeId: node.id,
        nodeType: 'workspace',
        nodeLabel: this.getWorkflowNodeLabel(node) ?? null,
        location: this.buildWorkflowNodeLocation(node),
      });

      const runtimeNodeData = this.getRuntimeNodeData(node.data);
      const sourceWorkspaceId = this.readFirstString(
        runtimeNodeData.workspaceId,
        runtimeNodeData.workspace_id,
      );
      if (sourceWorkspaceId) {
        workspaceDependencyIdsBySourceWorkspaceId.set(
          sourceWorkspaceId,
          dependencyId,
        );
      }
    }

    return workspaceDependencyIdsBySourceWorkspaceId;
  }

  private collectWorkflowSandboxPreflightDependency(
    node: schema.ReactFlowNode,
    workspaceDependencyIdsBySourceWorkspaceId: Map<string, string>,
    linkedWorkspaceDependencyIdsBySandboxNodeId: Map<string, string>,
    result: WorkflowImportPreflightResult,
  ): void {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);
    const lifecycleMode = this.readFirstString(
      runtimeNodeData.lifecycleMode,
      runtimeNodeData.lifecycle_mode,
    );
    const persistentSandboxId = this.readFirstString(
      runtimeNodeData.persistentSandboxId,
      runtimeNodeData.persistent_sandbox_id,
    );
    const requiresPersistentBinding =
      lifecycleMode === 'persistent' || Boolean(persistentSandboxId);

    const restoreWorkspaceId = this.readFirstString(
      runtimeNodeData.restoreWorkspaceId,
      runtimeNodeData.restore_workspace_id,
    );
    let linkedWorkspaceDependencyId =
      linkedWorkspaceDependencyIdsBySandboxNodeId.get(node.id) ?? null;

    if (restoreWorkspaceId) {
      linkedWorkspaceDependencyId =
        linkedWorkspaceDependencyId ??
        workspaceDependencyIdsBySourceWorkspaceId.get(restoreWorkspaceId) ??
        this.buildWorkflowRestoreWorkspaceDependencyId(restoreWorkspaceId);

      if (
        !result.workspaces.some(
          (dependency) =>
            dependency.dependencyId === linkedWorkspaceDependencyId,
        )
      ) {
        result.workspaces.push({
          dependencyId: linkedWorkspaceDependencyId,
          nodeId: node.id,
          nodeType: 'workspace',
          nodeLabel: this.getWorkflowNodeLabel(node) ?? null,
          location: `${this.buildWorkflowNodeLocation(node)} / 恢复工作区`,
        });
      }
    }

    if (!requiresPersistentBinding && !linkedWorkspaceDependencyId) {
      return;
    }

    result.sandboxes.push({
      dependencyId: this.buildWorkflowSandboxDependencyId(node.id),
      nodeId: node.id,
      nodeType: 'sandbox',
      nodeLabel: this.getWorkflowNodeLabel(node) ?? null,
      location: this.buildWorkflowNodeLocation(node),
      linkedWorkspaceDependencyId,
      required: requiresPersistentBinding,
    });
  }

  private buildWorkflowWorkspaceDependencyMap(
    nodes: schema.ReactFlowNode[],
  ): Map<string, string> {
    const workspaceDependencyIdsBySourceWorkspaceId = new Map<string, string>();

    for (const node of nodes) {
      if (this.getWorkflowNodeType(node) !== 'workspace') {
        continue;
      }

      const runtimeNodeData = this.getRuntimeNodeData(node.data);
      const sourceWorkspaceId = this.readFirstString(
        runtimeNodeData.workspaceId,
        runtimeNodeData.workspace_id,
      );

      if (sourceWorkspaceId) {
        workspaceDependencyIdsBySourceWorkspaceId.set(
          sourceWorkspaceId,
          this.buildWorkflowWorkspaceDependencyId(node.id),
        );
      }
    }

    return workspaceDependencyIdsBySourceWorkspaceId;
  }

  private buildWorkflowSandboxLinkedWorkspaceDependencyMap(
    nodes: schema.ReactFlowNode[],
    edges: schema.ReactFlowEdge[],
  ): Map<string, string> {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const linkedWorkspaceDependencyIdsBySandboxNodeId = new Map<string, string>();

    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode || !targetNode) {
        continue;
      }

      if (
        this.getWorkflowNodeType(sourceNode) !== 'workspace' ||
        this.getWorkflowNodeType(targetNode) !== 'sandbox'
      ) {
        continue;
      }

      if (!linkedWorkspaceDependencyIdsBySandboxNodeId.has(targetNode.id)) {
        linkedWorkspaceDependencyIdsBySandboxNodeId.set(
          targetNode.id,
          this.buildWorkflowWorkspaceDependencyId(sourceNode.id),
        );
      }
    }

    return linkedWorkspaceDependencyIdsBySandboxNodeId;
  }

  private async loadSelectedWorkspaceBindings(params: {
    targetTenantId: string;
    installBindings: WorkflowInstallBindings;
    dbClient: WorkflowDbClient;
  }): Promise<Map<string, Pick<schema.WorkspaceSnapshot, 'id' | 'name'>>> {
    const workspaceIds = Array.from(
      new Set(
        Object.values(params.installBindings.workspaces).filter(
          (value): value is string => value.trim().length > 0,
        ),
      ),
    );

    if (workspaceIds.length === 0) {
      return new Map();
    }

    const rows = await params.dbClient
      .select({
        id: schema.workspaceSnapshots.id,
        name: schema.workspaceSnapshots.name,
        status: schema.workspaceSnapshots.status,
      })
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.tenantId, params.targetTenantId),
          inArray(schema.workspaceSnapshots.id, workspaceIds),
        ),
      );

    const workspaceMap = new Map(
      rows.map((row) => [row.id, { id: row.id, name: row.name }]),
    );

    for (const row of rows) {
      if (row.status !== 'ready') {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-workspace-invalid',
          title: '工作区不可用',
          status: HttpStatus.CONFLICT,
          detail: `工作区「${row.name}」当前状态为 ${row.status}，无法作为安装绑定使用`,
        });
      }
    }

    for (const workspaceId of workspaceIds) {
      if (!workspaceMap.has(workspaceId)) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-workspace-not-found',
          title: '工作区不存在',
          status: HttpStatus.NOT_FOUND,
          detail: `未找到工作区 ${workspaceId}`,
        });
      }
    }

    return workspaceMap;
  }

  private async loadSelectedSandboxBindings(params: {
    targetTenantId: string;
    installBindings: WorkflowInstallBindings;
    dbClient: WorkflowDbClient;
  }): Promise<
    Map<string, Pick<schema.SandboxSession, 'id' | 'status' | 'config'>>
  > {
    const sandboxIds = Array.from(
      new Set(
        Object.values(params.installBindings.sandboxes).filter(
          (value): value is string => value.trim().length > 0,
        ),
      ),
    );

    if (sandboxIds.length === 0) {
      return new Map();
    }

    const rows = await params.dbClient
      .select({
        id: schema.sandboxSessions.id,
        status: schema.sandboxSessions.status,
        config: schema.sandboxSessions.config,
      })
      .from(schema.sandboxSessions)
      .where(
        and(
          eq(schema.sandboxSessions.tenantId, params.targetTenantId),
          inArray(schema.sandboxSessions.id, sandboxIds),
        ),
      );

    const sandboxMap = new Map(
      rows.map((row) => [row.id, { id: row.id, status: row.status, config: row.config }]),
    );
    const allowedStatuses = new Set(['ready', 'busy', 'stopped']);

    for (const row of rows) {
      if (row.config.lifecycleMode !== 'persistent') {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-sandbox-invalid',
          title: '沙箱不是持久化资源',
          status: HttpStatus.CONFLICT,
          detail: `沙箱 ${row.id} 不是持久化沙箱，无法作为安装绑定使用`,
        });
      }

      if (!allowedStatuses.has(row.status)) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-sandbox-status-invalid',
          title: '沙箱不可用',
          status: HttpStatus.CONFLICT,
          detail: `沙箱 ${row.id} 当前状态为 ${row.status}，无法作为安装绑定使用`,
        });
      }
    }

    for (const sandboxId of sandboxIds) {
      if (!sandboxMap.has(sandboxId)) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-sandbox-not-found',
          title: '持久沙箱不存在',
          status: HttpStatus.NOT_FOUND,
          detail: `未找到持久沙箱 ${sandboxId}`,
        });
      }
    }

    return sandboxMap;
  }

  private async prepareImportedWorkflowDefinitionForCreate(params: {
    sourceDefinition: ImportedWorkflowSourceDefinition;
    sourceTenantId: string;
    targetTenantId: string;
    targetUserId: string;
    importSource: 'marketplace' | 'share';
    importReference: string;
    installBindings: WorkflowInstallBindings;
    dbClient: WorkflowDbClient;
  }): Promise<ImportedWorkflowSourceDefinition> {
    const nodes = cloneJson(params.sourceDefinition.nodes);
    const edges = cloneJson(params.sourceDefinition.edges);
    const viewport = cloneJson(params.sourceDefinition.viewport);
    const installBindings = this.normalizeInstallBindings(params.installBindings);
    const workspaceDependencyIdsBySourceWorkspaceId =
      this.buildWorkflowWorkspaceDependencyMap(nodes);
    const linkedWorkspaceDependencyIdsBySandboxNodeId =
      this.buildWorkflowSandboxLinkedWorkspaceDependencyMap(nodes, edges);
    const workspaceBindings = await this.loadSelectedWorkspaceBindings({
      targetTenantId: params.targetTenantId,
      installBindings,
      dbClient: params.dbClient,
    });
    const sandboxBindings = await this.loadSelectedSandboxBindings({
      targetTenantId: params.targetTenantId,
      installBindings,
      dbClient: params.dbClient,
    });
    const cloneContext: ImportedWorkflowAgentCloneContext = {
      importSource: params.importSource,
      importReference: params.importReference,
      targetTenantId: params.targetTenantId,
      targetUserId: params.targetUserId,
      clonedAgents: new Map(),
      sourceModels: new Map(),
      targetModels: null,
      activeAgentCloneStack: new Set(),
      installBindings,
    };

    for (const node of nodes) {
      switch (this.getWorkflowNodeType(node)) {
        case 'workspace':
          this.applyInstalledWorkflowWorkspaceBinding(
            node,
            installBindings,
            workspaceBindings,
          );
          break;

        case 'sandbox':
          this.applyInstalledWorkflowSandboxBinding(
            node,
            installBindings,
            sandboxBindings,
            workspaceDependencyIdsBySourceWorkspaceId,
            linkedWorkspaceDependencyIdsBySandboxNodeId,
          );
          break;

        case 'llm-model':
          await this.remapImportedWorkflowModelNode({
            node,
            dependencyId: this.buildWorkflowModelDependencyId(node.id),
            runtimeNodeData: this.getRuntimeNodeData(node.data),
            sourceTenantId: params.sourceTenantId,
            targetTenantId: params.targetTenantId,
            context: cloneContext,
            dbClient: params.dbClient,
            location: this.buildWorkflowNodeLocation(node),
          });
          break;

        default:
          break;
      }
    }

    await this.cloneImportedWorkflowAgentDependencies({
      nodes,
      sourceTenantId: params.sourceTenantId,
      context: cloneContext,
      dbClient: params.dbClient,
    });

    const cloned = cloneDefinitionWithNewIds({ nodes, edges, viewport });
    return {
      nodes: cloned.nodes,
      edges: cloned.edges,
      viewport: cloned.viewport,
    };
  }

  private applyInstalledWorkflowWorkspaceBinding(
    node: schema.ReactFlowNode,
    installBindings: WorkflowInstallBindings,
    workspaceBindings: Map<string, Pick<schema.WorkspaceSnapshot, 'id' | 'name'>>,
  ): void {
    const dependencyId = this.buildWorkflowWorkspaceDependencyId(node.id);
    const workspaceId = installBindings.workspaces[dependencyId];

    if (!workspaceId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-workspace-missing',
        title: '安装配置缺少工作区绑定',
        status: HttpStatus.CONFLICT,
        detail: `节点「${this.getNodeDisplayName(node)}」需要绑定工作区后才能安装`,
      });
    }

    const workspace = workspaceBindings.get(workspaceId);
    if (!workspace) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-workspace-not-found',
        title: '工作区不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到工作区 ${workspaceId}`,
      });
    }

    clearNodeConfigField(node, 'workspaceId');
    clearNodeConfigField(node, 'workspace_id');
    clearNodeConfigField(node, 'workspaceName');
    clearNodeConfigField(node, 'workspace_name');
    setNodeConfigField(node, 'workspaceId', workspace.id);
    setNodeConfigField(node, 'workspaceName', workspace.name);
    this.setNodeLabel(node, workspace.name);
  }

  private applyInstalledWorkflowSandboxBinding(
    node: schema.ReactFlowNode,
    installBindings: WorkflowInstallBindings,
    sandboxBindings: Map<
      string,
      Pick<schema.SandboxSession, 'id' | 'status' | 'config'>
    >,
    workspaceDependencyIdsBySourceWorkspaceId: Map<string, string>,
    linkedWorkspaceDependencyIdsBySandboxNodeId: Map<string, string>,
  ): void {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);
    const lifecycleMode = this.readFirstString(
      runtimeNodeData.lifecycleMode,
      runtimeNodeData.lifecycle_mode,
    );
    const sourcePersistentSandboxId = this.readFirstString(
      runtimeNodeData.persistentSandboxId,
      runtimeNodeData.persistent_sandbox_id,
    );
    const requiresPersistentBinding =
      lifecycleMode === 'persistent' || Boolean(sourcePersistentSandboxId);

    const dependencyId = this.buildWorkflowSandboxDependencyId(node.id);
    const selectedSandboxId = installBindings.sandboxes[dependencyId];
    if (!selectedSandboxId) {
      if (!requiresPersistentBinding) {
        return;
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-sandbox-missing',
        title: '安装配置缺少持久沙箱绑定',
        status: HttpStatus.CONFLICT,
        detail: `节点「${this.getNodeDisplayName(node)}」需要绑定持久沙箱后才能安装`,
      });
    }

    const sandbox = sandboxBindings.get(selectedSandboxId);
    if (!sandbox) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-sandbox-not-found',
        title: '持久沙箱不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到持久沙箱 ${selectedSandboxId}`,
      });
    }

    const restoreWorkspaceSourceId = this.readFirstString(
      runtimeNodeData.restoreWorkspaceId,
      runtimeNodeData.restore_workspace_id,
    );
    const linkedWorkspaceDependencyId =
      linkedWorkspaceDependencyIdsBySandboxNodeId.get(node.id) ??
      (restoreWorkspaceSourceId
        ? workspaceDependencyIdsBySourceWorkspaceId.get(restoreWorkspaceSourceId) ??
          this.buildWorkflowRestoreWorkspaceDependencyId(
            restoreWorkspaceSourceId,
          )
        : null);
    if (linkedWorkspaceDependencyId) {
      const selectedWorkspaceId =
        installBindings.workspaces[linkedWorkspaceDependencyId];
      if (!selectedWorkspaceId) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-install-restore-workspace-missing',
          title: '安装配置缺少恢复工作区绑定',
          status: HttpStatus.CONFLICT,
          detail: `节点「${this.getNodeDisplayName(node)}」需要绑定恢复工作区后才能安装`,
        });
      }

      clearNodeConfigField(node, 'restoreWorkspaceId');
      clearNodeConfigField(node, 'restore_workspace_id');
      setNodeConfigField(node, 'restoreWorkspaceId', selectedWorkspaceId);
    } else {
      clearNodeConfigField(node, 'restoreWorkspaceId');
      clearNodeConfigField(node, 'restore_workspace_id');
    }

    clearNodeConfigField(node, 'persistentSandboxId');
    clearNodeConfigField(node, 'persistent_sandbox_id');
    clearNodeConfigField(node, 'persistentSandboxName');
    clearNodeConfigField(node, 'persistent_sandbox_name');
    setNodeConfigField(node, 'lifecycleMode', 'persistent');
    setNodeConfigField(node, 'persistentSandboxId', sandbox.id);
    setNodeConfigField(
      node,
      'persistentSandboxName',
      sandbox.config.name ?? sandbox.id,
    );
  }

  private async collectImportedWorkflowAgentDependencies(params: {
    sourceTenantId: string;
    sourceAgentDefinitionId: string;
    sourceAgentVersionId?: string;
    agentPath: string[];
    result: WorkflowImportPreflightResult;
    context: WorkflowImportDependencyContext;
  }): Promise<void> {
    const cacheKey = `${params.sourceAgentDefinitionId}:${params.sourceAgentVersionId ?? 'published'}`;

    if (params.context.visitedAgents.has(cacheKey)) {
      return;
    }

    if (params.context.activeAgentStack.has(cacheKey)) {
      params.result.blockers.push({
        code: 'WORKFLOW_IMPORT_AGENT_CYCLE',
        location: ['工作流', ...params.agentPath].join(' / '),
        message: `Agent ${params.sourceAgentDefinitionId} 在导入依赖中出现循环引用，当前无法自动安装。`,
      });
      return;
    }

    params.context.activeAgentStack.add(cacheKey);

    try {
      const source = await this.loadImportedWorkflowAgentSource({
        sourceTenantId: params.sourceTenantId,
        sourceAgentDefinitionId: params.sourceAgentDefinitionId,
        sourceAgentVersionId: params.sourceAgentVersionId,
      });
      params.context.visitedAgents.add(cacheKey);

      if (source.workspaceSnapshotId || source.snapshot.workspaceSnapshotId) {
        params.result.blockers.push({
          code: 'WORKFLOW_IMPORT_AGENT_WORKSPACE_UNSUPPORTED',
          location: ['工作流', ...params.agentPath].join(' / '),
          message: `依赖 Agent「${source.name}」绑定了工作区快照，当前安装流程还不能自动迁移。`,
        });
        return;
      }

      try {
        this.sanitizeImportedAgentSandboxConfig(
          source.sandboxConfig ?? source.snapshot.sandboxConfig ?? null,
          source.name,
        );
      } catch (error) {
        if (error instanceof DomainException) {
          params.result.blockers.push({
            code: 'WORKFLOW_IMPORT_AGENT_SANDBOX_UNSUPPORTED',
            location: ['工作流', ...params.agentPath].join(' / '),
            message: error.detail,
          });
          return;
        }
        throw error;
      }

      for (const node of source.snapshot.nodes) {
        const nodeType = this.getImportedAgentNodeType(node);
        const runtimeNodeData = this.getRuntimeNodeData(node.data);
        const location = this.buildImportedAgentNodeLocation(
          params.agentPath,
          node,
        );

        switch (nodeType) {
          case 'sub-agent': {
            const sourceSubAgentDefinitionId = this.readFirstString(
              runtimeNodeData.agentDefinitionId,
              runtimeNodeData.agent_definition_id,
            );
            if (!sourceSubAgentDefinitionId) {
              params.result.blockers.push({
                code: 'WORKFLOW_IMPORT_SUB_AGENT_BINDING_MISSING',
                location,
                message: `子 Agent 节点「${this.getNodeDisplayName(node)}」缺少绑定，当前无法直接安装。`,
              });
              break;
            }

            await this.collectImportedWorkflowAgentDependencies({
              sourceTenantId: params.sourceTenantId,
              sourceAgentDefinitionId: sourceSubAgentDefinitionId,
              sourceAgentVersionId: this.readFirstString(
                runtimeNodeData.agentVersionId,
                runtimeNodeData.agent_version_id,
              ),
              agentPath: [...params.agentPath, this.getNodeDisplayName(node)],
              result: params.result,
              context: params.context,
            });
            break;
          }

          case 'llm-model': {
            const dependencyId = this.buildImportedAgentModelDependencyId(
              source.agentDefinitionId,
              source.sourceVersionId,
              node.id,
            );
            if (
              params.result.llmModels.some(
                (dependency) => dependency.dependencyId === dependencyId,
              )
            ) {
              break;
            }

            try {
              const dependency = await this.buildWorkflowModelInstallDependency({
                node,
                dependencyId,
                location,
                sourceTenantId: params.sourceTenantId,
                targetTenantId: params.context.targetTenantId,
                context: params.context,
                dbClient: this.db,
              });
              if (dependency) {
                params.result.llmModels.push(dependency);
              }
            } catch (error) {
              if (error instanceof DomainException) {
                params.result.blockers.push({
                  code: 'WORKFLOW_IMPORT_MODEL_UNRESOLVABLE',
                  location,
                  message: error.detail,
                });
                break;
              }
              throw error;
            }
            break;
          }

          case 'knowledge-base': {
            if (
              this.readFirstString(
                runtimeNodeData.knowledgeBaseId,
                runtimeNodeData.knowledge_base_id,
              )
            ) {
              params.result.blockers.push({
                code: 'WORKFLOW_IMPORT_AGENT_KNOWLEDGE_UNSUPPORTED',
                location,
                message: `依赖 Agent「${source.name}」包含知识库节点，当前安装流程还不能自动迁移。`,
              });
            }
            break;
          }

          case 'memory': {
            if (
              this.readFirstString(
                runtimeNodeData.memoryInstanceId,
                runtimeNodeData.memory_instance_id,
              )
            ) {
              params.result.blockers.push({
                code: 'WORKFLOW_IMPORT_AGENT_MEMORY_UNSUPPORTED',
                location,
                message: `依赖 Agent「${source.name}」包含记忆节点，当前安装流程还不能自动迁移。`,
              });
            }
            break;
          }

          case 'mcp-tool': {
            if (
              this.readFirstString(
                runtimeNodeData.mcpServerConfigId,
                runtimeNodeData.mcp_server_config_id,
              )
            ) {
              params.result.blockers.push({
                code: 'WORKFLOW_IMPORT_AGENT_MCP_UNSUPPORTED',
                location,
                message: `依赖 Agent「${source.name}」包含 MCP 绑定，当前安装流程还不能自动迁移。`,
              });
            }
            break;
          }

          case 'skill': {
            if (
              this.readFirstString(
                runtimeNodeData.skillId,
                runtimeNodeData.skill_id,
              )
            ) {
              params.result.blockers.push({
                code: 'WORKFLOW_IMPORT_AGENT_SKILL_UNSUPPORTED',
                location,
                message: `依赖 Agent「${source.name}」包含 Skill 绑定，当前安装流程还不能自动迁移。`,
              });
            }
            break;
          }

          default:
            break;
        }
      }
    } catch (error) {
      if (error instanceof DomainException) {
        params.result.blockers.push({
          code: 'WORKFLOW_IMPORT_AGENT_LOAD_FAILED',
          location: ['工作流', ...params.agentPath].join(' / '),
          message: error.detail,
        });
        return;
      }

      throw error;
    } finally {
      params.context.activeAgentStack.delete(cacheKey);
    }
  }

  private async buildWorkflowModelInstallDependency(params: {
    node: schema.ReactFlowNode;
    dependencyId: string;
    location: string;
    sourceTenantId: string;
    targetTenantId: string;
    context: ImportedWorkflowModelCacheContext;
    dbClient: WorkflowDbClient;
  }): Promise<WorkflowInstallLlmDependency | null> {
    const sourceModel = await this.describeImportedWorkflowModelSource({
      runtimeNodeData: this.getRuntimeNodeData(params.node.data),
      sourceTenantId: params.sourceTenantId,
      context: params.context,
    });

    if (!sourceModel.providerSlug || !sourceModel.modelId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-source-model-incomplete',
        title: '源模型配置不完整',
        status: HttpStatus.CONFLICT,
        detail: `节点「${this.getNodeDisplayName(params.node)}」缺少 provider 或 modelId，当前无法在安装时自动配置。`,
      });
    }

    const defaultTargetModel = await this.resolveImportedWorkflowTargetModel({
      sourceModel,
      targetTenantId: params.targetTenantId,
      context: params.context,
      dbClient: params.dbClient,
    });

    return {
      dependencyId: params.dependencyId,
      nodeId: params.node.id,
      nodeType: 'llm-model',
      nodeLabel: this.getWorkflowNodeLabel(params.node) ?? null,
      location: params.location,
      provider: sourceModel.providerSlug,
      modelId: sourceModel.modelId,
      modelName: sourceModel.modelName ?? sourceModel.modelId,
      modelType: sourceModel.modelType,
      baseUrl: sourceModel.baseUrl,
      defaultModelConfigId: defaultTargetModel?.config.id ?? null,
    };
  }

  private async describeImportedWorkflowModelSource(params: {
    runtimeNodeData: Record<string, unknown>;
    sourceTenantId: string;
    context: Pick<ImportedWorkflowModelCacheContext, 'sourceModels'>;
  }): Promise<ImportedWorkflowModelDescriptor> {
    const sourceModelBindingId = this.readFirstString(
      params.runtimeNodeData.llmConfigId,
      params.runtimeNodeData.llm_config_id,
      params.runtimeNodeData.modelConfigId,
      params.runtimeNodeData.model_config_id,
    );
    const sourceModel = sourceModelBindingId
      ? await this.loadImportedWorkflowSourceModel({
          sourceTenantId: params.sourceTenantId,
          sourceModelBindingId,
          context: params.context,
        })
      : null;
    const modelType = this.readFirstString(
      sourceModel?.config.modelType,
      params.runtimeNodeData.modelType,
      params.runtimeNodeData.model_type,
    );

    return {
      sourceModel,
      providerSlug:
        sourceModel?.provider.slug ??
        this.readFirstString(params.runtimeNodeData.provider) ??
        null,
      providerName:
        sourceModel?.provider.name ??
        this.readFirstString(
          params.runtimeNodeData.providerName,
          params.runtimeNodeData.provider_name,
        ) ??
        null,
      providerApiProtocol:
        sourceModel?.provider.apiProtocol ??
        this.readFirstString(
          params.runtimeNodeData.apiProtocol,
          params.runtimeNodeData.api_protocol,
        ) ??
        null,
      modelId:
        sourceModel?.config.modelId ??
        this.readFirstString(
          params.runtimeNodeData.modelId,
          params.runtimeNodeData.model_id,
          params.runtimeNodeData.modelName,
          params.runtimeNodeData.model_name,
        ) ??
        null,
      modelName:
        sourceModel?.config.name ??
        this.readFirstString(
          params.runtimeNodeData.name,
          params.runtimeNodeData.label,
          params.runtimeNodeData.modelName,
          params.runtimeNodeData.model_name,
        ) ??
        null,
      modelType: modelType === 'embedding' ? 'embedding' : 'chat',
      baseUrl: this.normalizeOptionalText(
        sourceModel?.provider.baseUrl ??
          sourceModel?.provider.defaultBaseUrl ??
          this.readFirstString(
            params.runtimeNodeData.endpointUrl,
            params.runtimeNodeData.endpoint_url,
          ) ??
          undefined,
      ),
    };
  }

  private async remapImportedWorkflowModelNode(params: {
    node: schema.ReactFlowNode;
    dependencyId: string;
    runtimeNodeData: Record<string, unknown>;
    sourceTenantId: string;
    targetTenantId: string;
    context: ImportedWorkflowAgentCloneContext;
    dbClient: WorkflowDbClient;
    location: string;
  }): Promise<void> {
    const selectedModelConfigId =
      params.context.installBindings.llmModels[params.dependencyId];
    const sourceModel = await this.describeImportedWorkflowModelSource({
      runtimeNodeData: params.runtimeNodeData,
      sourceTenantId: params.sourceTenantId,
      context: params.context,
    });
    const targetModel = selectedModelConfigId
      ? await this.findImportedWorkflowTargetModelByBindingId({
          modelConfigId: selectedModelConfigId,
          targetTenantId: params.targetTenantId,
          context: params.context,
          dbClient: params.dbClient,
        })
      : await this.resolveImportedWorkflowTargetModel({
          sourceModel,
          targetTenantId: params.targetTenantId,
          context: params.context,
          dbClient: params.dbClient,
        });

    if (!targetModel) {
      const providerLabel = sourceModel.providerSlug ?? 'unknown';
      const modelLabel = sourceModel.modelId ?? 'unknown';
      const baseUrl = sourceModel.baseUrl;

      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-model-not-found',
        title: '目标租户缺少所需模型配置',
        status: HttpStatus.CONFLICT,
        detail: `${params.location} 需要模型 ${modelLabel}（provider=${providerLabel}${baseUrl ? `, baseUrl=${baseUrl}` : ''}），请先在当前账号配置或在安装界面手动选择对应模型。`,
      });
    }

    this.applyImportedWorkflowTargetModelToNode(params.node, targetModel);
  }

  private async loadImportedWorkflowSourceModel(params: {
    sourceTenantId: string;
    sourceModelBindingId: string;
    context: Pick<ImportedWorkflowModelCacheContext, 'sourceModels'>;
  }): Promise<ImportedWorkflowModelRecord> {
    const cached = params.context.sourceModels.get(params.sourceModelBindingId);
    if (cached) {
      return cached;
    }

    const [row] = await this.db
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

  private async ensureImportedWorkflowTargetModels(params: {
    targetTenantId: string;
    context: ImportedWorkflowModelCacheContext;
    dbClient: WorkflowDbClient;
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

  private async findImportedWorkflowTargetModelByBindingId(params: {
    modelConfigId: string;
    targetTenantId: string;
    context: ImportedWorkflowModelCacheContext;
    dbClient: WorkflowDbClient;
  }): Promise<ImportedWorkflowModelRecord> {
    const targetModels = await this.ensureImportedWorkflowTargetModels(params);
    const targetModel = targetModels.find(
      (candidate) => candidate.config.id === params.modelConfigId,
    );

    if (!targetModel) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-install-target-model-not-found',
        title: '安装选择的模型不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到已选择的模型配置 ${params.modelConfigId}`,
      });
    }

    return targetModel;
  }

  private async resolveImportedWorkflowTargetModel(params: {
    sourceModel: ImportedWorkflowModelDescriptor;
    targetTenantId: string;
    context: ImportedWorkflowModelCacheContext;
    dbClient: WorkflowDbClient;
  }): Promise<ImportedWorkflowModelRecord | null> {
    if (!params.sourceModel.providerSlug || !params.sourceModel.modelId) {
      return null;
    }

    const targetModels = await this.ensureImportedWorkflowTargetModels(params);
    const exactMatches = targetModels.filter((candidate) => {
      if (
        !this.isImportedWorkflowProviderCompatible(
          candidate.provider,
          params.sourceModel,
        ) ||
        candidate.config.modelId !== params.sourceModel.modelId ||
        candidate.config.modelType !== params.sourceModel.modelType
      ) {
        return false;
      }

      const candidateBaseUrl = this.normalizeOptionalText(
        candidate.provider.baseUrl ??
          candidate.provider.defaultBaseUrl ??
          undefined,
      );
      return candidateBaseUrl === params.sourceModel.baseUrl;
    });

    if (exactMatches.length > 0) {
      return this.pickImportedWorkflowTargetModel(
        exactMatches,
        params.sourceModel.modelName,
      );
    }

    const looseMatches = targetModels.filter(
      (candidate) =>
        this.isImportedWorkflowProviderCompatible(
          candidate.provider,
          params.sourceModel,
        ) &&
        candidate.config.modelId === params.sourceModel.modelId &&
        candidate.config.modelType === params.sourceModel.modelType,
    );

    if (looseMatches.length > 0) {
      return this.pickImportedWorkflowTargetModel(
        looseMatches,
        params.sourceModel.modelName,
      );
    }

    return null;
  }

  private pickImportedWorkflowTargetModel(
    candidates: ImportedWorkflowModelRecord[],
    sourceModelName: string | null,
  ): ImportedWorkflowModelRecord {
    const byName = sourceModelName
      ? candidates.find((candidate) => candidate.config.name === sourceModelName)
      : null;
    if (byName) {
      return byName;
    }

    const byDefault = candidates.find((candidate) => candidate.config.isDefault);
    return byDefault ?? candidates[0];
  }

  private isImportedWorkflowProviderCompatible(
    candidateProvider: schema.LlmProvider,
    sourceModel: ImportedWorkflowModelDescriptor,
  ): boolean {
    const candidateTokens = this.buildImportedWorkflowProviderIdentityTokens({
      slug: candidateProvider.slug,
      name: candidateProvider.name,
      apiProtocol: candidateProvider.apiProtocol,
    });
    const sourceTokens = this.buildImportedWorkflowProviderIdentityTokens({
      slug: sourceModel.providerSlug,
      name: sourceModel.providerName,
      apiProtocol: sourceModel.providerApiProtocol,
    });

    if (candidateTokens.size === 0 || sourceTokens.size === 0) {
      return false;
    }

    for (const token of candidateTokens) {
      if (sourceTokens.has(token)) {
        return true;
      }
    }

    return false;
  }

  private buildImportedWorkflowProviderIdentityTokens(params: {
    slug: string | null | undefined;
    name: string | null | undefined;
    apiProtocol: string | null | undefined;
  }): Set<string> {
    const tokens = new Set<string>();

    const add = (value: string | null | undefined) => {
      const normalized = this.normalizeImportedWorkflowProviderIdentity(value);
      if (normalized) {
        tokens.add(normalized);
      }
    };

    add(params.slug);
    add(params.name);
    add(params.apiProtocol);

    return tokens;
  }

  private normalizeImportedWorkflowProviderIdentity(
    value: string | null | undefined,
  ): string | null {
    const normalized = this.normalizeOptionalText(value ?? undefined)?.toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('openai_') || normalized.includes('openai')) {
      return 'openai';
    }

    if (normalized.includes('anthropic')) {
      return 'anthropic';
    }

    if (normalized.includes('google') || normalized.includes('gemini')) {
      return 'google';
    }

    if (normalized.includes('cohere')) {
      return 'cohere';
    }

    return normalized;
  }

  private applyImportedWorkflowTargetModelToNode(
    node: schema.ReactFlowNode,
    targetModel: ImportedWorkflowModelRecord,
  ): void {
    clearNodeConfigField(node, 'llmConfigId');
    clearNodeConfigField(node, 'llm_config_id');
    clearNodeConfigField(node, 'modelConfigId');
    clearNodeConfigField(node, 'model_config_id');
    clearNodeConfigField(node, 'apiKeyId');
    clearNodeConfigField(node, 'api_key_id');
    clearNodeConfigField(node, 'endpointUrl');
    clearNodeConfigField(node, 'endpoint_url');
    setNodeConfigField(node, 'llmConfigId', targetModel.config.id);
    setNodeConfigField(node, 'modelConfigId', targetModel.config.id);
    setNodeConfigField(node, 'provider', targetModel.provider.slug);
    setNodeConfigField(node, 'name', targetModel.config.name);
    setNodeConfigField(node, 'modelName', targetModel.config.modelId);
    setNodeConfigField(node, 'modelId', targetModel.config.modelId);
    setNodeConfigField(node, 'modelType', targetModel.config.modelType);
    if (targetModel.provider.apiKeyId) {
      setNodeConfigField(node, 'apiKeyId', targetModel.provider.apiKeyId);
    }

    const endpointUrl = this.normalizeOptionalText(
      targetModel.provider.baseUrl ??
        targetModel.provider.defaultBaseUrl ??
        undefined,
    );
    if (endpointUrl) {
      setNodeConfigField(node, 'endpointUrl', endpointUrl);
    }

    this.setNodeLabel(node, targetModel.config.modelId);
  }

  async importWorkflow(
    tenantId: string,
    userId: string,
    dto: ImportWorkflowDto,
  ): Promise<{ id: string; name: string; slug: string }> {
    const { name, description, file_content } = dto;
    const validationResult = validateImportFile(file_content);

    if (!validationResult.valid || !validationResult.workflow) {
      throw new DomainException({
        type: 'workflow/import-validation-failed',
        title: 'Import Validation Failed',
        status: HttpStatus.BAD_REQUEST,
        detail: 'The imported workflow file is invalid.',
        errors: validationResult.errors.map((message) => {
          const separatorIndex = message.indexOf(': ');

          if (separatorIndex === -1) {
            return {
              field: 'file_content',
              message,
            };
          }

          return {
            field: message.slice(0, separatorIndex),
            message: message.slice(separatorIndex + 2),
          };
        }),
      });
    }

    const importedWorkflow = validationResult.workflow;
    const clonedDefinition = cloneDefinitionWithNewIds(
      importedWorkflow.definition,
    );
    let slug = generateSlug(name);

    for (
      let attempt = 0;
      attempt <= WorkflowVersionService.MAX_SLUG_RETRIES;
      attempt++
    ) {
      try {
        const created = await this.tenantDb.transaction(async (tx) => {
          const [row] = await tx
            .insert(schema.workflowDefinitions)
            .values({
              tenantId,
              name,
              slug,
              description: description ?? importedWorkflow.description,
              nodes: clonedDefinition.nodes,
              edges: clonedDefinition.edges,
              viewport: clonedDefinition.viewport,
              inputSchema: importedWorkflow.inputSchema,
              metadata: {
                imported_from: {
                  schemaVersion: file_content.schema_version,
                  originalName: importedWorkflow.name,
                  exportedAt: file_content.exported_at,
                  importedAt: new Date().toISOString(),
                },
              },
              createdBy: userId,
              updatedBy: userId,
            })
            .returning({
              id: schema.workflowDefinitions.id,
              name: schema.workflowDefinitions.name,
              slug: schema.workflowDefinitions.slug,
            });

          return row;
        });

        this.logger.log(
          JSON.stringify({
            action: 'workflow_imported',
            workflowId: created.id,
            slug,
            originalName: importedWorkflow.name,
          }),
        );

        return created;
      } catch (error: unknown) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (
          !isUniqueViolation ||
          attempt === WorkflowVersionService.MAX_SLUG_RETRIES
        ) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: slug retry loop exhausted');
  }

  // ─── 更新工作流定义（乐观并发控制） ─────────────────────────────

  async updateDefinition(
    workflowId: string,
    userId: string,
    dto: UpdateWorkflowDefinitionDto,
  ): Promise<WorkflowDefinitionDetailResponseDto> {
    const updated = await this.withWorkflowWriteLock(
      workflowId,
      async (dbClient) => {
        const workflow = await this.findWorkflowOrThrow(dbClient, workflowId);

        if (workflow.status === 'archived') {
          throw new WorkflowArchivedException(workflowId);
        }

        const setClause: Record<string, unknown> = {
          version: sql`${schema.workflowDefinitions.version} + 1`,
          updatedBy: userId,
          updatedAt: new Date(),
        };
        const shouldNormalizeGraph =
          dto.nodes !== undefined || dto.edges !== undefined;
        const normalizedGraph = shouldNormalizeGraph
          ? normalizeWorkflowNodesAndEdges(
              (dto.nodes ?? workflow.nodes ?? []) as schema.ReactFlowNode[],
              (dto.edges ?? workflow.edges ?? []) as schema.ReactFlowEdge[],
            )
          : null;

        if (dto.name !== undefined) setClause.name = dto.name;
        if (dto.description !== undefined)
          setClause.description = dto.description;
        if (dto.icon !== undefined) setClause.icon = dto.icon;
        if (dto.nodes !== undefined && normalizedGraph) {
          setClause.nodes = normalizedGraph.nodes;
        }
        if (dto.edges !== undefined && normalizedGraph) {
          setClause.edges = normalizedGraph.edges;
        }
        if (dto.viewport !== undefined) setClause.viewport = dto.viewport;
        if (dto.inputSchema !== undefined) {
          setClause.inputSchema = normalizeWorkflowInputSchemaForUpdate(
            workflow.inputSchema,
            dto.inputSchema,
          );
        }

        const updateResult = await dbClient
          .update(schema.workflowDefinitions)
          .set(setClause)
          .where(
            and(
              eq(schema.workflowDefinitions.id, workflowId),
              eq(schema.workflowDefinitions.version, dto.version),
            ),
          )
          .returning();

        if (updateResult.length === 0) {
          throw new WorkflowVersionConflictException(
            workflowId,
            workflow.version,
          );
        }

        return updateResult[0];
      },
    );

    this.logger.log(
      JSON.stringify({
        action: 'workflow_updated',
        workflowId,
        version: updated.version,
        userId,
      }),
    );

    return serializeWorkflowDefinitionDetail(updated);
  }

  // ─── 创建版本快照 ─────────────────────────────────────────────

  async createVersion(
    workflowId: string,
    dto: CreateVersionDto,
    userId: string,
  ): Promise<VersionResponseDto> {
    const version = await this.withWorkflowWriteLock(
      workflowId,
      async (dbClient) => {
        const workflow = await this.findWorkflowOrThrow(dbClient, workflowId);

        if (workflow.status === 'archived') {
          throw new WorkflowArchivedException(workflowId);
        }

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
            snapshot: this.buildSnapshot(workflow),
            createdBy: userId,
          })
          .returning();

        return createdVersion;
      },
    );

    this.logger.log(
      JSON.stringify({
        action: 'version_created',
        workflowId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        userId,
      }),
    );

    return this.toResponseDto(version);
  }

  // ─── 列出版本历史 ─────────────────────────────────────────────

  async listVersions(
    workflowId: string,
    query: ListVersionsQueryDto,
  ): Promise<VersionListResult> {
    await this.findWorkflowOrThrow(this.tenantDb, workflowId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const [versions, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.workflowVersions)
        .where(eq(schema.workflowVersions.workflowDefinitionId, workflowId))
        .orderBy(desc(schema.workflowVersions.versionNumber))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowVersions)
        .where(eq(schema.workflowVersions.workflowDefinitionId, workflowId)),
    ]);

    return {
      data: versions.map((v) => this.toResponseDto(v)),
      meta: {
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
        totalPages:
          (countResult[0]?.count ?? 0) === 0
            ? 0
            : Math.ceil((countResult[0]?.count ?? 0) / pageSize),
      },
    };
  }

  // ─── 回滚到指定版本 ───────────────────────────────────────────

  async rollback(
    workflowId: string,
    versionId: string,
    userId: string,
  ): Promise<VersionResponseDto> {
    const version = await this.withWorkflowWriteLock(
      workflowId,
      async (dbClient) => {
        const workflow = await this.findWorkflowOrThrow(dbClient, workflowId);

        if (workflow.status === 'archived') {
          throw new WorkflowArchivedException(workflowId);
        }

        const targetVersion = await this.findVersionOrThrow(
          dbClient,
          versionId,
          workflowId,
        );
        const normalizedGraph = normalizeWorkflowNodesAndEdges(
          targetVersion.snapshot.nodes,
          targetVersion.snapshot.edges,
        );

        await dbClient
          .update(schema.workflowDefinitions)
          .set({
            nodes: normalizedGraph.nodes,
            edges: normalizedGraph.edges,
            viewport: targetVersion.snapshot.viewport,
            version: sql`${schema.workflowDefinitions.version} + 1`,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.workflowDefinitions.id, workflowId));

        return targetVersion;
      },
    );

    this.logger.log(
      JSON.stringify({
        action: 'version_rollback',
        workflowId,
        versionId,
        versionNumber: version.versionNumber,
        userId,
      }),
    );

    return this.toResponseDto(version);
  }

  // ─── 发布工作流 ───────────────────────────────────────────────

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

        const edges: schema.ReactFlowEdge[] = Array.isArray(workflow.edges)
          ? workflow.edges
          : [];
        const normalizedGraph = normalizeWorkflowNodesAndEdges(nodes, edges);
        const warnings = this.validateEdgeTypeCompatibility(
          normalizedGraph.nodes,
          normalizedGraph.edges,
        );
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

  // ─── 归档工作流 ───────────────────────────────────────────────

  async archive(workflowId: string, userId: string): Promise<void> {
    const workflow = await this.withWorkflowWriteLock(
      workflowId,
      async (dbClient) => {
        const currentWorkflow = await this.findWorkflowOrThrow(
          dbClient,
          workflowId,
        );

        if (currentWorkflow.status === 'archived') {
          throw new WorkflowArchivedException(workflowId);
        }

        const now = new Date();

        await dbClient
          .update(schema.workflowVersions)
          .set({ archivedAt: now })
          .where(
            and(
              eq(schema.workflowVersions.workflowDefinitionId, workflowId),
              sql`${schema.workflowVersions.archivedAt} IS NULL`,
            ),
          );

        await dbClient
          .update(schema.workflowDefinitions)
          .set({
            status: 'archived',
            updatedBy: userId,
            updatedAt: now,
          })
          .where(eq(schema.workflowDefinitions.id, workflowId));

        return currentWorkflow;
      },
    );

    await this.invalidatePublishedCache(workflow.tenantId, workflowId);

    this.logger.log(
      JSON.stringify({
        action: 'workflow_archived',
        workflowId,
        userId,
      }),
    );
  }

  // ─── 获取已发布版本（Redis L2 缓存） ─────────────────────────

  async getPublishedVersion(
    workflowId: string,
    tenantId: string,
  ): Promise<VersionResponseDto | null> {
    const cacheKey = this.getPublishedCacheKey(tenantId, workflowId);

    const cached = await this.redisCacheService.get(cacheKey);

    if (cached !== null) {
      if (cached === NULL_SENTINEL) {
        return null;
      }
      return JSON.parse(cached) as VersionResponseDto;
    }

    const workflow = await this.findWorkflowOrThrow(this.tenantDb, workflowId);

    if (!workflow.publishedVersionId) {
      // 缓存空值，防止缓存穿透
      await this.redisCacheService.set(cacheKey, NULL_SENTINEL, NULL_CACHE_TTL);
      return null;
    }

    const [version] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, workflow.publishedVersionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
      );

    if (!version) {
      await this.redisCacheService.set(cacheKey, NULL_SENTINEL, NULL_CACHE_TTL);
      return null;
    }

    const responseDto = this.toResponseDto(version);

    await this.redisCacheService.set(
      cacheKey,
      JSON.stringify(responseDto),
      PUBLISHED_VERSION_TTL,
    );

    return responseDto;
  }

  // ─── 私有辅助方法 ─────────────────────────────────────────────

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

  private async cloneImportedWorkflowAgentDependencies(params: {
    nodes: schema.ReactFlowNode[];
    sourceTenantId: string;
    context: ImportedWorkflowAgentCloneContext;
    dbClient: WorkflowDbClient;
  }): Promise<void> {
    for (const node of params.nodes) {
      if (this.getWorkflowNodeType(node) !== 'agent') {
        continue;
      }

      const runtimeNodeData = this.getRuntimeNodeData(node.data);
      const sourceAgentDefinitionId = this.readFirstString(
        runtimeNodeData.agentDefinitionId,
        runtimeNodeData.agent_definition_id,
        runtimeNodeData.selectedAgentId,
        runtimeNodeData.selected_agent_id,
      );

      if (!sourceAgentDefinitionId) {
        continue;
      }

      const sourceAgentVersionId = this.readFirstString(
        runtimeNodeData.agentVersionId,
        runtimeNodeData.agent_version_id,
      );
      const clonedAgent = await this.cloneImportedWorkflowAgent({
        sourceTenantId: params.sourceTenantId,
        sourceAgentDefinitionId,
        sourceAgentVersionId,
        context: params.context,
        dbClient: params.dbClient,
      });

      clearNodeConfigField(node, 'selectedAgentId');
      clearNodeConfigField(node, 'selected_agent_id');
      clearNodeConfigField(node, 'agentDefinitionId');
      clearNodeConfigField(node, 'agent_definition_id');
      clearNodeConfigField(node, 'agentVersionId');
      clearNodeConfigField(node, 'agent_version_id');
      clearNodeConfigField(node, 'agentName');
      clearNodeConfigField(node, 'agent_name');
      clearNodeConfigField(node, 'versionLabel');
      clearNodeConfigField(node, 'version_label');
      clearNodeConfigField(node, 'agentRuntimeMode');
      clearNodeConfigField(node, 'agent_runtime_mode');
      setNodeConfigField(node, 'selectedAgentId', clonedAgent.agentDefinitionId);
      setNodeConfigField(node, 'agentDefinitionId', clonedAgent.agentDefinitionId);
      setNodeConfigField(node, 'agentVersionId', clonedAgent.publishedVersionId);
      setNodeConfigField(node, 'agentName', clonedAgent.name);
      setNodeConfigField(node, 'versionLabel', 'published');
      setNodeConfigField(node, 'agentRuntimeMode', clonedAgent.runtimeMode);
    }
  }

  private async cloneImportedWorkflowAgent(params: {
    sourceTenantId: string;
    sourceAgentDefinitionId: string;
    sourceAgentVersionId?: string;
    context: ImportedWorkflowAgentCloneContext;
    dbClient: WorkflowDbClient;
  }): Promise<ImportedWorkflowAgentCloneResult> {
    const cacheKey = `${params.sourceAgentDefinitionId}:${params.sourceAgentVersionId ?? 'published'}`;
    const cached = params.context.clonedAgents.get(cacheKey);

    if (cached) {
      return cached;
    }

    if (params.context.activeAgentCloneStack.has(cacheKey)) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-agent-cycle',
        title: '工作流依赖 Agent 存在循环引用',
        status: HttpStatus.CONFLICT,
        detail: `Agent ${params.sourceAgentDefinitionId} 在导入链路中出现循环引用，当前无法自动克隆`,
      });
    }

    params.context.activeAgentCloneStack.add(cacheKey);

    try {
      const source = await this.loadImportedWorkflowAgentSource({
        sourceTenantId: params.sourceTenantId,
        sourceAgentDefinitionId: params.sourceAgentDefinitionId,
        sourceAgentVersionId: params.sourceAgentVersionId,
      });

      if (source.workspaceSnapshotId || source.snapshot.workspaceSnapshotId) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/workflow-import-agent-workspace-unsupported',
          title: '工作流依赖 Agent 包含工作区绑定',
          status: HttpStatus.CONFLICT,
          detail: `依赖 Agent「${source.name}」包含工作区快照绑定，当前无法随工作流安装自动迁移`,
        });
      }

      const sandboxConfig = this.sanitizeImportedAgentSandboxConfig(
        source.sandboxConfig ?? source.snapshot.sandboxConfig ?? null,
        source.name,
      );
      const preparedNodes = cloneJson(source.snapshot.nodes);
      const preparedEdges = cloneJson(source.snapshot.edges);
      const preparedViewport = cloneJson(
        source.snapshot.viewport ?? DEFAULT_VIEWPORT,
      );

      for (const node of preparedNodes) {
        const nodeType = this.getImportedAgentNodeType(node);
        const runtimeNodeData = this.getRuntimeNodeData(node.data);

        switch (nodeType) {
          case 'sub-agent': {
            const sourceSubAgentDefinitionId = this.readFirstString(
              runtimeNodeData.agentDefinitionId,
              runtimeNodeData.agent_definition_id,
            );
            if (!sourceSubAgentDefinitionId) {
              continue;
            }

            const sourceSubAgentVersionId = this.readFirstString(
              runtimeNodeData.agentVersionId,
              runtimeNodeData.agent_version_id,
            );
            const clonedSubAgent = await this.cloneImportedWorkflowAgent({
              sourceTenantId: params.sourceTenantId,
              sourceAgentDefinitionId: sourceSubAgentDefinitionId,
              sourceAgentVersionId: sourceSubAgentVersionId,
              context: params.context,
              dbClient: params.dbClient,
            });

            clearNodeConfigField(node, 'agentDefinitionId');
            clearNodeConfigField(node, 'agent_definition_id');
            clearNodeConfigField(node, 'agentVersionId');
            clearNodeConfigField(node, 'agent_version_id');
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
            break;
          }

          case 'llm-model':
            await this.remapImportedWorkflowModelNode({
              node,
              dependencyId: this.buildImportedAgentModelDependencyId(
                source.agentDefinitionId,
                source.sourceVersionId,
                node.id,
              ),
              runtimeNodeData,
              sourceTenantId: params.sourceTenantId,
              targetTenantId: params.context.targetTenantId,
              context: params.context,
              dbClient: params.dbClient,
              location: `依赖 Agent「${source.name}」/ ${this.getNodeDisplayName(node)}`,
            });
            break;

          case 'knowledge-base':
            if (
              this.readFirstString(
                runtimeNodeData.knowledgeBaseId,
                runtimeNodeData.knowledge_base_id,
              )
            ) {
              throw new DomainException({
                type: 'https://agentloom.dev/errors/workflow-import-agent-knowledge-unsupported',
                title: '工作流依赖 Agent 包含知识库绑定',
                status: HttpStatus.CONFLICT,
                detail: `依赖 Agent「${source.name}」包含知识库节点，当前无法随工作流安装自动迁移`,
              });
            }
            break;

          case 'memory':
            if (
              this.readFirstString(
                runtimeNodeData.memoryInstanceId,
                runtimeNodeData.memory_instance_id,
              )
            ) {
              throw new DomainException({
                type: 'https://agentloom.dev/errors/workflow-import-agent-memory-unsupported',
                title: '工作流依赖 Agent 包含记忆绑定',
                status: HttpStatus.CONFLICT,
                detail: `依赖 Agent「${source.name}」包含记忆节点，当前无法随工作流安装自动迁移`,
              });
            }
            break;

          case 'mcp-tool':
            if (
              this.readFirstString(
                runtimeNodeData.mcpServerConfigId,
                runtimeNodeData.mcp_server_config_id,
              )
            ) {
              throw new DomainException({
                type: 'https://agentloom.dev/errors/workflow-import-agent-mcp-unsupported',
                title: '工作流依赖 Agent 包含 MCP 绑定',
                status: HttpStatus.CONFLICT,
                detail: `依赖 Agent「${source.name}」包含 MCP 工具节点，当前无法随工作流安装自动迁移`,
              });
            }
            break;

          case 'skill':
            if (
              this.readFirstString(
                runtimeNodeData.skillId,
                runtimeNodeData.skill_id,
              )
            ) {
              throw new DomainException({
                type: 'https://agentloom.dev/errors/workflow-import-agent-skill-unsupported',
                title: '工作流依赖 Agent 包含 Skill 绑定',
                status: HttpStatus.CONFLICT,
                detail: `依赖 Agent「${source.name}」包含 Skill 节点，当前无法随工作流安装自动迁移`,
              });
            }
            break;

          default:
            break;
        }
      }

      const clonedCanvas = cloneDefinitionWithNewIds({
        nodes: preparedNodes,
        edges: preparedEdges,
        viewport: preparedViewport,
      });
      const importedAt = new Date().toISOString();
      const created = await this.insertImportedWorkflowAgentDefinition(
        {
          name: `${source.name} 副本`,
          description: source.description,
          icon: source.icon,
          runtimeMode: source.runtimeMode,
          nodes: clonedCanvas.nodes,
          edges: clonedCanvas.edges,
          viewport: clonedCanvas.viewport,
          systemPrompt: source.snapshot.systemPrompt ?? null,
          sandboxConfig,
          metadata: {
            importedFromWorkflow: {
              sourceType: params.context.importSource,
              sourceReference: params.context.importReference,
              importedAt,
              sourceAgentDefinitionId: source.agentDefinitionId,
              sourceVersionId: source.sourceVersionId,
            },
          },
        },
        params.context,
        params.dbClient,
      );

      params.context.clonedAgents.set(cacheKey, created);
      return created;
    } finally {
      params.context.activeAgentCloneStack.delete(cacheKey);
    }
  }

  private async loadImportedWorkflowAgentSource(params: {
    sourceTenantId: string;
    sourceAgentDefinitionId: string;
    sourceAgentVersionId?: string;
  }): Promise<ImportedWorkflowAgentSourceRecord> {
    const [definition] = await this.db
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

  private sanitizeImportedAgentSandboxConfig(
    sandboxConfig: schema.SandboxConfig | null,
    agentName: string,
  ): schema.SandboxConfig | null {
    if (!sandboxConfig) {
      return null;
    }

    if (sandboxConfig.restoreWorkspaceId || sandboxConfig.persistentSandboxId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-agent-sandbox-binding-unsupported',
        title: '工作流依赖 Agent 包含持久化沙箱绑定',
        status: HttpStatus.CONFLICT,
        detail: `依赖 Agent「${agentName}」包含工作区或持久化沙箱绑定，当前无法随工作流安装自动迁移`,
      });
    }

    return cloneJson(sandboxConfig);
  }

  private async insertImportedWorkflowAgentDefinition(
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
      metadata: Record<string, unknown>;
    },
    context: ImportedWorkflowAgentCloneContext,
    dbClient: WorkflowDbClient,
  ): Promise<ImportedWorkflowAgentCloneResult> {
    let slug = generateSlug(input.name);

    for (
      let attempt = 0;
      attempt <= WorkflowVersionService.MAX_SLUG_RETRIES;
      attempt += 1
    ) {
      try {
        const [createdAgent] = await dbClient
          .insert(schema.agentDefinitions)
          .values({
            tenantId: context.targetTenantId,
            name: input.name,
            slug,
            description: input.description,
            icon: input.icon,
            runtimeMode: input.runtimeMode,
            systemPrompt: input.systemPrompt,
            nodes: cloneJson(input.nodes),
            edges: cloneJson(input.edges),
            viewport: cloneJson(input.viewport),
            metadata: cloneJson(input.metadata),
            sandboxConfig:
              input.runtimeMode === 'sandbox' ? input.sandboxConfig : null,
            workspaceSnapshotId: null,
            version: 1,
            status: 'draft',
            createdBy: context.targetUserId,
            updatedBy: context.targetUserId,
          })
          .returning();

        const [createdVersion] = await dbClient
          .insert(schema.agentVersions)
          .values({
            agentDefinitionId: createdAgent.id,
            tenantId: context.targetTenantId,
            versionNumber: 1,
            label: 'v1 (workflow import)',
            snapshot: {
              runtimeMode: input.runtimeMode,
              nodes: cloneJson(input.nodes),
              edges: cloneJson(input.edges),
              viewport: cloneJson(input.viewport),
              systemPrompt: input.systemPrompt,
              sandboxConfig:
                input.runtimeMode === 'sandbox' ? input.sandboxConfig : null,
              workspaceSnapshotId: null,
              metadata: {
                nodeCount: input.nodes.length,
                edgeCount: input.edges.length,
                createdFromVersion: 1,
                releaseNotes: '由工作流安装自动导入',
              },
            },
            publishedAt: new Date(),
            createdBy: context.targetUserId,
          })
          .returning();

        await dbClient
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
          runtimeMode: createdAgent.runtimeMode,
        };
      } catch (error: unknown) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (
          !isUniqueViolation ||
          attempt === WorkflowVersionService.MAX_SLUG_RETRIES
        ) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: agent slug retry loop exhausted');
  }

  private getImportedAgentNodeType(node: schema.ReactFlowNode): string {
    const runtimeNodeData = this.getRuntimeNodeData(node.data);

    return (
      this.readFirstString(
        runtimeNodeData.nodeType,
        runtimeNodeData.node_type,
        node.type,
      ) ?? ''
    );
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

  private async getPublishedReleaseNumber(
    workflowId: string,
    publishedVersionId: string | null,
  ): Promise<number | null> {
    if (!publishedVersionId) {
      return null;
    }

    const [publishedVersion] = await this.tenantDb
      .select({
        snapshot: schema.workflowVersions.snapshot,
        publishedAt: schema.workflowVersions.publishedAt,
      })
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, publishedVersionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
      );

    if (!publishedVersion) {
      return null;
    }

    return this.extractReleaseNumber(
      publishedVersion.snapshot,
      publishedVersion.publishedAt,
    );
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
