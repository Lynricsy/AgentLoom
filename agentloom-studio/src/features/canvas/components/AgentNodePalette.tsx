import { memo, useMemo, useState, useCallback, type DragEvent } from 'react'
import { cn } from '../../../shared/lib/utils'
import {
  buildPaletteSearchText,
  matchesPaletteSearch,
  NODE_CATEGORIES,
} from './nodeCategories'
import { DRAG_TRANSFER_TYPE } from './NodePalette'
import {
  AGENT_CANVAS_NODE_REGISTRY,
  type AgentCanvasNodeType,
  type AgentNodeTypeConfig,
} from '../registry/agent-canvas-registry'
import type { NodeCategory } from '../types'
import type { AgentRuntimeMode } from '@/features/agent/types/agentRuntimeMode'

/** 自动创建的节点类型 — 新画布初始化时自动放置，不可从面板拖入 */
const AUTO_CREATED_NODE_TYPES = new Set<string>(['agent-main', 'sandbox'])
const NO_SANDBOX_NODE_TYPES = new Set<AgentCanvasNodeType>(['sandbox', 'workspace'])

interface AgentPaletteNodeItem {
  type: AgentCanvasNodeType
  label: string
  category: NodeCategory
  icon: string
  description: string
  searchText?: string
  /** 标记为自动创建的节点 — 面板中禁用拖拽，仅作信息展示 */
  isAutoCreated?: boolean
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
    searchText: buildPaletteSearchText(config),
    isAutoCreated: AUTO_CREATED_NODE_TYPES.has(config.type),
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
    items: resolveNodes(['agent-main']),
  },
  {
    label: '模型',
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
    label: '记忆',
    icon: NODE_CATEGORIES.memory.icon,
    color: NODE_CATEGORIES.memory.color,
    items: resolveNodes(['memory']),
  },
  {
    label: '高级',
    icon: NODE_CATEGORIES.agent.icon,
    color: NODE_CATEGORIES.agent.color,
    items: resolveNodes(['sub-agent', 'input-preprocessor', 'skill']),
  },
  {
    label: '环境',
    icon: NODE_CATEGORIES.tool.icon,
    color: NODE_CATEGORIES.tool.color,
    items: resolveNodes(['sandbox', 'workspace']),
  },
]

function getGroupKey(group: Pick<AgentPaletteGroup, 'label'>): string {
  return group.label
}

interface AgentNodePaletteProps {
  className?: string
  runtimeMode?: AgentRuntimeMode
}

export const AgentNodePalette = memo(function AgentNodePalette({
  className,
  runtimeMode = 'sandbox',
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
    if (item.isAutoCreated) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const filteredGroups = useMemo(() => {
    const visibleGroups = AGENT_PALETTE_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        runtimeMode === 'sandbox' ? true : !NO_SANDBOX_NODE_TYPES.has(item.type),
      ),
    })).filter((group) => group.items.length > 0)

    if (!searchQuery.trim()) return visibleGroups
    return visibleGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => matchesPaletteSearch(item, searchQuery)),
    })).filter((group) => group.items.length > 0)
  }, [runtimeMode, searchQuery])

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
              draggable={!item.isAutoCreated}
              onDragStart={(e) => onDragStart(e, item)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                item.isAutoCreated
                  ? 'cursor-default text-muted-foreground/50'
                  : 'cursor-grab text-muted-foreground hover:bg-surface-elevated hover:text-foreground active:cursor-grabbing',
              )}
              title={item.description}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-xs font-medium',
                    item.isAutoCreated ? 'text-muted-foreground/50' : 'text-foreground',
                  )}>
                    {item.label}
                  </span>
                  {item.isAutoCreated && (
                    <span className="inline-flex rounded bg-surface-elevated px-1 py-0.5 text-[10px] leading-none text-muted-foreground/60">
                      自动创建
                    </span>
                  )}
                </span>
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
