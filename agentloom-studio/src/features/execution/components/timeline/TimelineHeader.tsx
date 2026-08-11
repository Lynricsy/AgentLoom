import { memo } from 'react'

import { cn } from '@/shared/lib/utils'

import type { ExecutionStepStatus } from '../../types'
import {
  formatExecutionDuration,
  stepStatusMeta,
} from '../../lib/presentation'
import { StatusDot, StepStatusBadge } from '../StatusBadge'

interface TimelineHeaderProps {
  nodeName: string
  nodeType: string
  status: ExecutionStepStatus
  startedAt: string | null
  completedAt: string | null
}

export const TimelineHeader = memo(function TimelineHeader({
  nodeName,
  nodeType,
  status,
  startedAt,
  completedAt,
}: TimelineHeaderProps) {
  const meta = stepStatusMeta[status]

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-2"
      data-testid="timeline-header"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusDot
          className={cn('h-2.5 w-2.5', meta.dotClassName)}
          pulse={status === 'running'}
        />
        <p className="truncate text-sm font-semibold text-foreground">{nodeName}</p>
        <span className="truncate text-[11px] uppercase tracking-[0.18em] text-muted">
          {nodeType}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted">
          {formatExecutionDuration(startedAt, completedAt)}
        </span>
        <StepStatusBadge status={status} />
      </div>
    </div>
  )
})
