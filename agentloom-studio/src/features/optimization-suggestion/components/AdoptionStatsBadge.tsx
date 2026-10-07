import { memo } from 'react'
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

  const adoptionPct = Math.round(stats.adoptionRate * 100)
  const isHealthy = stats.adoptionRate >= 0.5

  return (
    <StatusBadge
      tone={isHealthy ? 'success' : 'warning'}
      data-testid="adoption-stats-badge"
    >
      采纳率: {adoptionPct}% {isHealthy ? '✓' : '⚠'}
    </StatusBadge>
  )
})
