import { memo, useMemo, useState, useCallback, type DragEvent } from 'react'
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { BlockLibraryPanel } from '@/features/block-library'
import { useActivePlugins, type PluginNodeDefinition } from '@/features/plugin'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { TooltipHint, TooltipProvider } from '@/shared/ui/tooltip'
import { cn } from '../../../shared/lib/utils'
import { useCanvasStore, useSelectedNodeData } from '../stores/canvasStore'
import {
  buildPaletteSearchText,
  matchesPaletteSearch,
  PALETTE_GROUPS,
  NODE_CATEGORIES,
} from './nodeCategories'
import {
  applyPaletteDragPreview,
  PALETTE_SHELL_CLASS,
  PaletteItemButton,
  PaletteRailItem,
  PaletteSectionHeader,
} from './paletteChrome'
import type { PaletteGroup, PaletteNodeItem } from '../types'
import {
  getNodeTypeConfig,
  PORT_DATA_TYPE_META,
  type PortDefinition,
} from '../types/nodeTypeRegistry'
import { createPort } from '../types/portSchema'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'
import type { PortDataType } from '../types/typeSchema'

export const DRAG_TRANSFER_TYPE = 'application/agentloom-node'

function getGroupKey(group: Pick<PaletteGroup, 'category' | 'label'>): string {
  return `${group.category}:${group.label}`
}

type PluginPortDefinition = PluginNodeDefinition['inputPorts'][number]

function normalizePluginPortDataType(dataType: string): PortDataType {
  if (dataType in PORT_DATA_TYPE_META) {
    return dataType as PortDataType
  }

  if (dataType === 'number' || dataType === 'boolean') {
    return 'json'
  }

  return 'json'
}

function buildPluginPorts(
  ports: PluginPortDefinition[] | undefined,
  direction: 'input' | 'output',
): PortDefinition[] {
  return (ports ?? []).map((port) =>
    createPort(
      port.id,
      port.label,
      direction,
      normalizePluginPortDataType(port.dataType),
      {
        required: port.required,
        description: port.description,
      },
    ),
  )
}

interface NodePaletteProps {
  className?: string
}

export const NodePalette = memo(function NodePalette({ className }: NodePaletteProps) {
  const [activeTab, setActiveTab] = useState('nodes')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false)
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
          searchText: buildPaletteSearchText(
            {
              type: 'plugin',
              label: nodeDef.label,
              category: 'plugin',
              description: nodeDef.description,
            },
            [plugin.name, plugin.pluginId, nodeDef.type],
          ),
          pluginId: plugin.pluginId,
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          pluginNodeType: nodeDef.type,
          pluginConfigSchema: nodeDef.configSchema,
          inputPorts: buildPluginPorts(nodeDef.inputPorts, 'input'),
          outputPorts: buildPluginPorts(nodeDef.outputPorts, 'output'),
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
          searchText: buildPaletteSearchText(config, ['compound', '内部节点']),
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

  const onDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, item: PaletteNodeItem) => {
      event.dataTransfer.setData(DRAG_TRANSFER_TYPE, JSON.stringify(item))
      event.dataTransfer.effectAllowed = 'move'
      applyPaletteDragPreview(event, {
        label: item.label,
        color: NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color,
      })
    },
    [],
  )

  const filteredGroups = searchQuery.trim()
    ? allGroups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => matchesPaletteSearch(item, searchQuery),
        ),
      })).filter((group) => group.items.length > 0)
    : allGroups

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
            {allGroups.flatMap((group) =>
              group.items.map((item) => (
                <PaletteRailItem
                  key={getPaletteItemKey(item)}
                  icon={item.icon}
                  color={
                    NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color
                  }
                  label={item.label}
                  description={item.description}
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
        <Tabs
          className="flex h-full flex-col"
          defaultValue="nodes"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <TabsList className="flex-1">
              <TabsTrigger value="nodes">节点</TabsTrigger>
              <TabsTrigger value="blocks">My Blocks</TabsTrigger>
            </TabsList>
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

          <TabsContent className="flex min-h-0 flex-1 flex-col" value="nodes">
            <div className="border-b border-border p-3">
              <div className="relative">
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
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <p className="mb-2 px-2 text-[11px] text-muted-foreground">
                拖拽节点到画布以添加
              </p>
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
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  无匹配节点
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent className="min-h-0 flex-1" value="blocks">
            <BlockLibraryPanel className="h-full" />
          </TabsContent>
        </Tabs>
      </aside>
    </TooltipProvider>
  )
})

function getPaletteItemKey(item: PaletteNodeItem): string {
  if (item.pluginId && item.pluginNodeType) {
    return `${item.pluginId}:${item.pluginNodeType}`
  }

  return item.pluginId ?? item.type
}

interface PaletteGroupSectionProps {
  group: PaletteGroup
  isCollapsed: boolean
  onToggle: () => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, item: PaletteNodeItem) => void
}

const PaletteGroupSection = memo(function PaletteGroupSection({
  group,
  isCollapsed,
  onToggle,
  onDragStart,
}: PaletteGroupSectionProps) {
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
              key={getPaletteItemKey(item)}
              icon={item.icon}
              color={
                NODE_CATEGORIES[item.category]?.color ?? NODE_CATEGORIES.control.color
              }
              label={item.label}
              description={item.description}
              onDragStart={(event) => onDragStart(event, item)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
