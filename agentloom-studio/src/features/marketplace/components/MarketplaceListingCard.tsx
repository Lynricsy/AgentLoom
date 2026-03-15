import { memo } from 'react'

import { Download, Tag } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import type {
  MarketplaceCategory,
  PublicMarketplaceListingItem,
} from '../types'
import { MARKETPLACE_CATEGORIES } from '../types'
import { StarRating } from './StarRating'

interface MarketplaceListingCardProps {
  listing: PublicMarketplaceListingItem
  onClick: () => void
}

const CATEGORY_LABELS = Object.fromEntries(
  MARKETPLACE_CATEGORIES.map((category) => [category.value, category.label]),
) as Record<MarketplaceCategory, string>

export const MarketplaceListingCard = memo(function MarketplaceListingCard({
  listing,
  onClick,
}: MarketplaceListingCardProps) {
  const categoryLabel = listing.category
    ? CATEGORY_LABELS[listing.category]
    : '未分类'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full w-full cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card p-4 text-left',
        'transition-colors hover:border-border/80 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
      )}
      data-testid="marketplace-listing-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {categoryLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              作者：{listing.author.displayName}
            </span>
          </div>
          <h3 className="line-clamp-2 text-base font-semibold text-foreground">
            {listing.title}
          </h3>
        </div>
      </div>

      <p className="line-clamp-3 text-sm text-muted-foreground">
        {listing.summary}
      </p>

      {listing.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {listing.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
        <StarRating rating={listing.avgRating} count={listing.reviewCount} size="sm" />
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          <span>{listing.useCount} 次安装</span>
        </div>
      </div>
    </button>
  )
})
