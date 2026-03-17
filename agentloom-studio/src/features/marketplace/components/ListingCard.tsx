import { memo, useCallback } from 'react'

import {
  Calendar,
  Eye,
  EyeOff,
  Puzzle,
  RefreshCw,
  Store,
  Workflow,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { formatMarketplacePrice } from '../lib/display'
import type { MyMarketplaceListingItem } from '../types'
import { ListingStatusBadge } from './ListingStatusBadge'

interface ListingCardProps {
  listing: MyMarketplaceListingItem
  onUnlist?: (listing: MyMarketplaceListingItem) => void
  onRelist?: (listing: MyMarketplaceListingItem) => void
  onViewReview?: (listing: MyMarketplaceListingItem) => void
}

export const ListingCard = memo(function ListingCard({
  listing,
  onUnlist,
  onRelist,
  onViewReview,
}: ListingCardProps) {
  const isPlugin = listing.listingType === 'plugin'

  const handleUnlist = useCallback(() => {
    onUnlist?.(listing)
  }, [listing, onUnlist])

  const handleRelist = useCallback(() => {
    onRelist?.(listing)
  }, [listing, onRelist])

  const handleViewReview = useCallback(() => {
    onViewReview?.(listing)
  }, [listing, onViewReview])

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-4',
        'transition-colors hover:border-border/80',
      )}
      data-testid="listing-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                isPlugin
                  ? 'bg-violet-500/15 text-violet-400'
                  : 'bg-sky-500/15 text-sky-400',
              )}
            >
              {isPlugin ? (
                <Puzzle className="h-3 w-3" />
              ) : (
                <Workflow className="h-3 w-3" />
              )}
              {isPlugin ? '插件' : '工作流'}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {formatMarketplacePrice(listing.pricingModel, listing.pricePerExecution)}
            </span>
          </div>

          <h3 className="truncate text-sm font-medium text-foreground">
            {listing.title}
          </h3>
        </div>
        <ListingStatusBadge status={listing.status} />
      </div>

      {listing.workflowName ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Store className="h-3 w-3 shrink-0" />
          <span className="truncate">{listing.workflowName}</span>
          {listing.versionNumber != null ? (
            <span className="shrink-0 text-muted-foreground/60">
              v{listing.versionNumber}
            </span>
          ) : null}
        </div>
      ) : null}

      {isPlugin && listing.pluginName ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Puzzle className="h-3 w-3 shrink-0" />
          <span className="truncate">{listing.pluginName}</span>
          {listing.pluginVersion ? (
            <span className="shrink-0 text-muted-foreground/60">
              v{listing.pluginVersion}
            </span>
          ) : null}
        </div>
      ) : null}

      {listing.summary ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {listing.summary}
        </p>
      ) : null}

      {listing.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {listing.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
        <Calendar className="h-3 w-3" />
        <span>
          {new Date(listing.submittedAt).toLocaleDateString('zh-CN')}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 pt-3">
        {listing.status === 'listed' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlist}
            className="gap-1"
          >
            <EyeOff className="h-3.5 w-3.5" />
            下架
          </Button>
        ) : null}

        {listing.status === 'unlisted' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRelist}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            重新上架
          </Button>
        ) : null}

        {listing.status === 'review_failed' ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewReview}
              className="gap-1"
            >
              <Eye className="h-3.5 w-3.5" />
              查看审核结果
            </Button>
            {isPlugin ? (
              <Button variant="ghost" size="sm" onClick={handleRelist} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                重新提交
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                重新提交
              </Button>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
})

export default ListingCard
