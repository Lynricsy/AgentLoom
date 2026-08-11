import { memo, useMemo } from 'react'
import { FolderOpen, Folder, File } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface LsArgs {
  path?: string
  limit?: number
}

function parseArgs(raw: unknown): LsArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LsArgs
    } catch {
      return { path: raw }
    }
  }
  return (raw ?? {}) as LsArgs
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

function parseEntries(output: string): string[] {
  if (!output.trim()) return []
  return output.split('\n').filter((line) => line.trim().length > 0)
}

function isDirectory(entry: string): boolean {
  return entry.endsWith('/')
}

const LsSummary = memo(function LsSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const entries = useMemo(() => parseEntries(output), [output])
  const location = args.path ?? '.'

  return (
    <span className="truncate font-mono text-xs text-foreground">
      List {location}
      {toolCall.result != null ? ` (${entries.length} items)` : ''}
    </span>
  )
})

const LsDetail = memo(function LsDetail({ toolCall, state }: ToolRendererProps) {
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const entries = useMemo(() => parseEntries(output), [output])

  if (state === 'pending' || (state === 'streaming' && !toolCall.result)) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        正在列出目录...
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
      <div className="flex items-center justify-center gap-2 rounded-lg bg-background p-6 text-xs text-muted-foreground">
        <FolderOpen className="size-4 opacity-40" />
        空目录
      </div>
    )
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-lg bg-background">
      {entries.map((entry, i) => {
        const isDir = isDirectory(entry)
        return (
          <div
            key={`${i}-${entry}`}
            className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 font-mono text-xs last:border-0"
          >
            {isDir ? (
              <Folder className="size-3.5 shrink-0 text-warning" />
            ) : (
              <File className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                'truncate',
                isDir ? 'text-warning' : 'text-foreground/80',
              )}
            >
              {entry}
            </span>
          </div>
        )
      })}
    </div>
  )
})

export const lsRendererDefinition: ToolRendererDefinition = {
  Summary: LsSummary,
  Detail: LsDetail,
  icon: FolderOpen,
}
