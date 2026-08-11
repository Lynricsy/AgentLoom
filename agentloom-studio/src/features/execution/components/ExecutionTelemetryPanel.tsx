import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, TriangleAlert } from 'lucide-react'
import { useExecutionRecords } from '../hooks/useExecutionRecords'
import {
  EXECUTION_RECORD_PAGE_SIZE,
  type ExecutionRecord,
} from '../api/executionRecordApi'
import { formatExecutionDateTime } from '../lib/presentation'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { JsonTreeView } from '@/shared/components/json/JsonTreeView'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'

const numberFormatter = new Intl.NumberFormat('zh-CN')

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }

  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} 分钟`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} 秒`
  }

  return `${Math.round(value)} 毫秒`
}

function RecordMeta({ record }: { record: ExecutionRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="font-medium text-foreground">
        {record.nodeId ?? (record.stepId ? `步骤 ${record.stepId.slice(0, 8)}` : '整次执行')}
      </span>
      <span>{formatExecutionDateTime(record.createdAt)}</span>
    </div>
  )
}

function SummaryRecordCard({ record }: { record: ExecutionRecord }) {
  const summary = record.summaryData

  const metrics = summary
    ? ([
        ['总步骤', numberFormatter.format(summary.totalSteps)],
        ['已完成', numberFormatter.format(summary.completedSteps)],
        ['失败', numberFormatter.format(summary.failedSteps)],
        ['工具调用', numberFormatter.format(summary.totalToolCalls)],
        ['自修复', numberFormatter.format(summary.totalSelfRepairs)],
        ['Tokens', numberFormatter.format(summary.totalTokens)],
        ['平均步骤耗时', formatLatency(summary.avgStepLatencyMs)],
        ['执行总耗时', formatLatency(summary.executionDurationMs)],
      ] as const)
    : []

  return (
    <Card data-testid={`telemetry-summary-${record.id}`}>
      <CardContent className="space-y-3 p-4">
        <RecordMeta record={record} />

        {metrics.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-[11px] text-muted">{label}</dt>
                <dd className="truncate text-sm font-medium tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <JsonTreeView
          value={record.summaryData}
          name="summaryData"
          defaultExpandedDepth={0}
          dataTestId={`telemetry-summary-json-${record.id}`}
        />
      </CardContent>
    </Card>
  )
}

function TelemetryRecordCard({ record }: { record: ExecutionRecord }) {
  const telemetry = record.telemetryData

  return (
    <Card data-testid={`telemetry-step-${record.id}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RecordMeta record={record} />

          {telemetry ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" size="sm">
                工具调用 {telemetry.toolCalls?.length ?? 0}
              </Badge>
              <Badge
                variant={telemetry.errors?.length ? 'error' : 'secondary'}
                size="sm"
              >
                错误 {telemetry.errors?.length ?? 0}
              </Badge>
              <Badge
                variant={telemetry.selfRepairs?.length ? 'warning' : 'secondary'}
                size="sm"
              >
                自修复 {telemetry.selfRepairs?.length ?? 0}
              </Badge>
              {telemetry.llmInteractions ? (
                <Badge variant="info" size="sm">
                  {telemetry.llmInteractions.totalTokens} tokens ·{' '}
                  {formatLatency(telemetry.llmInteractions.latencyMs)}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <JsonTreeView
          value={record.telemetryData}
          name="telemetryData"
          defaultExpandedDepth={0}
          dataTestId={`telemetry-step-json-${record.id}`}
        />
      </CardContent>
    </Card>
  )
}

/**
 * 执行遥测面板：按 recordType 分组展示 execution_summary 与 step_telemetry。
 * 只读视图，分页走服务端 limit/offset。
 */
export const ExecutionTelemetryPanel = memo(function ExecutionTelemetryPanel({
  executionId,
}: {
  executionId: string
}) {
  const { notify } = useToast()
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useExecutionRecords(executionId, {
    limit: EXECUTION_RECORD_PAGE_SIZE,
    offset: (page - 1) * EXECUTION_RECORD_PAGE_SIZE,
  })
  const notifiedErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isError) {
      notifiedErrorRef.current = null
      return
    }

    const message = error instanceof Error ? error.message : '未知错误'
    if (notifiedErrorRef.current === message) {
      return
    }

    notifiedErrorRef.current = message
    notify({
      variant: 'error',
      title: '加载执行遥测失败',
      description: message,
    })
  }, [error, isError, notify])

  const { summaries, stepRecords } = useMemo(() => {
    const records = data?.data ?? []

    return {
      summaries: records.filter(
        (record) => record.recordType === 'execution_summary',
      ),
      stepRecords: records.filter(
        (record) => record.recordType === 'step_telemetry',
      ),
    }
  }, [data?.data])

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="execution-telemetry-loading">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="execution-telemetry-error">
        <EmptyState
          icon={TriangleAlert}
          tone="var(--color-error)"
          title="加载执行遥测失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      </div>
    )
  }

  if (summaries.length === 0 && stepRecords.length === 0) {
    return (
      <div data-testid="execution-telemetry-empty">
        <EmptyState
          icon={Gauge}
          title="暂无遥测记录"
          description="本次执行还没有产生步骤遥测或执行汇总记录；Agent 步骤完成后会自动写入。"
        />
      </div>
    )
  }

  const meta = data?.meta
  const hasPrev = page > 1
  const hasMore = meta?.hasMore ?? false

  return (
    <div className="space-y-6" data-testid="execution-telemetry-panel">
      <section className="space-y-3" data-testid="execution-telemetry-summary-group">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">执行汇总</h3>
          <Badge variant="secondary" size="sm">
            {summaries.length}
          </Badge>
        </div>

        {summaries.length === 0 ? (
          <p className="text-xs text-muted">当前页没有 execution_summary 记录。</p>
        ) : (
          summaries.map((record) => (
            <SummaryRecordCard key={record.id} record={record} />
          ))
        )}
      </section>

      <section className="space-y-3" data-testid="execution-telemetry-step-group">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">步骤遥测</h3>
          <Badge variant="secondary" size="sm">
            {stepRecords.length}
          </Badge>
        </div>

        {stepRecords.length === 0 ? (
          <p className="text-xs text-muted">当前页没有 step_telemetry 记录。</p>
        ) : (
          stepRecords.map((record) => (
            <TelemetryRecordCard key={record.id} record={record} />
          ))
        )}
      </section>

      {hasPrev || hasMore ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>
            共 {numberFormatter.format(meta?.total ?? 0)} 条 · 第 {page} 页
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              data-testid="execution-telemetry-prev"
            >
              上一页
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasMore}
              onClick={() => setPage((current) => current + 1)}
              data-testid="execution-telemetry-next"
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
})
