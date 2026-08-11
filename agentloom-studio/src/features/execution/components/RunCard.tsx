import { memo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Clock3, TimerReset, Zap } from 'lucide-react'
import type { ExecutionResponse } from '../api/executionApi'
import {
  formatExecutionDateTime,
  formatExecutionDuration,
  formatTriggerSource,
  getExecutionStartedAt,
} from '../lib/presentation'
import { ExecutionStatusBadge } from './StatusBadge'
import { Card } from '@/shared/ui/card'

interface RunCardProps {
  execution: ExecutionResponse
}

export const RunCard = memo(function RunCard({ execution }: RunCardProps) {
  const navigate = useNavigate()
  const startedAt = getExecutionStartedAt(execution)

  return (
    <Card interactive className="overflow-hidden">
      <button
        type="button"
        data-testid={`run-card-${execution.id}`}
        className="group w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => void navigate({ to: '/executions/$executionId', params: { executionId: execution.id } })}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ExecutionStatusBadge status={execution.status} />
              <span className="text-xs uppercase tracking-[0.2em] text-muted">
                Run #{execution.id.slice(0, 8)}
              </span>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2 text-muted">
                <Clock3 className="h-4 w-4 shrink-0" />
                <span className="truncate">{formatExecutionDateTime(startedAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <TimerReset className="h-4 w-4 shrink-0" />
                <span className="truncate">{formatExecutionDuration(execution.startedAt, execution.completedAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Zap className="h-4 w-4 shrink-0" />
                <span className="truncate">{formatTriggerSource(execution.triggerType)}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
            <span className="text-xs text-muted">
              {execution.completedAt ? `结束于 ${formatExecutionDateTime(execution.completedAt)}` : '查看调试视图'}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
              调试视图
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </button>
    </Card>
  )
})
