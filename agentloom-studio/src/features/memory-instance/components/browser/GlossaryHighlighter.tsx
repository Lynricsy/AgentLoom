import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface GlossaryEntry {
  keyword: string
  nodes: Array<{ uri: string; nodeUuid: string; contentSnippet?: string }>
}

interface MatchSpan {
  start: number
  end: number
  keyword: string
  nodes: GlossaryEntry['nodes']
}

function findAllOccurrences(text: string, keywords: GlossaryEntry[]): MatchSpan[] {
  if (!keywords || keywords.length === 0 || !text) return []

  const matches: MatchSpan[] = []
  for (const entry of keywords) {
    if (!entry.keyword) continue
    let idx = text.indexOf(entry.keyword)
    while (idx !== -1) {
      matches.push({
        start: idx,
        end: idx + entry.keyword.length,
        keyword: entry.keyword,
        nodes: entry.nodes,
      })
      idx = text.indexOf(entry.keyword, idx + entry.keyword.length)
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))

  const result: MatchSpan[] = []
  let lastEnd = -1
  for (const m of matches) {
    if (m.start >= lastEnd) {
      result.push(m)
      lastEnd = m.end
    }
  }
  return result
}

interface GlossaryPopupProps {
  keyword: string
  nodes: GlossaryEntry['nodes']
  position: { x: number; y: number; isAbove: boolean; spanTop: number }
  onClose: () => void
  onNavigate: (path: string, domain?: string) => void
}

function GlossaryPopup({ keyword, nodes, position, onClose, onNavigate }: GlossaryPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const style: React.CSSProperties = {
    left: position.x,
    ...(position.isAbove
      ? { bottom: window.innerHeight - position.spanTop + 4, maxHeight: position.spanTop - 16 }
      : { top: position.y + 4, maxHeight: window.innerHeight - position.y - 16 }),
  }

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[100] flex w-72 flex-col overflow-hidden rounded-xl border border-amber-800/40 bg-surface-elevated shadow-2xl"
      style={style}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <BookOpen size={12} className="text-amber-400" />
        <span className="text-xs font-semibold text-amber-300">{keyword}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {nodes.map((node, i) => {
          const isUnlinked = node.uri?.startsWith('unlinked://')
          return (
            <button
              key={node.uri || i}
              type="button"
              onClick={() => {
                if (isUnlinked) return
                const match = node.uri?.match(/^([^:]+):\/\/(.*)$/)
                if (match?.[2] != null) onNavigate(match[2], match[1])
                onClose()
              }}
              className={cn(
                'group relative w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                isUnlinked
                  ? 'cursor-default opacity-80 bg-muted/40'
                  : 'cursor-pointer hover:bg-muted',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <code
                  className={cn(
                    'block flex-1 truncate font-mono text-[11px]',
                    isUnlinked
                      ? 'text-muted-foreground'
                      : 'text-primary/80 group-hover:text-primary',
                  )}
                >
                  {node.uri}
                </code>
                {isUnlinked && (
                  <span className="shrink-0 rounded border border-rose-900/50 bg-rose-950/40 px-1.5 py-0.5 text-[9px] text-rose-400">
                    Orphaned
                  </span>
                )}
              </div>
              {node.contentSnippet && (
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">
                  {node.contentSnippet}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

interface GlossaryHighlighterProps {
  content: string
  glossary: GlossaryEntry[]
  currentNodeUuid: string
  onNavigate: (path: string, domain?: string) => void
}

export function GlossaryHighlighter({
  content,
  glossary,
  currentNodeUuid,
  onNavigate,
}: GlossaryHighlighterProps) {
  const [popup, setPopup] = useState<{
    keyword: string
    nodes: GlossaryEntry['nodes']
    position: { x: number; y: number; isAbove: boolean; spanTop: number }
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPopup(null)
  }, [content])

  const filteredGlossary = useMemo(() => {
    if (!glossary) return []
    return glossary
      .map((entry) => {
        const filteredNodes = entry.nodes?.filter((n) => n.nodeUuid !== currentNodeUuid) || []
        return { ...entry, nodes: filteredNodes }
      })
      .filter((entry) => entry.nodes.length > 0)
  }, [glossary, currentNodeUuid])

  const matches = useMemo(
    () => findAllOccurrences(content, filteredGlossary),
    [content, filteredGlossary],
  )

  const handleKeywordClick = useCallback((e: React.MouseEvent, match: MatchSpan) => {
    const spanRect = (e.target as HTMLElement).getBoundingClientRect()

    const popupWidth = 288
    let x = spanRect.left
    if (x + popupWidth > window.innerWidth - 16) {
      x = window.innerWidth - popupWidth - 16
      if (x < 16) x = 16
    }

    const estimatedHeight = 250
    const y = spanRect.bottom
    let isAbove = false

    if (y + estimatedHeight > window.innerHeight - 16 && spanRect.top > estimatedHeight + 16) {
      isAbove = true
    }

    setPopup({
      keyword: match.keyword,
      nodes: match.nodes,
      position: { x, y, isAbove, spanTop: spanRect.top },
    })
  }, [])

  if (matches.length === 0) {
    return (
      <pre className="whitespace-pre-wrap font-serif leading-7 text-foreground">{content}</pre>
    )
  }

  const parts: Array<{ text: string; isMatch: boolean; match?: MatchSpan }> = []
  let lastIdx = 0
  for (const m of matches) {
    if (m.start > lastIdx) {
      parts.push({ text: content.slice(lastIdx, m.start), isMatch: false })
    }
    parts.push({ text: content.slice(m.start, m.end), isMatch: true, match: m })
    lastIdx = m.end
  }
  if (lastIdx < content.length) {
    parts.push({ text: content.slice(lastIdx), isMatch: false })
  }

  return (
    <div ref={containerRef} className="relative">
      <pre className="whitespace-pre-wrap font-serif leading-7 text-foreground">
        {parts.map((part, i) =>
          part.isMatch ? (
            <span
              key={i}
              className="cursor-pointer text-amber-300 underline decoration-amber-600/50 decoration-dotted transition-colors hover:text-amber-200 hover:decoration-amber-400"
              onClick={(e) => handleKeywordClick(e, part.match!)}
            >
              {part.text}
            </span>
          ) : (
            <Fragment key={i}>{part.text}</Fragment>
          ),
        )}
      </pre>
      {popup && (
        <GlossaryPopup
          keyword={popup.keyword}
          nodes={popup.nodes}
          position={popup.position}
          onClose={() => setPopup(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  )
}
