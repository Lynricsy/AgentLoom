import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasEdge, CanvasNode } from '../../types'
import { WorkflowStatusBar } from './WorkflowStatusBar'

let onViewportChange: ((viewport: { zoom: number }) => void) | undefined

vi.mock('@xyflow/react', () => ({
  useOnViewportChange: ({ onChange }: { onChange?: (viewport: { zoom: number }) => void }) => {
    onViewportChange = onChange
  },
}))

function createNode(id: string): CanvasNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      nodeType: 'llm-agent',
      category: 'agent',
      description: 'desc',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
  }
}

function createEdge(id: string): CanvasEdge {
  return {
    id,
    source: 'node-a',
    target: 'node-b',
  }
}

describe('WorkflowStatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T10:00:00.000Z'))
    useCanvasStore.getState().actions.reset()
    onViewportChange = undefined
  })

  it('显示节点数、连接数、缩放百分比和保存时间', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [createNode('node-a'), createNode('node-b')],
      edges: [createEdge('edge-1')],
      viewport: { x: 0, y: 0, zoom: 1.25 },
      lastSavedAt: new Date('2026-03-08T09:58:00.000Z'),
    }))

    render(<WorkflowStatusBar />)

    const bar = screen.getByTestId('workflow-status-bar')
    expect(bar.className).toContain('bottom-0')
    expect(bar.className).toContain('left-0')
    expect(bar.className).toContain('right-0')
    expect(bar.className).toContain('h-7')
    expect(screen.getByText('2 节点')).toBeInTheDocument()
    expect(screen.getByText('1 连接')).toBeInTheDocument()
    expect(screen.getByText('125%')).toBeInTheDocument()
    expect(screen.getByText('已保存 · 2分钟前')).toBeInTheDocument()

    act(() => {
      onViewportChange?.({ zoom: 1.5 })
    })
    expect(screen.getByText('150%')).toBeInTheDocument()
  })

  it('保存中时显示保存中状态', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isSaving: true,
    }))

    render(<WorkflowStatusBar />)

    expect(screen.getByText('保存中...')).toBeInTheDocument()
  })

  it('有脏数据时显示未保存状态', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isDirty: true,
    }))

    render(<WorkflowStatusBar />)

    expect(screen.getByText('未保存')).toBeInTheDocument()
  })
})
