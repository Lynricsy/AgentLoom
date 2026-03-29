import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  documents,
  knowledgeBases,
} from '../../../database/schema/knowledge-bases.schema';
import { organizations } from '../../../database/schema/organizations.schema';
import { EvidenceEventName } from '../../evidence/evidence.events';
import { VECTOR_STORE, EMBEDDING_DIMENSIONS } from '../knowledge.constants';
import { DocumentChunkService } from '../document-chunk.service';
import { EmbeddingService } from './embedding.service';
import { LlmService } from '../../llm/llm.service';
import type {
  VectorStore,
  VectorPoint,
} from '../interfaces/vector-store.interface';

export interface RagSearchOptions {
  knowledgeBaseId?: string;
  limit?: number;
  scoreThreshold?: number;
  evidenceContext?: {
    executionId: string;
    stepId: string;
    parentEvidenceId?: string;
  };
}

export interface RagSearchResult {
  chunkId: string;
  score: number;
  content: string;
  location: Record<string, unknown> | null;
  documentId: string;
  knowledgeBaseId: string;
  chunkIndex: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    private readonly embeddingService: EmbeddingService,
    private readonly documentChunkService: DocumentChunkService,
    private readonly llmService: LlmService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private getCollectionName(knowledgeBaseId: string): string {
    return `knowledge_${knowledgeBaseId}`;
  }

  private async resolveOrganizationId(tenantId: string): Promise<string> {
    const [org] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization not found for tenantId: ${tenantId}`);
    }

    return org.id;
  }

  async indexDocument(documentId: string, tenantId: string): Promise<void> {
    const chunks = await this.documentChunkService.findByDocumentId(
      documentId,
      tenantId,
    );

    if (chunks.length === 0) {
      this.logger.warn(
        `No chunks found for document ${documentId}, skipping indexing`,
      );
      return;
    }

    const knowledgeBaseId = chunks[0]!.knowledgeBaseId;
    const embeddingConfig = await this.resolveEmbeddingConfig(
      tenantId,
      knowledgeBaseId,
    );
    const collectionName = this.getCollectionName(knowledgeBaseId);

    await this.vectorStore.createCollection(
      collectionName,
      embeddingConfig.dimensions ?? EMBEDDING_DIMENSIONS,
    );

    const texts = chunks.map((chunk) => chunk.content);
    const embeddings = await this.embeddingService.generateEmbeddings(
      texts,
      embeddingConfig,
    );

    const points: VectorPoint[] = chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: embeddings[index],
      payload: {
        documentId: chunk.documentId,
        knowledgeBaseId: chunk.knowledgeBaseId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        location: chunk.metadata,
      },
    }));

    try {
      await this.vectorStore.upsert(collectionName, points);
    } catch (error) {
      this.logger.error(
        `Failed to upsert vectors for document ${documentId}, rolling back`,
      );
      try {
        await this.vectorStore.deleteByFilter(collectionName, {
          must: [{ key: 'documentId', match: { value: documentId } }],
        });
      } catch (rollbackError) {
        this.logger.error(
          `Rollback failed for document ${documentId}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
      throw error;
    }

    this.logger.log(
      `Indexed ${points.length} chunks for document ${documentId}`,
    );
  }

  async search(
    query: string,
    tenantId: string,
    options: RagSearchOptions = {},
  ): Promise<RagSearchResult[]> {
    if (!options.knowledgeBaseId) {
      this.logger.warn(
        'RagService.search 未提供 knowledgeBaseId，当前仅支持按知识库检索',
      );
      return [];
    }

    const collectionName = this.getCollectionName(options.knowledgeBaseId);

    const exists = await this.vectorStore.collectionExists(collectionName);
    if (!exists) {
      return [];
    }

    const embeddingConfig = await this.resolveEmbeddingConfig(
      tenantId,
      options.knowledgeBaseId,
    );
    const [queryEmbedding] = await this.embeddingService.generateEmbeddings(
      [query],
      embeddingConfig,
    );

    const rawResults = await this.vectorStore.search({
      collectionName,
      vector: queryEmbedding,
      limit: options.limit ?? 10,
      scoreThreshold: options.scoreThreshold,
    });

    const results = rawResults.map((r) => ({
      chunkId: r.id,
      score: r.score,
      content: (r.payload.content as string) ?? '',
      location: (r.payload.location as Record<string, unknown>) ?? null,
      documentId: (r.payload.documentId as string) ?? '',
      knowledgeBaseId: (r.payload.knowledgeBaseId as string) ?? '',
      chunkIndex: (r.payload.chunkIndex as number) ?? 0,
    }));

    if (options.evidenceContext && results.length > 0) {
      this.eventEmitter?.emit(EvidenceEventName.RAG_RETRIEVED, {
        tenantId,
        executionId: options.evidenceContext.executionId,
        stepId: options.evidenceContext.stepId,
        parentEvidenceId: options.evidenceContext.parentEvidenceId,
        results,
      });
    }

    return results;
  }

  async deleteByDocument(documentId: string, tenantId: string): Promise<void> {
    const [document] = await this.db
      .select({
        knowledgeBaseId: documents.knowledgeBaseId,
      })
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
      )
      .limit(1);
    if (!document) return;

    const collectionName = this.getCollectionName(document.knowledgeBaseId);

    const exists = await this.vectorStore.collectionExists(collectionName);
    if (!exists) return;

    await this.vectorStore.deleteByFilter(collectionName, {
      must: [{ key: 'documentId', match: { value: documentId } }],
    });
    this.logger.log(
      `Deleted vectors for document ${documentId} from "${collectionName}"`,
    );
  }

  async deleteKnowledgeBaseCollection(knowledgeBaseId: string): Promise<void> {
    const collectionName = this.getCollectionName(knowledgeBaseId);
    await this.vectorStore.deleteCollection(collectionName);
  }

  private async resolveEmbeddingConfig(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<Parameters<EmbeddingService['generateEmbeddings']>[1]> {
    const organizationId = await this.resolveOrganizationId(tenantId);
    const [knowledgeBase] = await this.db
      .select({
        embeddingModel: knowledgeBases.embeddingModel,
        embeddingModelConfigId: knowledgeBases.embeddingModelConfigId,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          eq(knowledgeBases.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!knowledgeBase) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }

    if (knowledgeBase.embeddingModelConfigId) {
      const config = await this.llmService.findById(
        knowledgeBase.embeddingModelConfigId,
        tenantId,
      );
      if (config.modelType !== 'embedding') {
        throw new Error(
          `Knowledge base ${knowledgeBaseId} 绑定的模型不是 Embedding 模型`,
        );
      }

      if (config.provider !== 'openai' && config.provider !== 'private_cloud') {
        throw new Error(
          `Embedding 模型仅支持 openai/private_cloud，当前为 ${config.provider}`,
        );
      }

      return {
        organizationId,
        tenantId,
        provider: config.provider,
        modelName: config.modelName,
        apiKeyId: config.apiKeyId,
        endpointUrl: config.endpointUrl,
        authMethod: config.authMethod,
        dimensions: config.embeddingDimensions,
      };
    }

    return {
      organizationId,
      tenantId,
      provider: 'openai',
      modelName: knowledgeBase.embeddingModel,
      apiKeyId: null,
      dimensions: null,
    };
  }
}
