import { TextNode, type NodeWithScore } from 'llamaindex';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { RagService } from '../services/rag.service';
import { KnowledgeEmbeddingModelNotConfiguredException } from '../knowledge.exceptions';

const externalMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  rerank: vi.fn(),
  rerankerOptions: vi.fn(),
  vectorAdd: vi.fn(),
}));

vi.mock('ai', () => ({ generateText: externalMocks.generateText }));
vi.mock('@llamaindex/cohere', () => ({
  CohereRerank: class CohereRerank {
    constructor(options: unknown) {
      externalMocks.rerankerOptions(options);
    }

    postprocessNodes(nodes: NodeWithScore[], query: string) {
      return externalMocks.rerank(nodes, query);
    }
  },
}));
vi.mock('@llamaindex/qdrant', () => ({
  QdrantVectorStore: class QdrantVectorStore {
    add(nodes: TextNode[]) {
      return externalMocks.vectorAdd(nodes);
    }
  },
}));

const TENANT_ID = 'tenant-rag';
const KB_ID = 'kb-rag';
interface DbFixture {
  select: Mock;
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
}

interface KnowledgeBaseFixture {
  id: string;
  tenantId: string;
  embeddingModel: string;
  embeddingModelConfigId: string | null;
  chunkingStrategy: Record<string, unknown>;
  retrievalStrategy: { topK: number; similarityThreshold: number | null };
  rerankingStrategy: Record<string, unknown>;
  queryOrchestration: Record<string, unknown>;
}

function createDb(): DbFixture {
  const db = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  db.select.mockReturnValue(db);
  db.from.mockReturnValue(db);
  db.where.mockReturnValue(db);
  db.orderBy.mockReturnValue(db);
  return db;
}

function createKnowledgeBase(
  overrides: Partial<KnowledgeBaseFixture> = {},
): KnowledgeBaseFixture {
  return {
    id: KB_ID,
    tenantId: TENANT_ID,
    embeddingModel: 'text-embedding-3-small',
    embeddingModelConfigId: null,
    chunkingStrategy: { type: 'sentence', chunkSize: 512, chunkOverlap: 32 },
    retrievalStrategy: { topK: 4, similarityThreshold: null },
    rerankingStrategy: { type: 'none' },
    queryOrchestration: { type: 'none' },
    ...overrides,
  };
}

