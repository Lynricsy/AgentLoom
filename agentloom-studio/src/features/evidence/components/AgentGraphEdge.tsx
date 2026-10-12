import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { AgentGraphEdge as AgentGraphEdgeData } from '../types'

export interface AgentGraphEdgeFlowData
  extends AgentGraphEdgeData,
    Record<string, unknown> {
  isHighlighted?: boolean
  sourceNodeName?: string
  targetNodeName?: string
}

export type AgentGraphFlowEdge = Edge<AgentGraphEdgeFlowData>

export const AgentGraphEdge = memo(function AgentGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data: rawData,
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const data = rawData as AgentGraphEdgeFlowData | undefined
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const isHighlighted = data?.isHighlighted ?? false
  const evidenceLinks = data?.evidenceLinks ?? 0
  const dataTypeSummary = data?.dataTypeSummary?.trim() ?? ''
  const sourceNodeName = data?.sourceNodeName?.trim() ?? data?.sourceNodeId ?? ''
  const targetNodeName = data?.targetNodeName?.trim() ?? data?.targetNodeId ?? ''
  const showTooltip = isHighlighted || selected || isHovered

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          'transition-colors duration-200',
          isHighlighted
            ? '!stroke-highlight/80'
            : selected
              ? '!stroke-primary'
              : '!stroke-border',
        )}
        style={{
          strokeWidth: isHighlighted || selected ? 2.5 : 1.5,
          // 复用 index.css 已定义的 edge-checking-dash（offset -20 = 两个 6+4 周期，无跳帧）；
          // 原先引用的 dash-flow 关键帧并不存在，高亮虚线从未流动
          strokeDasharray: isHighlighted ? '6 4' : undefined,
          animation:
            isHighlighted && !prefersReducedMotion
              ? 'edge-checking-dash 0.8s linear infinite'
              : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <Button
          variant="ghost"
          className="pointer-events-auto absolute h-6 w-24 rounded-full p-0 opacity-0 hover:bg-transparent"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          aria-label={`${sourceNodeName} 到 ${targetNodeName} 的证据链路`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          data-testid={`agent-graph-edge-hit-area-${id}`}
        />

        <AnimatePresence>
          {showTooltip && (
            <motion.div
              key="edge-tooltip"
              {...fadeIn}
              className="pointer-events-auto absolute max-w-64 break-words rounded-lg border border-border bg-popover px-2.5 py-1.5 text-2xs shadow-lg"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              }}
              data-testid={`agent-graph-edge-tooltip-${id}`}
            >
              <p className="font-medium text-foreground">
                {sourceNodeName} → {targetNodeName}
              </p>
              <p className="mt-0.5 text-muted-foreground tabular-nums">
                {evidenceLinks} 条证据链接
              </p>
              {dataTypeSummary.length > 0 && (
                <p className="mt-0.5 text-muted-foreground">
                  {dataTypeSummary}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </EdgeLabelRenderer>
    </>
  )
})
