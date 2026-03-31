import { memo } from 'react'
import { useViewport } from '@xyflow/react'
import { BookOpen } from 'lucide-react'
import {
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  isKnowledgeBaseConfigured,
  type KnowledgeBaseStatus,
} from '@/features/knowledge/types'
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
  const { zoom } = useViewport()

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
  const lod = zoom >= 0.7 ? 'high' : zoom >= 0.4 ? 'medium' : 'low'

  if (lod === 'low') {
    return (
      <div className="flex items-center gap-2" data-testid="knowledge-node-low">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`knowledge-node-${lod}`}>
      {/* Name row */}
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>

      {/* Status + stats merged into one row */}
      {lod === 'medium' && documentCount !== null && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{documentCount} 个文档</span>
        </div>
      )}

      {lod === 'high' && (
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
      )}
    </div>
  )
})
