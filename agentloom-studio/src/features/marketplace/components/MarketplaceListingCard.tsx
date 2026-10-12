import { memo, useState } from 'react'

import { Download, UserRound } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
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
import { WorkflowThumbnail } from './WorkflowThumbnail'

interface MarketplaceListingCardProps {
  listing: PublicMarketplaceListingItem
  onClick: () => void
}

export const MarketplaceListingCard = memo(function MarketplaceListingCard({
  listing,
  onClick,
}: MarketplaceListingCardProps) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const typeMeta = MARKETPLACE_LISTING_TYPE_META[listing.listingType]
  const TypeIcon = typeMeta.icon
  const categoryLabel = listing.category
    ? MARKETPLACE_CATEGORY_LABELS[listing.category]
    : '未分类'

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      className="group flex h-full flex-col overflow-hidden text-left"
      data-testid="marketplace-listing-card"
    >
      {/* 封面区：优先作者上传的封面；缺图时工作流画结构缩略图、插件显示包标识，再兜底类型图标 */}
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
            className={cn(
              'h-full w-full object-cover transition-opacity duration-300',
              coverLoaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverFailed(true)}
          />
        ) : listing.previewGraph ? (
          <WorkflowThumbnail graph={listing.previewGraph} className="p-3" />
        ) : (
          <>
            {listing.plugin ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
                <span className="max-w-full truncate font-mono text-xs text-foreground/80">
                  {listing.plugin.pluginId}
                </span>
                {listing.plugin.version ? (
                  <span className="font-mono text-2xs text-muted-foreground">
                    v{listing.plugin.version}
                  </span>
                ) : null}
              </div>
            ) : null}
            <TypeIcon
              aria-hidden
              className="absolute bottom-3 right-3 size-10"
              style={{
                color: `color-mix(in srgb, ${typeMeta.tone} 55%, transparent)`,
              }}
            />
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={typeMeta.tone} data-testid="listing-type-badge">
            <TypeIcon className="size-3" />
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

        <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">
          {listing.title}
        </h3>

        <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
          {listing.summary}
        </p>

        {listing.tags.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground">
            {listing.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="max-w-full truncate">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate" title={listing.author.displayName}>
              {listing.author.displayName}
            </span>
          </span>

          <div className="flex shrink-0 items-center gap-3">
            <StarRating
              rating={parseMarketplaceRating(listing.avgRating)}
              count={listing.reviewCount}
              size="sm"
            />
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <Download className="size-3.5" />
              {listing.useCount}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
})
