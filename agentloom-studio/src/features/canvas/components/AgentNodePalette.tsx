import { memo, useMemo, useState, useCallback, type DragEvent } from 'react'
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { TooltipHint, TooltipProvider } from '@/shared/ui/tooltip'
import { cn } from '../../../shared/lib/utils'
import {
  buildPaletteSearchText,
  matchesPaletteSearch,
  NODE_CATEGORIES,
} from './nodeCategories'
import { DRAG_TRANSFER_TYPE } from './NodePalette'
import {
  applyPaletteDragPreview,
  PALETTE_SHELL_CLASS,
  PaletteItemButton,
  PaletteRailItem,
  PaletteSectionHeader,
} from './paletteChrome'
import {
  AGENT_CANVAS_NODE_REGISTRY,
  type AgentCanvasNodeType,
  type AgentNodeTypeConfig,
} from '../registry/agent-canvas-registry'
import type { NodeCategory } from '../types'
import type { AgentRuntimeMode } from '@/features/agent'

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
    label: '提示',
    icon: NODE_CATEGORIES.output.icon,
    color: NODE_CATEGORIES.output.color,
    items: resolveNodes(['text']),
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
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false)

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

  const onDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, item: AgentPaletteNodeItem) => {
      if (item.isAutoCreated) {
        event.preventDefault()
        return
      }
      event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
      event.dataTransfer.effectAllowed = 'move'
      applyPaletteDragPreview(event, {
        label: item.label,
        color: NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color,
      })
    },
    [],
  )

  const visibleGroups = useMemo(
    () =>
      AGENT_PALETTE_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          runtimeMode === 'sandbox' ? true : !NO_SANDBOX_NODE_TYPES.has(item.type),
        ),
      })).filter((group) => group.items.length > 0),
    [runtimeMode],
  )

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return visibleGroups
    return visibleGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => matchesPaletteSearch(item, searchQuery)),
    })).filter((group) => group.items.length > 0)
  }, [searchQuery, visibleGroups])

  if (isPaletteCollapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <aside
          className={cn(
            PALETTE_SHELL_CLASS,
            'w-[var(--spacing-palette-collapsed)] items-center gap-1 py-3',
            className,
          )}
        >
          <TooltipHint side="right" label="展开节点面板">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="展开节点面板"
              onClick={() => setIsPaletteCollapsed(false)}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </TooltipHint>

          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pt-1">
            {visibleGroups.flatMap((group) =>
              group.items.map((item) => (
                <PaletteRailItem
                  key={item.type}
                  icon={item.icon}
                  color={
                    NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color
                  }
                  label={item.label}
                  description={item.description}
                  disabled={item.isAutoCreated}
                  onDragStart={(event) => onDragStart(event, item)}
                />
              )),
            )}
          </div>
        </aside>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          PALETTE_SHELL_CLASS,
          'w-[var(--spacing-palette-expanded)]',
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="搜索节点..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <TooltipHint side="right" label="折叠节点面板">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="折叠节点面板"
              onClick={() => setIsPaletteCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipHint>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <p className="mb-2 px-2 text-[11px] text-muted-foreground">
            拖拽节点到画布以添加
          </p>
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
            <p className="mt-4 text-center text-sm text-muted-foreground">无匹配节点</p>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
})

interface AgentPaletteGroupSectionProps {
  group: AgentPaletteGroup
  isCollapsed: boolean
  onToggle: () => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, item: AgentPaletteNodeItem) => void
}

const AgentPaletteGroupSection = memo(function AgentPaletteGroupSection({
  group,
  isCollapsed,
  onToggle,
  onDragStart,
}: AgentPaletteGroupSectionProps) {
  return (
    <div className="mb-2">
      <PaletteSectionHeader
        icon={group.icon}
        color={group.color}
        label={group.label}
        isCollapsed={isCollapsed}
        onToggle={onToggle}
      />

      {!isCollapsed && (
        <div className="mt-1 space-y-0.5 pl-1">
          {group.items.map((item) => (
            <PaletteItemButton
              key={item.type}
              icon={item.icon}
              color={
                NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color
              }
              label={item.label}
              description={item.description}
              disabled={item.isAutoCreated}
              badge={
                item.isAutoCreated ? (
                  <span className="inline-flex shrink-0 rounded bg-surface-elevated px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                    自动创建
                  </span>
                ) : undefined
              }
              onDragStart={(event) => onDragStart(event, item)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
