import { memo } from 'react'
import { cn } from '@/shared/lib/utils'
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
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        isHealthy
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-amber-500/15 text-amber-400',
      )}
      data-testid="adoption-stats-badge"
    >
      采纳率: {adoptionPct}% {isHealthy ? '✓' : '⚠'}
    </span>
  )
})
