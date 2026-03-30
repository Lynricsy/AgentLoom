import { memo, useMemo } from 'react'
import { FolderSearch, Folder, File } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface FindArgs {
  pattern: string
  path?: string
  limit?: number
}

function parseArgs(raw: unknown): FindArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as FindArgs
    } catch {
      return { pattern: '' }
    }
  }
  return (raw ?? { pattern: '' }) as FindArgs
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

function parseFileList(output: string): string[] {
  if (!output.trim()) return []
  return output.split('\n').filter((line) => line.trim().length > 0)
}

function isDirectory(entry: string): boolean {
  return entry.endsWith('/')
}

const FindSummary = memo(function FindSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const files = useMemo(() => parseFileList(output), [output])
  const location = args.path ?? '.'

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Find &ldquo;{args.pattern}&rdquo; in {location}
      {toolCall.result != null ? ` (${files.length} files)` : ''}
    </span>
  )
})

const FindDetail = memo(function FindDetail({ toolCall, state }: ToolRendererProps) {
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const entries = useMemo(() => parseFileList(output), [output])

  if (state === 'pending' || (state === 'streaming' && !toolCall.result)) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        Finding files...
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

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 p-6 text-xs text-muted-foreground">
        <FolderSearch className="size-4 opacity-40" />
        No files found
      </div>
    )
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-lg bg-zinc-900">
      {entries.map((entry, i) => {
        const isDir = isDirectory(entry)
        return (
          <div
            key={`${i}-${entry}`}
            className="flex items-center gap-2 border-b border-zinc-700/30 px-3 py-1.5 font-mono text-xs last:border-0"
          >
            {isDir ? (
              <Folder className="size-3.5 shrink-0 text-amber-400" />
            ) : (
              <File className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                'truncate',
                isDir ? 'text-amber-400' : 'text-foreground/80',
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

export const findRendererDefinition: ToolRendererDefinition = {
  Summary: FindSummary,
  Detail: FindDetail,
  icon: FolderSearch,
}
