import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasNode } from '../../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { CanvasSearch } from './CanvasSearch'

const fitViewMock = vi.fn()

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView: fitViewMock }),
}))

function createNode(id: string, nodeType: Parameters<typeof getNodeTypeConfig>[0]): CanvasNode {
  const config = getNodeTypeConfig(nodeType)

  return {
    id,
    type: config.category,
    position: { x: 0, y: 0 },
    data: {
      label: `${config.label} ${id}`,
      nodeType: config.type,
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
    },
  }
}

describe('CanvasSearch', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    fitViewMock.mockReset()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  it('打开时聚焦输入框并自动定位到第一个搜索结果', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [createNode('a', 'llm-agent'), createNode('b', 'chat-agent')],
      isSearchOpen: true,
      searchQuery: 'agent',
      searchMatchIds: ['a', 'b'],
      currentSearchIndex: 0,
    }))

    render(<CanvasSearch />)

    expect(screen.getByTestId('canvas-search-input')).toHaveFocus()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(fitViewMock).toHaveBeenCalledWith({
      nodes: [{ id: 'a' }],
      duration: 300,
      padding: 0.5,
    })
  })

  it('Enter 和 Shift+Enter 会在结果中循环导航', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isSearchOpen: true,
      nodes: [createNode('a', 'llm-agent'), createNode('b', 'chat-agent')],
      searchQuery: 'agent',
      searchMatchIds: ['a', 'b'],
      currentSearchIndex: 0,
    }))

    render(<CanvasSearch />)

    const input = screen.getByTestId('canvas-search-input')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useCanvasStore.getState().currentSearchIndex).toBe(1)

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
  })

  it('无匹配时显示无结果文案', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isSearchOpen: true,
      searchQuery: 'missing',
      searchMatchIds: [],
      currentSearchIndex: -1,
    }))

    render(<CanvasSearch />)

    expect(screen.getByText('无结果')).toBeInTheDocument()
  })

  it('Escape 会关闭搜索并清空搜索状态', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isSearchOpen: true,
      searchQuery: 'agent',
      searchMatchIds: ['a'],
      currentSearchIndex: 0,
    }))

    render(<CanvasSearch />)

    fireEvent.keyDown(screen.getByTestId('canvas-search-input'), { key: 'Escape' })

    const state = useCanvasStore.getState()
    expect(state.isSearchOpen).toBe(false)
    expect(state.searchQuery).toBe('')
    expect(state.searchMatchIds).toEqual([])
    expect(state.currentSearchIndex).toBe(-1)
  })
})
