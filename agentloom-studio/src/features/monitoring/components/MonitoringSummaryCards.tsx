import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Gauge,
  ShieldAlert,
} from 'lucide-react'
import { staggerList } from '@/shared/lib/motion'
import { Card, CardContent } from '@/shared/ui/card'
import {
  formatMonitoringCount,
  formatMonitoringDuration,
  formatMonitoringPercent,
} from '../lib/monitoring'
import type { MonitoringDashboardSummary } from '../types/monitoring'

interface SummaryCardProps {
  label: string
  value: string
  icon: LucideIcon
  /** 指标语义色，取自设计令牌 */
  tone: string
}

interface MonitoringSummaryCardsProps {
  summary: MonitoringDashboardSummary
}

export function MonitoringSummaryCards({ summary }: MonitoringSummaryCardsProps) {
  const cards: SummaryCardProps[] = [
    {
      label: '执行量',
      value: formatMonitoringCount(summary.executionCount),
      icon: Activity,
      tone: 'var(--color-primary)',
    },
    {
      label: '成功率',
      value: formatMonitoringPercent(summary.successRate),
      icon: CheckCircle2,
      tone: 'var(--color-success)',
    },
    {
      label: '失败率',
      value: formatMonitoringPercent(summary.failureRate),
      icon: AlertTriangle,
      tone: 'var(--color-error)',
    },
    {
      label: '平均耗时',
      value: formatMonitoringDuration(summary.averageDurationMs),
      icon: Clock3,
      tone: 'var(--color-info)',
    },
    {
      label: '队列深度',
      value: formatMonitoringCount(summary.queueDepth),
      icon: Gauge,
      tone: 'var(--color-node-control)',
    },
    {
      label: '治理阻止',
      value: formatMonitoringCount(summary.governanceBlocks),
      icon: ShieldAlert,
      tone: 'var(--color-warning)',
    },
    {
      label: '活跃告警',
      value: formatMonitoringCount(summary.activeAlerts),
      icon: Bell,
      tone: 'var(--color-node-memory)',
    },
  ]

  return (
    <section
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="monitoring-summary-cards"
    >
      {cards.map((card, index) => {
        const Icon = card.icon

        return (
          <motion.div key={card.label} {...staggerList(index)}>
            <Card className="h-full">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {card.value}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${card.tone} 14%, transparent)`,
                    color: card.tone,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </section>
  )
}
