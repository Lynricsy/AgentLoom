import { memo, useMemo } from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'
import {
  Bot,
  Brain,
  Braces,
  Clock,
  Code,
  Database,
  FileText,
  GitBranch,
  Globe,
  MessageSquare,
  Play,
  Repeat,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useHoveredNodeId } from '../../stores/canvasStore'
import { getResolvedNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { NODE_CATEGORIES } from '../nodeCategories'
import type { CanvasNode } from '../../types'

const NODE_TYPE_ICONS: Record<string, LucideIcon> = {
  Bot,
  Brain,
  MessageSquare,
  Globe,
  Code,
  Play,
  Clock,
  Database,
  FileText,
  Braces,
  GitBranch,
  Repeat,
}

export const NodeInfoCard = memo(function NodeInfoCard() {
  const hoveredNodeId = useHoveredNodeId()
  const { getNode } = useReactFlow()
  const viewport = useViewport()

  const node = useMemo(() => {
    if (!hoveredNodeId) return null
    return getNode(hoveredNodeId) as CanvasNode | undefined
  }, [hoveredNodeId, getNode])

  if (!node) return null

  const { data } = node
  const nodeWidth = node.measured?.width ?? 200
  const typeConfig = getResolvedNodeTypeConfig(data.nodeType, {
    category: data.category,
    inputPorts: Array.isArray(data.inputPorts) ? data.inputPorts : undefined,
    outputPorts: Array.isArray(data.outputPorts) ? data.outputPorts : undefined,
  })
  const categoryInfo = NODE_CATEGORIES[typeConfig.category]
  const NodeIcon = NODE_TYPE_ICONS[typeConfig.icon] ?? Bot
  const inputPortCount = Array.isArray(data.inputPorts) ? data.inputPorts.length : 0
  const outputPortCount = Array.isArray(data.outputPorts) ? data.outputPorts.length : 0

  const left = node.position.x * viewport.zoom + viewport.x + nodeWidth * viewport.zoom + 12
  const top = node.position.y * viewport.zoom + viewport.y - 8

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-0 top-0 z-[1000] min-w-[180px] max-w-[260px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg'
      )}
      style={{
        transform: `translate(${left}px, ${top}px)`,
      }}
      data-testid="node-info-card"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: categoryInfo?.color ?? 'var(--color-surface-elevated)' }}
        >
          <NodeIcon className="h-4 w-4 text-black/80" aria-hidden="true" data-testid="node-info-card-icon" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{data.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{categoryInfo?.label ?? '节点'}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{typeConfig?.label ?? data.nodeType}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{inputPortCount} 输入, {outputPortCount} 输出</span>
        <span className="text-border">|</span>
        <span>空闲</span>
      </div>
    </div>
  )
})
