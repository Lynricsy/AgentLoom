import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Position } from '@xyflow/react'

import { useEvidenceGraph } from '../../api/evidenceQueries'
import {
  useEvidenceUiStore,
  type EvidenceUiActions,
  type EvidenceUiState,
} from '../../stores/evidenceUiStore'
import type {
  EvidenceGraphResponse,
  GraphTimelineEntry,
} from '../../types'
import {
  AgentGraphEdge,
  type AgentGraphEdgeFlowData,
  type AgentGraphFlowEdge,
} from '../AgentGraphEdge'
import {
  AgentGraphNode,
  type AgentGraphFlowNode,
  type AgentGraphNodeFlowData,
} from '../AgentGraphNode'
import { EvidenceGraphControls } from '../EvidenceGraphControls'
import { EvidenceGraphView } from '../EvidenceGraphView'
import { GraphTimelinePlayer } from '../GraphTimelinePlayer'

let capturedReactFlowProps: Record<string, unknown> = {}
let mockNodesState: AgentGraphFlowNode[] = []
let mockEdgesState: AgentGraphFlowEdge[] = []

const mockSetNodes = vi.fn()
const mockOnNodesChange = vi.fn()
const mockSetEdges = vi.fn()
const mockOnEdgesChange = vi.fn()
const mockFitView = vi.fn()
const mockRefetch = vi.fn().mockResolvedValue({ data: undefined })
const mockOpenPanel = vi.fn()
const mockSetGraphSelectedNodeId = vi.fn()

vi.mock('lucide-react', () => ({
  Bot: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-bot" {...props} />
  ),
  Globe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-globe" {...props} />
  ),
  Wrench: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-wrench" {...props} />
  ),
  GitBranch: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-git-branch" {...props} />
  ),
  FileText: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-file-text" {...props} />
  ),
  Workflow: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-workflow" {...props} />
  ),
  Pause: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-pause" {...props} />
  ),
  Play: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-play" {...props} />
  ),
  RotateCcw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-reset" {...props} />
  ),
  Maximize: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-maximize" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert-circle" {...props} />
  ),
}))

vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  BaseEdge: ({ id, path }: { id: string; path: string }) => (
    <path data-testid={`edge-${id}`} d={path} />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <foreignObject>{children}</foreignObject>
  ),
  getBezierPath: () => ['M0,0 L100,100', 50, 50],
  ReactFlow: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
    capturedReactFlowProps = props
    return (
      <div
        data-testid="react-flow"
        data-nodes={Array.isArray(props.nodes) ? props.nodes.length : 0}
        data-edges={Array.isArray(props.edges) ? props.edges.length : 0}
      >
        {children}
      </div>
    )
  },
  useNodesState: vi.fn(() => [mockNodesState, mockSetNodes, mockOnNodesChange]),
  useEdgesState: vi.fn(() => [mockEdgesState, mockSetEdges, mockOnEdgesChange]),
  useReactFlow: vi.fn(() => ({ fitView: mockFitView })),
  Background: () => null,
}))

vi.mock('../../api/evidenceQueries', () => ({
  useEvidenceGraph: vi.fn(),
}))

vi.mock('../../stores/evidenceUiStore', () => ({
  useEvidenceUiStore: vi.fn(),
}))

vi.mock('@dagrejs/dagre', () => {
  class MockGraph {
    private nodeOrder: string[] = []

    setDefaultEdgeLabel() {
      return this
    }

    setGraph() {
      return this
    }

    setNode(id: string) {
      if (!this.nodeOrder.includes(id)) {
        this.nodeOrder.push(id)
      }
      return this
    }

    setEdge() {
      return this
    }

    node(id: string) {
      const index = this.nodeOrder.indexOf(id)
      return {
        x: 200 + Math.max(index, 0) * 240,
        y: 100 + Math.max(index, 0) * 140,
      }
    }
  }

  return {
    default: {
      graphlib: { Graph: MockGraph },
      layout: vi.fn(),
    },
  }
})

