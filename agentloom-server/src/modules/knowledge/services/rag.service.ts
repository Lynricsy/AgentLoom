import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { organizations } from '../../../database/schema/organizations.schema';
import { EvidenceEventName } from '../../evidence/evidence.events';
import { VECTOR_STORE, EMBEDDING_DIMENSIONS } from '../knowledge.constants';
import { DocumentChunkService } from '../document-chunk.service';
import { EmbeddingService } from './embedding.service';
import type {
  VectorStore,
  VectorPoint,
  VectorFilter,
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
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private getCollectionName(tenantId: string): string {
    return `knowledge_${tenantId}`;
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
    const collectionName = this.getCollectionName(tenantId);

    await this.vectorStore.createCollection(
      collectionName,
      EMBEDDING_DIMENSIONS,
    );

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

    const organizationId = await this.resolveOrganizationId(tenantId);

    const texts = chunks.map((chunk) => chunk.content);
    const embeddings = await this.embeddingService.generateEmbeddings(
      texts,
      organizationId,
      tenantId,
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
    const collectionName = this.getCollectionName(tenantId);

    const exists = await this.vectorStore.collectionExists(collectionName);
    if (!exists) {
      return [];
    }

    const organizationId = await this.resolveOrganizationId(tenantId);

    const [queryEmbedding] = await this.embeddingService.generateEmbeddings(
      [query],
      organizationId,
      tenantId,
    );

    const filter: VectorFilter | undefined = options.knowledgeBaseId
      ? {
          must: [
            {
              key: 'knowledgeBaseId',
              match: { value: options.knowledgeBaseId },
            },
          ],
        }
      : undefined;

    const rawResults = await this.vectorStore.search({
      collectionName,
      vector: queryEmbedding,
      limit: options.limit ?? 10,
      scoreThreshold: options.scoreThreshold,
      filter,
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
    const collectionName = this.getCollectionName(tenantId);

    const exists = await this.vectorStore.collectionExists(collectionName);
    if (!exists) return;

    await this.vectorStore.deleteByFilter(collectionName, {
      must: [{ key: 'documentId', match: { value: documentId } }],
    });
    this.logger.log(
      `Deleted vectors for document ${documentId} from "${collectionName}"`,
    );
  }

  async deleteCollection(tenantId: string): Promise<void> {
    const collectionName = this.getCollectionName(tenantId);
    await this.vectorStore.deleteCollection(collectionName);
  }
}
