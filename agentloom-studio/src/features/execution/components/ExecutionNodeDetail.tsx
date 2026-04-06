import { memo, useMemo, type ReactNode } from 'react'
import { JsonTreeView } from '@/shared/components/json'
import type { ExecutionStep } from '../types'
import {
  formatExecutionDateTime,
  formatExecutionDuration,
  stepStatusMeta,
} from '../lib/presentation'
import { cn } from '@/shared/lib/utils'

interface ExecutionNodeDetailProps {
  step: ExecutionStep | null
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-surface/60 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export const ExecutionNodeDetail = memo(function ExecutionNodeDetail({
  step,
}: ExecutionNodeDetailProps) {
  const timingRows = useMemo(() => {
    if (!step) {
      return []
    }

    return [
      { label: '开始时间', value: formatExecutionDateTime(step.startedAt) },
      { label: '结束时间', value: formatExecutionDateTime(step.completedAt) },
      { label: '耗时', value: formatExecutionDuration(step.startedAt, step.completedAt) },
      { label: '重试次数', value: `${step.retryCount}` },
    ]
  }, [step])

  if (!step) {
    return (
      <section className="flex h-full min-h-[320px] items-center justify-center rounded-3xl border border-border/70 bg-background/80 text-center" data-testid="execution-node-detail-empty">
        <div>
          <p className="text-sm font-medium text-foreground">Select a node to view details</p>
          <p className="mt-2 text-xs text-muted-foreground">点击画布节点或时间线条目后，这里会展示完整输入、输出与执行结果。</p>
        </div>
      </section>
    )
  }

  const statusMeta = stepStatusMeta[step.status]

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-3xl border border-border/70 bg-background/80" data-testid="execution-node-detail">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{step.nodeName}</h2>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              statusMeta.badgeClassName,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dotClassName)} />
            {statusMeta.label}
          </span>
        </div>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{step.nodeType}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <DetailSection title="Node Info">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Node ID</dt>
              <dd className="mt-1 font-mono text-foreground/90">{step.nodeId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Step ID</dt>
              <dd className="mt-1 font-mono text-foreground/90">{step.id}</dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="Inputs">
          {step.input ? (
            <JsonTreeView value={step.input} />
          ) : (
            <p className="text-sm text-muted-foreground">无输入数据</p>
          )}
        </DetailSection>

        <DetailSection title="Outputs">
          {step.output ? (
            <JsonTreeView value={step.output} />
          ) : (
            <p className="text-sm text-muted-foreground">无输出数据</p>
          )}
        </DetailSection>

        {step.errorMessage ? (
          <DetailSection title="Error">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
              {step.errorMessage}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="Timing">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {timingRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 text-foreground/90">{row.value}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>

        {step.retryHistory && step.retryHistory.length > 0 ? (
          <DetailSection title="Retry History">
            <div className="space-y-2">
              {step.retryHistory.map((attempt) => (
                <div key={`${attempt.attempt}-${attempt.timestamp}`} className="rounded-2xl border border-border/60 bg-background/60 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Attempt #{attempt.attempt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatExecutionDateTime(attempt.timestamp)}</p>
                  <p className="mt-2 text-sm text-foreground/90">{attempt.error}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}
      </div>
    </section>
  )
})
