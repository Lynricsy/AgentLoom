import { memo, useMemo, type ReactNode } from 'react'
import { MousePointerClick } from 'lucide-react'
import { JsonTreeView } from '@/shared/components/json'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Card } from '@/shared/ui/card'
import type { ExecutionStep } from '../types'
import {
  formatExecutionDateTime,
  formatExecutionDuration,
} from '../lib/presentation'
import { StepStatusBadge } from './StatusBadge'

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
    <section className="space-y-3 rounded-card border border-border bg-surface-elevated p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{title}</h3>
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
      <Card
        className="flex h-full min-h-[320px] items-center justify-center p-4"
        data-testid="execution-node-detail-empty"
      >
        <EmptyState
          className="border-0 px-0 py-0"
          icon={MousePointerClick}
          title="选择节点查看详情"
          description="点击画布节点或时间线条目后，这里会展示完整输入、输出与执行结果。"
        />
      </Card>
    )
  }

  return (
    <Card
      className="flex h-full min-h-[320px] flex-col overflow-hidden"
      data-testid="execution-node-detail"
    >
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{step.nodeName}</h2>
          <StepStatusBadge status={step.status} />
        </div>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{step.nodeType}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <DetailSection title="节点信息">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted">节点 ID</dt>
              <dd className="mt-1 break-all font-mono text-foreground">{step.nodeId}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted">步骤 ID</dt>
              <dd className="mt-1 break-all font-mono text-foreground">{step.id}</dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="输入">
          {step.input ? (
            <JsonTreeView value={step.input} />
          ) : (
            <p className="text-sm text-muted">无输入数据</p>
          )}
        </DetailSection>

        <DetailSection title="输出">
          {step.output ? (
            <JsonTreeView value={step.output} />
          ) : (
            <p className="text-sm text-muted">无输出数据</p>
          )}
        </DetailSection>

        {step.errorMessage ? (
          <DetailSection title="错误">
            <div className="rounded-card border border-error/30 bg-error/10 px-3 py-3 text-sm text-error">
              {step.errorMessage}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="耗时">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {timingRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd className="mt-1 text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>

        {step.retryHistory && step.retryHistory.length > 0 ? (
          <DetailSection title="重试历史">
            <div className="space-y-2">
              {step.retryHistory.map((attempt) => (
                <div
                  key={`${attempt.attempt}-${attempt.timestamp}`}
                  className="rounded-card border border-border bg-surface px-3 py-3"
                >
                  <p className="text-sm font-medium text-foreground">第 {attempt.attempt} 次尝试</p>
                  <p className="mt-1 text-xs text-muted">{formatExecutionDateTime(attempt.timestamp)}</p>
                  <p className="mt-2 text-sm text-foreground">{attempt.error}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}
      </div>
    </Card>
  )
})
