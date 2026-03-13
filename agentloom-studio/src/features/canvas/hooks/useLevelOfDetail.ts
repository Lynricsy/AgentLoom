import { useMemo } from 'react'
import { useViewport } from '@xyflow/react'

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
 */
export function useLevelOfDetail(): LevelOfDetail {
  const { zoom } = useViewport()

  return useMemo(() => {
    if (zoom >= LOD_FULL_THRESHOLD) return 'full'
    if (zoom >= LOD_COMPACT_THRESHOLD) return 'compact'
    return 'minimal'
  }, [zoom])
}
