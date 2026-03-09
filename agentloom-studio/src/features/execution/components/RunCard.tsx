import { memo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Clock3, TimerReset, Zap } from 'lucide-react'
import type { ExecutionResponse } from '../api/executionApi'
import {
  executionStatusMeta,
  formatExecutionDateTime,
  formatExecutionDuration,
  formatTriggerSource,
  getExecutionStartedAt,
} from '../lib/presentation'
import { cn } from '@/shared/lib/utils'

interface RunCardProps {
  execution: ExecutionResponse
}

export const RunCard = memo(function RunCard({ execution }: RunCardProps) {
  const navigate = useNavigate()
  const statusMeta = executionStatusMeta[execution.status]
  const startedAt = getExecutionStartedAt(execution)

  return (
    <button
      type="button"
      data-testid={`run-card-${execution.id}`}
      className="group w-full rounded-2xl border border-border/70 bg-surface/90 p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-surface-elevated/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => void navigate({ to: '/executions/$executionId', params: { executionId: execution.id } })}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
                statusMeta.badgeClassName,
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  statusMeta.pulseClassName,
                  execution.status === 'running' && 'animate-pulse',
                )}
              />
              {statusMeta.label}
            </span>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Run #{execution.id.slice(0, 8)}
            </span>
          </div>

          <div className="grid gap-2 text-sm text-foreground/90 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              <span>{formatExecutionDateTime(startedAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <TimerReset className="h-4 w-4" />
              <span>{formatExecutionDuration(execution.startedAt, execution.completedAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span>{formatTriggerSource(execution.triggerType)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <span className="text-xs text-muted-foreground">
            {execution.completedAt ? `结束于 ${formatExecutionDateTime(execution.completedAt)}` : '查看调试视图'}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition group-hover:translate-x-0.5">
            调试视图
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  )
})
