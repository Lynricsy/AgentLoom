import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasEdge, CanvasNode } from '../../types'
import { WorkflowStatusBar } from './WorkflowStatusBar'

let mockExecutionStatus: string | null = null
let mockExecutionProgress = { completedSteps: 0, totalSteps: 0 }
let mockIsExecutionActive = false

vi.mock('@/features/execution', () => ({
  useExecutionStatus: () => mockExecutionStatus,
  useExecutionProgress: () => mockExecutionProgress,
  useIsExecutionActive: () => mockIsExecutionActive,
}))

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
      nodeType: 'agent',
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
    mockExecutionStatus = null
    mockExecutionProgress = { completedSteps: 0, totalSteps: 0 }
    mockIsExecutionActive = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('显示节点数、连接数、缩放百分比和保存时间', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [createNode('n1'), createNode('n2'), createNode('n3')],
      edges: [createEdge('e1'), createEdge('e2')],
      lastSavedAt: new Date('2026-03-08T09:58:00.000Z'),
    }))

    render(<WorkflowStatusBar />)

    expect(screen.getByText('3 节点')).toBeInTheDocument()
    expect(screen.getByText('2 连接')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('已保存 · 2分钟前')).toBeInTheDocument()

    act(() => {
      onViewportChange?.({ zoom: 1.5 })
    })
    expect(screen.getByText('150%')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('已保存 · 3分钟前')).toBeInTheDocument()
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

  describe('执行状态指示器', () => {
    it('无执行状态时不显示指示器', () => {
      render(<WorkflowStatusBar />)

      expect(screen.queryByTestId('execution-status-indicator')).not.toBeInTheDocument()
    })

    it('running 状态显示执行中指示器', () => {
      mockExecutionStatus = 'running'
      mockIsExecutionActive = true
      mockExecutionProgress = { completedSteps: 2, totalSteps: 5 }

      render(<WorkflowStatusBar />)

      const indicator = screen.getByTestId('execution-status-indicator')
      expect(indicator).toBeInTheDocument()
      expect(indicator).toHaveTextContent('执行中')
      expect(indicator).toHaveTextContent('2/5')
    })

    it('completed 状态显示已完成', () => {
      mockExecutionStatus = 'completed'
      mockIsExecutionActive = false
      mockExecutionProgress = { completedSteps: 5, totalSteps: 5 }

      render(<WorkflowStatusBar />)

      const indicator = screen.getByTestId('execution-status-indicator')
      expect(indicator).toHaveTextContent('已完成')
    })

    it('failed 状态显示已失败', () => {
      mockExecutionStatus = 'failed'
      mockIsExecutionActive = false
      mockExecutionProgress = { completedSteps: 3, totalSteps: 5 }

      render(<WorkflowStatusBar />)

      const indicator = screen.getByTestId('execution-status-indicator')
      expect(indicator).toHaveTextContent('失败')
    })

    it('paused 状态显示已暂停', () => {
      mockExecutionStatus = 'paused'
      mockIsExecutionActive = true
      mockExecutionProgress = { completedSteps: 1, totalSteps: 4 }

      render(<WorkflowStatusBar />)

      const indicator = screen.getByTestId('execution-status-indicator')
      expect(indicator).toHaveTextContent('已暂停')
    })

    it('非活跃且 totalSteps 为 0 时不显示进度', () => {
      mockExecutionStatus = 'pending'
      mockIsExecutionActive = false
      mockExecutionProgress = { completedSteps: 0, totalSteps: 0 }

      render(<WorkflowStatusBar />)

      const indicator = screen.getByTestId('execution-status-indicator')
      expect(indicator).toBeInTheDocument()
      expect(indicator).not.toHaveTextContent('/')
    })
  })
})
