import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactFlowInstance } from '@xyflow/react'
import type { CanvasEdge, CanvasNode, PaletteNodeItem } from '../types'
import { useCanvasStore } from '../stores/canvasStore'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasDrop } from './useCanvasDrop'

const blockLibraryMocks = vi.hoisted(() => ({
  fetchBlockById: vi.fn(),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({
    notify: vi.fn(),
  }),
}))

vi.mock('@/features/block-library', () => ({
  fetchBlockById: blockLibraryMocks.fetchBlockById,
}))

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

const mockPluginPaletteNode: PaletteNodeItem = {
  type: 'plugin',
  label: 'Text to Uppercase QA',
  category: 'plugin',
  icon: 'Puzzle',
  description: '将输入文本转换为大写',
  pluginId: 'com.example.uppercase',
  pluginName: 'Uppercase Plugin',
  pluginVersion: '1.0.1',
  pluginNodeType: 'uppercase-node',
  pluginConfigSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        title: '前缀',
      },
    },
    required: [],
  },
  inputPorts: [
    {
      id: 'text-in',
      label: '输入文本',
      direction: 'input',
      dataType: 'text',
      required: true,
      multiple: false,
      maxConnections: 1,
      schema: {
        kind: 'text',
        title: '输入文本',
      },
    },
  ],
  outputPorts: [
    {
      id: 'text-out',
      label: '输出文本',
      direction: 'output',
      dataType: 'text',
      required: false,
      multiple: false,
      maxConnections: 1,
      schema: {
        kind: 'text',
        title: '输出文本',
      },
    },
  ],
}

const mockReusableBlockPaletteNode: PaletteNodeItem = {
  type: 'reusable-block',
  label: 'QA Imported Block 20260405-A',
  category: 'control',
  icon: 'Package2',
  description: '最小可复用块',
  blockId: 'block-1',
}

