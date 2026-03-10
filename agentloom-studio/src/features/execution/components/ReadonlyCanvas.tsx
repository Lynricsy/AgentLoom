import { memo, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import type { ExecutionDetail, ExecutionStep, ExecutionStepStatus } from '../types'
import { stepStatusMeta } from '../lib/presentation'
import { cn } from '@/shared/lib/utils'

interface ReadonlyCanvasProps {
  graph: ExecutionDetail['workflowVersion']['graph']
  steps: ExecutionStep[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

interface ExecutionCanvasNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  status: ExecutionStepStatus
}

type ExecutionCanvasNode = Node<ExecutionCanvasNodeData, 'execution-node'>

interface ExecutionCanvasEdgeData extends Record<string, never> {}

type ExecutionCanvasEdge = Edge<ExecutionCanvasEdgeData>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'
}

function ReadonlyCanvasNodeCard({ data, selected }: NodeProps<ExecutionCanvasNode>) {
  const statusMeta = stepStatusMeta[data.status]

  return (
    <article
      className={cn(
        'min-w-[180px] rounded-2xl border px-3 py-2 text-left shadow-md transition',
        statusMeta.nodeClassName,
        data.status === 'running' && 'animate-pulse',
        selected && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
          <p className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {data.nodeType}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            statusMeta.badgeClassName,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dotClassName)} />
          {statusMeta.label}
        </span>
      </div>
    </article>
  )
}

const nodeTypes: NodeTypes = {
  'execution-node': ReadonlyCanvasNodeCard,
}

export const ReadonlyCanvas = memo(function ReadonlyCanvas({
  graph,
  steps,
  selectedNodeId,
  onSelectNode,
}: ReadonlyCanvasProps) {
  const stepStatusByNodeId = useMemo(
    () => new Map(steps.map((step) => [step.nodeId, step.status])),
    [steps],
  )

  const nodes = useMemo<ExecutionCanvasNode[]>(() => {
    if (!Array.isArray(graph.nodes)) {
      return []
    }

    return graph.nodes.flatMap((rawNode) => {
      if (!isRecord(rawNode) || typeof rawNode.id !== 'string') {
        return []
      }

      const rawData = isRecord(rawNode.data) ? rawNode.data : {}
      const label = typeof rawData.label === 'string' ? rawData.label : rawNode.id
      const nodeType = typeof rawData.nodeType === 'string'
        ? rawData.nodeType
        : typeof rawNode.type === 'string'
          ? rawNode.type
          : 'node'
      const position = isPosition(rawNode.position) ? rawNode.position : { x: 0, y: 0 }

      return [{
        id: rawNode.id,
        position,
        type: 'execution-node',
        data: {
          label,
          nodeType,
          status: stepStatusByNodeId.get(rawNode.id) ?? 'pending',
        },
        selected: rawNode.id === selectedNodeId,
        draggable: false,
      }]
    })
  }, [graph.nodes, selectedNodeId, stepStatusByNodeId])

  const edges = useMemo<ExecutionCanvasEdge[]>(() => {
    if (!Array.isArray(graph.edges)) {
      return []
    }

    return graph.edges.flatMap((rawEdge) => {
      if (
        !isRecord(rawEdge) ||
        typeof rawEdge.id !== 'string' ||
        typeof rawEdge.source !== 'string' ||
        typeof rawEdge.target !== 'string'
      ) {
        return []
      }

      return [{
        id: rawEdge.id,
        source: rawEdge.source,
        target: rawEdge.target,
        sourceHandle:
          typeof rawEdge.sourceHandle === 'string' ? rawEdge.sourceHandle : undefined,
        targetHandle:
          typeof rawEdge.targetHandle === 'string' ? rawEdge.targetHandle : undefined,
        animated: stepStatusByNodeId.get(rawEdge.target) === 'running',
      }]
    })
  }, [graph.edges, stepStatusByNodeId])

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-3xl border border-border/70 bg-background/80" data-testid="readonly-canvas">
      <ReactFlow<ExecutionCanvasNode, ExecutionCanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        connectOnClick={false}
        edgesReconnectable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} className="!border-border !bg-surface-elevated !shadow-lg" />
      </ReactFlow>
    </div>
  )
})
