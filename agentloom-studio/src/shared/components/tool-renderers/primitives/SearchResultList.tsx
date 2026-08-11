import { memo, useMemo } from 'react'
import { File, Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface SearchResult {
  filePath: string
  lineNumber?: number
  content: string
  matchRanges?: Array<{ start: number; end: number }>
}

export interface SearchResultListProps {
  results: SearchResult[]
  pattern?: string
  maxHeight?: string
  className?: string
}

/**
 * Group results by file path for a cleaner display.
 */
function groupByFile(
  results: SearchResult[],
): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>()
  for (const result of results) {
    const existing = groups.get(result.filePath)
    if (existing) {
      existing.push(result)
    } else {
      groups.set(result.filePath, [result])
    }
  }
  return groups
}

/**
 * Highlight matching portions of text based on a pattern string.
 * Returns an array of segments with a `highlighted` flag.
 */
function highlightMatches(
  text: string,
  pattern: string | undefined,
  matchRanges: Array<{ start: number; end: number }> | undefined,
): Array<{ text: string; highlighted: boolean }> {
  // Prefer explicit match ranges
  if (matchRanges && matchRanges.length > 0) {
    const segments: Array<{ text: string; highlighted: boolean }> = []
    let cursor = 0
    for (const range of matchRanges) {
      if (range.start > cursor) {
        segments.push({ text: text.slice(cursor, range.start), highlighted: false })
      }
      segments.push({ text: text.slice(range.start, range.end), highlighted: true })
      cursor = range.end
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), highlighted: false })
    }
    return segments
  }

  // Fallback to pattern-based highlighting
  if (!pattern) {
    return [{ text, highlighted: false }]
  }

  try {
    const regex = new RegExp(`(${escapeRegex(pattern)})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part) => ({
      text: part,
      highlighted: regex.test(part),
    }))
  } catch {
    return [{ text, highlighted: false }]
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SearchResultLine = memo(function SearchResultLine({
  result,
  pattern,
}: {
  result: SearchResult
  pattern: string | undefined
}) {
  const segments = useMemo(
    () => highlightMatches(result.content, pattern, result.matchRanges),
    [result.content, pattern, result.matchRanges],
  )

  return (
    <div className="flex items-start gap-2 py-0.5 font-mono text-xs">
      {result.lineNumber !== undefined && (
        <span className="shrink-0 select-none text-muted-foreground/50" style={{ minWidth: '4ch' }}>
          {result.lineNumber}
        </span>
      )}
      <span className="min-w-0 whitespace-pre-wrap break-all text-foreground/80">
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <mark key={`${i}-${seg.text.slice(0, 8)}`} className="rounded-sm bg-warning/25 text-warning">
              {seg.text}
            </mark>
          ) : (
            <span key={`${i}-${seg.text.slice(0, 8)}`}>{seg.text}</span>
          ),
        )}
      </span>
    </div>
  )
})

export const SearchResultList = memo(function SearchResultList({
  results,
  pattern,
  maxHeight = '480px',
  className,
}: SearchResultListProps) {
  const grouped = useMemo(() => groupByFile(results), [results])

  if (results.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg bg-background p-8 text-muted-foreground',
          className,
        )}
      >
        <Search className="size-5 opacity-40" />
        <span className="text-xs">未找到匹配项</span>
      </div>
    )
  }

  return (
    <div
      className={cn('overflow-auto rounded-lg bg-background', className)}
      style={{ maxHeight }}
    >
      {Array.from(grouped.entries()).map(([filePath, fileResults]) => (
        <div key={filePath} className="border-b border-border/60 last:border-0">
          {/* File path header */}
          <div className="sticky top-0 flex items-center gap-1.5 bg-surface-elevated/90 px-3 py-1.5 backdrop-blur-sm">
            <File className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium text-foreground/90">
              {filePath}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
              {fileResults.length} 项匹配
            </span>
          </div>

          {/* Result lines */}
          <div className="px-3 py-1">
            {fileResults.map((result, i) => (
              <SearchResultLine
                key={`${result.lineNumber ?? i}`}
                result={result}
                pattern={pattern}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
})
