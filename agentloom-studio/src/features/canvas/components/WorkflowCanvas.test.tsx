import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import { createDefaultEdgeData } from '../types'
import type { CanvasNode, CanvasEdge } from '../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { WorkflowCanvas } from './WorkflowCanvas'

let capturedProps: Record<string, unknown> = {}
const notifyMock = vi.fn()
const fitViewMock = vi.fn()

const compatibleNodes: CanvasNode[] = [
  {
    id: 'n-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Source',
      nodeType: 'llm-agent',
      category: 'agent',
      config: {},
      inputPorts: [],
      outputPorts: [
        {
          id: 'result',
          label: 'Result',
          direction: 'output',
          dataType: 'text',
          required: false,
          multiple: false,
          maxConnections: null,
          schema: { kind: 'text' },
        },
      ],
    },
  },
  {
    id: 'n-2',
    type: 'tool',
    position: { x: 320, y: 0 },
    data: {
      label: 'Target',
      nodeType: 'http-tool',
      category: 'tool',
      config: {},
      inputPorts: [
        {
          id: 'input',
          label: 'Input',
          direction: 'input',
          dataType: 'text',
          required: true,
          multiple: false,
          maxConnections: null,
          schema: { kind: 'text' },
        },
      ],
      outputPorts: [],
    },
  },
]

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

vi.mock('@xyflow/react', () => {
  function MockReactFlow(props: Record<string, unknown>) {
    useEffect(() => {
      capturedProps = props
    }, [props])

    return (
      <div data-testid="react-flow">
        <button
          type="button"
          data-testid="trigger-edge-click"
          onClick={() => {
            const handler = props.onEdgeClick as (event: unknown, edge: CanvasEdge) => void
            handler?.({}, { id: 'e-1', source: 'n-1', target: 'n-2', data: createDefaultEdgeData() } as CanvasEdge)
          }}
        />
        <button
          type="button"
          data-testid="trigger-pane-click"
          onClick={() => {
            const handler = props.onPaneClick as () => void
            handler?.()
          }}
        />
        <button
          type="button"
          data-testid="trigger-node-click"
          onClick={() => {
            const handler = props.onNodeClick as (event: unknown, node: CanvasNode) => void
            handler?.({}, { id: 'n-1' } as CanvasNode)
          }}
        />
      </div>
    )
  }
  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: MockReactFlow,
    useReactFlow: () => ({ screenToFlowPosition: vi.fn(), getNode: vi.fn(), fitView: fitViewMock }),
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  }
})

