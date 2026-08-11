import { memo, useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { motion } from 'motion/react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { fadeInUp } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { TooltipHint, TooltipProvider } from '@/shared/ui/tooltip'
import { useCanvasActions, useSearchState } from '../../stores/canvasStore'

export const CanvasSearch = memo(function CanvasSearch() {
  const { isSearchOpen, searchQuery, searchMatchIds, currentSearchIndex } = useSearchState()
  const { setSearchQuery, nextSearchResult, prevSearchResult, clearSearch } = useCanvasActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (isSearchOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isSearchOpen])

  useEffect(() => {
    if (currentSearchIndex < 0 || searchMatchIds.length === 0) return
    const nodeId = searchMatchIds[currentSearchIndex]
    if (!nodeId) return
    fitView({ nodes: [{ id: nodeId }], duration: 300, padding: 0.5 })
  }, [currentSearchIndex, searchMatchIds, fitView])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          prevSearchResult()
        } else {
          nextSearchResult()
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSearch()
      }
    },
    [nextSearchResult, prevSearchResult, clearSearch]
  )

  if (!isSearchOpen) return null

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        {...fadeInUp}
        className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-panel border border-border bg-surface/90 px-3 py-1.5 shadow-popover backdrop-blur-sm"
        data-testid="canvas-search"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索节点..."
          aria-label="搜索节点"
          className="w-48 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          data-testid="canvas-search-input"
        />
        {searchQuery && (
          <span
            className={cn(
              'text-xs tabular-nums',
              searchMatchIds.length === 0 ? 'text-error' : 'text-muted-foreground',
            )}
          >
            {searchMatchIds.length === 0 ? '无结果' : `${currentSearchIndex + 1}/${searchMatchIds.length}`}
          </span>
        )}
        <div className="ml-0.5 flex items-center gap-0.5 border-l border-border pl-1.5">
          <TooltipHint label="上一个 (Shift+Enter)">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={prevSearchResult}
              disabled={searchMatchIds.length === 0}
              aria-label="上一个"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </TooltipHint>
          <TooltipHint label="下一个 (Enter)">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={nextSearchResult}
              disabled={searchMatchIds.length === 0}
              aria-label="下一个"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </TooltipHint>
          <TooltipHint label="关闭搜索 (Esc)">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearSearch}
              aria-label="关闭搜索"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipHint>
        </div>
      </motion.div>
    </TooltipProvider>
  )
})
