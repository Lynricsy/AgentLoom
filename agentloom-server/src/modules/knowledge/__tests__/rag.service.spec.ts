import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { RagService } from '../services/rag.service';
import { EmbeddingService } from '../services/embedding.service';
import { DocumentChunkService } from '../document-chunk.service';
import { VECTOR_STORE, EMBEDDING_DIMENSIONS } from '../knowledge.constants';
import { DRIZZLE } from '../../../database/database.module';
import type { VectorStore } from '../interfaces/vector-store.interface';

const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';
const DOC_ID = '00000000-0000-0000-0000-000000000001';
const KB_ID = 'kb-1';
const COLLECTION = `knowledge_${TENANT_ID}`;

function createMockVectorStore(): Record<keyof VectorStore, Mock> {
  return {
    createCollection: vi.fn(),
    collectionExists: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(),
    deleteByFilter: vi.fn(),
    deleteCollection: vi.fn(),
  };
}

function createMockChunk(index: number) {
  return {
    id: `chunk-${index}`,
    documentId: DOC_ID,
    knowledgeBaseId: KB_ID,
    chunkIndex: index,
    content: `Chunk content ${index}`,
    metadata: { page: index },
  };
}

describe('RagService', () => {
  let service: RagService;
  let vectorStore: ReturnType<typeof createMockVectorStore>;
  let embeddingService: { generateEmbeddings: Mock };
  let documentChunkService: { findByDocumentId: Mock };
  let mockDb: { select: Mock; from: Mock; where: Mock; limit: Mock };

  beforeEach(async () => {
    vectorStore = createMockVectorStore();
    embeddingService = { generateEmbeddings: vi.fn() };
    documentChunkService = { findByDocumentId: vi.fn() };

    mockDb = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([{ id: ORG_ID }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: VECTOR_STORE, useValue: vectorStore },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: DocumentChunkService, useValue: documentChunkService },
      ],
    }).compile();

    service = module.get(RagService);
  });

  describe('indexDocument', () => {
    it('should index document chunks as vectors', async () => {
      const chunks = [createMockChunk(0), createMockChunk(1)];
      documentChunkService.findByDocumentId.mockResolvedValue(chunks);
      embeddingService.generateEmbeddings.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      await service.indexDocument(DOC_ID, TENANT_ID);

      expect(vectorStore.createCollection).toHaveBeenCalledWith(
        COLLECTION,
        EMBEDDING_DIMENSIONS,
      );
      expect(documentChunkService.findByDocumentId).toHaveBeenCalledWith(
        DOC_ID,
        TENANT_ID,
      );
      expect(embeddingService.generateEmbeddings).toHaveBeenCalledWith(
        ['Chunk content 0', 'Chunk content 1'],
        ORG_ID,
        TENANT_ID,
      );
      expect(vectorStore.upsert).toHaveBeenCalledWith(COLLECTION, [
        {
          id: 'chunk-0',
          vector: [0.1, 0.2],
          payload: {
            documentId: DOC_ID,
            knowledgeBaseId: KB_ID,
            chunkIndex: 0,
            content: 'Chunk content 0',
            location: { page: 0 },
          },
        },
        {
          id: 'chunk-1',
          vector: [0.3, 0.4],
          payload: {
            documentId: DOC_ID,
            knowledgeBaseId: KB_ID,
            chunkIndex: 1,
            content: 'Chunk content 1',
            location: { page: 1 },
          },
        },
      ]);
    });

    it('should skip indexing when no chunks found', async () => {
      documentChunkService.findByDocumentId.mockResolvedValue([]);

      await service.indexDocument(DOC_ID, TENANT_ID);

      expect(vectorStore.createCollection).toHaveBeenCalled();
      expect(embeddingService.generateEmbeddings).not.toHaveBeenCalled();
      expect(vectorStore.upsert).not.toHaveBeenCalled();
    });

    it('should rollback on upsert failure', async () => {
      documentChunkService.findByDocumentId.mockResolvedValue([
        createMockChunk(0),
      ]);
      embeddingService.generateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      vectorStore.upsert.mockRejectedValue(new Error('upsert failed'));

      await expect(service.indexDocument(DOC_ID, TENANT_ID)).rejects.toThrow(
        'upsert failed',
      );

      expect(vectorStore.deleteByFilter).toHaveBeenCalledWith(COLLECTION, {
        must: [{ key: 'documentId', match: { value: DOC_ID } }],
      });
    });

    it('should re-throw original error even if rollback fails', async () => {
      documentChunkService.findByDocumentId.mockResolvedValue([
        createMockChunk(0),
      ]);
      embeddingService.generateEmbeddings.mockResolvedValue([[0.1]]);
      vectorStore.upsert.mockRejectedValue(new Error('upsert failed'));
      vectorStore.deleteByFilter.mockRejectedValue(new Error('rollback failed'));

      await expect(service.indexDocument(DOC_ID, TENANT_ID)).rejects.toThrow(
        'upsert failed',
      );
    });

    it('should throw when organization not found for tenantId', async () => {
      documentChunkService.findByDocumentId.mockResolvedValue([
        createMockChunk(0),
      ]);
      mockDb.limit.mockResolvedValue([]);

      await expect(service.indexDocument(DOC_ID, TENANT_ID)).rejects.toThrow(
        `Organization not found for tenantId: ${TENANT_ID}`,
      );
    });
  });

  describe('search', () => {
    it('should return empty array when collection does not exist', async () => {
      vectorStore.collectionExists.mockResolvedValue(false);

      const results = await service.search('query text', TENANT_ID);

      expect(results).toEqual([]);
      expect(embeddingService.generateEmbeddings).not.toHaveBeenCalled();
    });

    it('should search with query embedding', async () => {
      vectorStore.collectionExists.mockResolvedValue(true);
      embeddingService.generateEmbeddings.mockResolvedValue([[0.5, 0.6]]);
      vectorStore.search.mockResolvedValue([
        {
          id: 'chunk-0',
          score: 0.95,
          payload: {
            content: 'Chunk content 0',
            location: { page: 0 },
            documentId: DOC_ID,
            knowledgeBaseId: KB_ID,
            chunkIndex: 0,
          },
        },
      ]);

      const results = await service.search('query text', TENANT_ID);

      expect(embeddingService.generateEmbeddings).toHaveBeenCalledWith(
        ['query text'],
        ORG_ID,
        TENANT_ID,
      );
      expect(vectorStore.search).toHaveBeenCalledWith({
        collectionName: COLLECTION,
        vector: [0.5, 0.6],
        limit: 10,
        scoreThreshold: undefined,
        filter: undefined,
      });
      expect(results).toEqual([
        {
          chunkId: 'chunk-0',
          score: 0.95,
          content: 'Chunk content 0',
          location: { page: 0 },
          documentId: DOC_ID,
          knowledgeBaseId: KB_ID,
          chunkIndex: 0,
        },
      ]);
    });

    it('should apply knowledgeBaseId filter when provided', async () => {
      vectorStore.collectionExists.mockResolvedValue(true);
      embeddingService.generateEmbeddings.mockResolvedValue([[0.5]]);
      vectorStore.search.mockResolvedValue([]);

      await service.search('query', TENANT_ID, {
        knowledgeBaseId: KB_ID,
        limit: 5,
        scoreThreshold: 0.8,
      });

      expect(vectorStore.search).toHaveBeenCalledWith({
        collectionName: COLLECTION,
        vector: [0.5],
        limit: 5,
        scoreThreshold: 0.8,
        filter: {
          must: [{ key: 'knowledgeBaseId', match: { value: KB_ID } }],
        },
      });
    });
  });

  describe('deleteByDocument', () => {
    it('should skip when collection does not exist', async () => {
      vectorStore.collectionExists.mockResolvedValue(false);

      await service.deleteByDocument(DOC_ID, TENANT_ID);

      expect(vectorStore.deleteByFilter).not.toHaveBeenCalled();
    });

    it('should delete vectors by documentId filter', async () => {
      vectorStore.collectionExists.mockResolvedValue(true);

      await service.deleteByDocument(DOC_ID, TENANT_ID);

      expect(vectorStore.deleteByFilter).toHaveBeenCalledWith(COLLECTION, {
        must: [{ key: 'documentId', match: { value: DOC_ID } }],
      });
    });
  });

  describe('deleteCollection', () => {
    it('should delegate to vectorStore.deleteCollection', async () => {
      await service.deleteCollection(TENANT_ID);

      expect(vectorStore.deleteCollection).toHaveBeenCalledWith(COLLECTION);
    });
  });
});
