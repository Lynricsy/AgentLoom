import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactFlowInstance } from '@xyflow/react'
import type { CanvasEdge, CanvasNode, PaletteNodeItem } from '../types'
import { useCanvasStore } from '../stores/canvasStore'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasDrop } from './useCanvasDrop'

const mockPaletteNode: PaletteNodeItem = {
  type: 'llm-agent',
  label: 'LLM Agent',
  category: 'agent',
  icon: 'Bot',
  description: '大语言模型 Agent 节点',
}

const mockMcpPaletteNode: PaletteNodeItem = {
  type: 'mcp-tool',
  label: 'Test MCP Tool',
  category: 'tool',
  icon: 'Plug',
  description: 'A test MCP tool',
  mcpToolDefinitionId: 'mcp-tool-def-456',
  inputPorts: [
    {
      id: 'mcp-in',
      label: 'Query',
      direction: 'input' as const,
      dataType: 'text' as const,
      required: false,
      multiple: false,
      maxConnections: 1,
      schema: { kind: 'text' as const, title: 'Query' },
    },
  ],
  outputPorts: [
    {
      id: 'mcp-out',
      label: 'Response',
      direction: 'output' as const,
      dataType: 'json' as const,
      required: false,
      multiple: false,
      maxConnections: 1,
      schema: {
        kind: 'json' as const,
        shape: 'object' as const,
        title: 'Response',
        properties: {},
        additionalProperties: true,
      },
    },
  ],
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
}

describe('useCanvasDrop', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
  })

  it('应该使用节点分类作为 React Flow type 创建节点', () => {
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
    expect(state.nodes[0]?.data.nodeType).toBe('llm-agent')
    expect(state.nodes[0]?.data.inputPorts.length).toBeGreaterThan(0)
    expect(state.nodes[0]?.data.outputPorts.length).toBeGreaterThan(0)
    expect(state.nodes[0]?.data.config).toBeDefined()
    expect(state.isDirty).toBe(true)
  })

  it('MCP ツール drop には動的 inputPorts が含まれる', () => {
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
    expect(state.nodes[0]?.data.inputPorts).toHaveLength(1)
    expect(state.nodes[0]?.data.inputPorts[0]?.id).toBe('mcp-in')
    expect(state.nodes[0]?.data.outputPorts).toHaveLength(1)
    expect(state.nodes[0]?.data.outputPorts[0]?.id).toBe('mcp-out')
  })

  it('MCP ツール drop には mcpToolDefinitionId が含まれる', () => {
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
    expect(state.nodes[0]?.data.mcpToolDefinitionId).toBe('mcp-tool-def-456')
  })

  it('MCP ツール drop には config.inputSchema が含まれる', () => {
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
    expect(state.nodes[0]?.data.config).toEqual({
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    })
  })
})
