import { generateText, type LanguageModel } from 'ai';
import { CohereRerank } from '@llamaindex/cohere';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QdrantVectorStore } from '@llamaindex/qdrant';
import {
  MetadataMode,
  TextNode,
  jsonToNode,
  type NodeWithScore,
} from 'llamaindex';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { QdrantClient } from '@qdrant/js-client-rest';

import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  documents,
  knowledgeBases,
  knowledgeNodes,
  organizations,
  type KnowledgeBase,
} from '../../../database/schema';
import { EvidenceEventName } from '../../evidence/evidence.events';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { PiAiAdapter } from '../../llm/pi-ai-adapter';
import { LlmService } from '../../llm/llm.service';
import { KnowledgeBaseService } from '../knowledge-base.service';
import type { KnowledgeQueryOrchestrationStrategy } from '../knowledge-base-config';
import type { VectorSearchResult } from '../interfaces/vector-store.interface';
import { QDRANT_CLIENT } from '../qdrant.provider';
import { KnowledgeNodeService } from '../knowledge-node.service';
import { QdrantVectorStoreService } from './qdrant-vector-store.service';
import { EmbeddingService } from './embedding.service';
import { LlamaIndexEmbeddingAdapter } from './llamaindex-embedding.adapter';

export interface RagSearchOptions {
  knowledgeBaseIds?: string[];
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
  nodeId: string;
  score: number;
  content: string;
  location: Record<string, unknown> | null;
  documentId: string;
  knowledgeBaseId: string;
  chunkIndex: number;
  fileName: string | null;
  metadata: Record<string, unknown>;
}

type SearchableKnowledgeBase = Pick<
  KnowledgeBase,
  | 'id'
  | 'tenantId'
  | 'embeddingModel'
  | 'embeddingModelConfigId'
  | 'chunkingStrategy'
  | 'retrievalStrategy'
  | 'rerankingStrategy'
  | 'queryOrchestration'
>;

