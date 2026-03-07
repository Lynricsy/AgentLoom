import { memo, useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { X } from 'lucide-react'
import { useCanvasActions } from '../../stores/canvasStore'
import { createDefaultEdgeData, type CanvasEdge, type VisualCompatibilityLevel } from '../../types'

const LEVEL_LABELS: Record<VisualCompatibilityLevel, string> = {
  L0: 'Exact match',
  L1: 'Transform needed',
  checking: 'Checking…',
  error: 'Incompatible',
}

function resolveVisualLevel(data: CanvasEdge['data']): VisualCompatibilityLevel {
  return data?.visualLevel ?? 'L0'
}

export const SmartEdge = memo(function SmartEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<CanvasEdge>) {
  const { onEdgesChange, openFieldMapping } = useCanvasActions()
  const edgeData = data ?? createDefaultEdgeData()
  const visualLevel = resolveVisualLevel(data)
  const cssLevel = visualLevel.toLowerCase()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const pathId = `edge-path-${id}`
  const showParticles = visualLevel === 'L0' || visualLevel === 'L1'
  const levelLabel = LEVEL_LABELS[visualLevel]

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onEdgesChange([{ type: 'remove', id }])
    },
    [id, onEdgesChange]
  )

  const handleBadgeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openFieldMapping(id)
    },
    [id, openFieldMapping]
  )

  const hasMappingInfo =
    edgeData.mappingSummary.autoMatchedCount > 0 ||
    edgeData.mappingSummary.manualCount > 0 ||
    edgeData.mappingSummary.requiredUnmappedCount > 0

  const badgeText = hasMappingInfo
    ? `${edgeData.mappingSummary.autoMatchedCount + edgeData.mappingSummary.manualCount} mapped`
    : levelLabel

  return (
    <>
      <defs>
        <path id={pathId} d={edgePath} />
      </defs>

      <path
        d={edgePath}
        className="smart-edge-interaction"
        data-testid={`edge-${source}-${target}`}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`smart-edge-path smart-edge-path--${cssLevel}${selected ? ' smart-edge-path--selected' : ''}`}
      />

      {showParticles && (
        <>
          <circle
            r={3}
            className={`smart-edge-particle smart-edge-particle--${cssLevel} smart-edge-particle--running`}
          >
            <animateMotion dur="2s" repeatCount="indefinite">
              <mpath xlinkHref={`#${pathId}`} />
            </animateMotion>
          </circle>
          <circle
            r={3}
            className={`smart-edge-particle smart-edge-particle--${cssLevel} smart-edge-particle--running`}
          >
            <animateMotion dur="2s" repeatCount="indefinite" begin="1s">
              <mpath xlinkHref={`#${pathId}`} />
            </animateMotion>
          </circle>
        </>
      )}

      <EdgeLabelRenderer>
        <div
          role="toolbar"
          className={`edge-badge${selected ? ' edge-badge--visible' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          data-testid={`edge-badge-${id}`}
          onDoubleClick={handleBadgeDoubleClick}
        >
          <span className={`edge-badge__dot edge-badge__dot--${cssLevel}`} />
          <span>{badgeText}</span>
          <button
            type="button"
            className="edge-badge__delete"
            data-testid={`edge-delete-${id}`}
            onClick={handleDelete}
            aria-label="Delete connection"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
