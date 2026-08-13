import { memo, useCallback, useEffect, useState } from 'react'

import { Download, Loader2, Puzzle } from 'lucide-react'

import { WorkflowPreviewCanvas } from '@/features/canvas'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHiddenTitle,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Separator } from '@/shared/ui/separator'
import {
  useListingReviews,
  usePublicListingDetail,
} from '../api/publicMarketplaceQueries'
import {
  MARKETPLACE_CATEGORY_LABELS,
  MARKETPLACE_LISTING_TYPE_META,
  MARKETPLACE_PRICING_VARIANT,
  formatMarketplacePrice,
  parseMarketplaceRating,
} from '../lib/display'
import type { PublicMarketplaceListingDetail as ListingDetailType } from '../types'
import { MarketplaceInstallDialog } from './MarketplaceInstallDialog'
import { ReviewForm } from './ReviewForm'
import { ReviewList } from './ReviewList'
import { StarRating } from './StarRating'

interface MarketplaceDetailDialogProps {
  listingId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function isWorkflowListing(
  listing: ListingDetailType,
): listing is ListingDetailType & { listingType: 'workflow' } {
  return listing.listingType === 'workflow'
}

function WorkflowPreviewSection({
  listing,
}: {
  listing: ListingDetailType & { listingType: 'workflow' }
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">工作流预览</h3>
        <p className="text-xs text-muted">
          这是一个只读预览，安装后可以在画布中继续编辑。
        </p>
      </div>

      <WorkflowPreviewCanvas
        className="h-[260px] overflow-hidden rounded-card border border-border sm:h-[300px]"
        definition={listing.definition}
        lodOverride="full"
        emptyFallback={
          <div className="flex h-[260px] items-center justify-center rounded-card border border-dashed border-border text-sm text-muted sm:h-[300px]">
            暂无可预览的工作流结构。
          </div>
        }
        testId="marketplace-preview"
      />
    </section>
  )
}

function PluginDetailSection({
  listing,
}: {
  listing: ListingDetailType & { listingType: 'plugin' }
}) {
  const { plugin } = listing

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">插件信息</h3>
        <p className="text-xs text-muted">
          安装后可在工作流画布中使用该插件节点。
        </p>
      </div>

      <div
        className="space-y-3 rounded-card border border-border bg-surface-elevated p-4"
        data-testid="plugin-detail-metadata"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-node-plugin) 14%, transparent)',
              color: 'var(--color-node-plugin)',
            }}
          >
            <Puzzle className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-foreground">
            {plugin.name}
          </span>
          <Badge variant="outline">v{plugin.version}</Badge>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">插件 ID</dt>
          <dd className="truncate font-mono text-xs text-foreground">
            {plugin.pluginId}
          </dd>

          <dt className="text-muted">开发者</dt>
          <dd className="truncate text-foreground">{plugin.author}</dd>

          <dt className="text-muted">许可协议</dt>
          <dd className="truncate text-foreground">{plugin.license ?? '未指定'}</dd>
        </dl>

        {plugin.description ? (
          <p className="border-t border-border pt-3 text-sm text-muted">
            {plugin.description}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export const MarketplaceDetailDialog = memo(function MarketplaceDetailDialog({
  listingId,
  open,
  onOpenChange,
}: MarketplaceDetailDialogProps) {
  const [installOpen, setInstallOpen] = useState(false)

  const detailQuery = usePublicListingDetail(open ? listingId : null)
  const reviewsQuery = useListingReviews(open ? listingId : null)

  const listing = detailQuery.data
  const reviews = reviewsQuery.data?.data ?? listing?.reviews ?? []
  const reviewsTotal =
    reviewsQuery.data?.meta.total ?? listing?.reviewCount ?? reviews.length

  useEffect(() => {
    if (!open) {
      setInstallOpen(false)
    }
  }, [open])

  const handleInstallOpenChange = useCallback((nextOpen: boolean) => {
    setInstallOpen(nextOpen)
  }, [])

  const typeMeta = listing
    ? MARKETPLACE_LISTING_TYPE_META[listing.listingType]
    : null
  const TypeIcon = typeMeta?.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="sm:max-h-[88vh]"
        data-testid="marketplace-detail-dialog"
      >
        {detailQuery.isLoading ? (
          <>
            <DialogHiddenTitle>市场条目详情</DialogHiddenTitle>
            <div
              className="flex items-center justify-center gap-3 px-6 py-20"
              data-testid="marketplace-detail-loading"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted">正在加载详情…</span>
            </div>
          </>
        ) : detailQuery.isError || !listing || !typeMeta || !TypeIcon ? (
          <>
            <DialogHiddenTitle>市场条目详情</DialogHiddenTitle>
            <div
              className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center"
              data-testid="marketplace-detail-error"
            >
              <p className="text-base font-medium text-foreground">
                无法加载详情
              </p>
              <p className="text-sm text-muted">
                请稍后重试，或返回列表后重新打开。
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={typeMeta.tone} data-testid="detail-listing-type-badge">
                  <TypeIcon className="h-3 w-3" />
                  {typeMeta.label}
                </Badge>
                <Badge variant={MARKETPLACE_PRICING_VARIANT[listing.pricingModel]}>
                  {formatMarketplacePrice(
                    listing.pricingModel,
                    listing.pricePerExecution,
                  )}
                </Badge>
                {listing.category ? (
                  <Badge variant="secondary">
                    {MARKETPLACE_CATEGORY_LABELS[listing.category]}
                  </Badge>
                ) : null}
              </div>

              <DialogTitle className="text-lg">{listing.title}</DialogTitle>
              <DialogDescription>{listing.summary}</DialogDescription>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <span>作者：{listing.author.displayName}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span>{listing.useCount} 次安装</span>
                </span>
                <StarRating
                  rating={parseMarketplaceRating(listing.avgRating)}
                  count={listing.reviewCount}
                  size="sm"
                />
              </div>

              {listing.tags.length > 0 ? (
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {listing.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : null}
            </DialogHeader>

            <DialogBody className="space-y-5">
              {isWorkflowListing(listing) ? (
                <WorkflowPreviewSection listing={listing} />
              ) : (
                <PluginDetailSection listing={listing} />
              )}

              <Separator />

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    用户评价
                  </h3>
                  <p className="text-xs text-muted">
                    {reviewsQuery.isLoading
                      ? '正在加载评价…'
                      : `共 ${String(reviewsTotal)} 条评价`}
                  </p>
                </div>
                <ReviewList reviews={reviews} />
                <ReviewForm
                  listingId={listing.id}
                  onSuccess={() => {
                    void reviewsQuery.refetch()
                  }}
                />
              </section>
            </DialogBody>

            <DialogFooter>
              <Button onClick={() => setInstallOpen(true)}>安装到工作区</Button>
            </DialogFooter>

            <MarketplaceInstallDialog
              listingId={listing.id}
              listingTitle={listing.title}
              listingSummary={listing.summary}
              listingType={listing.listingType}
              open={installOpen}
              onOpenChange={handleInstallOpenChange}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
