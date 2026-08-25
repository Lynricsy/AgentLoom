import { useCallback, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Activity, AlertCircle, ArrowLeft, Receipt } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import {
  usePluginById,
  usePluginUsage,
  usePluginUsageSummary,
} from '../api/pluginQueries'
import {
  toPluginUsageRange,
  type PluginUsageSearch,
} from '../lib/usageSearch'
import type { PluginUsageRecord } from '../types'

const PAGE_SIZE = 20

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})

const numberFormatter = new Intl.NumberFormat('en-US')

/** 计费金额为 null 表示免费执行，不是「零元」 */
function formatBilling(amount: string | null, currency: string): string {
  if (amount === null) return '免费'

  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`

  return currency === 'USD' ? usdFormatter.format(value) : `${amount} ${currency}`
}

function formatDuration(durationMs: string | number | null): string {
  if (durationMs === null) return '—'

  const value = Number(durationMs)
  if (!Number.isFinite(value)) return '—'
  if (value < 1000) return `${numberFormatter.format(Math.round(value))} ms`

  return `${(value / 1000).toFixed(2)} s`
}

interface SummaryTileProps {
  label: string
  value: string
  isLoading: boolean
}

function SummaryTile({ label, value, isLoading }: SummaryTileProps) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-24 rounded-md" />
      ) : (
        <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      )}
    </div>
  )
}

export interface PluginUsagePageProps {
  pluginDbId: string
  search: PluginUsageSearch
  onSearchChange: (updates: Partial<PluginUsageSearch>) => void
  onPageChange: (page: number) => void
}

export function PluginUsagePage({
  pluginDbId,
  search,
  onSearchChange,
  onPageChange,
}: PluginUsagePageProps) {
  const range = useMemo(() => toPluginUsageRange(search), [search])

  const pluginQuery = usePluginById(pluginDbId)
  const summaryQuery = usePluginUsageSummary(pluginDbId, {
    periodStart: range.startDate,
    periodEnd: range.endDate,
  })
  const usageQuery = usePluginUsage(pluginDbId, {
    page: search.page,
    pageSize: PAGE_SIZE,
    startDate: range.startDate,
    endDate: range.endDate,
  })

  const plugin = pluginQuery.data?.data
  const summary = summaryQuery.data?.data
  const records = usageQuery.data?.data ?? []
  const meta = usageQuery.data?.meta

  const columns = useMemo<DataTableColumn<PluginUsageRecord>[]>(
    () => [
      {
        key: 'createdAt',
        header: '时间 (UTC)',
        className: 'w-44',
        cell: (record) => (
          <span className="text-muted">
            {DATE_TIME_FORMATTER.format(new Date(record.createdAt))}
          </span>
        ),
      },
      {
        key: 'executionId',
        header: '执行',
        className: 'w-full max-w-0',
        cell: (record) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-foreground">
              {record.executionId}
            </p>
            <p className="truncate font-mono text-[11px] text-muted">
              step {record.stepId}
            </p>
          </div>
        ),
      },
      {
        key: 'duration',
        header: '耗时',
        className: 'w-24',
        hideBelow: 'sm',
        cell: (record) => (
          <span className="text-muted">
            {formatDuration(record.executionDurationMs)}
          </span>
        ),
      },
      {
        key: 'billing',
        header: '计费金额',
        className: 'w-32',
        cell: (record) => (
          <span className="text-foreground">
            {formatBilling(record.billingAmount, record.currency)}
          </span>
        ),
      },
      {
        key: 'sourceListing',
        header: '来源 listing',
        className: 'w-48',
        hideBelow: 'lg',
        cell: (record) =>
          record.sourceListingId ? (
            <span className="truncate font-mono text-xs text-muted">
              {record.sourceListingId}
            </span>
          ) : (
            <span className="text-muted">本地插件</span>
          ),
      },
    ],
    [],
  )

  const handlePeriodStartChange = useCallback(
    (value: string) => {
      onSearchChange({ periodStart: value })
    },
    [onSearchChange],
  )

  const handlePeriodEndChange = useCallback(
    (value: string) => {
      onSearchChange({ periodEnd: value })
    },
    [onSearchChange],
  )

  return (
    <div
      className="flex h-full flex-col gap-5 overflow-y-auto p-6"
      data-testid="plugin-usage-page"
    >
      <PageHeader
        icon={Receipt}
        tone="var(--color-node-plugin)"
        title={plugin ? `${plugin.name} · 用量` : '插件用量'}
        description="按周期查看该插件的执行次数、计费金额与逐条调用流水。"
        actions={
          <Link
            to="/resources/plugins"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            <ArrowLeft className="h-4 w-4" />
            返回插件列表
          </Link>
        }
      />

      <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-3 sm:flex-row sm:items-end sm:p-4">
        <div className="space-y-1.5">
          <label
            htmlFor="usage-period-start"
            className="block text-xs font-medium text-muted"
          >
            开始日期 (UTC)
          </label>
          <Input
            id="usage-period-start"
            type="date"
            value={search.periodStart}
            max={search.periodEnd}
            onChange={(event) => handlePeriodStartChange(event.target.value)}
            data-testid="usage-period-start"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="usage-period-end"
            className="block text-xs font-medium text-muted"
          >
            结束日期 (UTC)
          </label>
          <Input
            id="usage-period-end"
            type="date"
            value={search.periodEnd}
            min={search.periodStart}
            onChange={(event) => handlePeriodEndChange(event.target.value)}
            data-testid="usage-period-end"
          />
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        data-testid="plugin-usage-summary"
      >
        <SummaryTile
          label="总执行次数"
          value={
            summary ? numberFormatter.format(summary.totalExecutions) : '0'
          }
          isLoading={summaryQuery.isLoading}
        />
        <SummaryTile
          label="总计费金额"
          value={
            summary?.totalBillingAmount
              ? usdFormatter.format(Number(summary.totalBillingAmount))
              : '免费'
          }
          isLoading={summaryQuery.isLoading}
        />
        <SummaryTile
          label="平均耗时"
          value={formatDuration(summary?.avgDurationMs ?? null)}
          isLoading={summaryQuery.isLoading}
        />
      </div>

      {usageQuery.isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="用量流水加载失败"
          description="请稍后重试，或确认当前账号有查看该插件的权限。"
          action={
            <Button variant="outline" onClick={() => void usageQuery.refetch()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={records}
          rowKey={(record) => record.id}
          loading={usageQuery.isLoading}
          empty={
            <EmptyState
              icon={Activity}
              tone="var(--color-node-plugin)"
              title="该周期内没有用量记录"
              description="调整上方的日期区间，或先在工作流中运行一次这个插件节点。"
            />
          }
          pagination={
            meta && meta.total > PAGE_SIZE
              ? {
                  page: meta.page,
                  pageSize: meta.pageSize,
                  total: meta.total,
                  onPageChange,
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
