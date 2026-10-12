import { useCallback, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  useReactFlow,
  type PanelPosition,
} from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'
import { CANVAS_CONTROLS_CLASS } from './canvasChrome'
import { LOD_FULL_THRESHOLD } from '../hooks/useLevelOfDetail'

export interface CanvasBackdropProps {
  /** 缩放控件位置；Agent 画布左侧被节点面板占满时放右下角 */
  position?: PanelPosition
  /** 传入时在缩放控件里显示「整理布局」按钮；只读画布不传 */
  onAutoLayout?: () => void
}

function AutoLayoutControlButton({ onAutoLayout }: { onAutoLayout: () => void }) {
  const { fitView, getZoom, zoomTo } = useReactFlow()
  const isRunningRef = useRef(false)

  const handleClick = useCallback(async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    try {
      // 低缩放时卡片按紧凑 / 极简尺寸渲染，measured 偏小；先放大到完整细节并等
      // React Flow 重新测量，布局才按真实卡片尺寸留间距，放大查看时不会重叠
      if (getZoom() < LOD_FULL_THRESHOLD) {
        await zoomTo(1)
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        )
      }
      onAutoLayout()
      // 等 React Flow 拿到整理后的新位置再适配视口
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await fitView({ padding: 0.2, duration: 300 })
    } finally {
      isRunningRef.current = false
    }
  }, [fitView, getZoom, onAutoLayout, zoomTo])

  return (
    <ControlButton
      onClick={handleClick}
      title="整理布局"
      aria-label="整理布局"
      data-testid="btn-canvas-auto-layout"
    >
      {/* 内置控件 svg 统一 fill: currentColor，线性图标需取消填充 */}
      <LayoutGrid className="!fill-none" />
    </ControlButton>
  )
}

/**
 * 画布背景点阵 + 缩放控件。工作流画布与 Agent 画布共用，保证两处外观一致。
 * 必须作为 `<ReactFlow>` 的子元素渲染。
 */
export function CanvasBackdrop({
  position = 'bottom-left',
  onAutoLayout,
}: CanvasBackdropProps) {
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
        className={CANVAS_CONTROLS_CLASS}
      >
        {onAutoLayout && <AutoLayoutControlButton onAutoLayout={onAutoLayout} />}
      </Controls>
    </>
  )
}
