import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/shared/lib/utils'

import type { EncryptionKeyStatus } from '../types'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide',
  {
    variants: {
      status: {
        active: 'bg-emerald-500/15 text-emerald-500',
        rotating: 'bg-amber-500/15 text-amber-500',
        revoked: 'bg-rose-500/15 text-rose-500',
      },
    },
    defaultVariants: {
      status: 'active',
    },
  },
)

const STATUS_LABELS: Record<EncryptionKeyStatus, string> = {
  active: '活跃',
  rotating: '轮换中',
  revoked: '已撤销',
}

interface KeyStatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: EncryptionKeyStatus
  className?: string
}

export function KeyStatusBadge({ status, className }: KeyStatusBadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ status }), className)}
      data-testid="key-status-badge"
    >
      <span
        className={cn('inline-block h-1.5 w-1.5 rounded-full', {
          'bg-emerald-500': status === 'active',
          'bg-amber-500': status === 'rotating',
          'bg-rose-500': status === 'revoked',
        })}
      />
      {STATUS_LABELS[status]}
    </span>
  )
}
