import { cn } from '@/shared/lib/utils'
import type { EarningsSummary } from '../api/developer-earnings.api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

interface SummaryCardProps {
  label: string
  value: string
  icon: React.ReactNode
  isLoading: boolean
}

function SummaryCard({ label, value, icon, isLoading }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      {isLoading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className="text-2xl font-bold text-foreground">{value}</p>
      )}
    </div>
  )
}

function DollarSignIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function TrendingUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function BarChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  )
}

interface EarningsSummaryCardsProps {
  summary: EarningsSummary | undefined
  isLoading: boolean
}

export function EarningsSummaryCards({
  summary,
  isLoading,
}: EarningsSummaryCardsProps) {
  const cards = [
    {
      label: '总收入',
      value: summary
        ? currencyFormatter.format(parseFloat(summary.totalRevenue))
        : '$0.00',
      icon: <DollarSignIcon />,
    },
    {
      label: '本月收入',
      value: summary
        ? currencyFormatter.format(parseFloat(summary.currentMonthRevenue))
        : '$0.00',
      icon: <TrendingUpIcon />,
    },
    {
      label: '开发者分成',
      value: summary
        ? currencyFormatter.format(parseFloat(summary.totalDeveloperShare))
        : '$0.00',
      icon: <DollarSignIcon />,
    },
    {
      label: '待打款',
      value: summary
        ? currencyFormatter.format(parseFloat(summary.pendingPayout))
        : '$0.00',
      icon: <TrendingUpIcon />,
    },
    {
      label: '已打款',
      value: summary
        ? currencyFormatter.format(parseFloat(summary.completedPayout))
        : '$0.00',
      icon: <DollarSignIcon />,
    },
    {
      label: '总使用次数',
      value: summary
        ? numberFormatter.format(summary.totalExecutions)
        : '0',
      icon: <BarChartIcon />,
    },
    {
      label: '活跃插件数',
      value: summary
        ? numberFormatter.format(summary.activePlugins)
        : '0',
      icon: <PackageIcon />,
    },
  ]

  return (
    <div
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4')}
    >
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
