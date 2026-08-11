import { memo, useMemo, type CSSProperties } from 'react'
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
import { StepStatusBadge } from './StatusBadge'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
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
  isCompoundContainer: boolean
  summary: string | null
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

function isCompoundContainerNodeType(nodeType: string): boolean {
  return nodeType === 'loop' || nodeType === 'iteration'
}

function readConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function resolveCompoundOutputMode(
  config: Record<string, unknown>,
  fallback: 'none' | 'collect-array' | 'last',
): 'none' | 'collect-array' | 'last' {
  return config.outputMode === 'none'
    || config.outputMode === 'collect-array'
    || config.outputMode === 'last'
    ? config.outputMode
    : fallback
}

function readNodeSummary(
  nodeType: string,
  config: Record<string, unknown>,
): string | null {
  switch (nodeType) {
    case 'loop':
      return `循环容器 · 输出 ${resolveCompoundOutputMode(config, 'last')}`
    case 'iteration':
      return `迭代容器 · 输出 ${resolveCompoundOutputMode(config, 'collect-array')}`
    case 'loop-start':
      return '输出 round / state'
    case 'iteration-start':
      return '输出 item / index'
    case 'loop-state':
      return '写回下一轮 state'
    case 'result': {
      const outputKey =
        typeof config.outputKey === 'string' && config.outputKey.trim().length > 0
          ? config.outputKey.trim()
          : 'result'
      return `输出键 ${outputKey}`
    }
    case 'break':
      return config.mode === 'expression' ? '命中表达式后结束整个容器' : '立即结束整个容器'
    case 'continue':
      return config.mode === 'expression' ? '命中表达式后进入下一轮' : '立即进入下一轮'
    default:
      return null
  }
}

function ReadonlyCanvasNodeCard({ data }: NodeProps<ExecutionCanvasNode>) {
  const statusMeta = stepStatusMeta[data.status]

  return (
    <article
      className={cn(
        'relative h-full w-full rounded-panel border px-3 py-2 text-left shadow-node transition-colors',
        data.isCompoundContainer
          ? 'overflow-hidden border-dashed bg-surface-elevated'
          : 'min-w-[180px]',
        statusMeta.nodeClassName,
        data.isSelected &&
          'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
      )}
    >
      {data.isCompoundContainer ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-3 top-[72px] rounded-card border border-dashed border-border"
        />
      ) : null}

      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-muted">
              {data.nodeType}
            </p>
            {data.isCompoundContainer ? (
              <Badge variant="outline" size="sm">
                compound
              </Badge>
            ) : null}
          </div>
        </div>
        <StepStatusBadge status={data.status} />
      </div>

      {data.summary ? (
        <p className="relative z-[1] mt-3 text-[11px] leading-4 text-muted">
          {data.summary}
        </p>
      ) : null}

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
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
      const nodeType =
        typeof rawData.nodeType === 'string'
          ? rawData.nodeType
          : typeof rawNode.type === 'string'
            ? rawNode.type
            : 'node'
      const position = isPosition(rawNode.position) ? rawNode.position : { x: 0, y: 0 }
      const rawStyle = isRecord(rawNode.style)
        ? (rawNode.style as CSSProperties)
        : undefined
      const isCompoundContainer = isCompoundContainerNodeType(nodeType)

      return [{
        id: rawNode.id,
        position,
        type: 'execution-node',
        parentId: typeof rawNode.parentId === 'string' ? rawNode.parentId : undefined,
        extent: rawNode.extent === 'parent' ? 'parent' : undefined,
        hidden: rawNode.hidden === true,
        draggable: false,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ...(rawStyle ? { style: rawStyle } : {}),
        data: {
          label,
          nodeType,
          status: stepStatusByNodeId.get(rawNode.id) ?? 'pending',
          isSelected: rawNode.id === selectedNodeId,
          isCompoundContainer,
          summary: readNodeSummary(nodeType, readConfig(rawData.config)),
        },
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
        ...(rawEdge.hidden === true ? { hidden: true } : {}),
        animated: stepStatusByNodeId.get(rawEdge.target) === 'running',
      }]
    })
  }, [graph.edges, stepStatusByNodeId])

  return (
    <Card
      className="h-full min-h-[320px] overflow-hidden"
      data-testid="readonly-canvas"
    >
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
        <Controls
          showInteractive={false}
          className="!border-border !bg-surface-elevated !shadow-lg"
        />
      </ReactFlow>
    </Card>
  )
})
