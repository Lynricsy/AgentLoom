import { memo, useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface KnowledgeArgs {
  query: string
  knowledgeBaseIds?: string[]
  topK?: number
}

interface KnowledgeResultEntry {
  content?: string
  score?: number
  metadata?: { source?: string; [key: string]: unknown }
}

interface KnowledgeResult {
  total?: number
  results?: KnowledgeResultEntry[]
}

function parseArgs(raw: unknown): KnowledgeArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as KnowledgeArgs
    } catch {
      return { query: '' }
    }
  }
  return (raw ?? { query: '' }) as KnowledgeArgs
}

function parseResult(raw: unknown): KnowledgeResult {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as KnowledgeResult
    } catch {
      return {}
    }
  }
  return (raw ?? {}) as KnowledgeResult
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function scoreColor(score: number): string {
  if (score >= 0.9) return 'text-success'
  if (score >= 0.7) return 'text-warning'
  return 'text-muted-foreground'
}

const KnowledgeSummary = memo(function KnowledgeSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const result = useMemo(() => parseResult(toolCall.result), [toolCall.result])
  const count = result.results?.length ?? result.total

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Search knowledge &ldquo;{truncate(args.query, 30)}&rdquo;
      {count != null ? ` (${count} results)` : ''}
    </span>
  )
})

const KnowledgeDetail = memo(function KnowledgeDetail({ toolCall, state }: ToolRendererProps) {
  const result = useMemo(() => parseResult(toolCall.result), [toolCall.result])
  const entries = result.results ?? []

  if (state === 'pending' || (state === 'streaming' && !toolCall.result)) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        正在搜索知识库...
      </div>
    )
  }

  if (state === 'failed' && toolCall.error) {
    return (
      <pre className="overflow-auto rounded-md bg-error/10 p-3 font-mono text-xs leading-relaxed text-error">
        {toolCall.error}
      </pre>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-background p-8 text-muted-foreground">
        <BookOpen className="size-5 opacity-40" />
        <span className="text-xs">未找到结果</span>
      </div>
    )
  }

  return (
    <div className="max-h-[480px] space-y-2 overflow-auto">
      {entries.map((entry, i) => {
        const source = entry.metadata?.source ?? `result-${i}`
        return (
          <div key={`${source}-${i}`} className="rounded-lg bg-background p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-info">
                {source}
              </span>
              {entry.score != null && (
                <span className={cn('shrink-0 text-[10px] font-medium', scoreColor(entry.score))}>
                  {entry.score.toFixed(2)}
                </span>
              )}
            </div>
            {entry.content && (
              <p className="text-xs leading-relaxed text-foreground/80 line-clamp-3">
                {truncate(entry.content, 150)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
})

export const knowledgeRendererDefinition: ToolRendererDefinition = {
  Summary: KnowledgeSummary,
  Detail: KnowledgeDetail,
  icon: BookOpen,
}
