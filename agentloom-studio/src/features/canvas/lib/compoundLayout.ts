import type { CoordinateExtent, XYPosition } from '@xyflow/react'
import { COMPOUND_CONTAINER_DEFAULT_SIZE } from '../types/controlFlow.types'

const COMPOUND_COLLAPSED_SIZE = {
  width: 360,
  height: 220,
} as const

const COMPOUND_HEADER_HEIGHT = 72
const COMPOUND_PORT_SECTION_PADDING = 8
const COMPOUND_PORT_ROW_HEIGHT = 24
const COMPOUND_SUMMARY_HEIGHT = 48
const COMPOUND_FRAME_GAP = 12
const COMPOUND_FRAME_HORIZONTAL_INSET = 20
const COMPOUND_FRAME_BOTTOM_PADDING = 20
const COMPOUND_FRAME_CHILD_PADDING = 16
const COMPOUND_CHILD_FALLBACK_SIZE = {
  width: 260,
  height: 160,
} as const
const COMPOUND_MIN_FRAME_SIZE = {
  width: 560,
  height: 280,
} as const

export interface CompoundLayoutSize {
  width: number
  height: number
}

export interface CompoundFrameInsets {
  top: number
  right: number
  bottom: number
  left: number
}

interface CompoundLayoutOptions {
  inputPortCount: number
  outputPortCount: number
  width?: number | null
  height?: number | null
  isCollapsed?: boolean
  childWidth?: number | null
  childHeight?: number | null
}

function getPortSectionHeight(portCount: number): number {
  if (portCount <= 0) {
    return 0
  }

  return COMPOUND_PORT_SECTION_PADDING * 2 + portCount * COMPOUND_PORT_ROW_HEIGHT
}

export function getCompoundFrameInsets(inputPortCount: number, outputPortCount: number): CompoundFrameInsets {
  return {
    top: COMPOUND_HEADER_HEIGHT + getPortSectionHeight(inputPortCount) + COMPOUND_SUMMARY_HEIGHT + COMPOUND_FRAME_GAP,
    right: COMPOUND_FRAME_HORIZONTAL_INSET,
    bottom: COMPOUND_FRAME_BOTTOM_PADDING + getPortSectionHeight(outputPortCount),
    left: COMPOUND_FRAME_HORIZONTAL_INSET,
  }
}

export function resolveCompoundContainerSize({ inputPortCount, outputPortCount, width, height, isCollapsed = false }: CompoundLayoutOptions): CompoundLayoutSize {
  const minSize = isCollapsed
    ? COMPOUND_COLLAPSED_SIZE
    : (() => {
        const insets = getCompoundFrameInsets(inputPortCount, outputPortCount)
        return {
          width: Math.max(COMPOUND_CONTAINER_DEFAULT_SIZE.width, COMPOUND_MIN_FRAME_SIZE.width + insets.left + insets.right),
          height: Math.max(COMPOUND_CONTAINER_DEFAULT_SIZE.height, COMPOUND_MIN_FRAME_SIZE.height + insets.top + insets.bottom),
        }
      })()

  return {
    width: typeof width === 'number' && Number.isFinite(width) ? Math.max(width, minSize.width) : minSize.width,
    height: typeof height === 'number' && Number.isFinite(height) ? Math.max(height, minSize.height) : minSize.height,
  }
}

export function buildCompoundChildExtent(options: CompoundLayoutOptions): CoordinateExtent {
  const size = resolveCompoundContainerSize(options)
  const frameInsets = getCompoundFrameInsets(options.inputPortCount, options.outputPortCount)

  // React Flow 会在真正拖拽时再次按 node.measured.width/height 扣减 upper bound，
  // 所以这里返回的是“内框本身”的盒子，而不是已经减过子节点尺寸的 top-left 范围。
  return [
    [frameInsets.left + COMPOUND_FRAME_CHILD_PADDING, frameInsets.top + COMPOUND_FRAME_CHILD_PADDING],
    [Math.max(frameInsets.left + COMPOUND_FRAME_CHILD_PADDING, size.width - frameInsets.right - COMPOUND_FRAME_CHILD_PADDING), Math.max(frameInsets.top + COMPOUND_FRAME_CHILD_PADDING, size.height - frameInsets.bottom - COMPOUND_FRAME_CHILD_PADDING)],
  ]
}

export function clampPositionToExtent(position: XYPosition, extent: CoordinateExtent, options: Pick<CompoundLayoutOptions, 'childWidth' | 'childHeight'> = {}): XYPosition {
  const childSize = resolveCompoundChildSize(options)
  const maxX = Math.max(extent[0][0], extent[1][0] - childSize.width)
  const maxY = Math.max(extent[0][1], extent[1][1] - childSize.height)

  return {
    x: Math.min(Math.max(position.x, extent[0][0]), maxX),
    y: Math.min(Math.max(position.y, extent[0][1]), maxY),
  }
}

export function getCompoundInitialChildPosition(options: CompoundLayoutOptions): XYPosition {
  const extent = buildCompoundChildExtent(options)

  return {
    x: extent[0][0],
    y: extent[0][1],
  }
}

function resolveCompoundChildSize({ childWidth, childHeight }: Pick<CompoundLayoutOptions, 'childWidth' | 'childHeight'>): CompoundLayoutSize {
  return {
    width: typeof childWidth === 'number' && Number.isFinite(childWidth) && childWidth > 0 ? childWidth : COMPOUND_CHILD_FALLBACK_SIZE.width,
    height: typeof childHeight === 'number' && Number.isFinite(childHeight) && childHeight > 0 ? childHeight : COMPOUND_CHILD_FALLBACK_SIZE.height,
  }
}

/**
 * 计算所有子节点的包围盒（基于子节点相对于 compound 父节点的本地坐标）。
 * 当子节点列表为空时返回 null。
 */
export function computeChildrenBoundingBox(
  children: readonly {
    position: XYPosition
    measured?: { width?: number; height?: number } | null
    width?: number | null
    height?: number | null
  }[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (children.length === 0) {
    return null
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const child of children) {
    const w = child.measured?.width ?? (typeof child.width === 'number' ? child.width : null) ?? COMPOUND_CHILD_FALLBACK_SIZE.width
    const h = child.measured?.height ?? (typeof child.height === 'number' ? child.height : null) ?? COMPOUND_CHILD_FALLBACK_SIZE.height
    minX = Math.min(minX, child.position.x)
    minY = Math.min(minY, child.position.y)
    maxX = Math.max(maxX, child.position.x + w)
    maxY = Math.max(maxY, child.position.y + h)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * 根据子节点包围盒和帧内距计算 compound 节点的最小 resize 尺寸。
 * 保证 resize 不能把 compound 缩小到无法容纳已有子节点。
 */
export function computeMinResizeSize(childrenBBox: { maxX: number; maxY: number } | null, frameInsets: CompoundFrameInsets): CompoundLayoutSize {
  const baseMinWidth = COMPOUND_MIN_FRAME_SIZE.width + frameInsets.left + frameInsets.right
  const baseMinHeight = COMPOUND_MIN_FRAME_SIZE.height + frameInsets.top + frameInsets.bottom

  if (!childrenBBox) {
    return { width: baseMinWidth, height: baseMinHeight }
  }

  const childRequiredWidth = childrenBBox.maxX + frameInsets.right + COMPOUND_FRAME_CHILD_PADDING
  const childRequiredHeight = childrenBBox.maxY + frameInsets.bottom + COMPOUND_FRAME_CHILD_PADDING

  return {
    width: Math.max(childRequiredWidth, baseMinWidth),
    height: Math.max(childRequiredHeight, baseMinHeight),
  }
}
