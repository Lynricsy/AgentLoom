import { memo } from 'react'

import { cn } from '@/shared/lib/utils'

import type { ExecutionStepStatus } from '../../types'
import {
  formatExecutionDuration,
  stepStatusMeta,
} from '../../lib/presentation'

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
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dotClassName)} />
          <p className="text-sm font-semibold text-foreground">{nodeName}</p>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {nodeType}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {formatExecutionDuration(startedAt, completedAt)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            meta.badgeClassName,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
          {meta.label}
        </span>
      </div>
    </div>
  )
})
