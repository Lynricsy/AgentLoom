import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { QdrantVectorStoreService } from '../services/qdrant-vector-store.service';
import { QDRANT_CLIENT } from '../qdrant.provider';
import type {
  VectorPoint,
  VectorSearchOptions,
  VectorFilter,
} from '../interfaces/vector-store.interface';
import { EMBEDDING_DIMENSIONS } from '../knowledge.constants';

const COLLECTION = 'knowledge_tenant-1';

function createMockClient() {
  return {
    createCollection: vi.fn(),
    getCollection: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    deleteCollection: vi.fn(),
  };
}

describe('QdrantVectorStoreService', () => {
  let service: QdrantVectorStoreService;
  let client: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    client = createMockClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantVectorStoreService,
        { provide: QDRANT_CLIENT, useValue: client },
      ],
    }).compile();

    service = module.get(QdrantVectorStoreService);
  });

  describe('createCollection', () => {
    it('should create collection when it does not exist', async () => {
      client.getCollection.mockRejectedValue(new Error('not found'));

      await service.createCollection(COLLECTION);

      expect(client.createCollection).toHaveBeenCalledWith(COLLECTION, {
        vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
      });
    });

    it('should skip creation when collection already exists', async () => {
      client.getCollection.mockResolvedValue({ status: 'green' });

      await service.createCollection(COLLECTION);

      expect(client.createCollection).not.toHaveBeenCalled();
    });

    it('should accept a custom vector size', async () => {
      client.getCollection.mockRejectedValue(new Error('not found'));

      await service.createCollection(COLLECTION, 768);

      expect(client.createCollection).toHaveBeenCalledWith(COLLECTION, {
        vectors: { size: 768, distance: 'Cosine' },
      });
    });
  });

  describe('collectionExists', () => {
    it('should return true when getCollection succeeds', async () => {
      client.getCollection.mockResolvedValue({ status: 'green' });

      const result = await service.collectionExists(COLLECTION);

      expect(result).toBe(true);
    });

    it('should return false when getCollection throws', async () => {
      client.getCollection.mockRejectedValue(new Error('not found'));

      const result = await service.collectionExists(COLLECTION);

      expect(result).toBe(false);
    });
  });

  describe('upsert', () => {
    it('should upsert points with wait:true', async () => {
      const points: VectorPoint[] = [
        { id: 'p1', vector: [0.1, 0.2], payload: { key: 'val' } },
        { id: 'p2', vector: [0.3, 0.4], payload: { key: 'val2' } },
      ];

      await service.upsert(COLLECTION, points);

      expect(client.upsert).toHaveBeenCalledWith(COLLECTION, {
        wait: true,
        points: [
          { id: 'p1', vector: [0.1, 0.2], payload: { key: 'val' } },
          { id: 'p2', vector: [0.3, 0.4], payload: { key: 'val2' } },
        ],
      });
    });

    it('should skip upsert when points array is empty', async () => {
      await service.upsert(COLLECTION, []);

      expect(client.upsert).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search and map results', async () => {
      client.search.mockResolvedValue([
        { id: 'r1', score: 0.95, payload: { content: 'hello' } },
        { id: 2, score: 0.8, payload: null },
      ]);

      const options: VectorSearchOptions = {
        collectionName: COLLECTION,
        vector: [0.1, 0.2],
        limit: 5,
        scoreThreshold: 0.7,
      };

      const results = await service.search(options);

      expect(client.search).toHaveBeenCalledWith(COLLECTION, {
        vector: [0.1, 0.2],
        limit: 5,
        score_threshold: 0.7,
        filter: undefined,
      });
      expect(results).toEqual([
        { id: 'r1', score: 0.95, payload: { content: 'hello' } },
        { id: '2', score: 0.8, payload: {} },
      ]);
    });

    it('should convert VectorFilter to Qdrant filter format', async () => {
      client.search.mockResolvedValue([]);

      const filter: VectorFilter = {
        must: [{ key: 'documentId', match: { value: 'doc-1' } }],
      };

      await service.search({
        collectionName: COLLECTION,
        vector: [0.1],
        filter,
      });

      expect(client.search).toHaveBeenCalledWith(
        COLLECTION,
        expect.objectContaining({
          filter: {
            must: [{ key: 'documentId', match: { value: 'doc-1' } }],
          },
        }),
      );
    });

    it('should use default limit of 10', async () => {
      client.search.mockResolvedValue([]);

      await service.search({
        collectionName: COLLECTION,
        vector: [0.1],
      });

      expect(client.search).toHaveBeenCalledWith(
        COLLECTION,
        expect.objectContaining({ limit: 10 }),
      );
    });
  });

  describe('deleteByFilter', () => {
    it('should delete with Qdrant filter and wait:true', async () => {
      const filter: VectorFilter = {
        must: [{ key: 'documentId', match: { value: 'doc-1' } }],
      };

      await service.deleteByFilter(COLLECTION, filter);

      expect(client.delete).toHaveBeenCalledWith(COLLECTION, {
        wait: true,
        filter: {
          must: [{ key: 'documentId', match: { value: 'doc-1' } }],
        },
      });
    });
  });

  describe('deleteCollection', () => {
    it('should delete collection when it exists', async () => {
      client.getCollection.mockResolvedValue({ status: 'green' });

      await service.deleteCollection(COLLECTION);

      expect(client.deleteCollection).toHaveBeenCalledWith(COLLECTION);
    });

    it('should skip deletion when collection does not exist', async () => {
      client.getCollection.mockRejectedValue(new Error('not found'));

      await service.deleteCollection(COLLECTION);

      expect(client.deleteCollection).not.toHaveBeenCalled();
    });
  });
});
