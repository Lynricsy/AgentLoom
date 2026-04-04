import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, count, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { ResourceSourceKind } from '../../database/schema';
import {
  knowledgeBases,
  type KnowledgeBase,
  documents,
} from '../../database/schema/knowledge-bases.schema';
import { knowledgeNodes } from '../../database/schema/knowledge-nodes.schema';
import { LlmService } from '../llm/llm.service';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import { EMBEDDING_MODEL } from './knowledge.constants';
import { CreateKnowledgeBaseDto, UpdateKnowledgeBaseSettingsDto } from './dto';
import { KnowledgeBaseNotFoundException } from './knowledge.exceptions';
import {
  createDefaultChunkingStrategy,
  createDefaultQueryOrchestration,
  createDefaultRetrievalStrategy,
  createDefaultRerankerStrategy,
  type KnowledgeChunkingStrategy,
  type KnowledgeQueryOrchestrationStrategy,
  type KnowledgeRetrievalStrategy,
  type KnowledgeRerankerStrategy,
} from './knowledge-base-config';

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
  nodeCount: number;
  chunkCount: number;
  status: KnowledgeBaseStatus;
  sourceKind: ResourceSourceKind;
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
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  async create(
    dto: CreateKnowledgeBaseDto,
    tenantId: string,
    userId: string,
  ): Promise<KnowledgeBaseSummary> {
    const embeddingSelection = await this.resolveEmbeddingSelection(
      tenantId,
      dto.embeddingModelConfigId,
      dto.embeddingModel,
    );
    const db = getTenantDb(this.db);
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        tenantId,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        chunkingStrategy:
          dto.chunkingStrategy ?? createDefaultChunkingStrategy(),
        retrievalStrategy:
          dto.retrievalStrategy ?? createDefaultRetrievalStrategy(),
        rerankingStrategy:
          dto.rerankingStrategy ?? createDefaultRerankerStrategy(),
        queryOrchestration:
          dto.queryOrchestration ?? createDefaultQueryOrchestration(),
        embeddingModel: embeddingSelection.modelName,
        embeddingModelConfigId: embeddingSelection.modelConfigId,
        createdBy: userId,
      })
      .returning();
    return {
      ...knowledgeBase,
      documentCount: 0,
      nodeCount: 0,
      chunkCount: 0,
      status: 'empty',
      sourceKind: 'manual',
    };
  }

  async findAllByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
    sourceKind?: ResourceSourceKind,
  ): Promise<{ data: KnowledgeBase[]; total: number }> {
    const db = getTenantDb(this.db);
    const offset = (page - 1) * pageSize;
    const conditions = [eq(knowledgeBases.tenantId, tenantId)];

    if (sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'knowledge_base',
          resourceIdColumn: knowledgeBases.id,
        });

      conditions.push(
        sourceKind === 'share_imported'
          ? importedExistsCondition
          : sql`not (${importedExistsCondition})`,
      );
    }

    const predicate = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(knowledgeBases)
        .where(predicate)
        .orderBy(desc(knowledgeBases.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(knowledgeBases)
        .where(predicate),
    ]);

    return { data, total };
  }

  async findSummariesByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
    sourceKind?: ResourceSourceKind,
  ): Promise<{ data: KnowledgeBaseSummary[]; total: number }> {
    const { data, total } = await this.findAllByTenant(
      tenantId,
      page,
      pageSize,
      sourceKind,
    );
    return {
      data: await this.hydrateSummaries(data, tenantId),
      total,
    };
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<KnowledgeBase> {
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
    const db = getTenantDb(this.db);
    await db
      .delete(knowledgeBases)
      .where(
        and(eq(knowledgeBases.id, id), eq(knowledgeBases.tenantId, tenantId)),
      );
  }

  async updateSettings(
    id: string,
    tenantId: string,
    dto: UpdateKnowledgeBaseSettingsDto,
  ): Promise<KnowledgeBaseSummary> {
    const existing = await this.findByIdOrThrow(id, tenantId);

    const db = getTenantDb(this.db);
    const updateData: Record<string, unknown> = {};
    if (dto.chunkingStrategy !== undefined) {
      updateData.chunkingStrategy = dto.chunkingStrategy;
    }
    if (dto.retrievalStrategy !== undefined) {
      updateData.retrievalStrategy = dto.retrievalStrategy;
    }
    if (dto.rerankingStrategy !== undefined) {
      updateData.rerankingStrategy = dto.rerankingStrategy;
    }
    if (dto.queryOrchestration !== undefined) {
      updateData.queryOrchestration = dto.queryOrchestration;
    }
    if (
      dto.embeddingModel !== undefined ||
      dto.embeddingModelConfigId !== undefined
    ) {
      const embeddingSelection = await this.resolveEmbeddingSelection(
        tenantId,
        dto.embeddingModelConfigId,
        dto.embeddingModel ?? existing.embeddingModel,
      );
      updateData.embeddingModel = embeddingSelection.modelName;
      updateData.embeddingModelConfigId = embeddingSelection.modelConfigId;
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(knowledgeBases)
        .set({ ...updateData, updatedAt: new Date() })
        .where(
          and(eq(knowledgeBases.id, id), eq(knowledgeBases.tenantId, tenantId)),
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
          knowledgeBaseId: knowledgeNodes.knowledgeBaseId,
          nodeCount: sql<number>`count(*)::int`,
        })
        .from(knowledgeNodes)
        .where(
          and(
            eq(knowledgeNodes.tenantId, tenantId),
            inArray(knowledgeNodes.knowledgeBaseId, knowledgeBaseIds),
          ),
        )
        .groupBy(knowledgeNodes.knowledgeBaseId),
    ]);

    const statusMap = new Map<string, KnowledgeBaseStatusCounters>();
    for (const row of documentRows) {
      const counters = statusMap.get(row.knowledgeBaseId) ?? {
        ...EMPTY_COUNTERS,
      };
      counters.documentCount += 1;
      this.bumpStatusCounter(counters, row.status);
      statusMap.set(row.knowledgeBaseId, counters);
    }

    const chunkCountMap = new Map(
      chunkRows.map((row) => [row.knowledgeBaseId, row.nodeCount]),
    );
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'knowledge_base',
      knowledgeBaseIds,
    );

    return items.map((item) => {
      const counters = statusMap.get(item.id) ?? EMPTY_COUNTERS;
      const nodeCount = chunkCountMap.get(item.id) ?? 0;
      return {
        ...item,
        documentCount: counters.documentCount,
        nodeCount,
        chunkCount: nodeCount,
        status: this.getKnowledgeBaseStatus(counters),
        sourceKind: sourceKindMap.get(item.id) ?? 'manual',
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

  private async resolveEmbeddingSelection(
    tenantId: string,
    requestedModelConfigId: string | null | undefined,
    requestedModelName?: string,
  ): Promise<{ modelName: string; modelConfigId: string | null }> {
    if (requestedModelConfigId) {
      const config = await this.llmService.findById(
        requestedModelConfigId,
        tenantId,
      );
      if (config.modelType !== 'embedding') {
        throw new Error('知识库只能绑定 Embedding 模型配置');
      }
      return {
        modelName: config.modelId,
        modelConfigId: config.id,
      };
    }

    const defaultEmbeddingModel = await this.llmService.findDefaultByType(
      tenantId,
      'embedding',
    );
    if (defaultEmbeddingModel) {
      return {
        modelName: defaultEmbeddingModel.modelId,
        modelConfigId: defaultEmbeddingModel.id,
      };
    }

    return {
      modelName: requestedModelName ?? EMBEDDING_MODEL,
      modelConfigId: null,
    };
  }

  getChunkingStrategy(
    knowledgeBase: Pick<KnowledgeBase, 'chunkingStrategy'>,
  ): KnowledgeChunkingStrategy {
    return knowledgeBase.chunkingStrategy ?? createDefaultChunkingStrategy();
  }

  getRetrievalStrategy(
    knowledgeBase: Pick<KnowledgeBase, 'retrievalStrategy'>,
  ): KnowledgeRetrievalStrategy {
    return knowledgeBase.retrievalStrategy ?? createDefaultRetrievalStrategy();
  }

  getRerankingStrategy(
    knowledgeBase: Pick<KnowledgeBase, 'rerankingStrategy'>,
  ): KnowledgeRerankerStrategy {
    return knowledgeBase.rerankingStrategy ?? createDefaultRerankerStrategy();
  }

  getQueryOrchestration(
    knowledgeBase: Pick<KnowledgeBase, 'queryOrchestration'>,
  ): KnowledgeQueryOrchestrationStrategy {
    return (
      knowledgeBase.queryOrchestration ?? createDefaultQueryOrchestration()
    );
  }
}