vi.mock('d3-force', () => ({
  forceSimulation: (
    nodes: Array<{
      id: string
      x?: number
      y?: number
    }>,
  ) => {
    nodes.forEach((node, index) => {
      node.x = 100 + index * 180
      node.y = 80 + index * 120
    })

    const simulation = {
      force: vi.fn(() => simulation),
      stop: vi.fn(() => simulation),
      tick: vi.fn(() => simulation),
    }

    return simulation
  },
  forceLink: () => {
    const linkForce = {
      id: vi.fn(() => linkForce),
    }

    return linkForce
  },
  forceManyBody: () => {
    const chargeForce = {
      strength: vi.fn(() => chargeForce),
    }

    return chargeForce
  },
  forceCenter: () => ({}),
  forceCollide: () => ({}),
}))

function createTimelineEntry(
  overrides: Partial<GraphTimelineEntry> = {},
): GraphTimelineEntry {
  return {
    timestamp: '2026-03-14T10:00:00.000Z',
    type: 'node',
    targetId: 'graph-node-1',
    label: '节点开始执行',
    ...overrides,
  }
}

function createGraphData(
  overrides: Partial<EvidenceGraphResponse> = {},
): EvidenceGraphResponse {
  return {
    nodes: [
      {
        id: 'graph-node-1',
        nodeId: 'node-1',
        nodeName: '起始节点',
        nodeType: 'chat-agent',
        executionStatus: 'completed',
        evidenceCount: 2,
        firstEvidenceAt: null,
        lastEvidenceAt: null,
      },
      {
        id: 'graph-node-2',
        nodeId: 'node-2',
        nodeName: '请求工具',
        nodeType: 'http-tool',
        executionStatus: 'running',
        evidenceCount: 1,
        firstEvidenceAt: null,
        lastEvidenceAt: null,
      },
    ],
    edges: [
      {
        id: 'graph-edge-1',
        sourceNodeId: 'graph-node-1',
        targetNodeId: 'graph-node-2',
        evidenceLinks: 3,
        dataTypeSummary: 'text → json',
      },
    ],
    timeline: [createTimelineEntry()],
    ...overrides,
  }
}

function createFlowNode(
  overrides: Partial<AgentGraphFlowNode> = {},
): AgentGraphFlowNode {
  return {
    id: 'graph-node-1',
    type: 'agentGraphNode',
    position: { x: 0, y: 0 },
    data: {
      id: 'graph-node-1',
      nodeId: 'node-1',
      nodeName: '起始节点',
      nodeType: 'chat-agent',
      executionStatus: 'completed',
      evidenceCount: 2,
      firstEvidenceAt: null,
      lastEvidenceAt: null,
      isHighlighted: false,
    },
    ...overrides,
  }
}

function createFlowEdge(
  overrides: Partial<AgentGraphFlowEdge> = {},
): AgentGraphFlowEdge {
  return {
    id: 'graph-edge-1',
    source: 'graph-node-1',
    target: 'graph-node-2',
    type: 'agentGraphEdge',
    data: {
      id: 'graph-edge-1',
      sourceNodeId: 'graph-node-1',
      targetNodeId: 'graph-node-2',
      sourceNodeName: '起始节点',
      targetNodeName: '请求工具',
      evidenceLinks: 3,
      dataTypeSummary: 'text → json',
      isHighlighted: false,
    },
    ...overrides,
  }
}

function renderNode(data: Partial<AgentGraphNodeFlowData>, selected = false) {
  const props = {
    id: 'node-1',
    data: {
      id: 'g-1',
      nodeId: 'n-1',
      nodeName: 'Test Node',
      nodeType: 'chat-agent',
      executionStatus: 'completed',
      evidenceCount: 3,
      firstEvidenceAt: null,
      lastEvidenceAt: null,
      isHighlighted: false,
      ...data,
    },
    selected,
    type: 'agentGraphNode',
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    xPos: 0,
    yPos: 0,
  }

  return render(<AgentGraphNode {...props} />)
}

function renderEdge(
  data: Partial<AgentGraphEdgeFlowData> = {},
  selected = false,
) {
  return render(
    <svg aria-label="agent-graph-edge-test">
      <title>agent-graph-edge-test</title>
      <AgentGraphEdge
        id="edge-1"
        source="graph-node-1"
        target="graph-node-2"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        selected={selected}
        data={{
          id: 'edge-1',
          sourceNodeId: 'graph-node-1',
          targetNodeId: 'graph-node-2',
          sourceNodeName: '起始节点',
          targetNodeName: '请求工具',
          evidenceLinks: 3,
          dataTypeSummary: 'text → json',
          isHighlighted: false,
          ...data,
        }}
      />
    </svg>,
  )
}

