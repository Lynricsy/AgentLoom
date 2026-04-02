import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TextNode } from 'llamaindex';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { EvidenceEventName } from '../../evidence/evidence.events';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmService } from '../../llm/llm.service';
import { PiAiAdapter } from '../../llm/pi-ai-adapter';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { KnowledgeNodeService } from '../knowledge-node.service';
import { QDRANT_CLIENT } from '../qdrant.provider';
import { EmbeddingService } from '../services/embedding.service';
import { QdrantVectorStoreService } from '../services/qdrant-vector-store.service';
import { RagService } from '../services/rag.service';

const TENANT_ID = 'tenant-1';
const DOC_ID = '00000000-0000-0000-0000-000000000001';
const KB_ID = 'kb-1';

describe('RagService', () => {
  let service: RagService;
  let knowledgeNodeService: {
    findLlamaNodesByDocumentId: Mock;
  };
  let knowledgeBaseService: {
    getRetrievalStrategy: Mock;
    getRerankingStrategy: Mock;
    getQueryOrchestration: Mock;
  };
  let vectorStoreService: {
    collectionExists: Mock;
    deleteByFilter: Mock;
    deleteCollection: Mock;
    search: Mock;
  };
  let embeddingService: {
    generateEmbeddings: Mock;
  };
  let mockDb: {
    select: Mock;
    from: Mock;
    where: Mock;
    orderBy: Mock;
    limit: Mock;
  };
  let eventEmitter: { emit: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();

    knowledgeNodeService = {
      findLlamaNodesByDocumentId: vi.fn(),
    };
    knowledgeBaseService = {
      getRetrievalStrategy: vi
        .fn()
        .mockReturnValue({ topK: 8, similarityThreshold: null }),
      getRerankingStrategy: vi.fn().mockReturnValue({ type: 'none' }),
      getQueryOrchestration: vi.fn().mockReturnValue({ type: 'none' }),
    };
    vectorStoreService = {
      collectionExists: vi.fn(),
      deleteByFilter: vi.fn(),
      deleteCollection: vi.fn(),
      search: vi.fn(),
    };
    embeddingService = {
      generateEmbeddings: vi.fn(),
    };
    eventEmitter = { emit: vi.fn() };

    mockDb = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: QDRANT_CLIENT, useValue: {} },
        { provide: KnowledgeNodeService, useValue: knowledgeNodeService },
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: QdrantVectorStoreService, useValue: vectorStoreService },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: LlmService, useValue: {} },
        { provide: PiAiAdapter, useValue: {} },
        { provide: DecryptionBoundaryService, useValue: {} },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(RagService);
  });

  it('indexDocument 在没有知识节点时应跳过索引', async () => {
    knowledgeNodeService.findLlamaNodesByDocumentId.mockResolvedValue([]);

    await expect(
      service.indexDocument(DOC_ID, TENANT_ID),
    ).resolves.toBeUndefined();

    expect(
      knowledgeNodeService.findLlamaNodesByDocumentId,
    ).toHaveBeenCalledWith(DOC_ID, TENANT_ID);
    expect(mockDb.limit).not.toHaveBeenCalled();
  });

  it('search 在缺少 knowledgeBaseIds 时应抛错', async () => {
    await expect(service.search('query text', TENANT_ID)).rejects.toThrow(
      'RagService.search 需要至少一个 knowledgeBaseId',
    );
  });

  it('search 应合并多个知识库结果、按分数排序并写 evidence 事件', async () => {
    const kbRecords = [{ id: 'kb-1' }, { id: 'kb-2' }];
    vi.spyOn(
      service as unknown as {
        resolveKnowledgeBasesForSearch: (
          ids: string[],
          tenantId: string,
        ) => Promise<unknown>;
      },
      'resolveKnowledgeBasesForSearch',
    ).mockResolvedValue(kbRecords);
    vi.spyOn(
      service as unknown as {
        searchSingleKnowledgeBase: () => Promise<unknown>;
      },
      'searchSingleKnowledgeBase',
    )
      .mockResolvedValueOnce([
        {
          nodeId: 'node-a',
          chunkId: 'node-a',
          score: 0.61,
          content: 'A',
          location: null,
          documentId: 'doc-a',
          knowledgeBaseId: 'kb-1',
          chunkIndex: 0,
          fileName: 'a.md',
          metadata: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          nodeId: 'node-b',
          chunkId: 'node-b',
          score: 0.92,
          content: 'B',
          location: null,
          documentId: 'doc-b',
          knowledgeBaseId: 'kb-2',
          chunkIndex: 0,
          fileName: 'b.md',
          metadata: {},
        },
      ]);

    const result = await service.search('query text', TENANT_ID, {
      knowledgeBaseIds: ['kb-1', 'kb-2', 'kb-1'],
      limit: 2,
      evidenceContext: {
        executionId: 'exec-1',
        stepId: 'step-1',
        parentEvidenceId: 'evidence-parent',
      },
    });

    expect(result).toEqual([
      expect.objectContaining({ nodeId: 'node-b', score: 0.92 }),
      expect.objectContaining({ nodeId: 'node-a', score: 0.61 }),
    ]);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EvidenceEventName.RAG_RETRIEVED,
      {
        tenantId: TENANT_ID,
        executionId: 'exec-1',
        stepId: 'step-1',
        parentEvidenceId: 'evidence-parent',
        results: result,
      },
    );
  });

  it('deleteByDocument 在集合存在时应删除对应向量', async () => {
    mockDb.limit.mockResolvedValueOnce([{ knowledgeBaseId: KB_ID }]);
    vectorStoreService.collectionExists.mockResolvedValue(true);

    await expect(
      service.deleteByDocument(DOC_ID, TENANT_ID),
    ).resolves.toBeUndefined();

    expect(vectorStoreService.deleteByFilter).toHaveBeenCalledWith(
      `knowledge_${KB_ID}`,
      {
        must: [{ key: 'documentId', match: { value: DOC_ID } }],
      },
    );
  });

  it('deleteKnowledgeBaseCollection 应委托给 vector store service', async () => {
    await expect(
      service.deleteKnowledgeBaseCollection(KB_ID),
    ).resolves.toBeUndefined();

    expect(vectorStoreService.deleteCollection).toHaveBeenCalledWith(
      `knowledge_${KB_ID}`,
    );
  });

  it('searchSingleKnowledgeBase 应解析 llamaindex payload 并执行纯向量检索', async () => {
    const firstNode = new TextNode({
      id_: 'node-1',
      text: 'search_knowledge',
      metadata: {
        documentId: 'doc-1',
        fileName: 'prd.md',
        sourceSectionIndex: 0,
        window: 'search_knowledge',
      },
    });
    const secondNode = new TextNode({
      id_: 'node-2',
      text: 'knowledgeBaseIds',
      metadata: {
        documentId: 'doc-1',
        fileName: 'prd.md',
        sourceSectionIndex: 1,
      },
    });

    vectorStoreService.collectionExists.mockResolvedValue(true);
    vectorStoreService.search
      .mockResolvedValueOnce([
        {
          id: 'node-1',
          score: 0.83,
          payload: {
            _node_content: JSON.stringify(firstNode.toJSON()),
            _node_type: 'TextNode',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'node-2',
          score: 0.74,
          payload: {
            _node_content: JSON.stringify(secondNode.toJSON()),
            _node_type: 'TextNode',
          },
        },
      ]);
    embeddingService.generateEmbeddings.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    vi.spyOn(
      service as unknown as {
        resolveEmbeddingConfig: (
          tenantId: string,
          knowledgeBaseId: string,
        ) => Promise<unknown>;
      },
      'resolveEmbeddingConfig',
    ).mockResolvedValue({
      provider: 'openai',
      modelName: 'text-embedding-3-small',
      tenantId: TENANT_ID,
      organizationId: 'org-1',
    });
    vi.spyOn(
      service as unknown as {
        buildQueryVariants: (
          query: string,
          tenantId: string,
          orchestration: unknown,
        ) => Promise<string[]>;
      },
      'buildQueryVariants',
    ).mockResolvedValue([
      '统一给 Agent 暴露的知识库工具叫什么？',
      '系统统一暴露 search_knowledge 工具，并显式传 knowledgeBaseIds。',
    ]);

    const result = await (
      service as unknown as {
        searchSingleKnowledgeBase: (
          query: string,
          tenantId: string,
          knowledgeBase: {
            id: string;
            tenantId: string;
            embeddingModel: string;
            embeddingModelConfigId: string | null;
            chunkingStrategy: { type: 'sentence_window'; windowSize: number };
            retrievalStrategy: {
              topK: number;
              similarityThreshold: number | null;
            };
            rerankingStrategy: { type: 'none' };
            queryOrchestration: { type: 'none' };
          },
          limit: number,
          scoreThreshold?: number,
        ) => Promise<unknown>;
      }
    ).searchSingleKnowledgeBase(
      '统一给 Agent 暴露的知识库工具叫什么？',
      TENANT_ID,
      {
        id: KB_ID,
        tenantId: TENANT_ID,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
        chunkingStrategy: { type: 'sentence_window', windowSize: 3 },
        retrievalStrategy: { topK: 8, similarityThreshold: null },
        rerankingStrategy: { type: 'none' },
        queryOrchestration: { type: 'none' },
      },
      5,
    );

    expect(embeddingService.generateEmbeddings).toHaveBeenCalledWith(
      [
        '统一给 Agent 暴露的知识库工具叫什么？',
        '系统统一暴露 search_knowledge 工具，并显式传 knowledgeBaseIds。',
      ],
      expect.objectContaining({
        provider: 'openai',
        modelName: 'text-embedding-3-small',
      }),
    );
    expect(vectorStoreService.search).toHaveBeenNthCalledWith(1, {
      collectionName: `knowledge_${KB_ID}`,
      vector: [0.1, 0.2],
      limit: 15,
      scoreThreshold: undefined,
    });
    expect(vectorStoreService.search).toHaveBeenNthCalledWith(2, {
      collectionName: `knowledge_${KB_ID}`,
      vector: [0.3, 0.4],
      limit: 15,
      scoreThreshold: undefined,
    });
    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'node-1',
        content: 'search_knowledge',
      }),
      expect.objectContaining({
        nodeId: 'node-2',
        content: 'knowledgeBaseIds',
      }),
    ]);
  });

  it('searchSingleKnowledgeBase 应兼容旧版 qdrant payload 结构', async () => {
    vectorStoreService.collectionExists.mockResolvedValue(true);
    vectorStoreService.search.mockResolvedValue([
      {
        id: 'legacy-node-1',
        score: 0.71,
        payload: {
          documentId: 'doc-legacy',
          knowledgeBaseId: KB_ID,
          chunkIndex: 3,
          fileName: 'qa.txt',
          content: 'KB-ALPHA-20260329-FOX',
          location: {
            page: 2,
            paragraph: 5,
            heading: 'Validation',
            charOffset: 120,
            charLength: 20,
          },
        },
      },
    ]);
    embeddingService.generateEmbeddings.mockResolvedValue([[0.9, 0.1]]);
    vi.spyOn(
      service as unknown as {
        resolveEmbeddingConfig: (
          tenantId: string,
          knowledgeBaseId: string,
        ) => Promise<unknown>;
      },
      'resolveEmbeddingConfig',
    ).mockResolvedValue({
      provider: 'openai',
      modelName: 'text-embedding-3-small',
      tenantId: TENANT_ID,
      organizationId: 'org-1',
    });
    vi.spyOn(
      service as unknown as {
        buildQueryVariants: (
          query: string,
          tenantId: string,
          orchestration: unknown,
        ) => Promise<string[]>;
      },
      'buildQueryVariants',
    ).mockResolvedValue(['唯一校验码是什么？']);

    const result = await (
      service as unknown as {
        searchSingleKnowledgeBase: (
          query: string,
          tenantId: string,
          knowledgeBase: {
            id: string;
            tenantId: string;
            embeddingModel: string;
            embeddingModelConfigId: string | null;
            chunkingStrategy: { type: 'sentence_window'; windowSize: number };
            retrievalStrategy: {
              topK: number;
              similarityThreshold: number | null;
            };
            rerankingStrategy: { type: 'none' };
            queryOrchestration: { type: 'none' };
          },
          limit: number,
          scoreThreshold?: number,
        ) => Promise<unknown>;
      }
    ).searchSingleKnowledgeBase(
      '唯一校验码是什么？',
      TENANT_ID,
      {
        id: KB_ID,
        tenantId: TENANT_ID,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
        chunkingStrategy: { type: 'sentence_window', windowSize: 3 },
        retrievalStrategy: { topK: 8, similarityThreshold: null },
        rerankingStrategy: { type: 'none' },
        queryOrchestration: { type: 'none' },
      },
      5,
    );

    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'legacy-node-1',
        content: 'KB-ALPHA-20260329-FOX',
        documentId: 'doc-legacy',
        chunkIndex: 3,
        fileName: 'qa.txt',
        location: {
          page: 2,
          paragraph: 5,
          heading: 'Validation',
          charOffset: 120,
          charLength: 20,
        },
      }),
    ]);
  });

  it('searchSingleKnowledgeBase 在缺少向量集合时应回退 lexical search', async () => {
    const lexicalNode = new TextNode({
      id_: 'lexical-node-1',
      text: 'KB-ALPHA-20260329-FOX',
      metadata: {
        documentId: 'doc-lexical',
        fileName: 'qa.txt',
        sourceSectionIndex: 2,
      },
    });

    vectorStoreService.collectionExists.mockResolvedValue(false);
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'lexical-node-1',
        payload: {
          _node_content: JSON.stringify(lexicalNode.toJSON()),
          _node_type: 'TextNode',
        },
        score: 2,
      },
    ]);
    vi.spyOn(
      service as unknown as {
        buildQueryVariants: (
          query: string,
          tenantId: string,
          orchestration: unknown,
        ) => Promise<string[]>;
      },
      'buildQueryVariants',
    ).mockResolvedValue(['QA KB 20260329 的唯一校验码是什么？']);

    const result = await (
      service as unknown as {
        searchSingleKnowledgeBase: (
          query: string,
          tenantId: string,
          knowledgeBase: {
            id: string;
            tenantId: string;
            embeddingModel: string;
            embeddingModelConfigId: string | null;
            chunkingStrategy: { type: 'sentence_window'; windowSize: number };
            retrievalStrategy: {
              topK: number;
              similarityThreshold: number | null;
            };
            rerankingStrategy: { type: 'none' };
            queryOrchestration: { type: 'none' };
          },
          limit: number,
          scoreThreshold?: number,
        ) => Promise<unknown>;
      }
    ).searchSingleKnowledgeBase(
      'QA KB 20260329 的唯一校验码是什么？',
      TENANT_ID,
      {
        id: KB_ID,
        tenantId: TENANT_ID,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
        chunkingStrategy: { type: 'sentence_window', windowSize: 3 },
        retrievalStrategy: { topK: 8, similarityThreshold: null },
        rerankingStrategy: { type: 'none' },
        queryOrchestration: { type: 'none' },
      },
      5,
    );

    expect(embeddingService.generateEmbeddings).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'lexical-node-1',
        content: 'KB-ALPHA-20260329-FOX',
        documentId: 'doc-lexical',
        fileName: 'qa.txt',
      }),
    ]);
  });

  it('searchSingleKnowledgeBase 在 embedding 调用失败时应回退 lexical search', async () => {
    const lexicalNode = new TextNode({
      id_: 'lexical-node-2',
      text: 'KB-BETA-20260329-FOX',
      metadata: {
        documentId: 'doc-lexical-2',
        fileName: 'qa-beta.txt',
        sourceSectionIndex: 4,
      },
    });

    vectorStoreService.collectionExists.mockResolvedValue(true);
    embeddingService.generateEmbeddings.mockRejectedValue(
      new Error('Embedding API error 503'),
    );
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'lexical-node-2',
        payload: {
          _node_content: JSON.stringify(lexicalNode.toJSON()),
          _node_type: 'TextNode',
        },
        score: 2,
      },
    ]);
    vi.spyOn(
      service as unknown as {
        resolveEmbeddingConfig: (
          tenantId: string,
          knowledgeBaseId: string,
        ) => Promise<unknown>;
      },
      'resolveEmbeddingConfig',
    ).mockResolvedValue({
      provider: 'private_cloud',
      modelName: 'Qwen/Qwen3-Embedding-8B',
      tenantId: TENANT_ID,
      organizationId: 'org-1',
      endpointUrl: 'https://models.example.test',
    });
    vi.spyOn(
      service as unknown as {
        buildQueryVariants: (
          query: string,
          tenantId: string,
          orchestration: unknown,
        ) => Promise<string[]>;
      },
      'buildQueryVariants',
    ).mockResolvedValue(['唯一校验码是什么？']);

    const result = await (
      service as unknown as {
        searchSingleKnowledgeBase: (
          query: string,
          tenantId: string,
          knowledgeBase: {
            id: string;
            tenantId: string;
            embeddingModel: string;
            embeddingModelConfigId: string | null;
            chunkingStrategy: { type: 'sentence_window'; windowSize: number };
            retrievalStrategy: {
              topK: number;
              similarityThreshold: number | null;
            };
            rerankingStrategy: { type: 'none' };
            queryOrchestration: { type: 'none' };
          },
          limit: number,
          scoreThreshold?: number,
        ) => Promise<unknown>;
      }
    ).searchSingleKnowledgeBase(
      '唯一校验码是什么？',
      TENANT_ID,
      {
        id: KB_ID,
        tenantId: TENANT_ID,
        embeddingModel: 'Qwen/Qwen3-Embedding-8B',
        embeddingModelConfigId: 'model-embedding-1',
        chunkingStrategy: { type: 'sentence_window', windowSize: 3 },
        retrievalStrategy: { topK: 8, similarityThreshold: null },
        rerankingStrategy: { type: 'none' },
        queryOrchestration: { type: 'none' },
      },
      5,
    );

    expect(vectorStoreService.search).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'lexical-node-2',
        content: 'KB-BETA-20260329-FOX',
        documentId: 'doc-lexical-2',
        fileName: 'qa-beta.txt',
      }),
    ]);
  });
});
