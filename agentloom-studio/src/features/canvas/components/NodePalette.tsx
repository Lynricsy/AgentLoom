import { memo, useState, useCallback, type DragEvent } from 'react'
import { cn } from '../../../shared/lib/utils'
import { PALETTE_GROUPS } from './nodeCategories'
import type { PaletteGroup, PaletteNodeItem } from '../types'

export const DRAG_TRANSFER_TYPE = 'application/agentloom-node'

interface NodePaletteProps {
  className?: string
}

export const NodePalette = memo(function NodePalette({ className }: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  const onDragStart = useCallback((event: DragEvent, item: PaletteNodeItem) => {
    event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const filteredGroups = searchQuery.trim()
    ? PALETTE_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((group) => group.items.length > 0)
    : PALETTE_GROUPS

  return (
    <aside
      className={cn(
        'flex h-full w-[var(--spacing-palette-expanded)] flex-col border-r border-border bg-surface',
        className
      )}
    >
      <div className="border-b border-border p-3">
        <input
          type="text"
          placeholder="搜索节点..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-info"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filteredGroups.map((group) => (
          <PaletteGroupSection
            key={group.category}
            group={group}
            isCollapsed={collapsedGroups.has(group.category)}
            onToggle={() => toggleGroup(group.category)}
            onDragStart={onDragStart}
          />
        ))}
        {filteredGroups.length === 0 && (
          <p className="mt-4 text-center text-sm text-muted">无匹配节点</p>
        )}
      </div>
    </aside>
  )
})

interface PaletteGroupSectionProps {
  group: PaletteGroup
  isCollapsed: boolean
  onToggle: () => void
  onDragStart: (event: DragEvent, item: PaletteNodeItem) => void
}

const PaletteGroupSection = memo(function PaletteGroupSection({
  group,
  isCollapsed,
  onToggle,
  onDragStart,
}: PaletteGroupSectionProps) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-surface-elevated"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: group.color }}
        />
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-muted text-xs">{isCollapsed ? '▸' : '▾'}</span>
      </button>

      {!isCollapsed && (
        <div className="mt-1 space-y-0.5 pl-2">
          {group.items.map((item) => (
            <button
              type="button"
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-elevated hover:text-foreground active:cursor-grabbing"
              title={item.description}
            >
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
