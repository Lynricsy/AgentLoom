export const KNOWLEDGE_BASE_VISIBILITIES = ['private', 'organization'] as const;
export type KnowledgeBaseVisibility =
  (typeof KNOWLEDGE_BASE_VISIBILITIES)[number];

export const DOCUMENT_STATUSES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const KNOWLEDGE_BASE_STATUSES = [
  'empty',
  'processing',
  'ready',
  'failed',
] as const;
export type KnowledgeBaseStatus = (typeof KNOWLEDGE_BASE_STATUSES)[number];

export const KNOWLEDGE_CHUNKING_STRATEGY_TYPES = [
  'sentence',
  'sentence_window',
  'markdown',
] as const;
export type KnowledgeChunkingStrategyType =
  (typeof KNOWLEDGE_CHUNKING_STRATEGY_TYPES)[number];

export const KNOWLEDGE_RERANKER_TYPES = ['none', 'cohere'] as const;
export type KnowledgeRerankerType = (typeof KNOWLEDGE_RERANKER_TYPES)[number];

export const KNOWLEDGE_QUERY_ORCHESTRATION_TYPES = [
  'none',
  'hyde',
] as const;
export type KnowledgeQueryOrchestrationType =
  (typeof KNOWLEDGE_QUERY_ORCHESTRATION_TYPES)[number];

export type KnowledgeChunkingStrategy =
  | {
      type: 'sentence';
      chunkSize: number;
      chunkOverlap: number;
    }
  | {
      type: 'sentence_window';
      windowSize: number;
    }
  | {
      type: 'markdown';
    };

export interface KnowledgeRetrievalStrategy {
  topK: number;
  similarityThreshold: number | null;
}

export type KnowledgeRerankingStrategy =
  | {
      type: 'none';
    }
  | {
      type: 'cohere';
      model: string;
      topN: number;
      apiKeyId: string | null;
      baseUrl: string | null;
      timeoutMs: number | null;
    };

export type KnowledgeQueryOrchestration =
  | {
      type: 'none';
    }
  | {
      type: 'hyde';
      modelConfigId: string | null;
      promptTemplate: string | null;
    };

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  visibility: KnowledgeBaseVisibility;
  createdBy: string;
  embeddingModel: string;
  embeddingModelConfigId: string | null;
  chunkingStrategy: KnowledgeChunkingStrategy;
  retrievalStrategy: KnowledgeRetrievalStrategy;
  rerankingStrategy: KnowledgeRerankingStrategy;
  queryOrchestration: KnowledgeQueryOrchestration;
  documentCount: number;
  nodeCount: number;
  chunkCount: number;
  status: KnowledgeBaseStatus;
  createdAt: string;
  updatedAt: string;
}

type KnowledgeBaseCountSource = Pick<KnowledgeBase, 'nodeCount' | 'chunkCount'>;

export interface KnowledgeBaseDocument {
  id: string;
  knowledgeBaseId: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
  visibility?: KnowledgeBaseVisibility;
  embeddingModel?: string;
  embeddingModelConfigId?: string | null;
  chunkingStrategy?: KnowledgeChunkingStrategy;
  retrievalStrategy?: KnowledgeRetrievalStrategy;
  rerankingStrategy?: KnowledgeRerankingStrategy;
  queryOrchestration?: KnowledgeQueryOrchestration;
}

export interface UpdateKnowledgeBaseSettingsInput {
  embeddingModel?: string;
  embeddingModelConfigId?: string | null;
  chunkingStrategy?: KnowledgeChunkingStrategy;
  retrievalStrategy?: KnowledgeRetrievalStrategy;
  rerankingStrategy?: KnowledgeRerankingStrategy;
  queryOrchestration?: KnowledgeQueryOrchestration;
}

export interface KnowledgeBaseNodeConfig extends Record<string, unknown> {
  knowledgeBaseId: string;
  knowledgeBaseName?: string;
  knowledgeBaseDocumentCount?: number;
  knowledgeBaseNodeCount?: number;
  knowledgeBaseChunkCount?: number;
  knowledgeBaseStatus?: KnowledgeBaseStatus;
}

export interface KnowledgeSearchResult {
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

export interface KnowledgeTestSearchResponse {
  query: string;
  knowledgeBaseId: string;
  total: number;
  results: KnowledgeSearchResult[];
}

export interface DocumentListParams {
  page?: number;
  pageSize?: number;
  status?: DocumentStatus;
}

export function getDocumentStatusLabel(status: DocumentStatus): string {
  const labels: Record<DocumentStatus, string> = {
    uploaded: '已上传',
    processing: '处理中',
    ready: '就绪',
    failed: '失败',
  };
  return labels[status];
}

export function getDocumentStatusVariant(
  status: DocumentStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<
    DocumentStatus,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    uploaded: 'outline',
    processing: 'secondary',
    ready: 'default',
    failed: 'destructive',
  };
  return variants[status];
}

export function getKnowledgeBaseStatusLabel(
  status: KnowledgeBaseStatus,
): string {
  const labels: Record<KnowledgeBaseStatus, string> = {
    empty: '空库',
    processing: '处理中',
    ready: '可用',
    failed: '异常',
  };
  return labels[status];
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function buildKnowledgeBaseNodeConfig(
  knowledgeBase:
    | string
    | Pick<
        KnowledgeBase,
        'id' | 'name' | 'documentCount' | 'nodeCount' | 'chunkCount' | 'status'
      >,
): KnowledgeBaseNodeConfig {
  if (typeof knowledgeBase === 'string') {
    return { knowledgeBaseId: knowledgeBase };
  }

  return {
    knowledgeBaseId: knowledgeBase.id,
    knowledgeBaseName: knowledgeBase.name,
    knowledgeBaseDocumentCount: knowledgeBase.documentCount,
    knowledgeBaseNodeCount: knowledgeBase.nodeCount,
    knowledgeBaseChunkCount: knowledgeBase.chunkCount,
    knowledgeBaseStatus: knowledgeBase.status,
  };
}

export function isKnowledgeBaseConfigured(
  config: Record<string, unknown>,
): config is KnowledgeBaseNodeConfig {
  return (
    typeof config.knowledgeBaseId === 'string' &&
    config.knowledgeBaseId.length > 0
  );
}

export function getKnowledgeNodeCount(
  knowledgeBase: KnowledgeBaseCountSource,
): number {
  return knowledgeBase.nodeCount > 0 ? knowledgeBase.nodeCount : knowledgeBase.chunkCount;
}

export function getKnowledgeNodeCountLabel(
  knowledgeBase: KnowledgeBaseCountSource,
): string {
  return `${getKnowledgeNodeCount(knowledgeBase)} 个知识节点`;
}

export function getChunkingStrategyLabel(
  strategy: KnowledgeChunkingStrategy,
): string {
  switch (strategy.type) {
    case 'sentence':
      return `句子分块 · ${strategy.chunkSize}/${strategy.chunkOverlap}`;
    case 'sentence_window':
      return `Sentence Window · ${strategy.windowSize}`;
    case 'markdown':
      return 'Markdown 分块';
  }
}
