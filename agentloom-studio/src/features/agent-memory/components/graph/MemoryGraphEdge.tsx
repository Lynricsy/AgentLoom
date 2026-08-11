import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { MemoryGraphEdgeData } from './types'

export const MemoryGraphEdge = memo(function MemoryGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data: rawData,
}: EdgeProps) {
  const data = rawData as MemoryGraphEdgeData | undefined
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const edgeName = data?.edgeName?.trim() ?? ''
  const priority = data?.priority

  const hasLabel = edgeName.length > 0 || priority != null

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected
            ? 'var(--color-node-memory)'
            : 'var(--color-border-hover)',
          strokeWidth: selected ? 2.5 : 1.75,
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute rounded-md border border-border px-2 py-0.5 text-[10px]',
              'bg-surface/90 shadow-node backdrop-blur-sm',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            data-testid={`memory-graph-edge-label-${id}`}
          >
            {edgeName && (
              <span className="font-medium text-foreground">{edgeName}</span>
            )}
            {priority != null && (
              <span className="ml-1 text-muted">#{priority}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
