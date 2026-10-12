import { memo, useMemo, type ReactNode } from 'react'
import { MousePointerClick } from 'lucide-react'
import { JsonTreeView } from '@/shared/components/json'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Card } from '@/shared/ui/card'
import { StatusBadge } from '@/shared/ui/status-badge'
import type { ExecutionStep } from '../types'
import {
  STEP_STATUS_META,
  formatExecutionDateTime,
  formatExecutionDuration,
} from '../lib/presentation'

interface ExecutionNodeDetailProps {
  step: ExecutionStep | null
  /** 头部右侧的附加操作（例如打开 Agent 运行视图），与状态徽章同行，避免出现/消失时整体跳动 */
  actions?: ReactNode
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export const ExecutionNodeDetail = memo(function ExecutionNodeDetail({
  step,
  actions,
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
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 break-words text-sm font-semibold text-foreground">{step.nodeName}</h2>
            <StatusBadge
              tone={STEP_STATUS_META[step.status].tone}
              dot
              pulse={step.status === 'running'}
              className="shrink-0"
              data-testid="step-status-badge"
            >
              {STEP_STATUS_META[step.status].label}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{step.nodeType}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <DetailSection title="节点信息">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">节点 ID</dt>
              <dd className="mt-1 truncate font-mono text-sm text-foreground" title={step.nodeId}>
                {step.nodeId}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">步骤 ID</dt>
              <dd className="mt-1 truncate font-mono text-sm text-foreground" title={step.id}>
                {step.id}
              </dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="输入">
          {step.input ? (
            <JsonTreeView value={step.input} />
          ) : (
            <p className="text-sm text-muted-foreground">无输入数据</p>
          )}
        </DetailSection>

        <DetailSection title="输出">
          {step.output ? (
            <JsonTreeView value={step.output} />
          ) : (
            <p className="text-sm text-muted-foreground">无输出数据</p>
          )}
        </DetailSection>

        {step.errorMessage ? (
          <DetailSection title="错误">
            <div className="whitespace-pre-wrap break-words rounded-lg border border-error/30 bg-error/10 px-3 py-3 text-sm text-error">
              {step.errorMessage}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="耗时">
          <dl className="grid gap-3 text-sm tabular-nums sm:grid-cols-2">
            {timingRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
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
                  className="rounded-lg border border-border bg-surface px-3 py-3"
                >
                  <p className="text-sm font-medium text-foreground">第 {attempt.attempt} 次尝试</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatExecutionDateTime(attempt.timestamp)}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{attempt.error}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}
      </div>
    </Card>
  )
})
