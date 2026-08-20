import {
  formatFileSize,
  type KnowledgeBase,
  type KnowledgeChunkingStrategy,
  type KnowledgeQueryOrchestration,
  type KnowledgeRerankingStrategy,
  type KnowledgeRetrievalStrategy,
  type KnowledgeSearchResult,
  type UpdateKnowledgeBaseSettingsInput,
} from '../types'

export const DOCUMENT_PAGE_SIZE = 20
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx'] as const

export const FILE_INPUT_ACCEPT = [
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

/**
 * Radix Select 不允许 value 为空串的 SelectItem，因此「使用默认…」这类可主动选回的空语义
 * 用哨兵值承载，提交前再映射回 null。
 */
export const USE_DEFAULT_MODEL = '__use_default__'

export const CHUNKING_STRATEGY_OPTIONS: Array<{
  value: KnowledgeChunkingStrategy['type']
  label: string
}> = [
  { value: 'sentence_window', label: 'Sentence Window' },
  { value: 'sentence', label: '句子分块' },
  { value: 'markdown', label: 'Markdown 分块' },
]

export const RERANKER_OPTIONS: Array<{
  value: KnowledgeRerankingStrategy['type']
  label: string
}> = [
  { value: 'none', label: '关闭重排' },
  { value: 'cohere', label: 'Cohere Rerank' },
]

export const QUERY_ORCHESTRATION_OPTIONS: Array<{
  value: KnowledgeQueryOrchestration['type']
  label: string
}> = [
  { value: 'none', label: '直接查询' },
  { value: 'hyde', label: 'HyDE' },
]

export type DocumentStatusFilter =
  | 'all'
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'

export const DOCUMENT_STATUS_FILTER_OPTIONS: Array<{
  value: DocumentStatusFilter
  label: string
}> = [
  { value: 'all', label: '全部文档' },
  { value: 'uploaded', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'ready', label: '已就绪' },
  { value: 'failed', label: '失败' },
]

export interface KnowledgeBaseSettingsDraft
  extends UpdateKnowledgeBaseSettingsInput {
  chunkingStrategy: KnowledgeChunkingStrategy
  retrievalStrategy: KnowledgeRetrievalStrategy
  rerankingStrategy: KnowledgeRerankingStrategy
  queryOrchestration: KnowledgeQueryOrchestration
  embeddingModelConfigId: string | null
}

export function createDefaultSettings(): KnowledgeBaseSettingsDraft {
  return {
    chunkingStrategy: {
      type: 'sentence_window',
      windowSize: 3,
    },
    retrievalStrategy: {
      topK: 8,
      similarityThreshold: null,
    },
    rerankingStrategy: {
      type: 'none',
    },
    queryOrchestration: {
      type: 'none',
    },
    embeddingModelConfigId: null,
  }
}

export function createSettingsFromKnowledgeBase(
  knowledgeBase: KnowledgeBase,
): KnowledgeBaseSettingsDraft {
  return {
    embeddingModel: knowledgeBase.embeddingModel,
    embeddingModelConfigId: knowledgeBase.embeddingModelConfigId,
    chunkingStrategy: knowledgeBase.chunkingStrategy,
    retrievalStrategy: knowledgeBase.retrievalStrategy,
    rerankingStrategy: knowledgeBase.rerankingStrategy,
    queryOrchestration: knowledgeBase.queryOrchestration,
  }
}

export const STATUS_BADGE_VARIANT: Record<
  string,
  'success' | 'info' | 'error' | 'secondary'
> = {
  ready: 'success',
  processing: 'info',
  failed: 'error',
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

/** 上传前的本地校验：扩展名白名单 + 单文件大小上限 */
export function validateUploadFile(file: File): string | null {
  const lastDotIndex = file.name.lastIndexOf('.')
  const extension =
    lastDotIndex < 0 ? '' : file.name.slice(lastDotIndex).toLowerCase()

  if (
    !SUPPORTED_DOCUMENT_EXTENSIONS.includes(
      extension as (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number],
    )
  ) {
    return '仅支持 PDF、TXT、Markdown 和 DOCX 文件'
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `文件大小不能超过 ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}`
  }

  return null
}

/** 检索命中的定位信息：页码 / 段落 / 标题 / 偏移，缺失时给出占位文案 */
export function renderLocation(result: KnowledgeSearchResult): string {
  const location = result.location
  if (!location) {
    return '无定位信息'
  }

  const segments: string[] = []
  if (typeof location.page === 'number') {
    segments.push(`页码 ${location.page}`)
  }
  if (typeof location.paragraph === 'number') {
    segments.push(`段落 ${location.paragraph}`)
  }
  if (typeof location.heading === 'string' && location.heading.length > 0) {
    segments.push(location.heading)
  }
  if (typeof location.charOffset === 'number') {
    segments.push(`偏移 ${location.charOffset}`)
  }

  return segments.length > 0 ? segments.join(' · ') : '无定位信息'
}
