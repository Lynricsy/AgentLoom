import { memo, useCallback, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useStore,
  type EdgeProps,
} from '@xyflow/react'
import { Shuffle, X } from 'lucide-react'
import { useExecutionStore } from '@/features/execution/stores/executionStore'
import { useCanvasActions } from '../../stores/canvasStore'
import { PORT_DATA_TYPE_META } from '../../types/nodeTypeRegistry'
import type { PortDataType } from '../../types/typeSchema'
import {
  createDefaultEdgeData,
  type CanvasEdge,
  type VisualCompatibilityLevel,
} from '../../types'

const LEVEL_LABELS: Record<VisualCompatibilityLevel, string> = {
  L0: 'L0 精确匹配',
  L1: '转换',
  checking: '检查中...',
  error: '不兼容',
}

/** 端口数据类型无法解析时的单色回退描边 */
const FALLBACK_STROKE = 'var(--color-primary)'

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

/**
 * 从节点 data 的端口定义里按 handleId 取数据类型。
 *
 * `CanvasEdgeData` 里**没有**源/目标端口类型字段（只有兼容性等级、映射与
 * missingFields），因此渐变配色必须在渲染期从 ReactFlow store 的节点端口定义
 * 现场解析；解析不到时由调用方退回单色 `--color-primary`。
 */
function readPortDataType(
  nodeData: unknown,
  portsKey: 'inputPorts' | 'outputPorts',
  handleId: string | null | undefined,
): PortDataType | null {
  if (typeof nodeData !== 'object' || nodeData === null) return null
  const ports = (nodeData as Record<string, unknown>)[portsKey]
  if (!Array.isArray(ports) || ports.length === 0) return null

  const list = ports as Array<Record<string, unknown>>
  // handleId 缺失（默认单 handle）时，只有唯一端口才能无歧义地推断类型
  const port = handleId
    ? list.find((item) => item.id === handleId)
    : list.length === 1
      ? list[0]
      : undefined
  const dataType = port?.dataType

  return typeof dataType === 'string' && dataType in PORT_DATA_TYPE_META
    ? (dataType as PortDataType)
    : null
}

