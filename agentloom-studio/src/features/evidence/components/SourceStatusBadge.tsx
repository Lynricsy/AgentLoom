import { memo } from 'react'
import { cva } from 'class-variance-authority'
import { AlertTriangle, Ban, Check } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

type SourceStatus = 'valid' | 'modified' | 'unavailable'

interface SourceStatusBadgeProps {
  hashValid: boolean
  sourceModified?: boolean
  sourceUnavailable?: boolean
  unavailableReason?: string
  className?: string
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      status: {
        valid: 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
        modified: 'border border-amber-500/20 bg-amber-500/10 text-amber-600',
        unavailable: 'border border-border/60 bg-muted text-muted-foreground',
      },
    },
  },
)

function deriveStatus(props: SourceStatusBadgeProps): SourceStatus {
  if (props.sourceUnavailable) return 'unavailable'
  if (props.sourceModified || !props.hashValid) return 'modified'
  return 'valid'
}

const statusConfig: Record<
  SourceStatus,
  { icon: typeof Check; label: string }
> = {
  valid: { icon: Check, label: '来源完整' },
  modified: { icon: AlertTriangle, label: '来源已修改' },
  unavailable: { icon: Ban, label: '来源不可用' },
}

export const SourceStatusBadge = memo(function SourceStatusBadge(
  props: SourceStatusBadgeProps,
) {
  const status = deriveStatus(props)
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(badgeVariants({ status }), props.className)}
      title={
        status === 'unavailable' ? props.unavailableReason : undefined
      }
      data-testid="source-status-badge"
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
})
