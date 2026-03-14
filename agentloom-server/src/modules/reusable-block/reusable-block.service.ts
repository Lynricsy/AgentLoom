import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { ZodError } from 'zod';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { ReusableBlock } from '../../database/schema/reusable-blocks.schema';
import {
  CreateReusableBlockSchema,
  QueryReusableBlockSchema,
  UpdateReusableBlockSchema,
  type CreateReusableBlockDto,
  type QueryReusableBlockDto,
  type UpdateReusableBlockDto,
} from './dto/reusable-block.dto';
import {
  InvalidBlockDefinitionException,
  ReusableBlockConflictException,
  ReusableBlockNotFoundException,
} from './reusable-block.exceptions';

type ReusableBlockListItem = Omit<ReusableBlock, 'definition'>;

type ReusableBlockListResult = {
  data: ReusableBlockListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class ReusableBlockService {
  private readonly logger = new Logger(ReusableBlockService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private get listColumns() {
    return {
      id: schema.reusableBlocks.id,
      orgId: schema.reusableBlocks.orgId,
      tenantId: schema.reusableBlocks.tenantId,
      name: schema.reusableBlocks.name,
      description: schema.reusableBlocks.description,
      category: schema.reusableBlocks.category,
      tags: schema.reusableBlocks.tags,
      metadata: schema.reusableBlocks.metadata,
      version: schema.reusableBlocks.version,
      isPublished: schema.reusableBlocks.isPublished,
      createdBy: schema.reusableBlocks.createdBy,
      createdAt: schema.reusableBlocks.createdAt,
      updatedAt: schema.reusableBlocks.updatedAt,
    };
  }

  async findAll(
    tenantId: string,
    query: QueryReusableBlockDto,
  ): Promise<ReusableBlockListResult> {
    const parsedQuery = QueryReusableBlockSchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.reusableBlocks.tenantId, tenantId)];

    if (parsedQuery.category) {
      conditions.push(
        eq(schema.reusableBlocks.category, parsedQuery.category),
      );
    }

    if (parsedQuery.search) {
      conditions.push(
        ilike(schema.reusableBlocks.name, `%${parsedQuery.search}%`),
      );
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select(this.listColumns)
        .from(schema.reusableBlocks)
        .where(whereClause)
        .orderBy(desc(schema.reusableBlocks.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.reusableBlocks)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findById(tenantId: string, id: string): Promise<ReusableBlock> {
    const block = await this.findReusableBlock(tenantId, id);

    if (!block) {
      throw new ReusableBlockNotFoundException(id);
    }

    return block;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateReusableBlockDto,
  ): Promise<ReusableBlock> {
    const parsedDto = this.parseCreateDto(dto);
    const orgId = await this.findOrganizationIdOrThrow(tenantId);

    const [created] = await this.tenantDb
      .insert(schema.reusableBlocks)
      .values({
        orgId,
        tenantId,
        name: parsedDto.name,
        description: this.normalizeCreateOptionalText(parsedDto.description),
        category: parsedDto.category ?? null,
        tags: parsedDto.tags,
        definition: parsedDto.definition,
        metadata: parsedDto.metadata ?? null,
        createdBy: userId,
      })
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'reusable_block_created',
        blockId: created.id,
        tenantId,
        userId,
      }),
    );

    return created;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateReusableBlockDto,
  ): Promise<ReusableBlock> {
    const parsedDto = this.parseUpdateDto(dto);

    const setClause: Record<string, unknown> = {
      version: sql`${schema.reusableBlocks.version} + 1`,
      updatedAt: new Date(),
    };

    if (parsedDto.name !== undefined) {
      setClause.name = parsedDto.name;
    }

    if (parsedDto.description !== undefined) {
      setClause.description = this.normalizeNullableOptionalText(
        parsedDto.description,
      );
    }

    if (parsedDto.category !== undefined) {
      setClause.category = parsedDto.category;
    }

    if (parsedDto.tags !== undefined) {
      setClause.tags = parsedDto.tags;
    }

    if (parsedDto.definition !== undefined) {
      setClause.definition = parsedDto.definition;
    }

    if (parsedDto.metadata !== undefined) {
      setClause.metadata = parsedDto.metadata;
    }

    if (parsedDto.isPublished !== undefined) {
      setClause.isPublished = parsedDto.isPublished;
    }

    const [updated] = await this.tenantDb
      .update(schema.reusableBlocks)
      .set(setClause)
      .where(
        and(
          eq(schema.reusableBlocks.id, id),
          eq(schema.reusableBlocks.tenantId, tenantId),
          eq(schema.reusableBlocks.version, parsedDto.version),
        ),
      )
      .returning();

    if (!updated) {
      const currentBlock = await this.findReusableBlock(tenantId, id);

      if (!currentBlock) {
        throw new ReusableBlockNotFoundException(id);
      }

      throw new ReusableBlockConflictException(id, currentBlock.version);
    }

    this.logger.log(
      JSON.stringify({
        action: 'reusable_block_updated',
        blockId: updated.id,
        tenantId,
        version: updated.version,
      }),
    );

    return updated;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.reusableBlocks)
      .where(
        and(
          eq(schema.reusableBlocks.id, id),
          eq(schema.reusableBlocks.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.reusableBlocks.id });

    if (!deleted) {
      throw new ReusableBlockNotFoundException(id);
    }

    this.logger.log(
      JSON.stringify({
        action: 'reusable_block_deleted',
        blockId: id,
        tenantId,
      }),
    );
  }

  private async findReusableBlock(tenantId: string, id: string) {
    const [block] = await this.tenantDb
      .select()
      .from(schema.reusableBlocks)
      .where(
        and(
          eq(schema.reusableBlocks.id, id),
          eq(schema.reusableBlocks.tenantId, tenantId),
        ),
      );

    return block;
  }

  private async findOrganizationIdOrThrow(tenantId: string): Promise<string> {
    const [organization] = await this.tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);

    if (!organization) {
      throw new Error(`No organization found for tenant ${tenantId}`);
    }

    return organization.id;
  }

  private parseCreateDto(dto: CreateReusableBlockDto) {
    const parsed = CreateReusableBlockSchema.safeParse(dto);

    if (!parsed.success) {
      this.rethrowDefinitionValidationError(parsed.error);
    }

    return parsed.data;
  }

  private parseUpdateDto(dto: UpdateReusableBlockDto) {
    const parsed = UpdateReusableBlockSchema.safeParse(dto);

    if (!parsed.success) {
      this.rethrowDefinitionValidationError(parsed.error);
    }

    return parsed.data;
  }

  private rethrowDefinitionValidationError(error: ZodError): never {
    const hasDefinitionIssue = error.issues.some(
      (issue) => issue.path[0] === 'definition' || issue.path[0] === 'edges',
    );

    if (hasDefinitionIssue) {
      const normalizedIssues = error.issues.map((issue) => ({
        ...issue,
        path:
          issue.path[0] === 'definition'
            ? issue.path
            : ['definition', ...issue.path],
      }));

      throw new InvalidBlockDefinitionException(
        new ZodError(normalizedIssues),
      );
    }

    throw error;
  }

  private normalizeCreateOptionalText(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    return value === '' ? null : value;
  }

  private normalizeNullableOptionalText(value: string | null): string | null {
    if (value === null || value === '') {
      return null;
    }

    return value;
  }
}
