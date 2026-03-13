import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TypeEngineServiceLike } from '../lib/typeEngine/contracts'
import { setTypeEngineServiceForTesting } from '../lib/typeEngine/service'
import { useCanvasStore } from '../stores/canvasStore'
import { createDefaultEdgeData } from '../types'
import type { CanvasEdge, CanvasNode } from '../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { WorkflowCanvas } from './WorkflowCanvas'

let capturedProps: Record<string, unknown> = {}
const notifyMock = vi.fn()
const fitViewMock = vi.fn()
const evaluateCompatibilityMock = vi.fn()
const getCachedCompatibilityMock = vi.fn()

const mockTypeEngineService: TypeEngineServiceLike = {
  warmup: vi.fn(async () => undefined),
  getCachedCompatibility: (sourcePort, targetPort) =>
    getCachedCompatibilityMock(sourcePort, targetPort),
  evaluateCompatibility: (sourcePort, targetPort, context) =>
    evaluateCompatibilityMock(sourcePort, targetPort, context),
  getRuntimeState: () => ({
    wasmReady: true,
    workerBusy: false,
    lastError: null,
  }),
}

function deferred<T>() {
  let resolve: ((value: T) => void) | null = null
  let reject: ((reason?: unknown) => void) | null = null
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve(value: T) {
      resolve?.(value)
    },
    reject(reason?: unknown) {
      reject?.(reason)
    },
  }
}

const exactCompatibility = {
  level: 'EXACT' as const,
  reason: null,
  missingFields: [],
  candidateMappings: [],
  conflictPath: null,
  transformFn: null,
  metadata: {},
}

const incompatibleCompatibility = {
  level: 'INCOMPATIBLE' as const,
  reason: 'type_mismatch_no_transform',
  missingFields: [],
  candidateMappings: [],
  conflictPath: 'root.kind',
  transformFn: null,
  metadata: {},
}

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

