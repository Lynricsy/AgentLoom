import { memo, useMemo } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { AnimatePresence, motion } from 'motion/react'
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
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { CANVAS_FLOATING_CLASS } from '../canvasChrome'
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

const CARD_MAX_WIDTH = 260
const CARD_GAP = 12

export const NodeInfoCard = memo(function NodeInfoCard() {
  const hoveredNodeId = useHoveredNodeId()
  const { getNode } = useReactFlow()
  const viewport = useViewport()
  const flowWidth = useStore((state) => state.width)

  const node = useMemo(() => {
    if (!hoveredNodeId) return null
    return getNode(hoveredNodeId) as CanvasNode | undefined
  }, [hoveredNodeId, getNode])

  return (
    <AnimatePresence>
      {node ? (
        <NodeInfoCardContent
          key={node.id}
          node={node}
          viewport={viewport}
          flowWidth={flowWidth}
        />
      ) : null}
    </AnimatePresence>
  )
})

interface NodeInfoCardContentProps {
  node: CanvasNode
  viewport: { x: number; y: number; zoom: number }
  flowWidth: number
}

function NodeInfoCardContent({ node, viewport, flowWidth }: NodeInfoCardContentProps) {
  const { data } = node
  const nodeWidth = node.measured?.width ?? 200
  const typeConfig = getResolvedNodeTypeConfig(data.nodeType, {
    category: data.category,
    inputPorts: Array.isArray(data.inputPorts) ? data.inputPorts : undefined,
    outputPorts: Array.isArray(data.outputPorts) ? data.outputPorts : undefined,
  })
  const categoryInfo = NODE_CATEGORIES[typeConfig.category]
  const NodeIcon = NODE_TYPE_ICONS[typeConfig.icon] ?? Bot
  const accent = categoryInfo?.color ?? 'var(--color-muted-foreground)'
  const inputPortCount = Array.isArray(data.inputPorts) ? data.inputPorts.length : 0
  const outputPortCount = Array.isArray(data.outputPorts) ? data.outputPorts.length : 0

  const nodeLeft = node.position.x * viewport.zoom + viewport.x
  const rightSideLeft = nodeLeft + nodeWidth * viewport.zoom + CARD_GAP
  // 节点靠近画布右缘时翻到节点左侧，避免被裁切或压到右侧面板下
  const flipToLeft = flowWidth > 0 && rightSideLeft + CARD_MAX_WIDTH > flowWidth
  const left = flipToLeft ? Math.max(0, nodeLeft - CARD_GAP - CARD_MAX_WIDTH) : rightSideLeft
  const top = node.position.y * viewport.zoom + viewport.y - 8

  return (
    <motion.div
      {...fadeIn}
      className={cn(
        CANVAS_FLOATING_CLASS,
        'pointer-events-none absolute left-0 top-0 z-40 min-w-[180px] max-w-[260px] p-3 text-foreground',
      )}
      style={{ x: left, y: top }}
      data-testid="node-info-card"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          <NodeIcon className="size-4" aria-hidden="true" data-testid="node-info-card-icon" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{data.label}</p>
          <p className="truncate text-2xs text-muted-foreground">{categoryInfo?.label ?? '节点'}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{typeConfig?.label ?? data.nodeType}</p>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
        {inputPortCount} 输入, {outputPortCount} 输出
      </p>
    </motion.div>
  )
}
