import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import { createDefaultEdgeData } from '../types'
import type { CanvasNode, CanvasEdge } from '../types'
import { WorkflowCanvas } from './WorkflowCanvas'

let capturedProps: Record<string, unknown> = {}

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

vi.mock('@xyflow/react', () => {
  function MockReactFlow(props: Record<string, unknown>) {
    capturedProps = props
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
    useReactFlow: () => ({ screenToFlowPosition: vi.fn() }),
  }
})

vi.mock('../hooks/useCanvasDrop', () => ({
  useCanvasDrop: () => ({
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
  }),
}))

describe('WorkflowCanvas', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    capturedProps = {}
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
})