describe('EvidenceGraph components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    capturedReactFlowProps = {}
    mockNodesState = []
    mockEdgesState = []

    mockRefetch.mockResolvedValue({ data: undefined })

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    vi.mocked(useEvidenceGraph).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    vi.mocked(useEvidenceUiStore).mockImplementation(
      (selector) => {
        const store: EvidenceUiState & EvidenceUiActions = {
          isOpen: false,
          panelExecutionId: null,
          panelNodeId: null,
          panelNodeName: null,
          selectedEvidenceId: null,
          highlightedEvidenceId: null,
          highlightUntil: null,
          documentViewer: null,
          graphSelectedNodeId: null,
          actions: {
            openPanel: mockOpenPanel,
            closePanel: vi.fn(),
            selectEvidence: vi.fn(),
            openDocumentViewer: vi.fn(),
            closeDocumentViewer: vi.fn(),
            openFromPhysicalLocation: vi.fn(),
            clearHighlight: vi.fn(),
            reset: vi.fn(),
            setGraphSelectedNodeId: mockSetGraphSelectedNodeId,
          },
        }

        return selector(store)
      },
    )
  })

  describe('AgentGraphNode', () => {
    it('渲染节点名称、类型、证据徽章与句柄', () => {
      renderNode({ nodeName: '规划节点', nodeType: 'chat-agent', evidenceCount: 3 })

      expect(screen.getByTestId('agent-graph-node-n-1')).toBeInTheDocument()
      expect(screen.getByText('规划节点')).toBeInTheDocument()
      expect(screen.getByText('chat-agent')).toBeInTheDocument()
      expect(screen.getByTestId('evidence-badge')).toHaveTextContent('3')
      expect(screen.getByTestId('handle-target')).toBeInTheDocument()
      expect(screen.getByTestId('handle-source')).toBeInTheDocument()
      expect(screen.getByTestId('icon-bot')).toBeInTheDocument()
    })

    it('evidenceCount 为 0 时隐藏证据徽章', () => {
      renderNode({ evidenceCount: 0 })

      expect(screen.queryByTestId('evidence-badge')).not.toBeInTheDocument()
    })

    it('selected=true 时显示选中高亮环', () => {
      renderNode({}, true)

      expect(screen.getByTestId('agent-graph-node-n-1').className).toContain(
        'ring-primary',
      )
    })

    it('isHighlighted=true 时显示高亮环', () => {
      renderNode({ isHighlighted: true })

      expect(screen.getByTestId('agent-graph-node-n-1').className).toContain(
        'ring-yellow-400/80',
      )
    })

    it('http-tool 节点渲染对应图标', () => {
      renderNode({ nodeType: 'http-tool' })

      expect(screen.getByTestId('icon-globe')).toBeInTheDocument()
    })
  })

  describe('AgentGraphEdge', () => {
    it('渲染 BaseEdge 并使用固定贝塞尔路径', () => {
      renderEdge()

      expect(screen.getByTestId('edge-edge-1')).toHaveAttribute(
        'd',
        'M0,0 L100,100',
      )
    })

    it('高亮时显示 tooltip，并展示源目标节点、证据数量与数据类型摘要', () => {
      renderEdge({ isHighlighted: true, evidenceLinks: 4, dataTypeSummary: 'text → json' })

      const tooltip = screen.getByTestId('agent-graph-edge-tooltip-edge-1')
      expect(tooltip).toHaveTextContent('起始节点 → 请求工具')
      expect(tooltip).toHaveTextContent('4 条证据链接')
      expect(tooltip).toHaveTextContent('text → json')
    })

    it('hover 边命中区域时显示 tooltip', () => {
      renderEdge()

      fireEvent.mouseEnter(screen.getByTestId('agent-graph-edge-hit-area-edge-1'))

      expect(screen.getByTestId('agent-graph-edge-tooltip-edge-1')).toBeInTheDocument()
    })

    it('selected=true 时也会显示 tooltip', () => {
      renderEdge({}, true)

      expect(
        screen.getByTestId('agent-graph-edge-tooltip-edge-1'),
      ).toBeInTheDocument()
    })

    it('未高亮且未选中时隐藏 tooltip', () => {
      renderEdge()

      expect(
        screen.queryByTestId('agent-graph-edge-tooltip-edge-1'),
      ).not.toBeInTheDocument()
    })
  })

  describe('GraphTimelinePlayer', () => {
    const onStepChange = vi.fn()

    beforeEach(() => {
      vi.useFakeTimers()
      onStepChange.mockReset()
    })

    it('timeline 为空时返回 null', () => {
      render(<GraphTimelinePlayer timeline={[]} onStepChange={onStepChange} />)

      expect(screen.queryByTestId('graph-timeline-player')).not.toBeInTheDocument()
    })

    it('初始显示播放按钮与 0/N 步骤信息', () => {
      render(
        <GraphTimelinePlayer
          timeline={[createTimelineEntry(), createTimelineEntry({ label: '第二步' })]}
          onStepChange={onStepChange}
        />,
      )

      expect(screen.getByTestId('timeline-play')).toBeInTheDocument()
      expect(screen.getByTestId('timeline-step-info')).toHaveTextContent('0/2')
    })

    it('点击播放后切换为暂停按钮', () => {
      render(
        <GraphTimelinePlayer
          timeline={[createTimelineEntry(), createTimelineEntry({ label: '第二步' })]}
          onStepChange={onStepChange}
        />,
      )

      fireEvent.click(screen.getByTestId('timeline-play'))

      expect(screen.getByTestId('timeline-pause')).toBeInTheDocument()
    })

    it('点击重置时回到 -1 步', () => {
      render(
        <GraphTimelinePlayer
          timeline={[createTimelineEntry(), createTimelineEntry({ label: '第二步' })]}
          onStepChange={onStepChange}
        />,
      )

      fireEvent.click(screen.getByTestId('timeline-reset'))

      expect(onStepChange).toHaveBeenCalledWith(-1)
    })

    it('播放到活动步骤时显示当前标签与时间戳', async () => {
      render(
        <GraphTimelinePlayer
          timeline={[
            createTimelineEntry({ label: '开始执行' }),
            createTimelineEntry({ label: '结束执行', targetId: 'graph-node-2' }),
          ]}
          onStepChange={onStepChange}
        />,
      )

      fireEvent.click(screen.getByTestId('timeline-play'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800)
      })

      expect(onStepChange).toHaveBeenCalledWith(0)
      expect(screen.getByTestId('timeline-step-info')).toHaveTextContent('1/2')
      expect(screen.getByTestId('timeline-step-label')).toHaveTextContent('开始执行')
      expect(screen.getByTestId('timeline-step-timestamp')).toHaveTextContent(
        '2026-03-14 10:00:00 UTC',
      )
    })

    it('播放结束后自动重置到初始状态并清除高亮步骤', async () => {
      render(
        <GraphTimelinePlayer
          timeline={[createTimelineEntry({ label: '唯一一步' })]}
          onStepChange={onStepChange}
        />,
      )

      fireEvent.click(screen.getByTestId('timeline-play'))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800)
      })

      expect(onStepChange).toHaveBeenNthCalledWith(1, 0)
      expect(screen.getByTestId('timeline-step-info')).toHaveTextContent('1/1')
      expect(screen.getByTestId('timeline-step-label')).toHaveTextContent('唯一一步')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800)
      })

      expect(onStepChange).toHaveBeenLastCalledWith(-1)
      expect(screen.getByTestId('timeline-step-info')).toHaveTextContent('0/1')
      expect(screen.queryByTestId('timeline-step-label')).not.toBeInTheDocument()
      expect(screen.queryByTestId('timeline-step-timestamp')).not.toBeInTheDocument()
      expect(screen.getByTestId('timeline-play')).toBeInTheDocument()
    })
  })

  describe('EvidenceGraphControls', () => {
    it('渲染全部控制按钮并高亮当前布局', () => {
      render(
        <EvidenceGraphControls
          layoutMode="dagre"
          onLayoutChange={vi.fn()}
          onFitView={vi.fn()}
          onRefresh={vi.fn()}
        />,
      )

      expect(screen.getByTestId('layout-dagre')).toBeInTheDocument()
      expect(screen.getByTestId('layout-force')).toBeInTheDocument()
      expect(screen.getByTestId('fit-view')).toBeInTheDocument()
      expect(screen.getByTestId('refresh-graph')).toBeInTheDocument()
      expect(screen.getByTestId('layout-dagre').className).toContain('bg-primary/15')
    })

    it('点击各按钮时触发对应回调', () => {
      const onLayoutChange = vi.fn()
      const onFitView = vi.fn()
      const onRefresh = vi.fn()

      render(
        <EvidenceGraphControls
          layoutMode="force"
          onLayoutChange={onLayoutChange}
          onFitView={onFitView}
          onRefresh={onRefresh}
        />,
      )

      fireEvent.click(screen.getByTestId('layout-dagre'))
      fireEvent.click(screen.getByTestId('layout-force'))
      fireEvent.click(screen.getByTestId('fit-view'))
      fireEvent.click(screen.getByTestId('refresh-graph'))

      expect(onLayoutChange).toHaveBeenNthCalledWith(1, 'dagre')
      expect(onLayoutChange).toHaveBeenNthCalledWith(2, 'force')
      expect(onFitView).toHaveBeenCalledTimes(1)
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('刷新中时给刷新按钮加上 animate-spin class', () => {
      render(
        <EvidenceGraphControls
          layoutMode="dagre"
          onLayoutChange={vi.fn()}
          onFitView={vi.fn()}
          onRefresh={vi.fn()}
          isRefreshing
        />,
      )

      expect(screen.getByTestId('refresh-graph').className).toContain('animate-spin')
    })
  })

  describe('EvidenceGraphView', () => {
    it('加载中时显示 loading state', () => {
      vi.mocked(useEvidenceGraph).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      render(<EvidenceGraphView executionId="exec-1" />)

      expect(screen.getByTestId('evidence-graph-loading')).toBeInTheDocument()
    })

    it('错误时显示 error state、错误消息与重试按钮，并允许重试', async () => {
      vi.mocked(useEvidenceGraph).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('图谱加载失败'),
        refetch: mockRefetch,
      } as never)

      render(<EvidenceGraphView executionId="exec-1" />)

      expect(screen.getByTestId('evidence-graph-error')).toBeInTheDocument()
      expect(screen.getByText('图谱加载失败')).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByTestId('evidence-graph-retry'))
        await Promise.resolve()
      })

      expect(mockRefetch).toHaveBeenCalledTimes(1)
    })

    it('无节点时显示 empty state', () => {
      vi.mocked(useEvidenceGraph).mockReturnValue({
        data: { data: createGraphData({ nodes: [], edges: [], timeline: [] }) },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      render(<EvidenceGraphView executionId="exec-1" />)

      expect(screen.getByTestId('evidence-graph-empty')).toBeInTheDocument()
    })

    it('有图数据时显示 graph view', () => {
      mockNodesState = [
        createFlowNode(),
        createFlowNode({
          id: 'graph-node-2',
          data: {
            id: 'graph-node-2',
            nodeId: 'node-2',
            nodeName: '请求工具',
            nodeType: 'http-tool',
            executionStatus: 'running',
            evidenceCount: 1,
            firstEvidenceAt: null,
            lastEvidenceAt: null,
            isHighlighted: false,
          },
        }),
      ]
      mockEdgesState = [createFlowEdge()]

      vi.mocked(useEvidenceGraph).mockReturnValue({
        data: { data: createGraphData() },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      render(<EvidenceGraphView executionId="exec-1" />)

      expect(screen.getByTestId('evidence-graph-view')).toBeInTheDocument()
      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
      expect(screen.getByTestId('evidence-graph-controls')).toBeInTheDocument()
      expect(screen.getByTestId('graph-timeline-player')).toBeInTheDocument()
      expect(capturedReactFlowProps.nodes).toEqual(mockNodesState)
      expect(capturedReactFlowProps.edges).toEqual(mockEdgesState)

      const graphEdgeCall = mockSetEdges.mock.calls.find((call) => Array.isArray(call[0]))
      expect(graphEdgeCall).toBeDefined()
      expect(graphEdgeCall?.[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              sourceNodeName: '起始节点',
              targetNodeName: '请求工具',
            }),
          }),
        ]),
      )
    })
  })
})
