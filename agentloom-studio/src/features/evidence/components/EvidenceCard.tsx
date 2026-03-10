import { memo } from 'react'
import { cva } from 'class-variance-authority'
import {
  Bot,
  FileSearch2,
  MessageSquare,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'

import type { EvidenceChainNode, EvidenceSourceType } from '../types'
import { LocationLink } from './LocationLink'
import { SourceStatusBadge } from './SourceStatusBadge'

interface EvidenceCardProps {
  node: EvidenceChainNode
  isSelected?: boolean
  onSelect?: (evidenceId: string) => void
  className?: string
}

const sourceTypeConfig: Record<
  EvidenceSourceType,
  { icon: typeof FileSearch2; label: string; color: string }
> = {
  rag_retrieval: { icon: FileSearch2, label: 'RAG 检索', color: 'text-blue-500' },
  agent_decision: { icon: Bot, label: 'Agent 决策', color: 'text-violet-500' },
  tool_output: { icon: Wrench, label: '工具输出', color: 'text-orange-500' },
  user_input: { icon: MessageSquare, label: '用户输入', color: 'text-emerald-500' },
  intervention: { icon: ShieldCheck, label: '人工介入', color: 'text-rose-500' },
}

const cardVariants = cva(
  'rounded-xl border p-3 text-left transition-colors',
  {
    variants: {
      selected: {
        true: 'border-primary/40 bg-primary/5 shadow-sm',
        false: 'border-border/60 bg-card/60 hover:border-border hover:bg-card/80',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
)

export const EvidenceCard = memo(function EvidenceCard({
  node,
  isSelected = false,
  onSelect,
  className,
}: EvidenceCardProps) {
  const config = sourceTypeConfig[node.sourceType] ?? sourceTypeConfig.rag_retrieval
  const Icon = config.icon
  const metadata = (node.packetSummary?.metadata ?? {}) as Record<string, unknown>

  return (
    <button
      type="button"
      className={cn(cardVariants({ selected: isSelected }), 'w-full', className)}
      onClick={() => onSelect?.(node.evidenceId)}
      data-testid={`evidence-card-${node.evidenceId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
          <span className="truncate text-xs font-medium text-foreground">
            {node.packetSummary?.title ?? config.label}
          </span>
        </div>
        <SourceStatusBadge
          hashValid={node.hashValid}
          sourceModified={node.sourceModified}
          sourceUnavailable={node.sourceUnavailable}
          unavailableReason={node.unavailableReason}
        />
      </div>

      {node.packetSummary?.excerpt && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {node.packetSummary.excerpt}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {node.sourceType === 'rag_retrieval' && (
          <>
            {metadata.relevanceScore != null && (
              <span className="text-[10px] text-muted-foreground">
                相关度 {String(metadata.relevanceScore)}
              </span>
            )}
            {metadata.documentId && (
              <LocationLink
                evidenceId={node.evidenceId}
                location={{
                  documentId: String(metadata.documentId),
                  fileName: node.packetSummary?.title?.replace('RAG 检索 · ', '') ?? '文档',
                  chunkId: metadata.chunkId ? String(metadata.chunkId) : '',
                  offset: 0,
                  length: 0,
                }}
                disabled={node.sourceUnavailable}
              />
            )}
          </>
        )}

        {node.sourceType === 'agent_decision' && (
          <>
            {metadata.selectedAction && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                {String(metadata.selectedAction)}
              </span>
            )}
            {metadata.confidence != null && (
              <span className="text-[10px] text-muted-foreground">
                置信度 {String(metadata.confidence)}
              </span>
            )}
          </>
        )}

        {node.sourceType === 'tool_output' && !!metadata.toolCallId && (
          <span className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
            {String(metadata.toolCallId)}
          </span>
        )}

        {node.sourceType === 'intervention' && !!metadata.resolvedBy && (
          <span className="text-[10px] text-muted-foreground">
            处理人：{String(metadata.resolvedBy)}
          </span>
        )}

        {node.depth > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            深度 {node.depth}
          </span>
        )}
      </div>
    </button>
  )
})
