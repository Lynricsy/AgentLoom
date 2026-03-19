import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonitoringTrendPoint } from '../types/monitoring'

interface MonitoringTrendChartProps {
  trend: MonitoringTrendPoint[]
  activeWindowLabel: string
}

export function MonitoringTrendChart({
  trend,
  activeWindowLabel,
}: MonitoringTrendChartProps) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
      data-testid="monitoring-trend-chart"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          执行趋势（{activeWindowLabel}）
        </h2>
        <p className="text-sm text-muted-foreground">
          这里仅展示当前窗口内的执行量变化。队列深度仍然会出现在摘要卡片、告警与热点中，但只代表当前 queue snapshot，不提供历史曲线。
        </p>
      </div>

      {trend.length === 0 ? (
        <div className="mt-5 flex h-72 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/20 text-sm text-muted-foreground">
          当前窗口内暂无趋势数据
        </div>
      ) : (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="bucketLabel"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                yAxisId="execution"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.75rem',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Line
                yAxisId="execution"
                type="monotone"
                dataKey="executionCount"
                name="执行量"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ fill: '#60a5fa', r: 4 }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
