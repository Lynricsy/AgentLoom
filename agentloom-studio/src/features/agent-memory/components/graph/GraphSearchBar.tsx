import { memo, useCallback, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface GraphSearchBarProps {
  onSearch: (query: string) => void
}

export const GraphSearchBar = memo(function GraphSearchBar({
  onSearch,
}: GraphSearchBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value
      setValue(q)
      onSearch(q)
    },
    [onSearch],
  )

  const handleClear = useCallback(() => {
    setValue('')
    onSearch('')
    inputRef.current?.focus()
  }, [onSearch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClear()
      }
    },
    [handleClear],
  )

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5',
        'border-border/60 bg-popover/95 backdrop-blur-sm',
        'shadow-md',
      )}
      data-testid="graph-search-bar"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        placeholder="搜索节点..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        data-testid="graph-search-input"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="清除搜索"
          data-testid="graph-search-clear"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
})
