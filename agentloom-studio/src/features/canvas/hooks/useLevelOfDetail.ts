import { useMemo } from 'react'
import { useViewport } from '@xyflow/react'
import { usePreviewMode } from '../components/PreviewModeContext'

/** 画布节点的细节层级 */
export type LevelOfDetail = 'full' | 'compact' | 'minimal'

/** LOD 缩放阈值 */
const LOD_FULL_THRESHOLD = 0.7
const LOD_COMPACT_THRESHOLD = 0.4

/**
 * 根据当前画布缩放等级返回节点细节层级
 *
 * - full   (zoom ≥ 0.7): 完整显示所有细节
 * - compact (0.4 ≤ zoom < 0.7): 隐藏次要信息
 * - minimal (zoom < 0.4): 仅显示标题和颜色标识
 *
 * 预览态可通过 `PreviewModeContext.lodOverride` 固定层级：小容器 fitView 会把 zoom
 * 压到 0.4 以下，缩略图却仍需要展示完整卡片。
 */
export function useLevelOfDetail(): LevelOfDetail {
  const { zoom } = useViewport()
  const previewMode = usePreviewMode()

  return useMemo(() => {
    if (previewMode?.lodOverride) return previewMode.lodOverride
    if (zoom >= LOD_FULL_THRESHOLD) return 'full'
    if (zoom >= LOD_COMPACT_THRESHOLD) return 'compact'
    return 'minimal'
  }, [previewMode?.lodOverride, zoom])
}
