import { memo, useCallback, useState } from 'react'
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
  L0: 'L0 精确匹配',
  L1: 'L1 需要转换',
  checking: '检查中...',
  error: '不兼容',
}

function resolveVisualLevel(data: CanvasEdge['data']): VisualCompatibilityLevel {
  return data?.visualLevel ?? 'L0'
}

function buildBadgeText(
  edgeData: NonNullable<CanvasEdge['data']>,
  visualLevel: VisualCompatibilityLevel,
): string {
  const { mappingSummary, reasonKey } = edgeData
  const hasMappingInfo =
    mappingSummary.autoMatchedCount > 0 ||
    mappingSummary.manualCount > 0 ||
    mappingSummary.requiredUnmappedCount > 0

  if (hasMappingInfo) {
    const total = mappingSummary.autoMatchedCount + mappingSummary.manualCount
    return `${total} 已映射`
  }

  if (visualLevel === 'error' && reasonKey) {
    return `不兼容: ${reasonKey}`
  }

  return LEVEL_LABELS[visualLevel]
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
  const [isHovered, setIsHovered] = useState(false)

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
  const badgeText = buildBadgeText(edgeData, visualLevel)
  const hasWarning = edgeData.mappingSummary.requiredUnmappedCount > 0
  const badgeVisible = isHovered || !!selected

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

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  return (
    <>
      <defs>
        <path id={pathId} d={edgePath} />
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={16}
        markerEnd={markerEnd}
        className={[
          'smart-edge-path',
          `smart-edge-path--${cssLevel}`,
          selected ? 'smart-edge-path--selected' : '',
          isHovered ? 'smart-edge-path--hovered' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`edge-${source}-${target}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
          className={`edge-badge nodrag nopan${badgeVisible ? ' edge-badge--visible' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          data-testid={`edge-badge-${id}`}
          onDoubleClick={handleBadgeDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span className={`edge-badge__dot edge-badge__dot--${cssLevel}`} />
          <span>{badgeText}</span>
          {hasWarning && (
            <span
              className="edge-badge__warning"
              data-testid={`edge-warning-${id}`}
              title={`${edgeData.mappingSummary.requiredUnmappedCount} 个必填字段未映射`}
            >
              ⚠
            </span>
          )}
          <button
            type="button"
            className="edge-badge__delete"
            data-testid={`edge-delete-${id}`}
            onClick={handleDelete}
            aria-label="删除连接"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
