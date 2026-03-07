import { memo, useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
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
    <div
      className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 shadow-lg"
      data-testid="canvas-search"
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="搜索节点..."
        className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        data-testid="canvas-search-input"
      />
      {searchQuery && (
        <span className={cn('text-xs tabular-nums', searchMatchIds.length === 0 ? 'text-destructive' : 'text-muted-foreground')}>
          {searchMatchIds.length === 0 ? '无结果' : `${currentSearchIndex + 1}/${searchMatchIds.length}`}
        </span>
      )}
      <div className="flex items-center border-l pl-1.5">
        <button
          type="button"
          onClick={prevSearchResult}
          disabled={searchMatchIds.length === 0}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label="上一个"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={nextSearchResult}
          disabled={searchMatchIds.length === 0}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label="下一个"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={clearSearch}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="关闭搜索"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
})
