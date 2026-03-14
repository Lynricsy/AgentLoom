import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { AgentGraphEdge as AgentGraphEdgeData } from '../types'

export interface AgentGraphEdgeFlowData
  extends AgentGraphEdgeData,
    Record<string, unknown> {
  isHighlighted?: boolean
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
  const dataTypeSummary = data?.dataTypeSummary ?? []
  const showTooltip = isHighlighted || selected

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          'transition-all duration-200',
          isHighlighted
            ? '!stroke-yellow-400/80'
            : selected
              ? '!stroke-primary'
              : '!stroke-border',
        )}
        style={{
          strokeWidth: isHighlighted || selected ? 2.5 : 1.5,
          strokeDasharray: isHighlighted ? '6 3' : undefined,
          animation: isHighlighted ? 'dash-flow 1s linear infinite' : undefined,
        }}
      />

      {showTooltip && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-auto absolute rounded-lg border px-2.5 py-1.5 text-[10px] shadow-lg',
              'border-border/60 bg-popover/95 backdrop-blur-sm',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            data-testid={`agent-graph-edge-tooltip-${id}`}
          >
            <p className="font-medium text-foreground">
              {evidenceLinks} 条证据链接
            </p>
            {dataTypeSummary.length > 0 && (
              <p className="mt-0.5 text-muted-foreground">
                {dataTypeSummary.join(', ')}
              </p>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
