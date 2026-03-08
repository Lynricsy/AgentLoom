import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, count, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  knowledgeBases,
  type KnowledgeBase,
  documents,
} from '../../database/schema/knowledge-bases.schema';
import { documentChunks } from '../../database/schema/document-chunks.schema';
import { CreateKnowledgeBaseDto, UpdateKnowledgeBaseSettingsDto } from './dto';
import { KnowledgeBaseNotFoundException } from './knowledge.exceptions';

type DocumentStatus = (typeof documents)['$inferSelect']['status'];

interface KnowledgeBaseStatusCounters {
  documentCount: number;
  uploadedCount: number;
  processingCount: number;
  readyCount: number;
  failedCount: number;
}

export type KnowledgeBaseStatus = 'empty' | 'processing' | 'ready' | 'failed';

export interface KnowledgeBaseSummary extends KnowledgeBase {
  documentCount: number;
  chunkCount: number;
  status: KnowledgeBaseStatus;
}

const EMPTY_COUNTERS: KnowledgeBaseStatusCounters = {
  documentCount: 0,
  uploadedCount: 0,
  processingCount: 0,
  readyCount: 0,
  failedCount: 0,
};

@Injectable()
export class KnowledgeBaseService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(
    dto: CreateKnowledgeBaseDto,
    tenantId: string,
    userId: string,
  ): Promise<KnowledgeBaseSummary> {
    const db = getTenantDb(this.db);
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        tenantId,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        chunkSize: dto.chunkSize,
        chunkOverlap: dto.chunkOverlap,
        embeddingModel: dto.embeddingModel,
        createdBy: userId,
      })
      .returning();
    return {
      ...knowledgeBase,
      documentCount: 0,
      chunkCount: 0,
      status: 'empty',
    };
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

  async findSummariesByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: KnowledgeBaseSummary[]; total: number }> {
    const { data, total } = await this.findAllByTenant(tenantId, page, pageSize);
    return {
      data: await this.hydrateSummaries(data, tenantId),
      total,
    };
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

  async findSummaryByIdOrThrow(
    id: string,
    tenantId: string,
  ): Promise<KnowledgeBaseSummary> {
    const knowledgeBase = await this.findByIdOrThrow(id, tenantId);
    const [summary] = await this.hydrateSummaries([knowledgeBase], tenantId);

    if (!summary) {
      throw new KnowledgeBaseNotFoundException(id);
    }

    return summary;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    // TODO: Clean up vector index entries when deleting KB (blocked by Story 4.4)
    const db = getTenantDb(this.db);
    await db
      .delete(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, id),
          eq(knowledgeBases.tenantId, tenantId),
        ),
      );
  }

  async updateSettings(
    id: string,
    tenantId: string,
    dto: UpdateKnowledgeBaseSettingsDto,
  ): Promise<KnowledgeBaseSummary> {
    await this.findByIdOrThrow(id, tenantId);

    const db = getTenantDb(this.db);
    const updateData: Record<string, unknown> = {};
    if (dto.chunkSize !== undefined) updateData.chunkSize = dto.chunkSize;
    if (dto.chunkOverlap !== undefined) updateData.chunkOverlap = dto.chunkOverlap;
    if (dto.embeddingModel !== undefined) updateData.embeddingModel = dto.embeddingModel;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(knowledgeBases)
        .set({ ...updateData, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeBases.id, id),
            eq(knowledgeBases.tenantId, tenantId),
          ),
        );
    }

    return this.findSummaryByIdOrThrow(id, tenantId);
  }

  private async hydrateSummaries(
    items: KnowledgeBase[],
    tenantId: string,
  ): Promise<KnowledgeBaseSummary[]> {
    if (items.length === 0) {
      return [];
    }

    const db = getTenantDb(this.db);
    const knowledgeBaseIds = items.map((item) => item.id);

    const [documentRows, chunkRows] = await Promise.all([
      db
        .select({
          knowledgeBaseId: documents.knowledgeBaseId,
          status: documents.status,
        })
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, tenantId),
            inArray(documents.knowledgeBaseId, knowledgeBaseIds),
          ),
        ),
      db
        .select({
          knowledgeBaseId: documentChunks.knowledgeBaseId,
          chunkCount: sql<number>`count(*)::int`,
        })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.tenantId, tenantId),
            inArray(documentChunks.knowledgeBaseId, knowledgeBaseIds),
          ),
        )
        .groupBy(documentChunks.knowledgeBaseId),
    ]);

    const statusMap = new Map<string, KnowledgeBaseStatusCounters>();
    for (const row of documentRows) {
      const counters = statusMap.get(row.knowledgeBaseId) ?? { ...EMPTY_COUNTERS };
      counters.documentCount += 1;
      this.bumpStatusCounter(counters, row.status);
      statusMap.set(row.knowledgeBaseId, counters);
    }

    const chunkCountMap = new Map(
      chunkRows.map((row) => [row.knowledgeBaseId, row.chunkCount]),
    );

    return items.map((item) => {
      const counters = statusMap.get(item.id) ?? EMPTY_COUNTERS;
      return {
        ...item,
        documentCount: counters.documentCount,
        chunkCount: chunkCountMap.get(item.id) ?? 0,
        status: this.getKnowledgeBaseStatus(counters),
      };
    });
  }

  private bumpStatusCounter(
    counters: KnowledgeBaseStatusCounters,
    status: DocumentStatus,
  ): void {
    switch (status) {
      case 'uploaded':
        counters.uploadedCount += 1;
        return;
      case 'processing':
        counters.processingCount += 1;
        return;
      case 'ready':
        counters.readyCount += 1;
        return;
      case 'failed':
        counters.failedCount += 1;
        return;
    }
  }

  private getKnowledgeBaseStatus(
    counters: KnowledgeBaseStatusCounters,
  ): KnowledgeBaseStatus {
    if (counters.documentCount === 0) {
      return 'empty';
    }

    if (counters.uploadedCount > 0 || counters.processingCount > 0) {
      return 'processing';
    }

    if (counters.readyCount > 0) {
      return 'ready';
    }

    return 'failed';
  }
}
