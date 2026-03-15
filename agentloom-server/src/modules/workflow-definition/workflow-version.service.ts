import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, ilike, max, or, sql } from 'drizzle-orm';

import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { transactionStorage } from '../../common/interceptors/tenant-transaction.interceptor';
import { RedisDomain, redisKey } from '../../common/redis/redis-key.util';
import { DomainException } from '../../common/exceptions/domain.exception';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';
import type { WorkflowDefinition } from '../../database/schema/workflow-definitions.schema';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { TemplateService } from '../template/template.service';
import { WorkflowNotPublishedException } from '../execution/execution.exceptions';
import { generateSlug, appendSlugSuffix } from '../organization/slug.utils';
import { cloneDefinitionWithNewIds } from './utils/clone-template.utils';
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
  InvalidStatusTransitionException,
  WorkflowArchivedException,
  WorkflowNotFoundException,
  WorkflowPublishValidationException,
  WorkflowVersionConflictException,
  WorkflowVersionNotFoundException,
} from './workflow-version.exceptions';
import { MarketplaceListingNotFoundException } from '../marketplace/marketplace.exceptions';
import { ShareService } from '../share/share.service';
import { validateImportFile } from './utils/validate-import.utils';

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
  const currentSchema = currentInputSchema ?? createDefaultWorkflowInputSchema();
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
      name: schema.workflowDefinitions.name,
      slug: schema.workflowDefinitions.slug,
      description: schema.workflowDefinitions.description,
      status: schema.workflowDefinitions.status,
      version: schema.workflowDefinitions.version,
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
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(schema.workflowDefinitions.status, query.status));
    }

    if (query.search) {
      const searchTerm = `%${query.search}%`;
      conditions.push(
        or(
          ilike(schema.workflowDefinitions.name, searchTerm),
          ilike(schema.workflowDefinitions.description, searchTerm),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumnMap = {
      updatedAt: schema.workflowDefinitions.updatedAt,
      createdAt: schema.workflowDefinitions.createdAt,
      name: schema.workflowDefinitions.name,
    } as const;
    const sortColumn = sortColumnMap[query.sort ?? 'updatedAt'];
    const orderFn = query.order === 'asc' ? asc : desc;

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select(this.definitionListColumns)
        .from(schema.workflowDefinitions)
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

    return {
      data: data.map(serializeWorkflowDefinition),
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

    return serializeWorkflowDefinition(workflow);
  }

  async findDefinitionDetailById(
    workflowId: string,
  ): Promise<WorkflowDefinitionDetailResponseDto> {
    const workflow = await this.findWorkflowOrThrow(this.tenantDb, workflowId);
    return serializeWorkflowDefinitionDetail(workflow);
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

    return {
      schema_version: WORKFLOW_EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      workflow: {
        name: workflow.name,
        description: workflow.description,
        definition: sanitizeDefinition(definition),
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
        throw new MarketplaceListingNotFoundException(dto.marketplace_listing_id);
      }

      const snapshot = listing.snapshot as WorkflowVersionSnapshot;
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
        const [created] = await this.tenantDb
          .insert(schema.workflowDefinitions)
          .values({
            tenantId,
            name: dto.name,
            slug,
            description: dto.description ?? null,
            nodes,
            edges,
            viewport,
            inputSchema,
            metadata,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning();

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
        const isUniqueViolation =
          error instanceof Error &&
          'code' in error &&
          (error as Record<string, unknown>).code === '23505';

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
        const [created] = await this.tenantDb
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
        const isUniqueViolation =
          error instanceof Error &&
          'code' in error &&
          (error as Record<string, unknown>).code === '23505';

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

        if (dto.name !== undefined) setClause.name = dto.name;
        if (dto.description !== undefined)
          setClause.description = dto.description;
        if (dto.nodes !== undefined) setClause.nodes = dto.nodes;
        if (dto.edges !== undefined) setClause.edges = dto.edges;
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

        await dbClient
          .update(schema.workflowDefinitions)
          .set({
            nodes: targetVersion.snapshot.nodes,
            edges: targetVersion.snapshot.edges,
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

        if (workflow.status !== 'draft') {
          throw new InvalidStatusTransitionException(
            workflow.status,
            'published',
          );
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
        const warnings = this.validateEdgeTypeCompatibility(nodes, edges);

        const publishedAt = new Date();
        const normalizedReleaseNotes = this.normalizeOptionalText(
          dto.releaseNotes,
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
                },
              },
            })
            .where(eq(schema.workflowVersions.id, dto.versionId))
            .returning();

          publishedVersion = updatedVersion;
        } else {
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
              snapshot: this.buildSnapshot(workflow, normalizedReleaseNotes),
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

  private buildSnapshot(
    workflow: typeof schema.workflowDefinitions.$inferSelect,
    releaseNotes: string | null = null,
  ): WorkflowVersionSnapshot {
    return {
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
      viewport: workflow.viewport ?? null,
      inputSchema: workflow.inputSchema ?? null,
      metadata: {
        nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
        edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
        createdFromVersion: workflow.version,
        releaseNotes,
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

  private normalizeOptionalText(value?: string): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
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
    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      label: version.label ?? null,
      snapshot: version.snapshot,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      archivedAt: version.archivedAt?.toISOString() ?? null,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