type RagInternals = {
  buildQueryVariants(
    query: string,
    tenantId: string,
    strategy: unknown,
  ): Promise<string[]>;
  generateHydeQuery(
    query: string,
    tenantId: string,
    strategy: unknown,
  ): Promise<string | null>;
  extractLexicalTokens(query: string): string[];
  mergeNodeScores(nodes: NodeWithScore[]): NodeWithScore[];
  parseLlamaIndexNodeFromPayload(
    payload: Record<string, unknown>,
  ): TextNode | null;
  parseLegacyNodeFromPayload(
    id: string,
    payload: Record<string, unknown>,
  ): TextNode | null;
  hydrateNodeWithScore(result: {
    id: string;
    score: number;
    payload: Record<string, unknown>;
  }): NodeWithScore | null;
  toSearchResult(node: NodeWithScore, knowledgeBaseId: string): unknown;
  searchKnowledgeBaseLexicallyByVariant(params: {
    knowledgeBaseId: string;
    tenantId: string;
    queryVariant: string;
    limit: number;
  }): Promise<NodeWithScore[]>;
  searchSingleKnowledgeBase(
    query: string,
    tenantId: string,
    knowledgeBase: KnowledgeBaseFixture,
    limit: number,
    scoreThreshold?: number,
  ): Promise<Array<{ nodeId: string; score: number }>>;
  applyReranker(
    nodes: NodeWithScore[],
    query: string,
    tenantId: string,
    knowledgeBase: KnowledgeBaseFixture,
    limit: number,
  ): Promise<NodeWithScore[]>;
  resolveEmbeddingConfig(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<unknown>;
  resolveOrganizationId(tenantId: string): Promise<string>;
  resolveKnowledgeBasesForSearch(
    knowledgeBaseIds: string[],
    tenantId: string,
  ): Promise<KnowledgeBaseFixture[]>;
};

describe('RagService behavior contracts', () => {
  let service: RagService;
  let internals: RagInternals;
  let db: DbFixture;
  let nodes: { findLlamaNodesByDocumentId: Mock };
  let knowledgeBases: {
    getRetrievalStrategy: Mock;
    getRerankingStrategy: Mock;
    getQueryOrchestration: Mock;
  };
  let vectors: {
    collectionExists: Mock;
    deleteByFilter: Mock;
    deleteCollection: Mock;
    search: Mock;
  };
  let embeddings: { generateEmbeddings: Mock };
  let llm: {
    findById: Mock;
    findDefaultByType: Mock;
  };
  let pi: { getModel: Mock };
  let decryptor: { decryptConfiguredApiKey: Mock };
  let evidence: { emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    db = createDb();
    nodes = { findLlamaNodesByDocumentId: vi.fn() };
    knowledgeBases = {
      getRetrievalStrategy: vi.fn(
        (kb: KnowledgeBaseFixture) => kb.retrievalStrategy,
      ),
      getRerankingStrategy: vi.fn(
        (kb: KnowledgeBaseFixture) => kb.rerankingStrategy,
      ),
      getQueryOrchestration: vi.fn(
        (kb: KnowledgeBaseFixture) => kb.queryOrchestration,
      ),
    };
    vectors = {
      collectionExists: vi.fn(),
      deleteByFilter: vi.fn(),
      deleteCollection: vi.fn(),
      search: vi.fn(),
    };
    embeddings = { generateEmbeddings: vi.fn() };
    llm = { findById: vi.fn(), findDefaultByType: vi.fn() };
    pi = { getModel: vi.fn() };
    decryptor = { decryptConfiguredApiKey: vi.fn() };
    evidence = { emit: vi.fn() };
    service = new RagService(
      db as never,
      {} as never,
      nodes as never,
      knowledgeBases as never,
      vectors as never,
      embeddings as never,
      llm as never,
      pi as never,
      decryptor as never,
      evidence as never,
    );
    internals = service as unknown as RagInternals;
  });

  it('HyDE rewrites the query with an explicit model and keeps both variants', async () => {
    const model = { modelId: 'chat-model' };
    llm.findById.mockResolvedValue(model);
    pi.getModel.mockResolvedValue({ languageModel: true });
    externalMocks.generateText.mockResolvedValue({
      text: '  synthetic answer  ',
    });

    await expect(
      internals.buildQueryVariants('original', TENANT_ID, {
        type: 'hyde',
        modelConfigId: 'chat-config',
        promptTemplate: 'Question: {{query}} / {{query}}',
      }),
    ).resolves.toEqual(['original', 'synthetic answer']);
    expect(llm.findById).toHaveBeenCalledWith('chat-config', TENANT_ID);
    expect(externalMocks.generateText).toHaveBeenCalledWith({
      model: { languageModel: true },
      prompt: 'Question: original / original',
    });
  });

  it('HyDE uses the default chat model and drops an empty synthetic answer', async () => {
    llm.findDefaultByType.mockResolvedValue({ id: 'default-chat' });
    pi.getModel.mockResolvedValue({ languageModel: true });
    externalMocks.generateText.mockResolvedValue({ text: '   ' });

    await expect(
      internals.buildQueryVariants('original', TENANT_ID, {
        type: 'hyde',
        modelConfigId: null,
        promptTemplate: null,
      }),
    ).resolves.toEqual(['original']);
    expect(llm.findDefaultByType).toHaveBeenCalledWith(TENANT_ID, 'chat');
    expect(externalMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('original') }),
    );
  });

  it('query orchestration none neither resolves a model nor generates text', async () => {
    await expect(
      internals.buildQueryVariants('literal query', TENANT_ID, {
        type: 'none',
      }),
    ).resolves.toEqual(['literal query']);
    expect(llm.findById).not.toHaveBeenCalled();
    expect(externalMocks.generateText).not.toHaveBeenCalled();
  });

  it('HyDE exposes a clear configuration error when no chat model is available', async () => {
    llm.findDefaultByType.mockResolvedValue(null);
    await expect(
      internals.generateHydeQuery('query', TENANT_ID, {
        type: 'hyde',
        modelConfigId: null,
        promptTemplate: null,
      }),
    ).rejects.toThrow('HyDE 策略未找到可用的对话模型配置');
  });

  it('lexical tokenization normalizes, deduplicates, and rejects punctuation-only queries', () => {
    expect(
      internals.extractLexicalTokens(
        'Agent.Agent AGENT.AGENT 中文知识 中文知识 x',
      ),
    ).toEqual(['agent.agent', '中文知识']);
    expect(internals.extractLexicalTokens(' ? / x ! ')).toEqual([]);
  });

  it('mergeNodeScores keeps the highest duplicate score and sorts missing scores last', () => {
    const low = new TextNode({ id_: 'same', text: 'low' });
    const high = new TextNode({ id_: 'same', text: 'high' });
    const missing = new TextNode({ id_: 'missing', text: 'missing' });
    const other = new TextNode({ id_: 'other', text: 'other' });

    expect(
      internals.mergeNodeScores([
        { node: low, score: 0.2 },
        { node: missing },
        { node: high, score: 0.9 },
        { node: other, score: 0.5 },
        { node: low, score: 0.1 },
      ]),
    ).toEqual([
      { node: high, score: 0.9 },
      { node: other, score: 0.5 },
      { node: missing },
    ]);
  });

  it('payload hydration accepts valid llama data and rejects malformed or empty payloads', () => {
    const node = new TextNode({ id_: 'llama-node', text: 'answer' });
    expect(
      internals.parseLlamaIndexNodeFromPayload({
        _node_content: JSON.stringify(node.toJSON()),
      })?.id_,
    ).toBe('llama-node');
    expect(
      internals.parseLlamaIndexNodeFromPayload({ _node_content: '  ' }),
    ).toBeNull();
    expect(
      internals.parseLlamaIndexNodeFromPayload({ _node_content: '{bad' }),
    ).toBeNull();
    expect(
      internals.parseLlamaIndexNodeFromPayload({ _node_content: 7 }),
    ).toBeNull();
    expect(
      internals.hydrateNodeWithScore({ id: 'bad', score: 0.8, payload: {} }),
    ).toBeNull();
  });

  it('legacy hydration honors fallback keys, removes invalid metadata, and preserves citation location', () => {
    const node = internals.parseLegacyNodeFromPayload('legacy', {
      text: 'fallback text',
      document_id: 'doc-snake',
      knowledge_base_id: 'ignored-by-result-contract',
      file_name: 'legacy.md',
      chunkIndex: 9,
      location: {
        heading: 'Section',
        paragraph: 2,
        page: 4,
        charOffset: 10,
        charLength: 20,
      },
    });
    expect(node).not.toBeNull();
    if (!node) {
      throw new Error('Expected a legacy node');
    }
    expect(internals.toSearchResult({ node, score: undefined }, KB_ID)).toEqual(
      expect.objectContaining({
        nodeId: 'legacy',
        score: 0,
        content: 'fallback text',
        documentId: 'doc-snake',
        knowledgeBaseId: KB_ID,
        chunkIndex: 9,
        fileName: 'legacy.md',
        location: {
          page: 4,
          paragraph: 2,
          heading: 'Section',
          charOffset: 10,
          charLength: 20,
        },
      }),
    );
    expect(
      internals.parseLegacyNodeFromPayload('empty', { content: '   ' }),
    ).toBeNull();
  });

  it('result conversion prefers sentence window and omits a citation location when all fields are invalid', () => {
    const node = new TextNode({
      id_: 'windowed',
      text: 'raw chunk',
      metadata: {
        window: '  surrounding context  ',
        documentId: 4,
        fileName: null,
        sourceSectionIndex: Number.NaN,
        page: '3',
        paragraph: Number.POSITIVE_INFINITY,
      },
    });
    expect(internals.toSearchResult({ node, score: 0.75 }, KB_ID)).toEqual({
      chunkId: 'windowed',
      nodeId: 'windowed',
      score: 0.75,
      content: '  surrounding context  ',
      location: null,
      documentId: '',
      knowledgeBaseId: KB_ID,
      chunkIndex: 0,
      fileName: null,
      metadata: node.metadata,
    });
  });

  it('lexical retrieval returns empty without querying storage for a tokenless variant', async () => {
    await expect(
      internals.searchKnowledgeBaseLexicallyByVariant({
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        queryVariant: '?! x',
        limit: 4,
      }),
    ).resolves.toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('lexical retrieval tolerates partial rows and keeps valid legacy rows', async () => {
    db.limit.mockResolvedValue([
      { id: 'bad-null', payload: null, score: 3 },
      { id: 'bad-array', payload: [], score: 2 },
      { id: 'good', payload: { window: 'found', documentId: 'doc' }, score: 1 },
    ]);
    const result = await internals.searchKnowledgeBaseLexicallyByVariant({
      knowledgeBaseId: KB_ID,
      tenantId: TENANT_ID,
      queryVariant: 'searchable token',
      limit: 4,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.node.id_).toBe('good');
    expect(result[0]?.score).toBe(1);
  });

  it('vector retrieval filters by explicit threshold, ignores malformed results, and enforces context limit', async () => {
    vectors.collectionExists.mockResolvedValue(true);
    embeddings.generateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const goodHigh = new TextNode({ id_: 'high', text: 'high' });
    const goodLow = new TextNode({ id_: 'low', text: 'low' });
    vectors.search.mockResolvedValue([
      { id: 'bad', score: 0.99, payload: {} },
      {
        id: 'low',
        score: 0.69,
        payload: { _node_content: JSON.stringify(goodLow.toJSON()) },
      },
      {
        id: 'high',
        score: 0.91,
        payload: { _node_content: JSON.stringify(goodHigh.toJSON()) },
      },
    ]);
    vi.spyOn(internals, 'resolveEmbeddingConfig').mockResolvedValue({
      provider: 'openai',
      modelName: 'embedding',
    });

    await expect(
      internals.searchSingleKnowledgeBase(
        'query',
        TENANT_ID,
        createKnowledgeBase(),
        1,
        0.7,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ nodeId: 'high', score: 0.91 }),
    ]);
    expect(vectors.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 4, scoreThreshold: 0.7 }),
    );
  });

  it('retrieval strategy threshold applies when no request override is supplied', async () => {
    vectors.collectionExists.mockResolvedValue(true);
    embeddings.generateEmbeddings.mockResolvedValue([[0.1]]);
    vectors.search.mockResolvedValue([]);
    vi.spyOn(internals, 'resolveEmbeddingConfig').mockResolvedValue({
      provider: 'openai',
    });
    const kb = createKnowledgeBase({
      retrievalStrategy: { topK: 7, similarityThreshold: 0.42 },
    });

    await expect(
      internals.searchSingleKnowledgeBase('query', TENANT_ID, kb, 0),
    ).resolves.toEqual([]);
    expect(vectors.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 7, scoreThreshold: 0.42 }),
    );
  });

  it('an empty vector response is a successful empty result and does not query lexical storage', async () => {
    vectors.collectionExists.mockResolvedValue(true);
    embeddings.generateEmbeddings.mockResolvedValue([[0.1]]);
    vectors.search.mockResolvedValue([]);
    vi.spyOn(internals, 'resolveEmbeddingConfig').mockResolvedValue({
      provider: 'openai',
    });

    await expect(
      internals.searchSingleKnowledgeBase(
        'query',
        TENANT_ID,
        createKnowledgeBase(),
        3,
      ),
    ).resolves.toEqual([]);
    expect(db.orderBy).not.toHaveBeenCalled();
  });

  it('Cohere reranking decrypts the tenant key and honors model, endpoint, timeout, and output limit', async () => {
    const first = {
      node: new TextNode({ id_: 'one', text: 'one' }),
      score: 0.2,
    };
    const second = {
      node: new TextNode({ id_: 'two', text: 'two' }),
      score: 0.8,
    };
    db.limit.mockResolvedValue([{ id: 'org-1' }]);
    decryptor.decryptConfiguredApiKey.mockResolvedValue('secret');
    externalMocks.rerank.mockResolvedValue([second]);
    const kb = createKnowledgeBase({
      rerankingStrategy: {
        type: 'cohere',
        apiKeyId: 'key-1',
        model: 'rerank-v3.5',
        topN: 9,
        baseUrl: 'https://cohere.test',
        timeoutMs: 1234,
      },
    });

    await expect(
      internals.applyReranker([first, second], 'question', TENANT_ID, kb, 1),
    ).resolves.toEqual([second]);
    expect(decryptor.decryptConfiguredApiKey).toHaveBeenCalledWith(
      {
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        tenantId: TENANT_ID,
        provider: 'cohere',
      },
      'RagService.applyReranker',
    );
    expect(externalMocks.rerankerOptions).toHaveBeenCalledWith({
      apiKey: 'secret',
      model: 'rerank-v3.5',
      topN: 1,
      baseUrl: 'https://cohere.test',
      timeout: 1234,
    });
  });

  it('reranking is bypassed for none strategy and for a single candidate', async () => {
    const only = {
      node: new TextNode({ id_: 'one', text: 'one' }),
      score: 0.2,
    };
    await expect(
      internals.applyReranker(
        [only],
        'q',
        TENANT_ID,
        createKnowledgeBase({
          rerankingStrategy: { type: 'cohere', model: 'm' },
        }),
        3,
      ),
    ).resolves.toEqual([only]);
    await expect(
      internals.applyReranker(
        [only, only],
        'q',
        TENANT_ID,
        createKnowledgeBase(),
        3,
      ),
    ).resolves.toEqual([only, only]);
    expect(decryptor.decryptConfiguredApiKey).not.toHaveBeenCalled();
  });

  it('reranking reports a missing tenant organization before decrypting a key', async () => {
    db.limit.mockResolvedValue([]);
    const candidates = [
      { node: new TextNode({ id_: 'one', text: 'one' }), score: 0.1 },
      { node: new TextNode({ id_: 'two', text: 'two' }), score: 0.2 },
    ];
    await expect(
      internals.applyReranker(
        candidates,
        'q',
        TENANT_ID,
        createKnowledgeBase({
          rerankingStrategy: { type: 'cohere', model: 'm', apiKeyId: null },
        }),
        2,
      ),
    ).rejects.toThrow(`Organization not found for tenantId: ${TENANT_ID}`);
    expect(decryptor.decryptConfiguredApiKey).not.toHaveBeenCalled();
  });

  it('search does not emit evidence for an empty result or without evidence context', async () => {
    const searchInternals = service as unknown as Pick<
      RagInternals,
      'resolveKnowledgeBasesForSearch' | 'searchSingleKnowledgeBase'
    >;
    const resolve = vi
      .spyOn(searchInternals, 'resolveKnowledgeBasesForSearch')
      .mockResolvedValue([createKnowledgeBase()]);
    vi.spyOn(searchInternals, 'searchSingleKnowledgeBase').mockResolvedValue(
      [],
    );

    await expect(
      service.search('query', TENANT_ID, {
        knowledgeBaseIds: [KB_ID, 3 as unknown as string],
        evidenceContext: { executionId: 'exec', stepId: 'step' },
      }),
    ).resolves.toEqual([]);
    await expect(
      service.search('query', TENANT_ID, { knowledgeBaseIds: [KB_ID] }),
    ).resolves.toEqual([]);
    expect(resolve).toHaveBeenCalledWith([KB_ID], TENANT_ID);
    expect(evidence.emit).not.toHaveBeenCalled();
  });

  it('deleteByDocument is a no-op for missing documents and missing collections', async () => {
    db.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ knowledgeBaseId: KB_ID }]);
    await service.deleteByDocument('missing', TENANT_ID);
    expect(vectors.collectionExists).not.toHaveBeenCalled();

    vectors.collectionExists.mockResolvedValue(false);
    await service.deleteByDocument('present', TENANT_ID);
    expect(vectors.deleteByFilter).not.toHaveBeenCalled();
  });

  it('indexDocument skips a deleted document after node loading', async () => {
    nodes.findLlamaNodesByDocumentId.mockResolvedValue([
      new TextNode({ id_: 'orphan', text: 'orphan' }),
    ]);
    db.limit.mockResolvedValue([]);
    await expect(
      service.indexDocument('deleted', TENANT_ID),
    ).resolves.toBeUndefined();
    expect(embeddings.generateEmbeddings).not.toHaveBeenCalled();
  });

  it('indexDocument assigns embeddings and rolls vector writes back on storage failure', async () => {
    const node = new TextNode({ id_: 'node', text: 'content' });
    nodes.findLlamaNodesByDocumentId.mockResolvedValue([node]);
    db.limit.mockResolvedValueOnce([{ knowledgeBaseId: KB_ID }]);
    embeddings.generateEmbeddings.mockResolvedValue([[0.4, 0.6]]);
    vi.spyOn(internals, 'resolveEmbeddingConfig').mockResolvedValue({
      provider: 'openai',
    });
    const rollback = vi.spyOn(service, 'deleteByDocument').mockResolvedValue();
    externalMocks.vectorAdd.mockRejectedValue(new Error('qdrant unavailable'));

    await expect(service.indexDocument('doc', TENANT_ID)).rejects.toThrow(
      'qdrant unavailable',
    );
    expect(node.embedding).toEqual([0.4, 0.6]);
    expect(rollback).toHaveBeenCalledWith('doc', TENANT_ID);
  });

  it('embedding config falls back to the tenant default embedding model when none is bound', async () => {
    db.limit
      .mockResolvedValueOnce([{ id: 'org-legacy' }])
      .mockResolvedValueOnce([
        { embeddingModel: 'legacy-embedding', embeddingModelConfigId: null },
      ]);
    llm.findDefaultByType.mockResolvedValue({
      modelType: 'embedding',
      modelId: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      provider: {
        slug: 'openai',
        apiKeyId: 'default-key',
        baseUrl: null,
        defaultBaseUrl: 'https://api.openai.com',
      },
    });

    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, KB_ID),
    ).resolves.toEqual({
      organizationId: 'org-legacy',
      tenantId: TENANT_ID,
      provider: 'openai',
      modelName: 'text-embedding-3-small',
      apiKeyId: 'default-key',
      endpointUrl: 'https://api.openai.com',
      authMethod: null,
      dimensions: 1536,
    });
  });

  it('embedding config rejects when neither a bound nor a default embedding model exists', async () => {
    db.limit
      .mockResolvedValueOnce([{ id: 'org-legacy' }])
      .mockResolvedValueOnce([
        { embeddingModel: 'legacy-embedding', embeddingModelConfigId: null },
      ]);
    llm.findDefaultByType.mockResolvedValue(null);

    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, KB_ID),
    ).rejects.toBeInstanceOf(KnowledgeEmbeddingModelNotConfiguredException);
  });

  it('embedding config maps a supported configured provider and its credentials', async () => {
    db.limit
      .mockResolvedValueOnce([{ id: 'org-private' }])
      .mockResolvedValueOnce([
        { embeddingModel: 'stale', embeddingModelConfigId: 'config-1' },
      ]);
    llm.findById.mockResolvedValue({
      modelType: 'embedding',
      modelId: 'private-embedding',
      embeddingDimensions: 2048,
      provider: {
        slug: 'private_cloud',
        apiKeyId: 'api-key',
        baseUrl: 'https://embedding.test',
      },
    });
    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, KB_ID),
    ).resolves.toEqual({
      organizationId: 'org-private',
      tenantId: TENANT_ID,
      provider: 'private_cloud',
      modelName: 'private-embedding',
      apiKeyId: 'api-key',
      endpointUrl: 'https://embedding.test',
      authMethod: null,
      dimensions: 2048,
    });
  });

  it('embedding config rejects missing knowledge bases, wrong model types, and unsupported providers', async () => {
    db.limit.mockResolvedValueOnce([{ id: 'org' }]).mockResolvedValueOnce([]);
    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, 'missing'),
    ).rejects.toThrow('Knowledge base not found: missing');

    db.limit
      .mockResolvedValueOnce([{ id: 'org' }])
      .mockResolvedValueOnce([{ embeddingModelConfigId: 'wrong' }]);
    llm.findById.mockResolvedValueOnce({
      modelType: 'chat',
      provider: { slug: 'openai' },
    });
    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, KB_ID),
    ).rejects.toThrow(`Knowledge base ${KB_ID} 绑定的模型不是 Embedding 模型`);

    db.limit
      .mockResolvedValueOnce([{ id: 'org' }])
      .mockResolvedValueOnce([{ embeddingModelConfigId: 'unsupported' }]);
    llm.findById.mockResolvedValueOnce({
      modelType: 'embedding',
      provider: { slug: 'anthropic' },
    });
    await expect(
      internals.resolveEmbeddingConfig(TENANT_ID, KB_ID),
    ).rejects.toThrow(
      'Embedding 模型仅支持 openai/private_cloud，当前为 anthropic',
    );
  });
});
