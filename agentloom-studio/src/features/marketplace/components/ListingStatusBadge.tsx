import { memo } from 'react'

import { Badge } from '@/shared/ui/badge'
import { MARKETPLACE_STATUS_VARIANT } from '../lib/display'
import type { MarketplaceListingStatus } from '../types'

interface ListingStatusBadgeProps {
  status: MarketplaceListingStatus
}

const STATUS_LABELS: Record<MarketplaceListingStatus, string> = {
  pending_review: '审核中',
  listed: '已上架',
  review_failed: '审核未通过',
  unlisted: '已下架',
}

export const ListingStatusBadge = memo(function ListingStatusBadge({
  status,
}: ListingStatusBadgeProps) {
  return (
    <Badge
      variant={MARKETPLACE_STATUS_VARIANT[status]}
      data-testid="listing-status-badge"
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
})

export default ListingStatusBadge
