import { memo, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import type { ExecutionDetail, ExecutionStep, ExecutionStepStatus } from '../types'
import { stepStatusMeta } from '../lib/presentation'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/hooks/use-theme'

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
  isSelected: boolean
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

function ReadonlyCanvasNodeCard({ data }: NodeProps<ExecutionCanvasNode>) {
  const statusMeta = stepStatusMeta[data.status]

  return (
    <article
      className={cn(
        'min-w-[180px] rounded-2xl border px-3 py-2 text-left shadow-md transition',
        statusMeta.nodeClassName,
        data.status === 'running' && 'animate-pulse',
        data.isSelected &&
          'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
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

      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!opacity-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!opacity-0"
      />
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
  const { resolvedTheme } = useTheme()
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
          isSelected: rawNode.id === selectedNodeId,
        },
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
        // 执行调试画布使用只读卡片节点，不暴露编排画布里的 handle。
        // 保留 handle id 会让 React Flow 判定边无法挂接，从而持续刷 warning。
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
        colorMode={resolvedTheme}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} className="!border-border !bg-surface-elevated !shadow-lg" />
      </ReactFlow>
    </div>
  )
})
