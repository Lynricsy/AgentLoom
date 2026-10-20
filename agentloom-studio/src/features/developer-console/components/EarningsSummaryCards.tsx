import { BarChart3, DollarSign, Package, TrendingUp, type LucideIcon } from 'lucide-react'

import { EMPTY_VALUE } from '@/shared/lib/format'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import type { EarningsSummary } from '../api/developer-earnings.api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

interface SummaryCardProps {
  label: string
  value: string
  icon: LucideIcon
  isLoading: boolean
}

function SummaryCard({ label, value, icon: Icon, isLoading }: SummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon aria-hidden className="size-5 text-muted-foreground" />
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
    </Card>
  )
}

interface EarningsSummaryCardsProps {
  summary: EarningsSummary | undefined
  isLoading: boolean
  /** 请求失败且无缓存数据时显示占位「—」，而不是误导性的 0 */
  isError?: boolean
}

export function EarningsSummaryCards({
  summary,
  isLoading,
  isError = false,
}: EarningsSummaryCardsProps) {
  const fallback = isError && !summary ? EMPTY_VALUE : null
  const money = (value: string | undefined) =>
    fallback ?? currencyFormatter.format(value ? parseFloat(value) : 0)
  const count = (value: number | undefined) =>
    fallback ?? numberFormatter.format(value ?? 0)

  // 月结在次月 1 日生成：「已结算」系列只含月结记录，「本月收入」「待结算分成」来自计费流水实时汇总
  const cards = [
    { label: '已结算收入', value: money(summary?.totalRevenue), icon: DollarSign },
    { label: '本月收入', value: money(summary?.currentMonthRevenue), icon: TrendingUp },
    { label: '待结算分成', value: money(summary?.accruedDeveloperShare), icon: TrendingUp },
    { label: '开发者分成', value: money(summary?.totalDeveloperShare), icon: DollarSign },
    { label: '待打款', value: money(summary?.pendingPayout), icon: TrendingUp },
    { label: '已打款', value: money(summary?.completedPayout), icon: DollarSign },
    { label: '已结算次数', value: count(summary?.totalExecutions), icon: BarChart3 },
    { label: '活跃插件数', value: count(summary?.activePlugins), icon: Package },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          isLoading={isLoading}
        />
      ))}
    </div>
  )
}