vi.mock('../hooks/useCanvasDrop', () => ({
  useCanvasDrop: () => ({
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

describe('WorkflowCanvas', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    capturedProps = {}
    notifyMock.mockReset()
    fitViewMock.mockReset()
  })

  it('注册了 smart edge 类型', () => {
    render(<WorkflowCanvas />)
    const edgeTypes = capturedProps.edgeTypes as Record<string, unknown>
    expect(edgeTypes).toBeDefined()
    expect(edgeTypes).toHaveProperty('smart')
  })

  it('defaultEdgeOptions 使用 smart 类型', () => {
    render(<WorkflowCanvas />)
    expect(capturedProps.defaultEdgeOptions).toEqual({ type: 'smart' })
  })

  it('点击边时选中对应边', () => {
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-edge-click'))
    expect(useCanvasStore.getState().selectedEdgeId).toBe('e-1')
  })

  it('点击边时打开字段映射面板', () => {
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-edge-click'))
    expect(useCanvasStore.getState().mappingPanelEdgeId).toBe('e-1')
  })

  it('点击边时清除选中的节点', () => {
    useCanvasStore.setState({ selectedNodeId: 'n-1' })
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-edge-click'))
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    expect(useCanvasStore.getState().selectedEdgeId).toBe('e-1')
  })

  it('点击画布空白处清除边和节点选中', () => {
    useCanvasStore.setState({ selectedEdgeId: 'e-1', selectedNodeId: 'n-1' })
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-pane-click'))
    expect(useCanvasStore.getState().selectedEdgeId).toBeNull()
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
  })

  it('点击节点时选中节点并清除边选中', () => {
    useCanvasStore.setState({ selectedEdgeId: 'e-1' })
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-node-click'))
    expect(useCanvasStore.getState().selectedNodeId).toBe('n-1')
    expect(useCanvasStore.getState().selectedEdgeId).toBeNull()
  })

  it('传递了 nodes 和 edges 到 ReactFlow', () => {
    render(<WorkflowCanvas />)
    expect(capturedProps.nodes).toBeDefined()
    expect(capturedProps.edges).toBeDefined()
    expect(Array.isArray(capturedProps.nodes)).toBe(true)
    expect(Array.isArray(capturedProps.edges)).toBe(true)
  })

  it('注册了连接生命周期处理器', () => {
    render(<WorkflowCanvas />)
    expect(typeof capturedProps.onConnect).toBe('function')
    expect(typeof capturedProps.isValidConnection).toBe('function')
    expect(typeof capturedProps.onConnectStart).toBe('function')
    expect(typeof capturedProps.onConnectEnd).toBe('function')
  })

  it('onConnect 会持久化兼容连线', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: compatibleNodes,
      edges: [],
    }))

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => void

    act(() => {
      onConnect({
        source: 'n-1',
        target: 'n-2',
        sourceHandle: 'result',
        targetHandle: 'input',
      })
    })

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]).toMatchObject({
      type: 'smart',
      source: 'n-1',
      target: 'n-2',
      sourceHandle: 'result',
      targetHandle: 'input',
    })
  })

  it('Ctrl+F 会打开画布搜索', () => {
    render(<WorkflowCanvas />)

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

    expect(useCanvasStore.getState().isSearchOpen).toBe(true)
    expect(screen.getByTestId('canvas-search')).toBeInTheDocument()
  })

  it('在画布容器内按 Ctrl+F 时不会因为重复监听而立即关闭搜索', () => {
    render(<WorkflowCanvas />)

    const canvasContainer = screen.getByTestId('react-flow').parentElement
    expect(canvasContainer).not.toBeNull()

    fireEvent.keyDown(canvasContainer as HTMLElement, { key: 'f', ctrlKey: true })

    expect(useCanvasStore.getState().isSearchOpen).toBe(true)
    expect(screen.getByTestId('canvas-search')).toBeInTheDocument()
  })

  it('在画布容器内按 Delete 时只会触发一次删除动作', () => {
    const originalDeleteSelectedNode = useCanvasStore.getState().actions.deleteSelectedNode
    const deleteSelectedNodeSpy = vi.fn(() => {
      originalDeleteSelectedNode()
    })

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: compatibleNodes,
      selectedNodeId: 'n-1',
      actions: {
        ...state.actions,
        deleteSelectedNode: deleteSelectedNodeSpy,
      },
    }))

    const { unmount } = render(<WorkflowCanvas />)

    const canvasContainer = screen.getByTestId('react-flow').parentElement
    expect(canvasContainer).not.toBeNull()

    act(() => {
      fireEvent.keyDown(canvasContainer as HTMLElement, { key: 'Delete' })
    })

    expect(deleteSelectedNodeSpy).toHaveBeenCalledTimes(1)
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()

    unmount()

    useCanvasStore.setState((state) => ({
      ...state,
      actions: {
        ...state.actions,
        deleteSelectedNode: originalDeleteSelectedNode,
      },
    }))
  })

  it('在创建前阻止循环依赖连线并提示固定错误文案', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const nodeA = createNode('a', 'llm-agent')
    const nodeB = createNode('b', 'llm-agent')

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [nodeA, nodeB],
      edges: [
        {
          id: 'edge-a-b',
          type: 'smart',
          source: 'a',
          target: 'b',
          sourceHandle: 'structured',
          targetHandle: 'context',
          data: createDefaultEdgeData(),
        },
      ],
    }))

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => void

    act(() => {
      onConnect({
        source: 'b',
        target: 'a',
        sourceHandle: 'structured',
        targetHandle: 'context',
      })
    })

    expect(useCanvasStore.getState().edges).toHaveLength(1)
    expect(notifyMock).toHaveBeenCalledWith({
      description: '无法创建连接：检测到循环依赖',
      variant: 'error',
    })
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('超过并行路径建议上限时只告警不阻止创建', () => {
    const hub = createNode('hub', 'llm-agent')
    const existingTargets = Array.from({ length: 10 }, (_, index) => createNode(`target-${index}`, 'text-output'))
    const nextTarget = createNode('target-10', 'text-output')

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [hub, ...existingTargets, nextTarget],
      edges: existingTargets.map((target, index) => ({
        id: `edge-${index}`,
        type: 'smart',
        source: 'hub',
        target: target.id,
        sourceHandle: 'result',
        targetHandle: 'content',
        data: createDefaultEdgeData(),
      })),
    }))

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => void

    act(() => {
      onConnect({
        source: 'hub',
        target: 'target-10',
        sourceHandle: 'result',
        targetHandle: 'content',
      })
    })

    expect(useCanvasStore.getState().edges).toHaveLength(11)
    expect(notifyMock).toHaveBeenCalledWith({
      description: '并行路径数量（11）超过建议上限（10），可能影响执行性能',
      variant: 'warning',
    })
  })
})
