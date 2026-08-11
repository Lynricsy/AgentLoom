import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import type { MonitoringTrendPoint } from '../types/monitoring'

interface MonitoringTrendChartProps {
  trend: MonitoringTrendPoint[]
  activeWindowLabel: string
}

/** recharts 只接受具体色值字符串，统一从设计令牌变量读取 */
const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 12 }
const AXIS_LINE = { stroke: 'var(--color-border)' }

export function MonitoringTrendChart({
  trend,
  activeWindowLabel,
}: MonitoringTrendChartProps) {
  return (
    <Card data-testid="monitoring-trend-chart">
      <CardHeader>
        <CardTitle>执行趋势（{activeWindowLabel}）</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          这里仅展示当前窗口内的执行量变化。队列深度仍然会出现在摘要卡片、告警与热点中，但只代表当前 queue snapshot，不提供历史曲线。
        </p>
      </CardHeader>

      <CardContent>
        {trend.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-card border border-dashed border-border bg-surface-elevated text-xs text-muted">
            当前窗口内暂无趋势数据
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="bucketLabel"
                  tick={AXIS_TICK}
                  axisLine={AXIS_LINE}
                  tickLine={AXIS_LINE}
                />
                <YAxis
                  yAxisId="execution"
                  tick={AXIS_TICK}
                  axisLine={AXIS_LINE}
                  tickLine={AXIS_LINE}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    color: 'var(--color-foreground)',
                  }}
                  labelStyle={{ color: 'var(--color-muted)' }}
                />
                <Line
                  yAxisId="execution"
                  type="monotone"
                  dataKey="executionCount"
                  name="执行量"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-primary)', r: 3 }}
                  activeDot={{ r: 5, fill: 'var(--color-primary)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
