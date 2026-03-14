import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import type { CanvasNode } from '../types'
import { CanvasContextMenu } from './CanvasContextMenu'

function createNode(id: string): CanvasNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      nodeType: 'llm-agent',
      category: 'agent',
      description: id,
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
  }
}

describe('CanvasContextMenu', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
  })

  it('renders at the requested fixed position when state is provided', () => {
    render(
      <CanvasContextMenu
        state={{ x: 120, y: 240 }}
        onClose={vi.fn()}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    const menu = screen.getByTestId('canvas-context-menu')
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveStyle({
      position: 'fixed',
      left: '120px',
      top: '240px',
    })
  })

  it('does not render when state is null', () => {
    render(
      <CanvasContextMenu
        state={null}
        onClose={vi.fn()}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument()
  })

  it('always shows the Delete action', () => {
    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={vi.fn()}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    expect(screen.getByTestId('canvas-context-menu-delete')).toHaveTextContent('Delete')
  })

  it('shows Encapsulate as Block when multiple nodes are selected', () => {
    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={vi.fn()}
        onEncapsulate={vi.fn()}
        selectedNodeCount={2}
      />,
    )

    expect(screen.getByTestId('canvas-context-menu-encapsulate')).toHaveTextContent(
      'Encapsulate as Block',
    )
  })

  it('hides Encapsulate as Block when fewer than two nodes are selected', () => {
    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={vi.fn()}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    expect(screen.queryByTestId('canvas-context-menu-encapsulate')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()

    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={onClose}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking outside the menu', () => {
    const onClose = vi.fn()

    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={onClose}
        onEncapsulate={vi.fn()}
        selectedNodeCount={1}
      />,
    )

    fireEvent.mouseDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('deletes all selected nodes when Delete is clicked during multi-selection', () => {
    const onClose = vi.fn()

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [createNode('node-1'), createNode('node-2')],
      selectedNodeId: 'node-2',
      selectedNodeIds: new Set(['node-1', 'node-2']),
    }))

    render(
      <CanvasContextMenu
        state={{ x: 40, y: 80 }}
        onClose={onClose}
        onEncapsulate={vi.fn()}
        selectedNodeCount={2}
      />,
    )

    fireEvent.click(screen.getByTestId('canvas-context-menu-delete'))

    expect(useCanvasStore.getState().nodes).toEqual([])
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(new Set())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
