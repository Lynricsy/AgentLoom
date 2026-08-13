import { memo, useState } from 'react'

import { Download, UserRound } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
import {
  MARKETPLACE_CATEGORY_LABELS,
  MARKETPLACE_LISTING_TYPE_META,
  MARKETPLACE_PRICING_VARIANT,
  formatMarketplacePrice,
  parseMarketplaceRating,
} from '../lib/display'
import type { PublicMarketplaceListingItem } from '../types'
import { StarRating } from './StarRating'

interface MarketplaceListingCardProps {
  listing: PublicMarketplaceListingItem
  onClick: () => void
}

export const MarketplaceListingCard = memo(function MarketplaceListingCard({
  listing,
  onClick,
}: MarketplaceListingCardProps) {
  const [coverFailed, setCoverFailed] = useState(false)
  const typeMeta = MARKETPLACE_LISTING_TYPE_META[listing.listingType]
  const TypeIcon = typeMeta.icon
  const categoryLabel = listing.category
    ? MARKETPLACE_CATEGORY_LABELS[listing.category]
    : '未分类'

  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-full w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      data-testid="marketplace-listing-card"
    >
      <Card interactive className="flex h-full flex-col overflow-hidden">
        {/* 封面区：缺图时用类型令牌色渐变 + 类型图标兜底，保持栅格节奏一致 */}
        <div
          className="relative aspect-[16/9] w-full overflow-hidden border-b border-border"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${typeMeta.tone} 24%, var(--color-surface)), color-mix(in srgb, ${typeMeta.tone} 6%, var(--color-surface)))`,
          }}
        >
          {listing.coverImageUrl && !coverFailed ? (
            <img
              src={listing.coverImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <TypeIcon
              aria-hidden
              className="absolute bottom-3 right-3 h-10 w-10"
              style={{
                color: `color-mix(in srgb, ${typeMeta.tone} 55%, transparent)`,
              }}
            />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={typeMeta.tone} data-testid="listing-type-badge">
              <TypeIcon className="h-3 w-3" />
              {typeMeta.label}
            </Badge>
            <Badge
              variant={MARKETPLACE_PRICING_VARIANT[listing.pricingModel]}
              data-testid="listing-pricing-badge"
            >
              {formatMarketplacePrice(
                listing.pricingModel,
                listing.pricePerExecution,
              )}
            </Badge>
            <Badge variant="secondary">{categoryLabel}</Badge>
          </div>

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {listing.title}
          </h3>

          <p className="line-clamp-2 text-xs leading-relaxed text-muted">
            {listing.summary}
          </p>

          {listing.tags.length > 0 ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {listing.tags.slice(0, 3).map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{listing.author.displayName}</span>
            </span>

            <div className="flex items-center gap-3">
              <StarRating
                rating={parseMarketplaceRating(listing.avgRating)}
                count={listing.reviewCount}
                size="sm"
              />
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Download className="h-3.5 w-3.5" />
                {listing.useCount}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </button>
  )
})
