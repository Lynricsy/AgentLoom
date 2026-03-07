import { memo, useMemo } from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { useHoveredNodeId } from '../../stores/canvasStore'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { NODE_CATEGORIES } from '../nodeCategories'
import type { CanvasNode } from '../../types'

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
  const typeConfig = getNodeTypeConfig(data.nodeType)
  const categoryInfo = NODE_CATEGORIES[data.category]

  const left = node.position.x * viewport.zoom + viewport.x + nodeWidth * viewport.zoom + 12
  const top = node.position.y * viewport.zoom + viewport.y

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-0 top-0 z-[1000] min-w-[160px] max-w-[240px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg'
      )}
      style={{
        transform: `translate(${left}px, ${top}px)`,
      }}
      data-testid="node-info-card"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: categoryInfo?.color }}
        />
        <span className="truncate text-sm font-medium">{data.label}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{typeConfig?.label ?? data.nodeType}</p>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span>{data.inputPorts.length} 输入</span>
        <span>{data.outputPorts.length} 输出</span>
      </div>
    </div>
  )
})
