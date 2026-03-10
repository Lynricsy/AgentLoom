import { memo, useMemo } from 'react'

import { cn } from '@/shared/lib/utils'

import type { ExecutionStepStatus } from '../../types'
import { stepStatusMeta } from '../../lib/presentation'

interface TimelineDurationProps {
  status: ExecutionStepStatus
  startedAt: string | null
  completedAt: string | null
  executionStartedAt: string | null
  executionCompletedAt: string | null
}

function toMs(value: string | null): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export const TimelineDuration = memo(function TimelineDuration({
  status,
  startedAt,
  completedAt,
  executionStartedAt,
  executionCompletedAt,
}: TimelineDurationProps) {
  const { offsetPercent, widthPercent } = useMemo(() => {
    const execStart = toMs(executionStartedAt)
    const execEnd = toMs(executionCompletedAt)
    const nodeStart = toMs(startedAt)
    const nodeEnd = toMs(completedAt)

    if (execStart == null) {
      return { offsetPercent: 0, widthPercent: 100 }
    }

    const totalSpan = Math.max((execEnd ?? Date.now()) - execStart, 1)
    const startPoint = nodeStart ?? execStart
    const endPoint = nodeEnd ?? (nodeStart ? Date.now() : startPoint)

    const rawOffset = ((startPoint - execStart) / totalSpan) * 100
    const rawWidth =
      ((Math.max(endPoint, startPoint) - startPoint) / totalSpan) * 100

    return {
      offsetPercent: Math.min(Math.max(rawOffset, 0), 92),
      widthPercent: Math.min(Math.max(rawWidth, 2), 100 - rawOffset),
    }
  }, [startedAt, completedAt, executionStartedAt, executionCompletedAt])

  const meta = stepStatusMeta[status]

  return (
    <div
      className="h-2 rounded-full bg-muted/70"
      data-testid="timeline-duration"
    >
      <div
        className={cn('h-full rounded-full transition-all', meta.dotClassName)}
        style={{
          marginLeft: `${offsetPercent}%`,
          width: `${widthPercent}%`,
        }}
      />
    </div>
  )
})
