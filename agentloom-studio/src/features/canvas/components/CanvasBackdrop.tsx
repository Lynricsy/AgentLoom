import {
  Background,
  BackgroundVariant,
  Controls,
  type PanelPosition,
} from '@xyflow/react'

export interface CanvasBackdropProps {
  /** 缩放控件位置；Agent 画布左侧被节点面板占满时放右下角 */
  position?: PanelPosition
}

/**
 * 画布背景点阵 + 缩放控件。工作流画布与 Agent 画布共用，保证两处外观一致。
 * 必须作为 `<ReactFlow>` 的子元素渲染。
 */
export function CanvasBackdrop({ position = 'bottom-left' }: CanvasBackdropProps) {
  return (
    <>
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={2}
        color="var(--color-border)"
      />
      <Controls
        showInteractive={false}
        position={position}
        className="!border-border !bg-muted !shadow-lg"
      />
    </>
  )
}
