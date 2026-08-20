import type { RefObject } from 'react'
import { CanvasContextMenu } from './CanvasContextMenu'
import { NodeInfoCard } from './overlays/NodeInfoCard'
import {
  CompatibilityPreview,
  type CompatibilityPreviewHandle,
} from './overlays/CompatibilityPreview'
import { ConnectionStateOverlay } from './overlays/ConnectionStateOverlay'
import { CanvasSearch } from './toolbar/CanvasSearch'
import type { PreviewState } from '../hooks/useConnectionInteraction'
import type { ActiveConnectionState } from '../lib/connectionHandleDom'
import type { CanvasContextMenuState } from '../types'

export interface CanvasOverlayLayerProps {
  previewRef: RefObject<CompatibilityPreviewHandle | null>
  previewState: PreviewState
  activeConnection: ActiveConnectionState | null
  contextMenuState: CanvasContextMenuState | null
  selectedNodeCount: number
  onCloseContextMenu: () => void
  onEncapsulate: () => void
}

/**
 * 画布之上的浮层：连线兼容性预览、端口高亮几何、搜索、节点信息卡与右键菜单。
 * `CompatibilityPreview` 的位置由 imperative handle 直接写 DOM，避免每帧 re-render。
 */
export function CanvasOverlayLayer({
  previewRef,
  previewState,
  activeConnection,
  contextMenuState,
  selectedNodeCount,
  onCloseContextMenu,
  onEncapsulate,
}: CanvasOverlayLayerProps) {
  return (
    <>
      <CompatibilityPreview
        ref={previewRef}
        visible={previewState.visible}
        visualLevel={previewState.visualLevel}
        x={-9999}
        y={-9999}
        reasonKey={previewState.reasonKey}
        metadata={previewState.metadata}
      />
      <ConnectionStateOverlay
        active={!!activeConnection}
        cursor={null}
        sourceHandle={activeConnection?.sourceHandle ?? null}
        compatibleTargets={activeConnection?.compatibleTargets ?? []}
        incompatibleTargets={activeConnection?.incompatibleTargets ?? []}
        label={null}
      />
      <CanvasSearch />
      <NodeInfoCard />
      <CanvasContextMenu
        state={contextMenuState}
        onClose={onCloseContextMenu}
        onEncapsulate={onEncapsulate}
        selectedNodeCount={selectedNodeCount}
      />
    </>
  )
}
