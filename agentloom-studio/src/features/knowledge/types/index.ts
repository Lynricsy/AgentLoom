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

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  visibility: KnowledgeBaseVisibility;
  createdBy: string;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  embeddingModelConfigId: string | null;
  documentCount: number;
  chunkCount: number;
  status: KnowledgeBaseStatus;
  createdAt: string;
  updatedAt: string;
}

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
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingModel?: string;
  embeddingModelConfigId?: string | null;
}

export interface UpdateKnowledgeBaseSettingsInput {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingModel?: string;
  embeddingModelConfigId?: string | null;
}

export interface KnowledgeBaseNodeConfig extends Record<string, unknown> {
  knowledgeBaseId: string;
  knowledgeBaseName?: string;
  knowledgeBaseDocumentCount?: number;
  knowledgeBaseChunkCount?: number;
  knowledgeBaseStatus?: KnowledgeBaseStatus;
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
        'id' | 'name' | 'documentCount' | 'chunkCount' | 'status'
      >,
): KnowledgeBaseNodeConfig {
  if (typeof knowledgeBase === 'string') {
    return { knowledgeBaseId: knowledgeBase };
  }

  return {
    knowledgeBaseId: knowledgeBase.id,
    knowledgeBaseName: knowledgeBase.name,
    knowledgeBaseDocumentCount: knowledgeBase.documentCount,
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
