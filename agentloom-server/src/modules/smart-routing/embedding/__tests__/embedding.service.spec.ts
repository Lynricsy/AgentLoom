import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DecryptionBoundaryService } from '../../../api-key/decryption-boundary.service';
import { LlmService } from '../../../llm/llm.service';
import { EmbeddingIntegrationService } from '../embedding.service';
import { DEFAULT_EMBEDDING_CONFIG } from '../embedding.types';

const createMockDecryptionBoundaryService = () => ({
  decryptConfiguredApiKey: vi.fn().mockResolvedValue('test-api-key'),
});

const createMockLlmService = () => ({
  findAll: vi.fn().mockResolvedValue([{ id: 'org-1', orgId: 'org-1' }]),
  // endpoint / 凭据 / 模型名现在都从租户默认 Embedding 模型配置解析。
  findDefaultByType: vi.fn().mockResolvedValue({
    id: 'config-embedding',
    modelId: 'text-embedding-3-small',
    provider: {
      slug: 'openai',
      orgId: 'org-1',
      apiKeyId: 'key-1',
      baseUrl: null,
      defaultBaseUrl: 'https://api.openai.com',
    },
  }),
});

function make1536Vector(seed = 0.1): number[] {
  return Array.from({ length: 1536 }, (_, i) => seed + i * 0.001);
}

function mockFetchSuccess(vector: number[] = make1536Vector()) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: [{ embedding: vector, index: 0 }],
        usage: { prompt_tokens: 8, total_tokens: 8 },
      }),
  });
}

describe('EmbeddingIntegrationService', () => {
  let service: EmbeddingIntegrationService;
  let decryptionService: ReturnType<typeof createMockDecryptionBoundaryService>;
  let llmService: ReturnType<typeof createMockLlmService>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    decryptionService = createMockDecryptionBoundaryService();
    llmService = createMockLlmService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingIntegrationService,
        {
          provide: DecryptionBoundaryService,
          useValue: decryptionService,
        },
        {
          provide: LlmService,
          useValue: llmService,
        },
      ],
    }).compile();

    service = module.get(EmbeddingIntegrationService);
  });

  it('should return embedding vector on successful API call', async () => {
    const expectedVector = make1536Vector();
    const fetchMock = mockFetchSuccess(expectedVector);
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generateEmbedding('hello world', 'tenant-1');

    expect(result).toEqual(expectedVector);
    expect(result).toHaveLength(1536);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(options.method).toBe('POST');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('should return null on timeout (>2000ms)', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    data: [{ embedding: make1536Vector(), index: 0 }],
                  }),
              }),
            3000,
          );
          opts.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generateEmbedding('slow query', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should return null on 429 rate limit response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generateEmbedding('rate limited', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should return null on 500 server error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generateEmbedding('server error', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generateEmbedding('network fail', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should return cached result for duplicate text (API called once)', async () => {
    const expectedVector = make1536Vector(0.5);
    const fetchMock = mockFetchSuccess(expectedVector);
    vi.stubGlobal('fetch', fetchMock);

    const first = await service.generateEmbedding('cached text', 'tenant-1');
    const second = await service.generateEmbedding('cached text', 'tenant-1');

    expect(first).toEqual(expectedVector);
    expect(second).toEqual(expectedVector);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('should not cache failed requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: make1536Vector(), index: 0 }],
            usage: { prompt_tokens: 8, total_tokens: 8 },
          }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const first = await service.generateEmbedding('retry text', 'tenant-1');
    const second = await service.generateEmbedding('retry text', 'tenant-1');

    expect(first).toBeNull();
    expect(second).toEqual(make1536Vector());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should return null when decryption service fails', async () => {
    decryptionService.decryptConfiguredApiKey.mockRejectedValue(
      new Error('No API key configured'),
    );

    const result = await service.generateEmbedding('no key', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should return null for empty text input', async () => {
    const result = await service.generateEmbedding('', 'tenant-1');

    expect(result).toBeNull();
  });

  it('should use configured model from EmbeddingConfig', async () => {
    const fetchMock = mockFetchSuccess();
    vi.stubGlobal('fetch', fetchMock);

    const customService = new EmbeddingIntegrationService(
      decryptionService as unknown as DecryptionBoundaryService,
      llmService as unknown as LlmService,
      { ...DEFAULT_EMBEDDING_CONFIG, modelId: 'text-embedding-3-large' },
    );

    await customService.generateEmbedding('custom model', 'tenant-1');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('text-embedding-3-large');
  });
});
