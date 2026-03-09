import { Test, type TestingModule } from '@nestjs/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  afterEach,
  type Mock,
} from 'vitest';

import { EmbeddingService } from '../services/embedding.service';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { EMBEDDING_MODEL, EMBEDDING_BATCH_SIZE } from '../knowledge.constants';

const ORG_ID = 'org-1';
const TENANT_ID = 'tenant-1';
const API_KEY = 'sk-test-key';

function createEmbeddingResponse(embeddings: number[][]): Response {
  return new Response(
    JSON.stringify({
      data: embeddings.map((embedding, index) => ({ embedding, index })),
      usage: { prompt_tokens: 10, total_tokens: 10 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let decryptionBoundaryService: { decryptConfiguredApiKey: Mock };
  let fetchSpy: Mock;

  beforeEach(async () => {
    decryptionBoundaryService = {
      decryptConfiguredApiKey: vi.fn().mockResolvedValue(API_KEY),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: DecryptionBoundaryService,
          useValue: decryptionBoundaryService,
        },
      ],
    }).compile();

    service = module.get(EmbeddingService);

    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateEmbeddings', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.generateEmbeddings([], ORG_ID, TENANT_ID);

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should generate embeddings for a single batch', async () => {
      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      fetchSpy.mockResolvedValue(createEmbeddingResponse(embeddings));

      const result = await service.generateEmbeddings(
        ['text1', 'text2'],
        ORG_ID,
        TENANT_ID,
      );

      expect(result).toEqual(embeddings);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: ['text1', 'text2'],
          }),
        }),
      );
    });

    it('should decrypt API key with correct parameters', async () => {
      fetchSpy.mockResolvedValue(createEmbeddingResponse([[0.1]]));

      await service.generateEmbeddings(['text'], ORG_ID, TENANT_ID);

      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: null,
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          provider: 'openai',
        },
        'EmbeddingService.generateEmbeddings',
      );
    });

    it('should batch texts when exceeding EMBEDDING_BATCH_SIZE', async () => {
      const texts = Array.from(
        { length: EMBEDDING_BATCH_SIZE + 5 },
        (_, i) => `text-${i}`,
      );
      const batch1Embeddings = Array.from(
        { length: EMBEDDING_BATCH_SIZE },
        () => [0.1],
      );
      const batch2Embeddings = Array.from({ length: 5 }, () => [0.2]);

      fetchSpy
        .mockResolvedValueOnce(createEmbeddingResponse(batch1Embeddings))
        .mockResolvedValueOnce(createEmbeddingResponse(batch2Embeddings));

      const result = await service.generateEmbeddings(texts, ORG_ID, TENANT_ID);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(EMBEDDING_BATCH_SIZE + 5);
    });

    it('should sort embeddings by index from API response', async () => {
      const response = new Response(
        JSON.stringify({
          data: [
            { embedding: [0.3, 0.4], index: 1 },
            { embedding: [0.1, 0.2], index: 0 },
          ],
          usage: { prompt_tokens: 10, total_tokens: 10 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
      fetchSpy.mockResolvedValue(response);

      const result = await service.generateEmbeddings(
        ['first', 'second'],
        ORG_ID,
        TENANT_ID,
      );

      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });

    it('should throw on API error after retries exhausted', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(new Response('rate limited', { status: 429 })),
      );

      await expect(
        service.generateEmbeddings(['text'], ORG_ID, TENANT_ID),
      ).rejects.toThrow('OpenAI Embedding API error 429');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    }, 10_000);

    it('should not retry non-retryable 400 errors', async () => {
      fetchSpy.mockResolvedValue(new Response('bad request', { status: 400 }));

      await expect(
        service.generateEmbeddings(['text'], ORG_ID, TENANT_ID),
      ).rejects.toThrow('OpenAI Embedding API error 400');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      fetchSpy
        .mockImplementationOnce(() =>
          Promise.resolve(new Response('error', { status: 500 })),
        )
        .mockResolvedValueOnce(createEmbeddingResponse([[0.1, 0.2]]));

      const result = await service.generateEmbeddings(
        ['text'],
        ORG_ID,
        TENANT_ID,
      );
      expect(result).toEqual([[0.1, 0.2]]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('should honor Retry-After header when rate limited', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': '3' },
          }),
        )
        .mockResolvedValueOnce(createEmbeddingResponse([[0.1, 0.2]]));

      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      await expect(
        service.generateEmbeddings(['text'], ORG_ID, TENANT_ID),
      ).resolves.toEqual([[0.1, 0.2]]);

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
    }, 10_000);
  });
});
