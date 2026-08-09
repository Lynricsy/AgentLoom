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
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';
import { generateSlug, appendSlugSuffix } from '../organization/slug.utils';
import { cloneDefinitionWithNewIds } from './utils/clone-template.utils';
import { normalizeWorkflowNodesAndEdges } from './utils/normalize-workflow-graph.utils';
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
      const cloned = cloneDefinitionWithNewIds({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: snapshot.viewport ?? DEFAULT_VIEWPORT,
      });

      nodes = cloned.nodes;
      edges = cloned.edges;
      viewport = cloned.viewport;
      inputSchema = snapshot.inputSchema
        ? workflowInputSchemaSchema.parse(snapshot.inputSchema)
        : null;
      importSourceTenantId = listing.sourceTenantId;
      importSourceType = 'marketplace';
      importSourceReference = listing.id;
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
      const cloned = cloneDefinitionWithNewIds({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: snapshot.viewport ?? DEFAULT_VIEWPORT,
      });

      nodes = cloned.nodes;
      edges = cloned.edges;
      viewport = cloned.viewport;
      inputSchema = snapshot.inputSchema
        ? workflowInputSchemaSchema.parse(snapshot.inputSchema)
        : null;
      importSourceTenantId = share.tenantId;
      importSourceType = 'share';
      importSourceReference = dto.share_token;
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
          const importedNodes = cloneJson(nodes);

          if (
            importSourceTenantId &&
            importSourceType &&
            importSourceReference
          ) {
            if (this.hasImportedWorkflowAgentDependencies(importedNodes)) {
              await this.cloneImportedWorkflowAgentDependencies({
                nodes: importedNodes,
                sourceTenantId: importSourceTenantId,
                importSource: importSourceType,
                importReference: importSourceReference,
                targetTenantId: tenantId,
                targetUserId: userId,
                dbClient: tx,
              });
            }

            await this.localizeImportedWorkflowSharedResources({
              nodes: importedNodes,
              sourceTenantId: importSourceTenantId,
              targetTenantId: tenantId,
              targetUserId: userId,
              dbClient: tx,
            });
          }

          const [row] = await tx
            .insert(schema.workflowDefinitions)
            .values({
              tenantId,
              name: dto.name,
              slug,
              description: dto.description ?? null,
              icon: dto.icon ?? null,
              nodes: importedNodes,
              edges: cloneJson(edges),
              viewport: cloneJson(viewport),
              inputSchema: inputSchema ? cloneJson(inputSchema) : null,
              metadata: cloneJson(metadata),
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();

          const isImported =
            dto.template_slug || dto.marketplace_listing_id || dto.share_token;

          if (isImported) {
            const snapshot = this.buildSnapshot(row, '导入时自动发布', 1);
            const [version] = await tx
              .insert(schema.workflowVersions)
              .values({
                workflowDefinitionId: row.id,
                tenantId,
                versionNumber: 1,
                label: 'v1 (imported)',
                snapshot,
                publishedAt: new Date(),
                createdBy: userId,
              })
              .returning();

            const [published] = await tx
              .update(schema.workflowDefinitions)
              .set({
                status: 'published',
                publishedVersionId: version.id,
                updatedBy: userId,
                updatedAt: new Date(),
              })
              .where(eq(schema.workflowDefinitions.id, row.id))
              .returning();

            return published;
          }

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

          const normalizedGraph = normalizeWorkflowNodesAndEdges(
            clonedDefinition.nodes,
            clonedDefinition.edges,
          );
          const snapshot: WorkflowVersionSnapshot = {
            nodes: normalizedGraph.nodes,
            edges: normalizedGraph.edges,
            viewport: clonedDefinition.viewport ?? null,
            inputSchema: importedWorkflow.inputSchema ?? null,
            metadata: {
              nodeCount: normalizedGraph.nodes.length,
              edgeCount: normalizedGraph.edges.length,
              createdFromVersion: 1,
              releaseNotes: '导入时自动发布',
              releaseNumber: 1,
            },
          };

          const [version] = await tx
            .insert(schema.workflowVersions)
            .values({
              workflowDefinitionId: row.id,
              tenantId,
              versionNumber: 1,
              label: 'v1 (imported)',
              snapshot,
              publishedAt: new Date(),
              createdBy: userId,
            })
            .returning();

          await tx
            .update(schema.workflowDefinitions)
            .set({
              status: 'published',
              publishedVersionId: version.id,
              updatedBy: userId,
              updatedAt: new Date(),
            })
            .where(eq(schema.workflowDefinitions.id, row.id));

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

  private hasImportedWorkflowAgentDependencies(
    nodes: schema.ReactFlowNode[],
  ): boolean {
    return nodes.some((node) => {
      if (this.getWorkflowNodeType(node) !== 'agent') {
        return false;
      }

      const runtimeNodeData = this.getRuntimeNodeData(node.data);
      return Boolean(
        this.readFirstString(
          runtimeNodeData.agentDefinitionId,
          runtimeNodeData.agent_definition_id,
          runtimeNodeData.selectedAgentId,
          runtimeNodeData.selected_agent_id,
        ),
      );
    });
  }

  private async cloneImportedWorkflowAgentDependencies(params: {
    nodes: schema.ReactFlowNode[];
    sourceTenantId: string;
    importSource: 'marketplace' | 'share';
    importReference: string;
    targetTenantId: string;
    targetUserId: string;
    dbClient: WorkflowDbClient;
  }): Promise<void> {
    const context: ImportedWorkflowAgentCloneContext = {
      importSource: params.importSource,
      importReference: params.importReference,
      targetTenantId: params.targetTenantId,
      targetUserId: params.targetUserId,
      clonedAgents: new Map(),
      sourceModels: new Map(),
      targetModels: null,
      activeAgentCloneStack: new Set(),
    };

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
        context,
        dbClient: params.dbClient,
      });

      clearNodeConfigField(node, 'selected_agent_id');
      clearNodeConfigField(node, 'agent_definition_id');
      clearNodeConfigField(node, 'agent_version_id');
      clearNodeConfigField(node, 'agent_name');
      clearNodeConfigField(node, 'version_label');
      clearNodeConfigField(node, 'agent_runtime_mode');
      setNodeConfigField(
        node,
        'selectedAgentId',
        clonedAgent.agentDefinitionId,
      );
      setNodeConfigField(
        node,
        'agentDefinitionId',
        clonedAgent.agentDefinitionId,
      );
      setNodeConfigField(
        node,
        'agentVersionId',
        clonedAgent.publishedVersionId,
      );
      setNodeConfigField(node, 'agentName', clonedAgent.name);
      setNodeConfigField(node, 'versionLabel', 'published');
      setNodeConfigField(node, 'agentRuntimeMode', clonedAgent.runtimeMode);
    }
  }

  private async localizeImportedWorkflowSharedResources(params: {
    nodes: schema.ReactFlowNode[];
    sourceTenantId: string;
    targetTenantId: string;
    targetUserId: string;
    dbClient: WorkflowDbClient;
  }): Promise<void> {
    const hasBindings = params.nodes.some((node) => {
      const nodeType = this.getWorkflowNodeType(node);
      const runtimeNodeData = this.getRuntimeNodeData(node.data);

      if (nodeType === 'workspace') {
        return Boolean(
          this.readFirstString(
            runtimeNodeData.workspaceId,
            runtimeNodeData.workspace_id,
          ),
        );
      }

      if (nodeType !== 'sandbox') {
        return false;
      }

      return Boolean(
        this.readFirstString(
          runtimeNodeData.restoreWorkspaceId,
          runtimeNodeData.restore_workspace_id,
          runtimeNodeData.persistentSandboxId,
          runtimeNodeData.persistent_sandbox_id,
        ),
      );
    });

    if (!hasBindings) {
      return;
    }

    const targetOrganizationId =
      await this.resolveImportedWorkflowTargetOrganizationId(
        params.targetTenantId,
        params.dbClient,
      );
    const clonedWorkspaces = new Map<
      string,
      ImportedWorkflowWorkspaceCloneResult
    >();

    for (const node of params.nodes) {
      const nodeType = this.getWorkflowNodeType(node);
      const runtimeNodeData = this.getRuntimeNodeData(node.data);

      if (nodeType === 'workspace') {
        const sourceWorkspaceId = this.readFirstString(
          runtimeNodeData.workspaceId,
          runtimeNodeData.workspace_id,
        );
        if (!sourceWorkspaceId) {
          continue;
        }

        const clonedWorkspace = await this.cloneImportedWorkflowWorkspace({
          sourceTenantId: params.sourceTenantId,
          sourceWorkspaceId,
          fallbackName:
            this.readFirstString(
              runtimeNodeData.workspaceName,
              runtimeNodeData.workspace_name,
            ) ??
            this.getWorkflowNodeLabel(node) ??
            '项目工作区',
          targetTenantId: params.targetTenantId,
          targetOrganizationId,
          targetUserId: params.targetUserId,
          dbClient: params.dbClient,
          clonedWorkspaces,
        });

        clearNodeConfigField(node, 'workspace_id');
        clearNodeConfigField(node, 'workspace_name');
        setNodeConfigField(node, 'workspaceId', clonedWorkspace.workspaceId);
        setNodeConfigField(node, 'workspaceName', clonedWorkspace.name);
        continue;
      }

      if (nodeType !== 'sandbox') {
        continue;
      }

      const sourceRestoreWorkspaceId = this.readFirstString(
        runtimeNodeData.restoreWorkspaceId,
        runtimeNodeData.restore_workspace_id,
      );
      if (sourceRestoreWorkspaceId) {
        const clonedWorkspace = await this.cloneImportedWorkflowWorkspace({
          sourceTenantId: params.sourceTenantId,
          sourceWorkspaceId: sourceRestoreWorkspaceId,
          fallbackName: '导入工作区',
          targetTenantId: params.targetTenantId,
          targetOrganizationId,
          targetUserId: params.targetUserId,
          dbClient: params.dbClient,
          clonedWorkspaces,
        });

        clearNodeConfigField(node, 'restore_workspace_id');
        setNodeConfigField(
          node,
          'restoreWorkspaceId',
          clonedWorkspace.workspaceId,
        );
      }

      clearNodeConfigField(node, 'persistentSandboxId');
      clearNodeConfigField(node, 'persistent_sandbox_id');
    }
  }

  private async cloneImportedWorkflowWorkspace(params: {
    sourceTenantId: string;
    sourceWorkspaceId: string;
    fallbackName: string;
    targetTenantId: string;
    targetOrganizationId: string;
    targetUserId: string;
    dbClient: WorkflowDbClient;
    clonedWorkspaces: Map<string, ImportedWorkflowWorkspaceCloneResult>;
  }): Promise<ImportedWorkflowWorkspaceCloneResult> {
    const cached = params.clonedWorkspaces.get(params.sourceWorkspaceId);
    if (cached) {
      return cached;
    }

    const [sourceSnapshot] = await params.dbClient
      .select({
        name: schema.workspaceSnapshots.name,
        description: schema.workspaceSnapshots.description,
      })
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, params.sourceWorkspaceId),
          eq(schema.workspaceSnapshots.tenantId, params.sourceTenantId),
          ne(schema.workspaceSnapshots.status, 'deleted'),
        ),
      )
      .limit(1);

    const name =
      this.normalizeOptionalText(sourceSnapshot?.name ?? undefined) ??
      this.normalizeOptionalText(params.fallbackName) ??
      '项目工作区';
    const description =
      this.normalizeOptionalText(sourceSnapshot?.description ?? undefined) ??
      '从 Marketplace/分享导入的工作流已重置为本地空工作区。';

    const [snapshot] = await params.dbClient
      .insert(schema.workspaceSnapshots)
      .values({
        organizationId: params.targetOrganizationId,
        tenantId: params.targetTenantId,
        name,
        description,
        storageKey: 'pending',
        status: 'ready',
        sizeBytes: 0,
        createdById: params.targetUserId,
        config: {
          importedFromWorkflow: {
            sourceTenantId: params.sourceTenantId,
            sourceWorkspaceId: params.sourceWorkspaceId,
            importedAt: new Date().toISOString(),
          },
        },
      })
      .returning();

    const [updated] = await params.dbClient
      .update(schema.workspaceSnapshots)
      .set({
        storageKey: buildWorkspaceStorageKey(
          params.targetTenantId,
          snapshot.id,
        ),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workspaceSnapshots.id, snapshot.id),
          eq(schema.workspaceSnapshots.tenantId, params.targetTenantId),
        ),
      )
      .returning();

    const created = {
      workspaceId: (updated ?? snapshot).id,
      name: (updated ?? snapshot).name,
    };
    params.clonedWorkspaces.set(params.sourceWorkspaceId, created);
    return created;
  }

  private async resolveImportedWorkflowTargetOrganizationId(
    tenantId: string,
    dbClient: WorkflowDbClient,
  ): Promise<string> {
    const [organization] = await dbClient
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);

    if (!organization) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-organization-not-found',
        title: '导入目标组织不存在',
        status: HttpStatus.NOT_FOUND,
        detail: `未找到租户 ${tenantId} 对应的组织，无法导入共享资源`,
      });
    }

    return organization.id;
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
      const clonedCanvas = cloneDefinitionWithNewIds({
        nodes: cloneJson(source.snapshot.nodes),
        edges: cloneJson(source.snapshot.edges),
        viewport: cloneJson(source.snapshot.viewport ?? DEFAULT_VIEWPORT),
      });

      for (const node of clonedCanvas.nodes) {
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

            clearNodeConfigField(node, 'agent_definition_id');
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

          case 'llm-model': {
            await this.remapImportedWorkflowAgentModelNode({
              node,
              runtimeNodeData,
              sourceTenantId: params.sourceTenantId,
              context: params.context,
              dbClient: params.dbClient,
              sourceAgentName: source.name,
            });
            break;
          }

          case 'knowledge-base': {
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
          }

          case 'memory': {
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
          }

          case 'mcp-tool': {
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
          }

          case 'skill': {
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
          }

          default:
            break;
        }
      }

      const importedAt = new Date().toISOString();
      const created = await this.insertImportedWorkflowAgentDefinition(
        {
          name:
            params.context.importSource === 'marketplace'
              ? source.name
              : `${source.name} 副本`,
          description: source.description,
          icon: source.icon,
          runtimeMode: source.runtimeMode,
          nodes: clonedCanvas.nodes,
          edges: clonedCanvas.edges,
          viewport: source.snapshot.viewport ?? DEFAULT_VIEWPORT,
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

  private async remapImportedWorkflowAgentModelNode(params: {
    node: schema.ReactFlowNode;
    runtimeNodeData: Record<string, unknown>;
    sourceTenantId: string;
    context: ImportedWorkflowAgentCloneContext;
    dbClient: WorkflowDbClient;
    sourceAgentName: string;
  }): Promise<void> {
    const sourceModelBindingId = this.readFirstString(
      params.runtimeNodeData.llmConfigId,
      params.runtimeNodeData.llm_config_id,
      params.runtimeNodeData.modelConfigId,
      params.runtimeNodeData.model_config_id,
    );

    if (!sourceModelBindingId) {
      return;
    }

    const sourceModel = await this.loadImportedWorkflowSourceModel({
      sourceTenantId: params.sourceTenantId,
      sourceModelBindingId,
      context: params.context,
    });
    const targetModel = await this.resolveImportedWorkflowTargetModel({
      sourceModel,
      runtimeNodeData: params.runtimeNodeData,
      targetTenantId: params.context.targetTenantId,
      context: params.context,
      dbClient: params.dbClient,
    });

    if (!targetModel) {
      const providerBaseUrl = this.normalizeOptionalText(
        sourceModel.provider.baseUrl ??
          sourceModel.provider.defaultBaseUrl ??
          undefined,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/workflow-import-model-not-found',
        title: '目标租户缺少所需模型配置',
        status: HttpStatus.CONFLICT,
        detail: `依赖 Agent「${params.sourceAgentName}」需要模型 ${sourceModel.config.modelId}（provider=${sourceModel.provider.slug}${providerBaseUrl ? `, baseUrl=${providerBaseUrl}` : ''}），请先在当前账号配置对应模型`,
      });
    }

    clearNodeConfigField(params.node, 'llm_config_id');
    clearNodeConfigField(params.node, 'model_config_id');
    clearNodeConfigField(params.node, 'api_key_id');
    clearNodeConfigField(params.node, 'endpoint_url');
    setNodeConfigField(params.node, 'llmConfigId', targetModel.config.id);
    setNodeConfigField(params.node, 'modelConfigId', targetModel.config.id);
    setNodeConfigField(params.node, 'provider', targetModel.provider.slug);
    setNodeConfigField(params.node, 'name', targetModel.config.name);
    setNodeConfigField(params.node, 'modelName', targetModel.config.modelId);
    setNodeConfigField(params.node, 'modelId', targetModel.config.modelId);
    setNodeConfigField(params.node, 'modelType', targetModel.config.modelType);

    if (targetModel.provider.apiKeyId) {
      setNodeConfigField(
        params.node,
        'apiKeyId',
        targetModel.provider.apiKeyId,
      );
    } else {
      clearNodeConfigField(params.node, 'apiKeyId');
    }

    const endpointUrl = this.normalizeOptionalText(
      targetModel.provider.baseUrl ??
        targetModel.provider.defaultBaseUrl ??
        undefined,
    );
    if (endpointUrl) {
      setNodeConfigField(params.node, 'endpointUrl', endpointUrl);
    } else {
      clearNodeConfigField(params.node, 'endpointUrl');
    }
  }

  private async loadImportedWorkflowSourceModel(params: {
    sourceTenantId: string;
    sourceModelBindingId: string;
    context: ImportedWorkflowAgentCloneContext;
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

  private async resolveImportedWorkflowTargetModel(params: {
    sourceModel: ImportedWorkflowModelRecord;
    runtimeNodeData: Record<string, unknown>;
    targetTenantId: string;
    context: ImportedWorkflowAgentCloneContext;
    dbClient: WorkflowDbClient;
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
      return this.pickImportedWorkflowTargetModel(
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
      return this.pickImportedWorkflowTargetModel(
        looseMatches,
        params.sourceModel.config.name,
      );
    }

    return null;
  }

  private pickImportedWorkflowTargetModel(
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
