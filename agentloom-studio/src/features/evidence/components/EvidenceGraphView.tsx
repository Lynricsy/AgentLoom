import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  Position,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { Loader2, AlertCircle, GitBranch } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useEvidenceGraph } from '../api/evidenceQueries'
import { useEvidenceUiStore } from '../stores/evidenceUiStore'
import type {
  AgentGraphNode as AgentGraphNodeType,
  AgentGraphEdge as AgentGraphEdgeType,
  EvidenceGraphResponse,
} from '../types'
import { AgentGraphNode, type AgentGraphNodeFlowData, type AgentGraphFlowNode } from './AgentGraphNode'
import {
  AgentGraphEdge,
  type AgentGraphEdgeFlowData,
  type AgentGraphFlowEdge,
} from './AgentGraphEdge'
import { GraphTimelinePlayer } from './GraphTimelinePlayer'
import { EvidenceGraphControls } from './EvidenceGraphControls'

const NODE_WIDTH = 200
const NODE_HEIGHT = 80

// React Flow v12 NodeTypes/EdgeTypes 泛型约束需要 any 桥接自定义节点类型
const nodeTypes: NodeTypes = {
  agentGraphNode: AgentGraphNode as NodeTypes[string],
}

const edgeTypes: EdgeTypes = {
  agentGraphEdge: AgentGraphEdge as EdgeTypes[string],
}

type LayoutType = 'dagre' | 'force'

function buildFlowEdges(
  graphNodes: AgentGraphNodeType[],
  graphEdges: AgentGraphEdgeType[],
): AgentGraphFlowEdge[] {
  const nodeNameMap = new Map(graphNodes.map((node) => [node.id, node.nodeName]))

  return graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: 'agentGraphEdge' as const,
    data: {
      ...edge,
      sourceNodeName: nodeNameMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeName: nodeNameMap.get(edge.targetNodeId) ?? edge.targetNodeId,
      isHighlighted: false,
    } satisfies AgentGraphEdgeFlowData,
  }))
}

function applyDagreLayout(
  graphNodes: AgentGraphNodeType[],
  graphEdges: AgentGraphEdgeType[],
): { nodes: AgentGraphFlowNode[]; edges: AgentGraphFlowEdge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120 })

  for (const node of graphNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of graphEdges) {
    g.setEdge(edge.sourceNodeId, edge.targetNodeId)
  }

  dagre.layout(g)

  const nodes: AgentGraphFlowNode[] = graphNodes.map((node) => {
    const pos = g.node(node.id)
    return {
      id: node.id,
      type: 'agentGraphNode' as const,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        ...node,
        isHighlighted: false,
      } satisfies AgentGraphNodeFlowData,
    }
  })

  const edges = buildFlowEdges(graphNodes, graphEdges)

  return { nodes, edges }
}

interface ForceNode extends SimulationNodeDatum {
  id: string
}

function applyForceLayout(
  graphNodes: AgentGraphNodeType[],
  graphEdges: AgentGraphEdgeType[],
): { nodes: AgentGraphFlowNode[]; edges: AgentGraphFlowEdge[] } {
  const simNodes: ForceNode[] = graphNodes.map((n) => ({ id: n.id }))
  const simLinks: SimulationLinkDatum<ForceNode>[] = graphEdges.map((e) => ({
    source: e.sourceNodeId,
    target: e.targetNodeId,
  }))

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      'link',
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks).id(
        (d) => d.id,
      ),
    )
    .force('charge', forceManyBody().strength(-400))
    .force('center', forceCenter(400, 300))
    .force('collide', forceCollide(NODE_WIDTH / 2 + 20))
    .stop()

  for (let i = 0; i < 300; i++) {
    simulation.tick()
  }

  const posMap = new Map<string, { x: number; y: number }>()
  for (const sn of simNodes) {
    posMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
  }

  const nodes: AgentGraphFlowNode[] = graphNodes.map((node) => {
    const pos = posMap.get(node.id) ?? { x: 0, y: 0 }
    return {
      id: node.id,
      type: 'agentGraphNode' as const,
      position: { x: pos.x, y: pos.y },
      data: { ...node, isHighlighted: false } satisfies AgentGraphNodeFlowData,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })

  const edges = buildFlowEdges(graphNodes, graphEdges)

  return { nodes, edges }
}