const HYDE_DEFAULT_PROMPT = [
  '你是知识库检索预处理器。',
  '请基于用户查询，写出一段可能出现在相关资料中的假设性答案摘要。',
  '不要解释过程，不要列清单，只输出一段便于向量检索命中的自然语言文本。',
  '用户查询：{{query}}',
].join('\n');

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(QDRANT_CLIENT) private readonly qdrantClient: QdrantClient,
    private readonly knowledgeNodeService: KnowledgeNodeService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly vectorStoreService: QdrantVectorStoreService,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
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
    const nodes = await this.knowledgeNodeService.findLlamaNodesByDocumentId(
      documentId,
      tenantId,
    );

    if (nodes.length === 0) {
      this.logger.warn(
        `No knowledge nodes found for document ${documentId}, skipping indexing`,
      );
      return;
    }

    const [document] = await this.db
      .select({
        knowledgeBaseId: documents.knowledgeBaseId,
      })
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
      )
      .limit(1);

    if (!document) {
      return;
    }

    const embeddingConfig = await this.resolveEmbeddingConfig(
      tenantId,
      document.knowledgeBaseId,
    );
    const embedModel = new LlamaIndexEmbeddingAdapter(
      this.embeddingService,
      embeddingConfig,
    );
    const vectorStore = new QdrantVectorStore({
      client: this.qdrantClient,
      collectionName: this.getCollectionName(document.knowledgeBaseId),
      embedModel,
    });

    const texts = nodes.map((node) => node.getContent(MetadataMode.NONE));
    const embeddings = await embedModel.getTextEmbeddings(texts);
    nodes.forEach((node, index) => {
      node.embedding = embeddings[index];
    });

    try {
      await vectorStore.add(nodes);
    } catch (error) {
      this.logger.error(
        `Failed to add knowledge nodes for document ${documentId}, rolling back`,
      );
      await this.deleteByDocument(documentId, tenantId);
      throw error;
    }

    this.logger.log(
      `Indexed ${nodes.length} knowledge nodes for document ${documentId}`,
    );
  }

  async search(
    query: string,
    tenantId: string,
    options: RagSearchOptions = {},
  ): Promise<RagSearchResult[]> {
    const knowledgeBaseIds = Array.from(
      new Set(
        (options.knowledgeBaseIds ?? []).filter(
          (knowledgeBaseId) => typeof knowledgeBaseId === 'string',
        ),
      ),
    );

    if (knowledgeBaseIds.length === 0) {
      throw new Error('RagService.search 需要至少一个 knowledgeBaseId');
    }

    const knowledgeBaseRecords = await this.resolveKnowledgeBasesForSearch(
      knowledgeBaseIds,
      tenantId,
    );
    const searchLimit = options.limit ?? 8;

    const resultGroups = await Promise.all(
      knowledgeBaseRecords.map((knowledgeBase) =>
        this.searchSingleKnowledgeBase(
          query,
          tenantId,
          knowledgeBase,
          searchLimit,
          options.scoreThreshold,
        ),
      ),
    );

    const results = resultGroups
      .flat()
      .sort((left, right) => right.score - left.score)
      .slice(0, searchLimit);

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

    const exists =
      await this.vectorStoreService.collectionExists(collectionName);
    if (!exists) return;

    await this.vectorStoreService.deleteByFilter(collectionName, {
      must: [{ key: 'documentId', match: { value: documentId } }],
    });
    this.logger.log(
      `Deleted vectors for document ${documentId} from "${collectionName}"`,
    );
  }

  async deleteKnowledgeBaseCollection(knowledgeBaseId: string): Promise<void> {
    const collectionName = this.getCollectionName(knowledgeBaseId);
    await this.vectorStoreService.deleteCollection(collectionName);
  }

  private async searchSingleKnowledgeBase(
    query: string,
    tenantId: string,
    knowledgeBase: SearchableKnowledgeBase,
    limit: number,
    scoreThreshold?: number,
  ): Promise<RagSearchResult[]> {
    const collectionName = this.getCollectionName(knowledgeBase.id);
    const collectionExists =
      await this.vectorStoreService.collectionExists(collectionName);

    const retrievalStrategy =
      this.knowledgeBaseService.getRetrievalStrategy(knowledgeBase);
    const rerankingStrategy =
      this.knowledgeBaseService.getRerankingStrategy(knowledgeBase);
    const queryOrchestration =
      this.knowledgeBaseService.getQueryOrchestration(knowledgeBase);

    const finalLimit = Math.max(1, limit);
    const retrievalLimit = Math.max(
      finalLimit * 3,
      retrievalStrategy.topK,
      rerankingStrategy.type === 'cohere' ? rerankingStrategy.topN : finalLimit,
    );
    const effectiveThreshold =
      scoreThreshold ?? retrievalStrategy.similarityThreshold ?? undefined;

    const queryVariants = await this.buildQueryVariants(
      query,
      tenantId,
      queryOrchestration,
    );
    const finalizeResults = async (
      nodes: NodeWithScore[],
    ): Promise<RagSearchResult[]> => {
      const thresholdedNodes =
        effectiveThreshold === undefined
          ? nodes
          : nodes.filter(
              (node) =>
                typeof node.score !== 'number' ||
                node.score >= effectiveThreshold,
            );

      const rerankedNodes = await this.applyReranker(
        thresholdedNodes,
        query,
        tenantId,
        knowledgeBase,
        finalLimit,
      );

      return rerankedNodes
        .slice(0, finalLimit)
        .map((node) => this.toSearchResult(node, knowledgeBase.id));
    };

    if (collectionExists) {
      try {
        const embeddingConfig = await this.resolveEmbeddingConfig(
          tenantId,
          knowledgeBase.id,
        );
        const embedModel = new LlamaIndexEmbeddingAdapter(
          this.embeddingService,
          embeddingConfig,
        );
        const queryEmbeddings =
          await embedModel.getTextEmbeddings(queryVariants);
        const queryResults = await Promise.all(
          queryEmbeddings.map((vector) =>
            this.vectorStoreService.search({
              collectionName,
              vector,
              limit: retrievalLimit,
              scoreThreshold: effectiveThreshold,
            }),
          ),
        );
        const mergedNodes = this.mergeNodeScores(
          queryResults.flat().flatMap((result) => {
            const hydrated = this.hydrateNodeWithScore(result);
            return hydrated ? [hydrated] : [];
          }),
        );

        return finalizeResults(mergedNodes);
      } catch (error) {
        this.logger.warn(
          `知识库 ${knowledgeBase.id} 向量检索失败，回退 lexical search: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      this.logger.warn(
        `知识库 ${knowledgeBase.id} 缺少向量集合，回退 lexical search`,
      );
    }

    const lexicalNodes = await this.searchKnowledgeBaseLexically({
      knowledgeBaseId: knowledgeBase.id,
      tenantId,
      queryVariants,
      limit: retrievalLimit,
    });
    return finalizeResults(lexicalNodes);
  }

  private async searchKnowledgeBaseLexically(params: {
    knowledgeBaseId: string;
    tenantId: string;
    queryVariants: string[];
    limit: number;
  }): Promise<NodeWithScore[]> {
    const variantResults = await Promise.all(
      params.queryVariants.map((queryVariant) =>
        this.searchKnowledgeBaseLexicallyByVariant({
          knowledgeBaseId: params.knowledgeBaseId,
          tenantId: params.tenantId,
          queryVariant,
          limit: params.limit,
        }),
      ),
    );

    return this.mergeNodeScores(variantResults.flat());
  }

  private async searchKnowledgeBaseLexicallyByVariant(params: {
    knowledgeBaseId: string;
    tenantId: string;
    queryVariant: string;
    limit: number;
  }): Promise<NodeWithScore[]> {
    const tokens = this.extractLexicalTokens(params.queryVariant);
    if (tokens.length === 0) {
      return [];
    }

    const tokenMatchClauses = tokens.map((token) => {
      const loweredToken = token.toLowerCase();
      return sql<number>`CASE WHEN lower(${knowledgeNodes.content}) LIKE ${`%${loweredToken}%`} THEN 1 ELSE 0 END`;
    });
    const lexicalScore = tokenMatchClauses.reduce(
      (accumulator, clause) => sql<number>`${accumulator} + ${clause}`,
      sql<number>`0`,
    );

    const rows = await this.db
      .select({
        id: knowledgeNodes.id,
        payload: knowledgeNodes.payload,
        score: lexicalScore,
      })
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.tenantId, params.tenantId),
          eq(knowledgeNodes.knowledgeBaseId, params.knowledgeBaseId),
          sql`${lexicalScore} > 0`,
        ),
      )
      .orderBy(desc(lexicalScore))
      .limit(params.limit);

    return rows.flatMap((row) => {
      const payload =
        row.payload && typeof row.payload === 'object'
          ? (row.payload as Record<string, unknown>)
          : {};
      const node =
        this.parseLlamaIndexNodeFromPayload(payload) ??
        this.parseLegacyNodeFromPayload(row.id, payload);
      if (!node) {
        return [];
      }

      return [
        {
          node,
          score: row.score,
        } satisfies NodeWithScore,
      ];
    });
  }

  private mergeNodeScores(nodes: NodeWithScore[]): NodeWithScore[] {
    const merged = new Map<string, NodeWithScore>();

    for (const candidate of nodes) {
      const key = candidate.node.id_;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, candidate);
        continue;
      }

      const nextScore = candidate.score ?? Number.NEGATIVE_INFINITY;
      const currentScore = existing.score ?? Number.NEGATIVE_INFINITY;

      if (nextScore > currentScore) {
        merged.set(key, candidate);
      }
    }

    return Array.from(merged.values()).sort((left, right) => {
      return (right.score ?? 0) - (left.score ?? 0);
    });
  }

  private extractLexicalTokens(query: string): string[] {
    const normalized = query.toLowerCase();
    const tokens = normalized.match(
      /[a-z0-9][a-z0-9._-]{1,}|\p{Script=Han}{2,}/gu,
    );
    if (!tokens) {
      return [];
    }

    return Array.from(new Set(tokens));
  }

  private hydrateNodeWithScore(
    result: VectorSearchResult,
  ): NodeWithScore | null {
    const node =
      this.parseLlamaIndexNodeFromPayload(result.payload) ??
      this.parseLegacyNodeFromPayload(result.id, result.payload);

    if (!node) {
      this.logger.warn(
        `Skipping vector result ${result.id} because payload cannot be converted into a knowledge node`,
      );
      return null;
    }

    return {
      node,
      score: result.score,
    };
  }

  private parseLlamaIndexNodeFromPayload(
    payload: Record<string, unknown>,
  ): TextNode | null {
    const serializedNode = payload._node_content;
    if (
      typeof serializedNode !== 'string' ||
      serializedNode.trim().length === 0
    ) {
      return null;
    }

    try {
      return jsonToNode(JSON.parse(serializedNode)) as TextNode;
    } catch (error) {
      this.logger.warn(
        `Failed to parse llamaindex node payload: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private parseLegacyNodeFromPayload(
    id: string,
    payload: Record<string, unknown>,
  ): TextNode | null {
    const content =
      this.readStringValue(payload, 'content') ??
      this.readStringValue(payload, 'text') ??
      this.readStringValue(payload, 'window');

    if (!content || content.trim().length === 0) {
      return null;
    }

    const location = this.readRecordValue(payload, 'location');
    const metadata = this.compactMetadata({
      window: this.readStringValue(payload, 'window') ?? undefined,
      originalText: this.readStringValue(payload, 'originalText') ?? undefined,
      documentId:
        this.readStringValue(payload, 'documentId') ??
        this.readStringValue(payload, 'document_id') ??
        undefined,
      knowledgeBaseId:
        this.readStringValue(payload, 'knowledgeBaseId') ??
        this.readStringValue(payload, 'knowledge_base_id') ??
        undefined,
      fileName:
        this.readStringValue(payload, 'fileName') ??
        this.readStringValue(payload, 'file_name') ??
        undefined,
      heading: this.readStringValue(location, 'heading') ?? undefined,
      paragraph: this.readNumberValue(location, 'paragraph') ?? undefined,
      page: this.readNumberValue(location, 'page') ?? undefined,
      absoluteCharOffset:
        this.readNumberValue(location, 'absoluteCharOffset') ??
        this.readNumberValue(location, 'charOffset') ??
        undefined,
      absoluteCharLength:
        this.readNumberValue(location, 'absoluteCharLength') ??
        this.readNumberValue(location, 'charLength') ??
        undefined,
      sourceSectionIndex:
        this.readNumberValue(payload, 'sourceSectionIndex') ??
        this.readNumberValue(payload, 'chunkIndex') ??
        undefined,
    });

    return new TextNode({
      id_: id,
      text: content,
      metadata,
    });
  }

  private async applyReranker(
    nodes: NodeWithScore[],
    query: string,
    tenantId: string,
    knowledgeBase: SearchableKnowledgeBase,
    limit: number,
  ): Promise<NodeWithScore[]> {
    const rerankingStrategy =
      this.knowledgeBaseService.getRerankingStrategy(knowledgeBase);

    if (rerankingStrategy.type !== 'cohere' || nodes.length <= 1) {
      return nodes;
    }

    const organizationId = await this.resolveOrganizationId(tenantId);
    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: rerankingStrategy.apiKeyId,
        organizationId,
        tenantId,
        provider: 'cohere',
      },
      'RagService.applyReranker',
    );

    const reranker = new CohereRerank({
      apiKey,
      model: rerankingStrategy.model,
      topN: limit,
      baseUrl: rerankingStrategy.baseUrl ?? undefined,
      timeout: rerankingStrategy.timeoutMs ?? undefined,
    });

    return reranker.postprocessNodes(nodes, query);
  }

  private async buildQueryVariants(
    query: string,
    tenantId: string,
    orchestration: KnowledgeQueryOrchestrationStrategy,
  ): Promise<string[]> {
    if (orchestration.type !== 'hyde') {
      return [query];
    }

    const synthetic = await this.generateHydeQuery(
      query,
      tenantId,
      orchestration,
    );

    return synthetic ? [query, synthetic] : [query];
  }

  private async generateHydeQuery(
    query: string,
    tenantId: string,
    orchestration: Extract<
      KnowledgeQueryOrchestrationStrategy,
      { type: 'hyde' }
    >,
  ): Promise<string | null> {
    const modelConfig = orchestration.modelConfigId
      ? await this.llmService.findById(orchestration.modelConfigId, tenantId)
      : await this.llmService.findDefaultByType(tenantId, 'chat');

    if (!modelConfig) {
      throw new Error('HyDE 策略未找到可用的对话模型配置');
    }

    const model = (await this.piAiAdapter.getModel(
      modelConfig,
    )) as LanguageModel;
    const promptTemplate = orchestration.promptTemplate ?? HYDE_DEFAULT_PROMPT;
    const prompt = promptTemplate.replaceAll('{{query}}', query);
    const result = await generateText({
      model,
      prompt,
    });

    const text = result.text.trim();
    return text.length > 0 ? text : null;
  }

  private toSearchResult(
    nodeWithScore: NodeWithScore,
    knowledgeBaseId: string,
  ): RagSearchResult {
    const node = nodeWithScore.node as TextNode;
    const metadata = (node.metadata ?? {}) as Record<string, unknown>;
    const content = this.resolveNodeContent(node);

    return {
      chunkId: node.id_,
      nodeId: node.id_,
      score: nodeWithScore.score ?? 0,
      content,
      location: this.buildLocation(metadata),
      documentId: this.readStringMetadata(metadata, 'documentId') ?? '',
      knowledgeBaseId,
      chunkIndex: this.readNumberMetadata(metadata, 'sourceSectionIndex') ?? 0,
      fileName: this.readStringMetadata(metadata, 'fileName'),
      metadata,
    };
  }

  private resolveNodeContent(node: TextNode): string {
    const windowContent = node.metadata?.window;
    if (typeof windowContent === 'string' && windowContent.trim().length > 0) {
      return windowContent;
    }

    return node.getContent(MetadataMode.NONE);
  }

  private buildLocation(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const page = this.readNumberMetadata(metadata, 'page');
    const paragraph = this.readNumberMetadata(metadata, 'paragraph');
    const heading = this.readStringMetadata(metadata, 'heading');
    const charOffset = this.readNumberMetadata(metadata, 'absoluteCharOffset');
    const charLength = this.readNumberMetadata(metadata, 'absoluteCharLength');

    const location = {
      page,
      paragraph,
      heading,
      charOffset,
      charLength,
    };

    return Object.values(location).some((value) => value !== null)
      ? location
      : null;
  }

  private readStringMetadata(
    metadata: Record<string, unknown>,
    key: string,
  ): string | null {
    return this.readStringValue(metadata, key);
  }

  private readNumberMetadata(
    metadata: Record<string, unknown>,
    key: string,
  ): number | null {
    return this.readNumberValue(metadata, key);
  }

  private readStringValue(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    if (!record) {
      return null;
    }

    const value = record[key];
    return typeof value === 'string' ? value : null;
  }

  private readNumberValue(
    record: Record<string, unknown> | null,
    key: string,
  ): number | null {
    if (!record) {
      return null;
    }

    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readRecordValue(
    record: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> | null {
    const value = record[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private compactMetadata(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    );
  }

  private async resolveKnowledgeBasesForSearch(
    knowledgeBaseIds: string[],
    tenantId: string,
  ): Promise<SearchableKnowledgeBase[]> {
    const rows = await this.db
      .select({
        id: knowledgeBases.id,
        tenantId: knowledgeBases.tenantId,
        embeddingModel: knowledgeBases.embeddingModel,
        embeddingModelConfigId: knowledgeBases.embeddingModelConfigId,
        chunkingStrategy: knowledgeBases.chunkingStrategy,
        retrievalStrategy: knowledgeBases.retrievalStrategy,
        rerankingStrategy: knowledgeBases.rerankingStrategy,
        queryOrchestration: knowledgeBases.queryOrchestration,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.tenantId, tenantId),
          inArray(knowledgeBases.id, knowledgeBaseIds),
        ),
      );

    return rows;
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

      if (
        config.provider.slug !== 'openai' &&
        config.provider.slug !== 'private_cloud'
      ) {
        throw new Error(
          `Embedding 模型仅支持 openai/private_cloud，当前为 ${config.provider.slug}`,
        );
      }

      return {
        organizationId,
        tenantId,
        provider: config.provider.slug as 'openai' | 'private_cloud',
        modelName: config.modelId,
        apiKeyId: config.provider.apiKeyId,
        endpointUrl: config.provider.baseUrl,
        authMethod: null,
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