const mixedTargetNodes: CanvasNode[] = [
  compatibleNodes[0]!,
  compatibleNodes[1]!,
  {
    id: 'n-3',
    type: 'agent',
    position: { x: 320, y: 180 },
    data: {
      label: 'Model Target',
      nodeType: 'llm-agent',
      category: 'agent',
      config: {},
      inputPorts: [
        {
          id: 'model-input',
          label: 'Model',
          direction: 'input',
          dataType: 'model',
          required: true,
          multiple: false,
          maxConnections: null,
          schema: { kind: 'model' },
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

    const nodes = Array.isArray(props.nodes) ? (props.nodes as CanvasNode[]) : []

    return (
      <div data-testid="react-flow">
        {nodes.map((node) => (
          <div key={node.id} data-testid={`node-${node.id}`}>
            {node.data.inputPorts.map((port) => (
              <button
                key={`${node.id}-${port.id}-input`}
                type="button"
                data-testid={`handle-${node.id}-${port.id}-input`}
                data-node-id={node.id}
                data-port-id={port.id}
                data-port-direction="input"
              />
            ))}
            {node.data.outputPorts.map((port) => (
              <button
                key={`${node.id}-${port.id}-output`}
                type="button"
                data-testid={`handle-${node.id}-${port.id}-output`}
                data-node-id={node.id}
                data-port-id={port.id}
                data-port-direction="output"
              />
            ))}
          </div>
        ))}
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
        {props.children as ReactNode}
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
    evaluateCompatibilityMock.mockReset()
    getCachedCompatibilityMock.mockReset()
    setTypeEngineServiceForTesting(mockTypeEngineService)
  })

  it('注册了 smart edge 类型', () => {
    render(<WorkflowCanvas />)
    const edgeTypes = capturedProps.edgeTypes as Record<string, unknown>
    expect(edgeTypes).toBeDefined()
    expect(edgeTypes).toHaveProperty('smart')
  })

  it('点击边时打开字段映射面板并选中边', () => {
    render(<WorkflowCanvas />)
    fireEvent.click(screen.getByTestId('trigger-edge-click'))
    expect(useCanvasStore.getState().selectedEdgeId).toBe('e-1')
    expect(useCanvasStore.getState().mappingPanelEdgeId).toBe('e-1')
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

  it('注册了连接生命周期处理器', () => {
    render(<WorkflowCanvas />)
    expect(typeof capturedProps.onConnect).toBe('function')
    expect(typeof capturedProps.isValidConnection).toBe('function')
    expect(typeof capturedProps.onConnectStart).toBe('function')
    expect(typeof capturedProps.onConnectEnd).toBe('function')
  })

  it('isValidConnection 只使用同步 guard 与缓存，不触发异步权威检查', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: compatibleNodes,
      edges: [],
    }))

    render(<WorkflowCanvas />)

    const isValidConnection = capturedProps.isValidConnection as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => boolean

    expect(
      isValidConnection({
        source: 'n-1',
        target: 'n-2',
        sourceHandle: 'result',
        targetHandle: 'input',
      }),
    ).toBe(true)
    expect(evaluateCompatibilityMock).not.toHaveBeenCalled()

    getCachedCompatibilityMock.mockReturnValue(incompatibleCompatibility)

    expect(
      isValidConnection({
        source: 'n-1',
        target: 'n-2',
        sourceHandle: 'result',
        targetHandle: 'input',
      }),
    ).toBe(false)
    expect(evaluateCompatibilityMock).not.toHaveBeenCalled()
  })

  it('onConnectStart 先进入 checking，再异步分类兼容/不兼容目标', async () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: mixedTargetNodes,
      edges: [],
    }))

    evaluateCompatibilityMock.mockImplementation((_sourcePort, targetPort) => {
      if (targetPort.id === 'input') {
        return Promise.resolve(exactCompatibility)
      }

      return Promise.resolve(incompatibleCompatibility)
    })

    render(<WorkflowCanvas />)

    const onConnectStart = capturedProps.onConnectStart as (
      event: MouseEvent,
      params: { handleType: 'source'; nodeId: string; handleId: string },
    ) => void

    act(() => {
      onConnectStart(new MouseEvent('mousedown', { clientX: 80, clientY: 80 }), {
        handleType: 'source',
        nodeId: 'n-1',
        handleId: 'result',
      })
    })

    expect(screen.getByTestId('compatibility-preview')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent('检查中...')

    await waitFor(() => {
      const overlay = screen.getByTestId('connection-overlay')
      expect(overlay.querySelectorAll('.connection-overlay__halo--compatible')).toHaveLength(1)
      expect(overlay.querySelectorAll('.connection-overlay__halo--incompatible')).toHaveLength(1)
    })
  })

  it('丢弃过期的 connect-start 异步结果，避免覆盖已结束的拖拽状态', async () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: mixedTargetNodes,
      edges: [],
    }))

    const pending = deferred<typeof exactCompatibility>()
    evaluateCompatibilityMock.mockReturnValue(pending.promise)

    render(<WorkflowCanvas />)

    const onConnectStart = capturedProps.onConnectStart as (
      event: MouseEvent,
      params: { handleType: 'source'; nodeId: string; handleId: string },
    ) => void
    const onConnectEnd = capturedProps.onConnectEnd as () => void

    act(() => {
      onConnectStart(new MouseEvent('mousedown', { clientX: 80, clientY: 80 }), {
        handleType: 'source',
        nodeId: 'n-1',
        handleId: 'result',
      })
      onConnectEnd()
    })

    await act(async () => {
      pending.resolve(exactCompatibility)
      await pending.promise
    })

    expect(screen.queryByTestId('connection-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('compatibility-preview')).toHaveAttribute('aria-hidden', 'true')
  })

  it('onConnect 仅在最终兼容数据返回后才创建边，且不会持久化 checking', async () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: compatibleNodes,
      edges: [],
    }))

    const pending = deferred<typeof exactCompatibility>()
    evaluateCompatibilityMock.mockReturnValue(pending.promise)

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => Promise<void>

    const connectPromise = onConnect({
      source: 'n-1',
      target: 'n-2',
      sourceHandle: 'result',
      targetHandle: 'input',
    })

    expect(useCanvasStore.getState().edges).toHaveLength(0)

    pending.resolve(exactCompatibility)
    await act(async () => {
      await connectPromise
    })

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]).toMatchObject({
      type: 'smart',
      source: 'n-1',
      target: 'n-2',
      sourceHandle: 'result',
      targetHandle: 'input',
      data: expect.objectContaining({
        rawCompatibilityLevel: 'EXACT',
        visualLevel: 'L0',
      }),
    })
    expect(state.edges[0]?.data?.visualLevel).not.toBe('checking')
  })

  it('onConnect 在 uncached 不兼容时会提示明确原因且不创建边', async () => {
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: compatibleNodes,
      edges: [],
    }))

    evaluateCompatibilityMock.mockResolvedValue(incompatibleCompatibility)

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => Promise<void>

    await act(async () => {
      await onConnect({
        source: 'n-1',
        target: 'n-2',
        sourceHandle: 'result',
        targetHandle: 'input',
      })
    })

    expect(useCanvasStore.getState().edges).toHaveLength(0)
    expect(notifyMock).toHaveBeenCalledWith({
      description: '无法创建连接：当前端口类型不兼容，且没有可用转换',
      variant: 'error',
    })
  })

  it('在创建前阻止循环依赖连线并提示固定错误文案', async () => {
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
          sourceHandle: 'structured-output',
          targetHandle: 'context',
          data: createDefaultEdgeData(),
        },
      ],
    }))

    evaluateCompatibilityMock.mockResolvedValue(exactCompatibility)

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => Promise<void>

    await act(async () => {
      await onConnect({
        source: 'b',
        target: 'a',
        sourceHandle: 'structured-output',
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

  it('超过并行路径建议上限时只告警不阻止创建', async () => {
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
        sourceHandle: 'final-output',
        targetHandle: 'content',
        data: createDefaultEdgeData(),
      })),
    }))

    evaluateCompatibilityMock.mockResolvedValue(exactCompatibility)

    render(<WorkflowCanvas />)

    const onConnect = capturedProps.onConnect as (connection: {
      source: string
      target: string
      sourceHandle: string
      targetHandle: string
    }) => Promise<void>

    await act(async () => {
      await onConnect({
        source: 'hub',
        target: 'target-10',
        sourceHandle: 'final-output',
        targetHandle: 'content',
      })
    })

    expect(useCanvasStore.getState().edges).toHaveLength(11)
    expect(notifyMock).toHaveBeenCalledWith({
      description: '并行路径数量（11）超过建议上限（10），可能影响执行性能',
      variant: 'warning',
    })
  })

  it('Ctrl+F 会打开画布搜索', () => {
    render(<WorkflowCanvas />)

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

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
})
