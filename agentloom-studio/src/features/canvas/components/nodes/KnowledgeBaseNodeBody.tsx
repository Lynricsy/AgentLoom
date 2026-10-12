import { memo } from 'react'
import { BookOpen } from 'lucide-react'
import {
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  isKnowledgeBaseConfigured,
  type KnowledgeBaseStatus,
} from '@/features/knowledge'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import { NodeBadge } from '../shared/NodeBadge'

interface KnowledgeBaseNodeBodyProps {
  config: Record<string, unknown>
}

function readNumericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readKnowledgeBaseStatus(value: unknown): KnowledgeBaseStatus | null {
  return value === 'empty' ||
    value === 'processing' ||
    value === 'ready' ||
    value === 'failed'
    ? value
    : null
}

const KNOWLEDGE_BASE_STATUS_TONE: Record<KnowledgeBaseStatus, StatusTone> = {
  empty: 'neutral',
  processing: 'info',
  ready: 'success',
  failed: 'error',
}

export const KnowledgeBaseNodeBody = memo(function KnowledgeBaseNodeBody({
  config,
}: KnowledgeBaseNodeBodyProps) {
  // Body 只在外层 shell 的 full LOD 下渲染，这里不再按 zoom 二次降级
  if (!isKnowledgeBaseConfigured(config)) {
    return (
      <div className="flex items-center gap-2 italic text-subtle-foreground">
        <BookOpen className="size-3.5 shrink-0" />
        <span>选择知识库</span>
      </div>
    )
  }

  const name =
    typeof config.knowledgeBaseName === 'string'
      ? config.knowledgeBaseName
      : String(config.knowledgeBaseId)

  const documentCount = readNumericValue(config.knowledgeBaseDocumentCount)
  const nodeCount =
    readNumericValue(config.knowledgeBaseNodeCount)
    ?? readNumericValue(config.knowledgeBaseChunkCount)
  const status = readKnowledgeBaseStatus(config.knowledgeBaseStatus)

  return (
    <div className="flex flex-col gap-2" data-testid="knowledge-node-body">
      {/* Name row */}
      <div className="flex min-w-0 items-center gap-2">
        <BookOpen className="size-3.5 shrink-0 text-primary/80" />
        <span className="min-w-0 truncate font-medium text-foreground" title={name}>
          {name}
        </span>
      </div>

      {/* 状态 + 统计徽章 */}
      <div className="flex flex-wrap items-center gap-1">
        {status && (
          <StatusBadge tone={KNOWLEDGE_BASE_STATUS_TONE[status]} size="sm">
            {getKnowledgeBaseStatusLabel(status)}
          </StatusBadge>
        )}
        {documentCount !== null && (
          <NodeBadge variant="info" color="default">
            {documentCount} 个文档
          </NodeBadge>
        )}
        {nodeCount !== null && (
          <NodeBadge variant="info" color="default">
            {getKnowledgeNodeCountLabel({ nodeCount, chunkCount: nodeCount })}
          </NodeBadge>
        )}
      </div>
    </div>
  )
})
