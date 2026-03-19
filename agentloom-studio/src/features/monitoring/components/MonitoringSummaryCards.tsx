import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Gauge,
  ShieldAlert,
} from 'lucide-react'
import {
  formatMonitoringCount,
  formatMonitoringDuration,
  formatMonitoringPercent,
} from '../lib/monitoring'
import type { MonitoringDashboardSummary } from '../types/monitoring'

interface SummaryCardProps {
  label: string
  value: string
  icon: ReactNode
}

function SummaryCard({ label, value, icon }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

interface MonitoringSummaryCardsProps {
  summary: MonitoringDashboardSummary
}

export function MonitoringSummaryCards({ summary }: MonitoringSummaryCardsProps) {
  const cards: SummaryCardProps[] = [
    {
      label: '执行量',
      value: formatMonitoringCount(summary.executionCount),
      icon: <Activity className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '成功率',
      value: formatMonitoringPercent(summary.successRate),
      icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '失败率',
      value: formatMonitoringPercent(summary.failureRate),
      icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '平均耗时',
      value: formatMonitoringDuration(summary.averageDurationMs),
      icon: <Clock3 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '队列深度',
      value: formatMonitoringCount(summary.queueDepth),
      icon: <Gauge className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '治理阻止',
      value: formatMonitoringCount(summary.governanceBlocks),
      icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" />,
    },
    {
      label: '活跃告警',
      value: formatMonitoringCount(summary.activeAlerts),
      icon: <Bell className="h-4 w-4" aria-hidden="true" />,
    },
  ]

  return (
    <section
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="monitoring-summary-cards"
    >
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </section>
  )
}
