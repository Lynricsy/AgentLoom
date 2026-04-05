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
          const [row] = await tx
            .insert(schema.workflowDefinitions)
            .values({
              tenantId,
              name: dto.name,
              slug,
              description: dto.description ?? null,
              icon: dto.icon ?? null,
              nodes,
              edges,
              viewport,
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
          await this.resourceSourceService.recordImportedResources(tenantId, userId, [
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
          ]);
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

  private getWorkflowNodeLabel(
    node: schema.ReactFlowNode,
  ): string | undefined {
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
