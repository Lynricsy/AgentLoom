import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { motion } from 'motion/react'
import {
  Globe,
  Wrench,
  GitBranch,
  FileText,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { DUR, EASE } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import type { AgentGraphNode as AgentGraphNodeData } from '../types'

const NODE_TYPE_ICONS: Record<string, React.ElementType> = {
  'http-tool': Globe,
  'mcp-tool': Wrench,
  'conditional-branch': GitBranch,
  'text-template': FileText,
  'reusable-block': Workflow,
}

const STATUS_COLORS: Record<
  string,
  { bg: string; ring: string; dot: string; pulse: boolean }
> = {
  completed: {
    bg: 'bg-success/10',
    ring: 'ring-success/30',
    dot: 'bg-success',
    pulse: false,
  },
  running: {
    bg: 'bg-info/10',
    ring: 'ring-info/30',
    dot: 'bg-info',
    pulse: true,
  },
  failed: {
    bg: 'bg-error/10',
    ring: 'ring-error/30',
    dot: 'bg-error',
    pulse: false,
  },
  waiting_for_intervention: {
    bg: 'bg-warning/10',
    ring: 'ring-warning/30',
    dot: 'bg-warning',
    pulse: false,
  },
  pending: {
    bg: 'bg-surface-elevated',
    ring: 'ring-border',
    dot: 'bg-muted-foreground',
    pulse: false,
  },
  cancelled: {
    bg: 'bg-surface-elevated',
    ring: 'ring-border',
    dot: 'bg-muted-foreground',
    pulse: false,
  },
}

const DEFAULT_STATUS = {
  bg: 'bg-surface-elevated',
  ring: 'ring-border',
  dot: 'bg-muted-foreground',
  pulse: false,
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
        'relative rounded-card border px-4 py-3 shadow-node transition-all duration-200',
        'min-w-[160px] max-w-[220px]',
        'bg-surface',
        statusColors.ring,
        selected
          ? 'ring-2 ring-primary border-primary'
          : 'ring-1 border-border',
        isHighlighted && 'ring-2 ring-warning border-warning',
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
          <IconComponent className="h-4 w-4 text-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {data.nodeName}
          </p>
          <p className="truncate text-[10px] text-muted">
            {data.nodeType}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <motion.span
            aria-hidden
            className={cn('h-1.5 w-1.5 rounded-full', statusColors.dot)}
            animate={statusColors.pulse ? { opacity: 0.35 } : undefined}
            transition={
              statusColors.pulse
                ? {
                    duration: DUR.slow,
                    ease: EASE,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }
                : undefined
            }
          />
          <span className="text-[10px] text-muted">
            {data.executionStatus}
          </span>
        </div>

        {data.evidenceCount > 0 && (
          <Badge size="sm" data-testid="evidence-badge">
            {data.evidenceCount}
          </Badge>
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