describe('useCanvasDrop', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    blockLibraryMocks.fetchBlockById.mockReset()
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
          getData: (type: string) => (type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockPaletteNode) : ''),
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
          getData: (type: string) => (type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockMcpPaletteNode) : ''),
        },
      } as unknown as React.DragEvent)
    })

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]?.data.nodeType).toBe('mcp-tool')
    expect(state.nodes[0]?.data.outputPorts.length).toBeGreaterThan(0)
    expect(
      state.nodes[0]?.data.outputPorts.some((port) => port.dataType === 'tool'),
    ).toBe(true)
  })

  it('plugin drop 会保留插件元数据与动态端口定义', () => {
    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 320, y: 220 })),
    } as Pick<
      ReactFlowInstance<CanvasNode, CanvasEdge>,
      'screenToFlowPosition'
    > as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 320,
        clientY: 220,
        dataTransfer: {
          getData: (type: string) =>
            type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockPluginPaletteNode) : '',
        },
      } as unknown as React.DragEvent)
    })

    const node = useCanvasStore.getState().nodes[0]

    expect(node?.data).toMatchObject({
      nodeType: 'plugin',
      pluginId: 'com.example.uppercase',
      pluginName: 'Uppercase Plugin',
      pluginVersion: '1.0.1',
      pluginNodeType: 'uppercase-node',
      pluginConfigSchema: {
        type: 'object',
      },
      pluginConfig: {},
    })
    expect(node?.data.inputPorts[0]?.id).toBe('text-in')
    expect(node?.data.outputPorts[0]?.id).toBe('text-out')
  })

  it('reusable-block drop 会拉取块详情并写入 blockDefinition 与动态端口', async () => {
    blockLibraryMocks.fetchBlockById.mockResolvedValue({
      id: 'block-1',
      name: 'QA Imported Block 20260405-A',
      description: '最小可复用块',
      category: 'automation',
      tags: ['qa'],
      metadata: { nodeCount: 1, version: 1 },
      version: 1,
      isPublished: false,
      createdAt: '2026-04-04T20:00:00.000Z',
      updatedAt: '2026-04-04T20:00:00.000Z',
      createdBy: 'user-1',
      definition: {
        nodes: [{ id: 'inner-1', data: { label: 'Inner Node' } }],
        edges: [],
        inputPorts: [
          {
            id: 'block-in-1',
            label: '输入文本',
            dataType: 'text',
            sourceNodeId: 'inner-1',
            sourcePortId: 'text-in',
          },
        ],
        outputPorts: [
          {
            id: 'block-out-1',
            label: '输出文本',
            dataType: 'text',
            sourceNodeId: 'inner-1',
            sourcePortId: 'text-out',
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 480, y: 260 })),
    } as Pick<
      ReactFlowInstance<CanvasNode, CanvasEdge>,
      'screenToFlowPosition'
    > as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    await act(async () => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 480,
        clientY: 260,
        dataTransfer: {
          getData: (type: string) =>
            type === DRAG_TRANSFER_TYPE
              ? JSON.stringify(mockReusableBlockPaletteNode)
              : '',
        },
      } as unknown as React.DragEvent)

      await Promise.resolve()
    })

    expect(blockLibraryMocks.fetchBlockById).toHaveBeenCalledWith('block-1')

    const node = useCanvasStore.getState().nodes[0]
    expect(node?.data).toMatchObject({
      nodeType: 'reusable-block',
      blockId: 'block-1',
      blockName: 'QA Imported Block 20260405-A',
      isExpanded: false,
      blockDefinition: {
        nodes: [{ id: 'inner-1' }],
      },
    })
    expect(node?.data.inputPorts[0]?.id).toBe('block-in-1')
    expect(node?.data.outputPorts[0]?.id).toBe('block-out-1')
  })

  it('会把 compound 内拖入节点限制到可见循环体内框里', () => {
    useCanvasStore.getState().actions.addNode({
      id: 'loop-1',
      nodeType: 'loop',
      category: 'control',
      position: { x: 100, y: 100 },
      label: 'Loop',
    })

    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 110, y: 110 })),
    } as Pick<ReactFlowInstance<CanvasNode, CanvasEdge>, 'screenToFlowPosition'> as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 110,
        clientY: 110,
        dataTransfer: {
          getData: (type: string) => (type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockPaletteNode) : ''),
        },
      } as unknown as React.DragEvent)
    })

    const childNode = useCanvasStore.getState().nodes.find((node) => node.parentId === 'loop-1' && node.data.nodeType === 'chat-agent')

    expect(childNode).toBeDefined()
    expect(Array.isArray(childNode?.extent)).toBe(true)
    expect(childNode?.expandParent).toBe(false)

    const extent = childNode?.extent
    if (!Array.isArray(extent)) {
      throw new Error('Expected compound child extent to be an array extent')
    }

    expect(childNode?.position).toEqual({
      x: extent[0][0],
      y: extent[0][1],
    })
    expect(extent[1][1] - extent[0][1]).toBeGreaterThanOrEqual(80)
  })

  it('resize 后解析 compound 父容器时会优先使用 live width/height', () => {
    useCanvasStore.getState().actions.addNode({
      id: 'loop-1',
      nodeType: 'loop',
      category: 'control',
      position: { x: 100, y: 100 },
      label: 'Loop',
    })

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === 'loop-1'
          ? {
              ...node,
              style: {
                ...(node.style ?? {}),
                width: 600,
                height: 540,
              },
              width: 900,
              height: 700,
              measured: {
                width: 900,
                height: 700,
              },
            }
          : node,
      ),
    }))

    const reactFlowInstance = {
      screenToFlowPosition: vi.fn(() => ({ x: 850, y: 200 })),
    } as Pick<ReactFlowInstance<CanvasNode, CanvasEdge>, 'screenToFlowPosition'> as ReactFlowInstance<CanvasNode, CanvasEdge>

    const { result } = renderHook(() => useCanvasDrop(reactFlowInstance))

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        clientX: 850,
        clientY: 200,
        dataTransfer: {
          getData: (type: string) => (type === DRAG_TRANSFER_TYPE ? JSON.stringify(mockPaletteNode) : ''),
        },
      } as unknown as React.DragEvent)
    })

    const childNode = useCanvasStore.getState().nodes.find((node) => node.parentId === 'loop-1' && node.data.nodeType === 'chat-agent')

    expect(childNode).toBeDefined()
    expect(childNode?.parentId).toBe('loop-1')
  })
})
