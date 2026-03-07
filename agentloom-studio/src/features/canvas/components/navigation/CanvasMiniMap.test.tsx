import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../stores/canvasStore'
import { CanvasMiniMap } from './CanvasMiniMap'

vi.mock('@xyflow/react', () => ({
  MiniMap: ({ pannable, zoomable }: { pannable?: boolean; zoomable?: boolean }) => (
    <div
      data-testid="xyflow-minimap"
      data-pannable={String(pannable)}
      data-zoomable={String(zoomable)}
    />
  ),
}))

describe('CanvasMiniMap', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
  })

  it('默认展开并启用拖拽与缩放，同时避让底部状态栏', () => {
    render(<CanvasMiniMap />)

    const minimap = screen.getByTestId('canvas-minimap')
    expect(minimap.className).toContain('bottom-11')
    expect(screen.getByTestId('xyflow-minimap')).toHaveAttribute('data-pannable', 'true')
    expect(screen.getByTestId('xyflow-minimap')).toHaveAttribute('data-zoomable', 'true')
    expect(screen.getByRole('button', { name: '折叠小地图' })).toBeInTheDocument()
  })

  it('可以折叠和重新展开小地图', () => {
    render(<CanvasMiniMap />)

    fireEvent.click(screen.getByRole('button', { name: '折叠小地图' }))
    expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(true)
    expect(screen.queryByTestId('xyflow-minimap')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开小地图' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开小地图' }))
    expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(false)
    expect(screen.getByTestId('xyflow-minimap')).toBeInTheDocument()
  })
})