interface EvidenceGraphViewProps {
  executionId: string
}

export const EvidenceGraphView = memo(function EvidenceGraphView({
  executionId,
}: EvidenceGraphViewProps) {
  const { data, isLoading, isError, error, refetch } = useEvidenceGraph(executionId)
  const { fitView } = useReactFlow()

  const [layoutType, setLayoutType] = useState<LayoutType>('dagre')
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentGraphFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<AgentGraphFlowEdge>([])
  const [timelineStep, setTimelineStep] = useState(-1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const initialFitDone = useRef(false)

  const openPanel = useEvidenceUiStore((s) => s.actions.openPanel)
  const setGraphSelectedNodeId = useEvidenceUiStore(
    (s) => s.actions.setGraphSelectedNodeId,
  )

  const graphData: EvidenceGraphResponse | undefined = data?.data

  const applyLayout = useCallback(
    (gd: EvidenceGraphResponse, lt: LayoutType) => {
      const result =
        lt === 'dagre'
          ? applyDagreLayout(gd.nodes, gd.edges)
          : applyForceLayout(gd.nodes, gd.edges)
      setNodes(result.nodes)
      setEdges(result.edges)
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return
    applyLayout(graphData, layoutType)
    initialFitDone.current = false
  }, [graphData, layoutType, applyLayout])

  useEffect(() => {
    if (nodes.length > 0 && !initialFitDone.current) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 })
        initialFitDone.current = true
      })
    }
  }, [nodes, fitView])

  const activeTargetId = useMemo(() => {
    if (!graphData || timelineStep < 0) return null
    const entry = graphData.timeline[timelineStep]
    return entry?.targetId ?? null
  }, [graphData, timelineStep])

  useEffect(() => {
    if (!activeTargetId) {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, isHighlighted: false },
        })),
      )
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          data: { ...e.data!, isHighlighted: false },
        })),
      )
      return
    }

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isHighlighted: n.id === activeTargetId },
      })),
    )
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: { ...e.data!, isHighlighted: e.id === activeTargetId },
      })),
    )
  }, [activeTargetId, setNodes, setEdges])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: AgentGraphFlowNode) => {
      setGraphSelectedNodeId(node.data.nodeId)
      openPanel(executionId, node.data.nodeId, node.data.nodeName)
    },
    [executionId, openPanel, setGraphSelectedNodeId],
  )

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }, [refetch])

  const handleLayoutChange = useCallback(
    (lt: LayoutType) => {
      setLayoutType(lt)
      if (graphData) {
        applyLayout(graphData, lt)
      }
    },
    [graphData, applyLayout],
  )

  if (isLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="evidence-graph-loading"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 text-destructive',
        )}
        data-testid="evidence-graph-error"
      >
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error?.message ?? '加载溯源图失败'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          data-testid="evidence-graph-retry"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              重试中...
            </>
          ) : (
            '重试加载'
          )}
        </Button>
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
        data-testid="evidence-graph-empty"
      >
        <GitBranch className="h-8 w-8" />
        <p className="text-sm">暂无证据数据</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full" data-testid="evidence-graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>

      <EvidenceGraphControls
        layoutMode={layoutType}
        onLayoutChange={handleLayoutChange}
        onFitView={handleFitView}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {graphData.timeline.length > 0 && (
        <GraphTimelinePlayer
          timeline={graphData.timeline}
          onStepChange={setTimelineStep}
        />
      )}
    </div>
  )
})
