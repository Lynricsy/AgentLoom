import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, X } from 'lucide-react'
import { scaleIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

const GLOSSARY_TONE = 'var(--color-type-knowledge)'

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
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    left: position.x,
    ...(position.isAbove
      ? { bottom: window.innerHeight - position.spanTop + 4, maxHeight: position.spanTop - 16 }
      : { top: position.y + 4, maxHeight: window.innerHeight - position.y - 16 }),
  }

  return createPortal(
    // 弹出类浮层统一 scaleIn 进退场（父级 AnimatePresence 负责退场）
    <motion.div
      ref={popupRef}
      {...scaleIn}
      role="dialog"
      aria-label={`词条：${keyword}`}
      className={cn(
        'fixed z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border bg-popover shadow-lg',
        position.isAbove ? 'origin-bottom-left' : 'origin-top-left',
      )}
      style={{
        ...style,
        borderColor: `color-mix(in srgb, ${GLOSSARY_TONE} 35%, var(--color-border))`,
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <BookOpen className="size-3 shrink-0" style={{ color: GLOSSARY_TONE }} />
        <span
          className="min-w-0 truncate text-xs font-semibold"
          style={{ color: GLOSSARY_TONE }}
          title={keyword}
        >
          {keyword}
        </span>
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label="关闭词条卡片"
          onClick={onClose}
          className="ml-auto shrink-0 text-muted-foreground"
        >
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {nodes.map((node, i) => {
          const isUnlinked = node.uri?.startsWith('unlinked://')
          return (
            <Button
              key={node.uri || i}
              variant="ghost"
              onClick={() => {
                if (isUnlinked) return
                const match = node.uri?.match(/^([^:]+):\/\/(.*)$/)
                if (match?.[2] != null) onNavigate(match[2], match[1])
                onClose()
              }}
              className={cn(
                'group relative flex h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-lg px-2.5 py-2 text-left font-normal transition-colors active:scale-100',
                isUnlinked
                  ? 'cursor-default opacity-80 bg-muted hover:bg-muted'
                  : 'cursor-pointer hover:bg-muted',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <code
                  className={cn(
                    'block flex-1 truncate font-mono text-2xs',
                    isUnlinked
                      ? 'text-muted-foreground'
                      : 'text-primary/80 group-hover:text-primary',
                  )}
                >
                  {node.uri}
                </code>
                {isUnlinked && (
                  <span className="shrink-0 rounded-md border border-error/30 bg-error/10 px-1.5 py-0.5 text-2xs text-error">
                    未关联
                  </span>
                )}
              </div>
              {node.contentSnippet && (
                <p className="mt-0.5 line-clamp-2 break-words text-2xs leading-snug text-muted-foreground">
                  {node.contentSnippet}
                </p>
              )}
            </Button>
          )
        })}
      </div>
    </motion.div>,
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

  const handleKeywordClick = useCallback((e: React.SyntheticEvent, match: MatchSpan) => {
    const spanRect = (e.currentTarget as HTMLElement).getBoundingClientRect()

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
      <pre className="whitespace-pre-wrap break-words font-serif leading-7 text-foreground">{content}</pre>
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
      <pre className="whitespace-pre-wrap break-words font-serif leading-7 text-foreground">
        {parts.map((part, i) =>
          part.isMatch ? (
            <span
              key={i}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-xs underline decoration-dotted underline-offset-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              style={{ color: GLOSSARY_TONE, textDecorationColor: `color-mix(in srgb, ${GLOSSARY_TONE} 60%, transparent)` }}
              onClick={(e) => handleKeywordClick(e, part.match!)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleKeywordClick(e, part.match!)
                }
              }}
            >
              {part.text}
            </span>
          ) : (
            <Fragment key={i}>{part.text}</Fragment>
          ),
        )}
      </pre>
      <AnimatePresence>
        {popup && (
          <GlossaryPopup
            key={`${popup.keyword}-${popup.position.x}-${popup.position.y}`}
            keyword={popup.keyword}
            nodes={popup.nodes}
            position={popup.position}
            onClose={() => setPopup(null)}
            onNavigate={onNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
