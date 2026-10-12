import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import type { MonthlyTrend } from '../api/developer-earnings.api'

// 与 EarningsSummaryCards / PluginUsageRanking / SettlementHistory 的金额格式保持一致
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

interface MonthlyTrendChartProps {
  trends: MonthlyTrend[] | undefined
  isLoading: boolean
}

export function MonthlyTrendChart({
  trends,
  isLoading,
}: MonthlyTrendChartProps) {
  const chartData = trends?.map((t) => ({
    month: t.month,
    revenue: parseFloat(t.revenue),
  }))

  return (
    <Card className="p-4">
      <h3 className="mb-4 text-base font-semibold text-foreground">
        月度收入趋势
      </h3>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !chartData || chartData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          暂无趋势数据
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={{ stroke: 'var(--color-border)' }}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.5rem',
                  color: 'var(--color-foreground)',
                }}
                formatter={(value) => [currencyFormatter.format(Number(value)), '收入']}
                labelStyle={{ color: 'var(--color-muted-foreground)' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-primary)', r: 4 }}
                activeDot={{ r: 6, fill: 'var(--color-primary)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
