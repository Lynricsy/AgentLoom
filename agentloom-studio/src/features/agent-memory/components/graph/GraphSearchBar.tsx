import { memo, useCallback, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

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
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg focus-within:border-border-hover"
      data-testid="graph-search-bar"
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="搜索节点..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
        data-testid="graph-search-input"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="清除搜索"
          data-testid="graph-search-clear"
        >
          <X />
        </Button>
      )}
    </div>
  )
})
