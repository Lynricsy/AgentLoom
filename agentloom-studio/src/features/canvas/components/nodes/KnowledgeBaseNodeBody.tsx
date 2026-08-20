import { memo } from 'react'
import { BookOpen } from 'lucide-react'
import {
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  isKnowledgeBaseConfigured,
  type KnowledgeBaseStatus,
} from '@/features/knowledge'
import { NodeBadge, type NodeBadgeColor } from '../shared/NodeBadge'

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

function getStatusBadgeColor(status: KnowledgeBaseStatus): NodeBadgeColor {
  switch (status) {
    case 'ready':
      return 'success'
    case 'processing':
      return 'info'
    case 'failed':
      return 'destructive'
    default:
      return 'default'
  }
}

export const KnowledgeBaseNodeBody = memo(function KnowledgeBaseNodeBody({
  config,
}: KnowledgeBaseNodeBodyProps) {
  // Body 只在外层 shell 的 full LOD 下渲染，这里不再按 zoom 二次降级
  if (!isKnowledgeBaseConfigured(config)) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
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
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>

      {/* 状态 + 统计徽章 */}
      <div className="flex flex-wrap items-center gap-1">
        {status && (
          <NodeBadge variant="status" color={getStatusBadgeColor(status)}>
            {getKnowledgeBaseStatusLabel(status)}
          </NodeBadge>
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
