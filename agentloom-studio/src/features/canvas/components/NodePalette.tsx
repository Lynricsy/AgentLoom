import { memo, useMemo, useState, useCallback, type DragEvent } from 'react'
import { BlockLibraryPanel } from '@/features/block-library/components/BlockLibraryPanel'
import { useActivePlugins } from '@/features/plugin'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { cn } from '../../../shared/lib/utils'
import { useCanvasStore, useSelectedNodeData } from '../stores/canvasStore'
import { PALETTE_GROUPS, NODE_CATEGORIES } from './nodeCategories'
import type { PaletteGroup, PaletteNodeItem } from '../types'
import { getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'

export const DRAG_TRANSFER_TYPE = 'application/agentloom-node'

function getGroupKey(group: Pick<PaletteGroup, 'category' | 'label'>): string {
  return `${group.category}:${group.label}`
}

interface NodePaletteProps {
  className?: string
}

export const NodePalette = memo(function NodePalette({ className }: NodePaletteProps) {
  const [activeTab, setActiveTab] = useState('nodes')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const { data: pluginsResponse } = useActivePlugins()
  const selectedNodeData = useSelectedNodeData()
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId)

  const selectedCompoundNodeId = useMemo(() => {
    if (!selectedNodeData?.nodeType) {
      return null
    }

    if (isCompoundContainerNodeType(selectedNodeData.nodeType)) {
      return selectedNodeId
    }

    return null
  }, [selectedNodeData, selectedNodeId])

  const pluginGroup = useMemo<PaletteGroup | null>(() => {
    const plugins = pluginsResponse?.data ?? []
    const pluginItems: PaletteNodeItem[] = []

    for (const plugin of plugins) {
      for (const nodeDef of plugin.nodeDefinitions) {
        pluginItems.push({
          type: 'plugin',
          label: nodeDef.label,
          category: 'plugin',
          icon: 'Puzzle',
          description: nodeDef.description,
          searchText: [plugin.name, nodeDef.label, nodeDef.description].filter(Boolean).join(' '),
          pluginId: `${plugin.id}:${nodeDef.type}`,
        })
      }
    }

    if (pluginItems.length === 0) return null
    return {
      category: 'plugin' as const,
      label: 'Plugins',
      icon: NODE_CATEGORIES.plugin.icon,
      color: NODE_CATEGORIES.plugin.color,
      items: pluginItems,
    }
  }, [pluginsResponse])

  const compoundGroup = useMemo<PaletteGroup | null>(() => {
    if (!selectedCompoundNodeId) {
      return null
    }

    const internalTypes = ['result', 'break', 'continue', 'loop-state'] as const
    const items: PaletteNodeItem[] = internalTypes
      .filter((type) =>
        type === 'loop-state'
          ? selectedNodeData?.nodeType === 'loop'
          : true,
      )
      .map((type) => {
        const config = getNodeTypeConfig(type)
        return {
          type: config.type,
          label: config.label,
          category: config.category,
          icon: config.icon,
          description: config.description,
          compoundOnly: true,
          compoundParentId: selectedCompoundNodeId,
        }
      })

    return {
      category: 'control',
      label: 'Compound 内部节点',
      icon: NODE_CATEGORIES.control.icon,
      color: NODE_CATEGORIES.control.color,
      items,
    }
  }, [selectedCompoundNodeId, selectedNodeData?.nodeType])

  const allGroups = useMemo(() => {
    const groups = [...PALETTE_GROUPS]
    if (compoundGroup) groups.push(compoundGroup)
    if (pluginGroup) groups.push(pluginGroup)
    return groups
  }, [compoundGroup, pluginGroup])

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

  const onDragStart = useCallback((event: DragEvent, item: PaletteNodeItem) => {
    event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const filteredGroups = searchQuery.trim()
    ? allGroups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => {
            const normalizedQuery = searchQuery.toLowerCase()
            const searchableText = [item.label, item.description, item.searchText]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            return searchableText.includes(normalizedQuery)
          }
        ),
      })).filter((group) => group.items.length > 0)
    : allGroups

  return (
    <aside
      className={cn(
        'flex h-full w-[var(--spacing-palette-expanded)] flex-col border-r border-border bg-surface',
        className
      )}
    >
      <Tabs
        className="flex h-full flex-col"
        defaultValue="nodes"
        onValueChange={setActiveTab}
        value={activeTab}
      >
        <div className="border-b border-border p-3">
          <TabsList>
            <TabsTrigger value="nodes">节点</TabsTrigger>
            <TabsTrigger value="blocks">My Blocks</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="nodes">
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
                <PaletteGroupSection
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
        </TabsContent>

        <TabsContent className="min-h-0 flex-1" value="blocks">
          <BlockLibraryPanel className="h-full" />
        </TabsContent>
      </Tabs>
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
              key={item.pluginId ?? item.type}
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