/** 订阅单个端口的数据类型色 token（标量选择器，避免多余重渲染） */
function usePortColorToken(
  nodeId: string,
  handleId: string | null | undefined,
  portsKey: 'inputPorts' | 'outputPorts',
): string | null {
  return useStore(
    useCallback(
      (state) => {
        const dataType = readPortDataType(
          state.nodeLookup.get(nodeId)?.data,
          portsKey,
          handleId,
        )
        return dataType ? PORT_DATA_TYPE_META[dataType].colorToken : null
      },
      [nodeId, handleId, portsKey],
    ),
  )
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
  sourceHandleId,
  targetHandleId,
  data,
  selected,
  markerEnd,
}: EdgeProps<CanvasEdge>) {
  const { onEdgesChange, openFieldMapping } = useCanvasActions()
  const edgeData = data ?? createDefaultEdgeData()
  const visualLevel: VisualCompatibilityLevel = data?.visualLevel ?? 'L0'
  const readonlyPreview = data?.readonlyPreview === true
  const cssLevel = visualLevel.toLowerCase()
  const [isHovered, setIsHovered] = useState(false)

  const sourceColor = usePortColorToken(source, sourceHandleId, 'outputPorts')
  const targetColor = usePortColorToken(target, targetHandleId, 'inputPorts')

  // 粒子只在“数据正流入目标节点”时出现：与 useExecutionHighlight 的 dep-active
  // 语义一致（running 节点的入边为活跃边）。空闲画布上的边一律静止。
  // 只读预览与编辑器共用节点 id，必须整体不读执行态，否则同 id 的编辑器执行会
  // 让预览里的边跑起粒子。
  const isFlowing = useExecutionStore(
    (state) => state.nodes[target]?.status === 'running',
  )

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const domId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const pathId = `edge-path-${domId}`
  const gradientId = `edge-gradient-${domId}`

  // error / checking 有各自的语义色（红 / info），不参与类型渐变
  const typeColored = visualLevel === 'L0' || visualLevel === 'L1'
  const useGradient = typeColored && sourceColor !== null && targetColor !== null
  const strokeValue = useGradient
    ? `url(#${gradientId})`
    : typeColored
      ? (sourceColor ?? targetColor ?? FALLBACK_STROKE)
      : FALLBACK_STROKE
  const glowColor =
    visualLevel === 'error'
      ? 'var(--color-compat-l3)'
      : (sourceColor ?? targetColor ?? FALLBACK_STROKE)

  const showParticles = !readonlyPreview && isFlowing && typeColored
  const particleColor = sourceColor ?? targetColor ?? FALLBACK_STROKE
  const badgeText = buildBadgeText(edgeData, visualLevel)
  const hasWarning = edgeData.mappingSummary.requiredUnmappedCount > 0
  // L1 / error 需要常驻提示（可点击进入字段映射），其余等级仍是 hover / 选中才出现
  const persistentBadge = visualLevel === 'L1' || visualLevel === 'error'
  const badgeVisible =
    !readonlyPreview && (isHovered || !!selected || persistentBadge)
  const badgeTabIndex = badgeVisible ? 0 : -1

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onEdgesChange([{ type: 'remove', id }])
    },
    [id, onEdgesChange],
  )

  const handleBadgeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openFieldMapping(id)
    },
    [id, openFieldMapping],
  )

  const handleMouseEnter = () => {
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  return (
    <>
      <defs>
        <path id={pathId} d={edgePath} />
        {useGradient && (
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
          >
            <stop offset="0%" stopColor={sourceColor} />
            <stop offset="100%" stopColor={targetColor} />
          </linearGradient>
        )}
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
        style={
          {
            '--edge-stroke': strokeValue,
            '--edge-glow': glowColor,
          } as React.CSSProperties
        }
        data-testid={`edge-${source}-${target}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {showParticles && (
        <>
          <circle
            r={3}
            style={{ fill: particleColor }}
            className={`smart-edge-particle smart-edge-particle--${cssLevel} smart-edge-particle--running`}
          >
            <animateMotion dur="2s" repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <circle
            r={3}
            style={{ fill: particleColor }}
            className={`smart-edge-particle smart-edge-particle--${cssLevel} smart-edge-particle--running`}
          >
            <animateMotion dur="2s" repeatCount="indefinite" begin="1s">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        </>
      )}

      {!readonlyPreview ? (
        <EdgeLabelRenderer>
          <div
            className={`edge-badge edge-badge--${cssLevel} nodrag nopan${badgeVisible ? ' edge-badge--visible' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: badgeVisible ? 'all' : 'none',
            }}
            data-testid={`edge-badge-${id}`}
            aria-hidden={!badgeVisible}
          >
            <button
              type="button"
              className="edge-badge__summary"
              data-testid={`edge-badge-action-${id}`}
              onClick={handleBadgeClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onFocus={handleMouseEnter}
              onBlur={handleMouseLeave}
              aria-label="打开字段映射"
              tabIndex={badgeTabIndex}
            >
              {visualLevel === 'L1' ? (
                <Shuffle className="edge-badge__icon" size={10} />
              ) : (
                <span
                  className={`edge-badge__dot edge-badge__dot--${cssLevel}`}
                />
              )}
              <span>{badgeText}</span>
            </button>
            {hasWarning && (
              <span
                className="edge-badge__warning"
                data-testid={`edge-warning-${id}`}
                title={`${edgeData.mappingSummary.requiredUnmappedCount} 个必填字段未映射`}
              >
                ⚠
              </span>
            )}
            {selected && (
              <button
                type="button"
                className="edge-badge__delete"
                data-testid={`edge-delete-${id}`}
                onClick={handleDelete}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onFocus={handleMouseEnter}
                onBlur={handleMouseLeave}
                aria-label="删除连接"
                tabIndex={badgeTabIndex}
              >
                <X size={10} />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
})
