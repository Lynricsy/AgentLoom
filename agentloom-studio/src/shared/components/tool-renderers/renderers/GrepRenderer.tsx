import { memo, useMemo } from 'react'
import { Search } from 'lucide-react'
import { SearchResultList } from '../primitives/SearchResultList'
import type { SearchResult } from '../primitives/SearchResultList'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface GrepArgs {
  pattern: string
  path?: string
  glob?: string
  ignoreCase?: boolean
}

function parseArgs(raw: unknown): GrepArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as GrepArgs
    } catch {
      return { pattern: '' }
    }
  }
  return (raw ?? { pattern: '' }) as GrepArgs
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

const GREP_LINE_RE = /^(.+?):(\d+):(.*)$/

function parseGrepResults(output: string, _pattern: string): SearchResult[] {
  const results: SearchResult[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    const match = GREP_LINE_RE.exec(line)
    if (match) {
      const filePath = match[1] ?? ''
      const lineNumber = parseInt(match[2] ?? '0', 10)
      const content = match[3] ?? ''
      results.push({ filePath, lineNumber, content })
    }
  }

  return results
}

function countMatches(output: string): number {
  if (!output.trim()) return 0
  return output.split('\n').filter((l) => GREP_LINE_RE.test(l)).length
}

const GrepSummary = memo(function GrepSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const matchCount = useMemo(() => countMatches(output), [output])
  const location = args.path ?? args.glob ?? '.'

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Grep &ldquo;{args.pattern}&rdquo; in {location}
      {toolCall.result != null ? ` (${matchCount} matches)` : ''}
    </span>
  )
})

const GrepDetail = memo(function GrepDetail({ toolCall, state }: ToolRendererProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const results = useMemo(
    () => parseGrepResults(output, args.pattern),
    [output, args.pattern],
  )

  if (state === 'pending' || (state === 'streaming' && !toolCall.result)) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        正在搜索...
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

  return (
    <SearchResultList
      results={results}
      pattern={args.pattern}
    />
  )
})

export const grepRendererDefinition: ToolRendererDefinition = {
  Summary: GrepSummary,
  Detail: GrepDetail,
  icon: Search,
}
