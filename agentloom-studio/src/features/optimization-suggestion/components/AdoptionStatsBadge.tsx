import { memo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { formatPercent } from '@/shared/lib/format'
import { StatusBadge } from '@/shared/ui/status-badge'
import { useAdoptionStats } from '../api/optimization-suggestion-queries'

interface AdoptionStatsBadgeProps {
  workflowDefinitionId?: string
}

export const AdoptionStatsBadge = memo(function AdoptionStatsBadge({
  workflowDefinitionId,
}: AdoptionStatsBadgeProps) {
  const { data: stats, isLoading } = useAdoptionStats(workflowDefinitionId)

  if (isLoading || !stats || stats.total === 0) {
    return null
  }

  const isHealthy = stats.adoptionRate >= 0.5
  const Icon = isHealthy ? Check : AlertTriangle

  return (
    <StatusBadge
      tone={isHealthy ? 'success' : 'warning'}
      data-testid="adoption-stats-badge"
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">采纳率 {formatPercent(stats.adoptionRate, 0)}</span>
    </StatusBadge>
  )
})
