import { memo } from 'react'
import { useViewport } from '@xyflow/react'
import { BookOpen } from 'lucide-react'
import {
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  isKnowledgeBaseConfigured,
  type KnowledgeBaseStatus,
} from '@/features/knowledge/types'

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

function getKnowledgeBaseStatusClass(status: KnowledgeBaseStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-500/10 text-emerald-700'
    case 'processing':
      return 'bg-blue-500/10 text-blue-700'
    case 'failed':
      return 'bg-rose-500/10 text-rose-700'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export const KnowledgeBaseNodeBody = memo(function KnowledgeBaseNodeBody({
  config,
}: KnowledgeBaseNodeBodyProps) {
  const { zoom } = useViewport()

  if (!isKnowledgeBaseConfigured(config)) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
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
        <span className="truncate text-xs font-medium text-foreground">{name}</span>
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid={`knowledge-node-${lod}`}>
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-xs font-medium text-foreground">{name}</span>
      </div>
      {lod === 'medium' && documentCount !== null && (
        <p className="text-[11px] text-muted-foreground">{documentCount} 个文档</p>
      )}
      {lod === 'high' && (
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          {status && (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 font-medium ${getKnowledgeBaseStatusClass(
                status,
              )}`}
            >
              {getKnowledgeBaseStatusLabel(status)}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {documentCount !== null && <span>{documentCount} 个文档</span>}
            {nodeCount !== null && (
              <span>{getKnowledgeNodeCountLabel({ nodeCount, chunkCount: nodeCount })}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
