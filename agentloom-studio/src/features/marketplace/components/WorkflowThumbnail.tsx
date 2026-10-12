import { memo, useMemo } from 'react'

import { getNodeAccentToken, type NodeCategory } from '@/features/canvas'
import { cn } from '@/shared/lib/utils'
import type { MarketplacePreviewGraph } from '../types'

/** 画布坐标下的留白比例：按包围盒长边取，避免节点贴边 */
const PADDING_RATIO = 0.08
const MIN_PADDING = 40
/** 节点圆角与色条高度，单位为画布坐标（随 viewBox 一起缩放） */
const NODE_RADIUS = 14
const HEADER_HEIGHT = 28

interface WorkflowThumbnailProps {
  graph: MarketplacePreviewGraph
  className?: string
}

/**
 * 市场卡片的工作流缩略图。
 *
 * 用静态 SVG 画节点包围盒与连线，不挂 ReactFlow：一页 20 张卡片各起一个画布实例
 * 太重，卡片也不需要交互。节点着色与画布共用类别色令牌。
 */
export const WorkflowThumbnail = memo(function WorkflowThumbnail({
  graph,
  className,
}: WorkflowThumbnailProps) {
  const layout = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    for (const node of graph.nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    }
    const padding = Math.max(
      Math.max(maxX - minX, maxY - minY) * PADDING_RATIO,
      MIN_PADDING,
    )

    // 连线统一从源节点右侧中点出发、落到目标节点左侧中点，与画布的左入右出端口方向一致
    const edgePaths = graph.edges.flatMap((edge) => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target || source === target) {
        return []
      }
      const startX = source.x + source.width
      const startY = source.y + source.height / 2
      const endX = target.x
      const endY = target.y + target.height / 2
      const bend = Math.max(Math.abs(endX - startX) / 2, 60)
      return [
        {
          key: `${edge.source}->${edge.target}`,
          d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
        },
      ]
    })

    return {
      viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
      edgePaths,
    }
  }, [graph])

  return (
    <svg
      viewBox={layout.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={cn('h-full w-full', className)}
      aria-hidden
      data-testid="marketplace-card-thumbnail"
    >
      <g
        fill="none"
        style={{ stroke: 'var(--color-muted-foreground)', strokeOpacity: 0.55 }}
      >
        {layout.edgePaths.map((edge) => (
          <path
            key={edge.key}
            d={edge.d}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {graph.nodes.map((node) => {
        const accent = getNodeAccentToken(
          node.nodeType ?? '',
          // 未知类别由 getNodeAccentToken 回退到 control 色
          (node.category ?? 'control') as NodeCategory,
        )
        const headerHeight = Math.min(HEADER_HEIGHT, node.height / 3)
        const radius = Math.min(NODE_RADIUS, headerHeight, node.width / 2)
        const right = node.x + node.width
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={radius}
              style={{
                fill: `color-mix(in srgb, ${accent} 10%, var(--color-surface))`,
                stroke: `color-mix(in srgb, ${accent} 55%, transparent)`,
              }}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* 只圆上边角的色条，对应画布节点卡的标题栏 */}
            <path
              d={`M ${node.x} ${node.y + headerHeight} V ${node.y + radius} Q ${node.x} ${node.y} ${node.x + radius} ${node.y} H ${right - radius} Q ${right} ${node.y} ${right} ${node.y + radius} V ${node.y + headerHeight} Z`}
              style={{ fill: accent, fillOpacity: 0.75 }}
            />
          </g>
        )
      })}
    </svg>
  )
})
