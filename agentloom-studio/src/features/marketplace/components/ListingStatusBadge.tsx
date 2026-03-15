import { memo } from 'react'

import { cn } from '@/shared/lib/utils'
import type { MarketplaceListingStatus } from '../types'

interface ListingStatusBadgeProps {
  status: MarketplaceListingStatus
}

const STATUS_CONFIG: Record<
  MarketplaceListingStatus,
  { label: string; className: string }
> = {
  pending_review: {
    label: '审核中',
    className: 'bg-amber-500/15 text-amber-400',
  },
  listed: {
    label: '已上架',
    className: 'bg-emerald-500/15 text-emerald-400',
  },
  review_failed: {
    label: '审核未通过',
    className: 'bg-red-500/15 text-red-400',
  },
  unlisted: {
    label: '已下架',
    className: 'bg-zinc-500/15 text-zinc-400',
  },
}

export const ListingStatusBadge = memo(function ListingStatusBadge({
  status,
}: ListingStatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
      data-testid="listing-status-badge"
    >
      {config.label}
    </span>
  )
})

export default ListingStatusBadge
