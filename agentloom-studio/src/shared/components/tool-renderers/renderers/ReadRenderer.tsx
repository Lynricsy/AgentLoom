import { memo, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { CodeViewer } from '../primitives/CodeViewer'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface ReadArgs {
  path: string
  offset?: number
  limit?: number
}

function parseArgs(raw: unknown): ReadArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ReadArgs
    } catch {
      return { path: '' }
    }
  }
  return (raw ?? { path: '' }) as ReadArgs
}

function resultToString(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw == null) return ''
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

const ReadSummary = memo(function ReadSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const lineRange =
    args.offset != null || args.limit != null
      ? ` (L${args.offset ?? 1}${args.limit != null ? `-${(args.offset ?? 1) + args.limit}` : ''})`
      : ''

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Read {args.path || 'file'}{lineRange}
    </span>
  )
})

const ReadDetail = memo(function ReadDetail({ toolCall, state }: ToolRendererProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const content = useMemo(() => resultToString(toolCall.result), [toolCall.result])

  if (state === 'pending' || (state === 'streaming' && !toolCall.result)) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        Reading file...
      </div>
    )
  }

  if (state === 'failed' && toolCall.error) {
    return (
      <pre className="overflow-auto rounded-md bg-red-950/30 p-3 font-mono text-xs leading-relaxed text-red-400">
        {toolCall.error}
      </pre>
    )
  }

  if (!content) return null

  return (
    <CodeViewer
      code={content}
      fileName={args.path}
      startLine={args.offset ?? 1}
    />
  )
})

export const readRendererDefinition: ToolRendererDefinition = {
  Summary: ReadSummary,
  Detail: ReadDetail,
  icon: FileText,
}
