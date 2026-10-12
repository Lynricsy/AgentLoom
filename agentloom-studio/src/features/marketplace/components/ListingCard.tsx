import { memo, useCallback } from 'react'

import {
  Calendar,
  Eye,
  EyeOff,
  Pencil,
  Puzzle,
  RefreshCw,
  Workflow,
} from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusBadge } from '@/shared/ui/status-badge'
import { formatDate } from '@/shared/lib/format'
import {
  MARKETPLACE_LISTING_TYPE_META,
  MARKETPLACE_PRICING_VARIANT,
  MARKETPLACE_STATUS_META,
  formatMarketplacePrice,
} from '../lib/display'
import type { MyMarketplaceListingItem } from '../types'

interface ListingCardProps {
  listing: MyMarketplaceListingItem
  onUnlist?: (listing: MyMarketplaceListingItem) => void
  onRelist?: (listing: MyMarketplaceListingItem) => void
  onViewReview?: (listing: MyMarketplaceListingItem) => void
  /** 仅插件 listing 支持编辑（PATCH /plugins/marketplace/listings/:id） */
  onEdit?: (listing: MyMarketplaceListingItem) => void
}

export const ListingCard = memo(function ListingCard({
  listing,
  onUnlist,
  onRelist,
  onViewReview,
  onEdit,
}: ListingCardProps) {
  const isPlugin = listing.listingType === 'plugin'
  const typeMeta = MARKETPLACE_LISTING_TYPE_META[listing.listingType]
  const TypeIcon = typeMeta.icon

  const handleUnlist = useCallback(() => {
    onUnlist?.(listing)
  }, [listing, onUnlist])

  const handleRelist = useCallback(() => {
    onRelist?.(listing)
  }, [listing, onRelist])

  const handleViewReview = useCallback(() => {
    onViewReview?.(listing)
  }, [listing, onViewReview])

  const handleEdit = useCallback(() => {
    onEdit?.(listing)
  }, [listing, onEdit])

  const canEditPlugin = isPlugin && onEdit != null && listing.status !== 'pending_review'

  const hasActions =
    canEditPlugin ||
    listing.status === 'listed' ||
    listing.status === 'unlisted' ||
    listing.status === 'review_failed'

  return (
    <Card className="flex h-full flex-col gap-3 p-4" data-testid="listing-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge tone={typeMeta.tone}>
            <TypeIcon className="size-3" />
            {typeMeta.label}
          </Badge>
          <Badge variant={MARKETPLACE_PRICING_VARIANT[listing.pricingModel]}>
            {formatMarketplacePrice(listing.pricingModel, listing.pricePerExecution)}
          </Badge>
        </div>
        <StatusBadge
          tone={MARKETPLACE_STATUS_META[listing.status].tone}
          className="shrink-0"
          data-testid="listing-status-badge"
        >
          {MARKETPLACE_STATUS_META[listing.status].label}
        </StatusBadge>
      </div>

      <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">
        {listing.title}
      </h3>

      {listing.workflowName ? (
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Workflow className="size-3 shrink-0" />
          <span className="min-w-0 truncate" title={listing.workflowName}>
            {listing.workflowName}
          </span>
          {listing.versionNumber != null ? (
            <span className="shrink-0 tabular-nums">v{listing.versionNumber}</span>
          ) : null}
        </div>
      ) : null}

      {isPlugin && listing.pluginName ? (
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Puzzle className="size-3 shrink-0" />
          <span className="min-w-0 truncate" title={listing.pluginName}>
            {listing.pluginName}
          </span>
          {listing.pluginVersion ? (
            <span className="shrink-0 tabular-nums">v{listing.pluginVersion}</span>
          ) : null}
        </div>
      ) : null}

      {listing.summary ? (
        <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
          {listing.summary}
        </p>
      ) : null}

      {listing.tags.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground">
          {listing.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="max-w-full truncate">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-1.5 text-2xs text-muted-foreground">
        <Calendar className="size-3 shrink-0" />
        <span className="tabular-nums">{formatDate(listing.submittedAt)}</span>
      </div>

      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {listing.status === 'listed' ? (
            <Button variant="outline" size="sm" onClick={handleUnlist}>
              <EyeOff />
              下架
            </Button>
          ) : null}

          {listing.status === 'unlisted' ? (
            <Button variant="outline" size="sm" onClick={handleRelist}>
              <Eye />
              重新上架
            </Button>
          ) : null}

          {listing.status === 'review_failed' ? (
            <>
              <Button variant="outline" size="sm" onClick={handleViewReview}>
                <Eye />
                查看审核结果
              </Button>
              {isPlugin ? (
                <Button variant="ghost" size="sm" onClick={handleRelist}>
                  <RefreshCw />
                  重新提交
                </Button>
              ) : (
                <Button variant="ghost" size="sm" disabled>
                  <RefreshCw />
                  重新提交
                </Button>
              )}
            </>
          ) : null}

          {canEditPlugin ? (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil />
              编辑
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
})

export default ListingCard
