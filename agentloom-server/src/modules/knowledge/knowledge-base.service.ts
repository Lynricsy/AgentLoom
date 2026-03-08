import { Inject, Injectable } from '@nestjs/common';
import { eq, desc, sql, count } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  knowledgeBases,
  type KnowledgeBase,
} from '../../database/schema/knowledge-bases.schema';
import { CreateKnowledgeBaseDto } from './dto';
import { KnowledgeBaseNotFoundException } from './knowledge.exceptions';

@Injectable()
export class KnowledgeBaseService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(
    dto: CreateKnowledgeBaseDto,
    tenantId: string,
    userId: string,
  ): Promise<KnowledgeBase> {
    const db = getTenantDb(this.db);
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        tenantId,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        createdBy: userId,
      })
      .returning();
    return knowledgeBase;
  }

  async findAllByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: KnowledgeBase[]; total: number }> {
    const db = getTenantDb(this.db);
    const offset = (page - 1) * pageSize;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(knowledgeBases)
        .where(eq(knowledgeBases.tenantId, tenantId))
        .orderBy(desc(knowledgeBases.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(knowledgeBases)
        .where(eq(knowledgeBases.tenantId, tenantId)),
    ]);

    return { data, total };
  }

  async findByIdOrThrow(
    id: string,
    tenantId: string,
  ): Promise<KnowledgeBase> {
    const db = getTenantDb(this.db);
    const [knowledgeBase] = await db
      .select()
      .from(knowledgeBases)
      .where(
        sql`${knowledgeBases.id} = ${id} AND ${knowledgeBases.tenantId} = ${tenantId}`,
      )
      .limit(1);

    if (!knowledgeBase) {
      throw new KnowledgeBaseNotFoundException(id);
    }

    return knowledgeBase;
  }
}
