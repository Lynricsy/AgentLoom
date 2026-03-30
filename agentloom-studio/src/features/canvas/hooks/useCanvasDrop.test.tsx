import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactFlowInstance } from '@xyflow/react'
import type { CanvasEdge, CanvasNode, PaletteNodeItem } from '../types'
import { useCanvasStore } from '../stores/canvasStore'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasDrop } from './useCanvasDrop'

const mockPaletteNode: PaletteNodeItem = {
  type: 'chat-agent',
  label: 'LLM Agent',
  category: 'agent',
  icon: 'Bot',
  description: '大语言模型 Agent 节点',
}

const mockMcpPaletteNode: PaletteNodeItem = {
  type: 'mcp-tool',
  label: 'MCP Tool',
  category: 'tool',
  icon: 'Plug',
  description: 'MCP 工具节点',
}

describe('useCanvasDrop', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
  })

  it('応该使用节点分类作为 React Flow type 创建节点', () => {
    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 240, y: 180 })),
    } as Pick<ReactFlowInstance<CanvasNode, CanvasEdge>, 'screenToFlowPosition'> as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 640,
        clientY: 320,
        dataTransfer: {
          getData: (type: string) =>
            type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockPaletteNode) : '',
        },
      } as unknown as React.DragEvent)
    })

    expect(reactFlowInstance.screenToFlowPosition).toHaveBeenCalledWith({
      x: 640,
      y: 320,
    })

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]?.type).toBe('agent')
    expect(state.nodes[0]?.data.nodeType).toBe('chat-agent')
    expect(state.nodes[0]?.data.inputPorts.length).toBeGreaterThan(0)
    expect(state.nodes[0]?.data.outputPorts.length).toBeGreaterThan(0)
    expect(state.nodes[0]?.data.config).toBeDefined()
    expect(state.isDirty).toBe(true)
  })

  it('MCP Tool drop 使用注册表默认端口', () => {
    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 100, y: 100 })),
    } as Pick<ReactFlowInstance<CanvasNode, CanvasEdge>, 'screenToFlowPosition'> as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 400,
        clientY: 200,
        dataTransfer: {
          getData: (type: string) =>
            type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockMcpPaletteNode) : '',
        },
      } as unknown as React.DragEvent)
    })

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]?.data.nodeType).toBe('mcp-tool')
    expect(state.nodes[0]?.data.outputPorts.length).toBeGreaterThan(0)
    expect(state.nodes[0]?.data.outputPorts[0]?.dataType).toBe('tool')
  })
})
