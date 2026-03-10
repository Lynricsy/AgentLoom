import { memo, useMemo } from 'react'
import type { ExecutionStep } from '../types'
import {
  formatClockTime,
  formatExecutionDuration,
  stepStatusMeta,
  summarizeDataShape,
} from '../lib/presentation'
import { cn } from '@/shared/lib/utils'

interface ExecutionTimelineProps {
  steps: ExecutionStep[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

interface TimelineRow {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  status: ExecutionStep['status']
  startedAt: string | null
  completedAt: string | null
  durationLabel: string
  summary: string
  offsetPercent: number
  widthPercent: number
}

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function buildTimelineRows(steps: ExecutionStep[]): TimelineRow[] {
  const normalizedSteps = steps.map((step, index) => {
    const startedAtMs = toTimestamp(step.startedAt)
    const completedAtMs = toTimestamp(step.completedAt)
    const fallbackTimestamp = startedAtMs ?? completedAtMs ?? index

    return {
      step,
      index,
      startedAtMs,
      completedAtMs,
      fallbackTimestamp,
    }
  })

  const timedStarts = normalizedSteps
    .map((entry) => entry.startedAtMs ?? entry.completedAtMs)
    .filter((value): value is number => value != null)

  const timelineStart = timedStarts.length > 0 ? Math.min(...timedStarts) : 0
  const timelineEnd = normalizedSteps.reduce((latest, entry) => {
    const candidate = entry.completedAtMs ?? entry.startedAtMs ?? latest
    return Math.max(latest, candidate)
  }, timelineStart)
  const timelineSpan = Math.max(timelineEnd - timelineStart, 1)

  return normalizedSteps
    .sort((left, right) => {
      if ((left.step.stepOrder ?? left.index) !== (right.step.stepOrder ?? right.index)) {
        return (left.step.stepOrder ?? left.index) - (right.step.stepOrder ?? right.index)
      }

      return left.fallbackTimestamp - right.fallbackTimestamp
    })
    .map(({ step, startedAtMs, completedAtMs }) => {
      const startPoint = startedAtMs ?? completedAtMs ?? timelineStart
      const endPoint = completedAtMs ?? startedAtMs ?? startPoint
      const rawOffset = ((startPoint - timelineStart) / timelineSpan) * 100
      const rawWidth = ((Math.max(endPoint, startPoint) - startPoint) / timelineSpan) * 100
      const minWidth = startedAtMs != null || completedAtMs != null ? 8 : 6
      const widthPercent = Math.min(Math.max(rawWidth, minWidth), 100)
      const offsetPercent = Math.min(Math.max(rawOffset, 0), Math.max(100 - widthPercent, 0))

      let summary = `状态：${stepStatusMeta[step.status].label}`
      if (step.errorMessage) {
        summary = `错误：${step.errorMessage}`
      } else if (step.output) {
        summary = `输出：${summarizeDataShape(step.output)}`
      } else if (step.status === 'waiting_for_intervention') {
        summary = '等待人工介入后继续执行'
      }

      return {
        id: step.id,
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        nodeType: step.nodeType,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        durationLabel: formatExecutionDuration(step.startedAt, step.completedAt),
        summary,
        offsetPercent,
        widthPercent,
      }
    })
}

export const ExecutionTimeline = memo(function ExecutionTimeline({
  steps,
  selectedNodeId,
  onSelectNode,
}: ExecutionTimelineProps) {
  const rows = useMemo(() => buildTimelineRows(steps), [steps])

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-3xl border border-border/70 bg-background/80" data-testid="execution-timeline">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">执行时间线</h2>
        <p className="text-xs text-muted-foreground">每个节点一行，展示开始、结束、耗时与相对执行跨度。</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            暂无执行步骤
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const statusMeta = stepStatusMeta[row.status]
              const isSelected = row.nodeId === selectedNodeId

              return (
                <button
                  key={row.id}
                  type="button"
                  className={cn(
                    'w-full rounded-2xl border border-border/60 bg-surface/60 px-4 py-4 text-left transition hover:border-border/80 hover:bg-surface/80',
                    isSelected && 'border-primary/40 bg-primary/5',
                  )}
                  onClick={() => onSelectNode(row.nodeId)}
                  data-testid={`execution-timeline-item-${row.id}`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('h-2.5 w-2.5 rounded-full', statusMeta.dotClassName)} />
                          <p className="text-sm font-semibold text-foreground">{row.nodeName}</p>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {row.nodeType}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-foreground/90">{row.summary}</p>
                      </div>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          statusMeta.badgeClassName,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dotClassName)} />
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="h-2 rounded-full bg-muted/70">
                        <div
                          className={cn('h-full rounded-full', statusMeta.dotClassName)}
                          style={{
                            marginLeft: `${row.offsetPercent}%`,
                            width: `${row.widthPercent}%`,
                          }}
                        />
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>开始：{formatClockTime(row.startedAt)}</span>
                        <span>结束：{formatClockTime(row.completedAt)}</span>
                        <span>耗时：{row.durationLabel}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
})
