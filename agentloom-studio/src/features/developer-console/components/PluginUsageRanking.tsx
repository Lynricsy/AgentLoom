import { BarChart3 } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { formatPercent } from '@/shared/lib/format'
import { Card } from '@/shared/ui/card'
import type { PluginUsageRank } from '../api/developer-earnings.api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

interface PluginUsageRankingProps {
  rankings: PluginUsageRank[] | undefined
  isLoading: boolean
}

const COLUMNS: DataTableColumn<PluginUsageRank>[] = [
  {
    key: 'pluginName',
    header: '插件名称',
    className: 'w-full max-w-0',
    cell: (rank) => (
      <span className="block truncate font-medium text-foreground" title={rank.pluginName}>
        {rank.pluginName}
      </span>
    ),
  },
  {
    key: 'executionCount',
    header: '使用次数',
    align: 'right',
    nowrap: true,
    cellClassName: 'text-muted-foreground',
    cell: (rank) => numberFormatter.format(rank.executionCount),
  },
  {
    key: 'revenue',
    header: '收入',
    align: 'right',
    nowrap: true,
    cell: (rank) => currencyFormatter.format(parseFloat(rank.revenue)),
  },
  {
    key: 'percentage',
    header: '占比',
    align: 'right',
    nowrap: true,
    cellClassName: 'text-muted-foreground',
    // 服务端返回 0–100 的百分数
    cell: (rank) => formatPercent(rank.percentage / 100),
  },
]

export function PluginUsageRanking({
  rankings,
  isLoading,
}: PluginUsageRankingProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">
          插件使用排名
        </h3>
      </div>

      <DataTable
        columns={COLUMNS}
        data={rankings ?? []}
        rowKey={(rank) => rank.pluginId}
        loading={isLoading}
        skeletonRows={4}
        className="rounded-none border-0"
        empty={<EmptyState variant="plain" icon={BarChart3} title="暂无使用数据" />}
      />
    </Card>
  )
}
