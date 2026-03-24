import { memo, useMemo, useState, useCallback, type DragEvent } from 'react'
import { cn } from '../../../shared/lib/utils'
import { NODE_CATEGORIES } from './nodeCategories'
import { DRAG_TRANSFER_TYPE } from './NodePalette'
import {
  AGENT_CANVAS_NODE_REGISTRY,
  type AgentCanvasNodeType,
  type AgentNodeTypeConfig,
} from '../registry/agent-canvas-registry'
import type { NodeCategory } from '../types'

interface AgentPaletteNodeItem {
  type: AgentCanvasNodeType
  label: string
  category: NodeCategory
  icon: string
  description: string
  searchText?: string
}

interface AgentPaletteGroup {
  label: string
  icon: string
  color: string
  items: AgentPaletteNodeItem[]
}

function buildAgentPaletteItem(config: AgentNodeTypeConfig): AgentPaletteNodeItem {
  return {
    type: config.type,
    label: config.label,
    category: config.category,
    icon: config.icon,
    description: config.description,
  }
}

function resolveNodes(types: readonly string[]): AgentPaletteNodeItem[] {
  return types.flatMap((t) => {
    const config = AGENT_CANVAS_NODE_REGISTRY.get(t)
    return config ? [buildAgentPaletteItem(config)] : []
  })
}

const AGENT_PALETTE_GROUPS: AgentPaletteGroup[] = [
  {
    label: '核心',
    icon: NODE_CATEGORIES.agent.icon,
    color: NODE_CATEGORIES.agent.color,
    items: resolveNodes(['llm-model', 'smart-routing']),
  },
  {
    label: '工具',
    icon: NODE_CATEGORIES.tool.icon,
    color: NODE_CATEGORIES.tool.color,
    items: resolveNodes(['http-tool', 'code-tool', 'mcp-tool']),
  },
  {
    label: '知识',
    icon: NODE_CATEGORIES.knowledge.icon,
    color: NODE_CATEGORIES.knowledge.color,
    items: resolveNodes(['knowledge-base']),
  },
  {
    label: '高级',
    icon: NODE_CATEGORIES.agent.icon,
    color: NODE_CATEGORIES.agent.color,
    items: resolveNodes(['sub-agent', 'input-preprocessor', 'skill']),
  },
]

function getGroupKey(group: Pick<AgentPaletteGroup, 'label'>): string {
  return group.label
}

interface AgentNodePaletteProps {
  className?: string
}

export const AgentNodePalette = memo(function AgentNodePalette({
  className,
}: AgentNodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }, [])

  const onDragStart = useCallback((event: DragEvent, item: AgentPaletteNodeItem) => {
    event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return AGENT_PALETTE_GROUPS
    const normalizedQuery = searchQuery.toLowerCase()
    return AGENT_PALETTE_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const searchableText = [item.label, item.description, item.searchText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return searchableText.includes(normalizedQuery)
      }),
    })).filter((group) => group.items.length > 0)
  }, [searchQuery])

  return (
    <aside
      className={cn(
        'flex h-full w-[var(--spacing-palette-expanded)] flex-col border-r border-border bg-surface',
        className,
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
        {filteredGroups.map((group) => {
          const groupKey = getGroupKey(group)
          return (
            <AgentPaletteGroupSection
              key={groupKey}
              group={group}
              isCollapsed={collapsedGroups.has(groupKey)}
              onToggle={() => toggleGroup(groupKey)}
              onDragStart={onDragStart}
            />
          )
        })}
        {filteredGroups.length === 0 && (
          <p className="mt-4 text-center text-sm text-muted">无匹配节点</p>
        )}
      </div>
    </aside>
  )
})

interface AgentPaletteGroupSectionProps {
  group: AgentPaletteGroup
  isCollapsed: boolean
  onToggle: () => void
  onDragStart: (event: DragEvent, item: AgentPaletteNodeItem) => void
}

const AgentPaletteGroupSection = memo(function AgentPaletteGroupSection({
  group,
  isCollapsed,
  onToggle,
  onDragStart,
}: AgentPaletteGroupSectionProps) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-surface-elevated"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
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
              className="flex w-full cursor-grab items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-surface-elevated hover:text-foreground active:cursor-grabbing"
              title={item.description}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
