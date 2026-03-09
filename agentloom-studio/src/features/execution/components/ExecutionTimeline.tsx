import { memo, useEffect, useMemo, useRef } from 'react'
import type { ExecutionStep, ExecutionStepStatus } from '../types'
import {
  formatClockTime,
  stepStatusMeta,
  summarizeDataShape,
} from '../lib/presentation'
import { cn } from '@/shared/lib/utils'

interface ExecutionTimelineProps {
  steps: ExecutionStep[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

interface TimelineEvent {
  id: string
  nodeId: string
  nodeName: string
  timestamp: string
  status: ExecutionStepStatus
  tone: 'status' | 'output' | 'error'
  label: string
  message: string
}

function buildTimelineEvents(steps: ExecutionStep[]): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const step of steps) {
    if (step.startedAt) {
      events.push({
        id: `${step.id}-started`,
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        timestamp: step.startedAt,
        status: 'running',
        tone: 'status',
        label: '开始执行',
        message: '节点进入运行态',
      })
    }

    if (step.output) {
      events.push({
        id: `${step.id}-output`,
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        timestamp: step.completedAt ?? step.startedAt ?? new Date(0).toISOString(),
        status: step.status,
        tone: 'output',
        label: '输出',
        message: summarizeDataShape(step.output),
      })
    }

    if (step.errorMessage) {
      events.push({
        id: `${step.id}-error`,
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        timestamp: step.completedAt ?? step.startedAt ?? new Date(0).toISOString(),
        status: 'failed',
        tone: 'error',
        label: '错误',
        message: step.errorMessage,
      })
    } else if (step.completedAt) {
      events.push({
        id: `${step.id}-completed`,
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        timestamp: step.completedAt,
        status: step.status,
        tone: 'status',
        label: stepStatusMeta[step.status].label,
        message: step.status === 'completed' ? '节点已完成执行' : '节点状态已更新',
      })
    }
  }

  return events.sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  )
}

export const ExecutionTimeline = memo(function ExecutionTimeline({
  steps,
  selectedNodeId,
  onSelectNode,
}: ExecutionTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const events = useMemo(() => buildTimelineEvents(steps), [steps])
  const latestEventId = events.at(-1)?.id ?? null

  useEffect(() => {
    if (!latestEventId) {
      return
    }

    const element = scrollContainerRef.current
    if (!element) {
      return
    }

    element.scrollTop = element.scrollHeight
  }, [latestEventId])

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-3xl border border-border/70 bg-background/80" data-testid="execution-timeline">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">执行时间线</h2>
        <p className="text-xs text-muted-foreground">按时间顺序查看节点状态变化、输出与错误。</p>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            No execution events yet
          </div>
        ) : (
          <div className="relative space-y-4 before:absolute before:bottom-0 before:left-[17px] before:top-0 before:w-px before:bg-border/70">
            {events.map((event) => {
              const statusMeta = stepStatusMeta[event.status]
              const isSelected = event.nodeId === selectedNodeId

              return (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    'relative flex w-full items-start gap-3 rounded-2xl border border-transparent px-1 py-1 text-left transition hover:border-border/70 hover:bg-surface/70',
                    isSelected && 'border-primary/40 bg-primary/5',
                  )}
                  onClick={() => onSelectNode(event.nodeId)}
                  data-testid={`execution-timeline-item-${event.id}`}
                >
                  <span
                    className={cn(
                      'relative z-10 mt-2 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background',
                      event.tone === 'error' ? 'bg-rose-400' : event.tone === 'output' ? 'bg-primary' : statusMeta.dotClassName,
                    )}
                  />

                  <div className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-surface/60 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{event.nodeName}</p>
                        <p className="text-xs text-muted-foreground">{event.label}</p>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatClockTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground/90">{event.message}</p>
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
