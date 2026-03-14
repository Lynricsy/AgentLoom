import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
  Bot,
  Globe,
  Wrench,
  GitBranch,
  FileText,
  Workflow,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { AgentGraphNode as AgentGraphNodeData } from '../types'

const NODE_TYPE_ICONS: Record<string, React.ElementType> = {
  'llm-agent': Bot,
  'http-tool': Globe,
  'mcp-tool': Wrench,
  'conditional-branch': GitBranch,
  'text-template': FileText,
  'reusable-block': Workflow,
}

const STATUS_COLORS: Record<string, { bg: string; ring: string; dot: string }> = {
  completed: {
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  running: {
    bg: 'bg-blue-500/10',
    ring: 'ring-blue-500/30',
    dot: 'bg-blue-400 animate-pulse',
  },
  failed: {
    bg: 'bg-rose-500/10',
    ring: 'ring-rose-500/30',
    dot: 'bg-rose-400',
  },
  waiting_for_intervention: {
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/30',
    dot: 'bg-amber-400',
  },
  pending: {
    bg: 'bg-zinc-500/10',
    ring: 'ring-zinc-500/30',
    dot: 'bg-zinc-400',
  },
  cancelled: {
    bg: 'bg-zinc-500/10',
    ring: 'ring-zinc-500/30',
    dot: 'bg-zinc-500',
  },
}

const DEFAULT_STATUS = {
  bg: 'bg-zinc-500/10',
  ring: 'ring-zinc-500/30',
  dot: 'bg-zinc-400',
}

export interface AgentGraphNodeFlowData
  extends AgentGraphNodeData,
    Record<string, unknown> {
  isHighlighted?: boolean
}

export type AgentGraphFlowNode = Node<AgentGraphNodeFlowData>

export const AgentGraphNode = memo(function AgentGraphNode({
  data,
  selected,
}: NodeProps<AgentGraphFlowNode>) {
  const IconComponent = NODE_TYPE_ICONS[data.nodeType] ?? Workflow
  const statusColors = STATUS_COLORS[data.executionStatus] ?? DEFAULT_STATUS
  const isHighlighted = data.isHighlighted ?? false

  return (
    <div
      className={cn(
        'relative rounded-xl border px-4 py-3 shadow-md transition-all duration-200',
        'min-w-[160px] max-w-[220px]',
        'bg-card/90 backdrop-blur-sm',
        statusColors.ring,
        selected
          ? 'ring-2 ring-primary border-primary/60'
          : 'ring-1 border-border/60',
        isHighlighted && 'ring-2 ring-yellow-400/80 border-yellow-400/60',
      )}
      data-testid={`agent-graph-node-${data.nodeId}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-border !bg-muted-foreground"
      />

      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            statusColors.bg,
          )}
        >
          <IconComponent className="h-4 w-4 text-foreground/80" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {data.nodeName}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {data.nodeType}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusColors.dot)} />
          <span className="text-[10px] text-muted-foreground">
            {data.executionStatus}
          </span>
        </div>

        {data.evidenceCount > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            data-testid="evidence-badge"
          >
            {data.evidenceCount}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-border !bg-muted-foreground"
      />
    </div>
  )
})
