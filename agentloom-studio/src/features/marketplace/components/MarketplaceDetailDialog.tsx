import { memo, useCallback, useEffect, useState } from 'react'

import { AlertCircle, Download, Puzzle } from 'lucide-react'

import { WorkflowPreviewCanvas } from '@/features/canvas'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
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
import { Skeleton } from '@/shared/ui/skeleton'
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
        <p className="text-xs text-muted-foreground">
          这是一个只读预览，安装后可以在画布中继续编辑。
        </p>
      </div>

      {/* ReactFlow 根节点内联 width/height: 100%，会盖掉传给它的高度类，高度必须由外层容器给 */}
      <div className="h-64 overflow-hidden rounded-lg border border-border sm:h-72">
        <WorkflowPreviewCanvas
          definition={listing.definition}
          lodOverride="full"
          emptyFallback={
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              暂无可预览的工作流结构。
            </div>
          }
          testId="marketplace-preview"
        />
      </div>
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
        <p className="text-xs text-muted-foreground">
          安装后可在工作流画布中使用该插件节点。
        </p>
      </div>

      <div
        className="space-y-3 rounded-lg border border-border bg-muted p-4"
        data-testid="plugin-detail-metadata"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-lg"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-node-plugin) 14%, transparent)',
              color: 'var(--color-node-plugin)',
            }}
          >
            <Puzzle className="size-4" />
          </span>
          <span
            className="min-w-0 truncate text-sm font-medium text-foreground"
            title={plugin.name}
          >
            {plugin.name}
          </span>
          <Badge variant="outline" className="shrink-0">
            v{plugin.version}
          </Badge>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">插件 ID</dt>
          <dd className="truncate font-mono text-xs text-foreground" title={plugin.pluginId}>
            {plugin.pluginId}
          </dd>

          <dt className="text-muted-foreground">开发者</dt>
          <dd className="truncate text-foreground" title={plugin.author}>
            {plugin.author}
          </dd>

          <dt className="text-muted-foreground">许可协议</dt>
          <dd className="truncate text-foreground">{plugin.license ?? '未指定'}</dd>
        </dl>

        {plugin.description ? (
          <p className="break-words border-t border-border pt-3 text-sm text-muted-foreground">
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
      {/* 固定最小高度：loading / error / 内容三态切换时弹窗高度不再从 ~120px 跳到满高 */}
      <DialogContent
        size="lg"
        className="sm:max-h-[88dvh] sm:min-h-[28rem]"
        data-testid="marketplace-detail-dialog"
      >
        {detailQuery.isLoading ? (
          <>
            <DialogHiddenTitle>市场条目详情</DialogHiddenTitle>
            <div
              className="space-y-4 px-6 py-6"
              data-testid="marketplace-detail-loading"
              role="status"
              aria-label="正在加载详情…"
            >
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-64 w-full rounded-lg sm:h-72" />
            </div>
          </>
        ) : detailQuery.isError || !listing || !typeMeta || !TypeIcon ? (
          <>
            <DialogHiddenTitle>市场条目详情</DialogHiddenTitle>
            <div
              className="grid flex-1 place-items-center px-6 py-10"
              data-testid="marketplace-detail-error"
            >
              <EmptyState
                variant="plain"
                icon={AlertCircle}
                tone="var(--color-error)"
                title="无法加载详情"
                description="请稍后重试，或返回列表后重新打开。"
              />
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={typeMeta.tone} data-testid="detail-listing-type-badge">
                  <TypeIcon className="size-3" />
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

              <DialogTitle className="break-words text-lg">{listing.title}</DialogTitle>
              <DialogDescription className="break-words">{listing.summary}</DialogDescription>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="max-w-[16rem] truncate" title={listing.author.displayName}>
                  作者：{listing.author.displayName}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <Download className="size-3.5" />
                  <span className="tabular-nums">{listing.useCount} 次安装</span>
                </span>
                <StarRating
                  rating={parseMarketplaceRating(listing.avgRating)}
                  count={listing.reviewCount}
                  size="sm"
                />
              </div>

              {listing.tags.length > 0 ? (
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                  {listing.tags.map((tag) => (
                    <span key={tag} className="max-w-full truncate">
                      #{tag}
                    </span>
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
                  <p className="text-xs text-muted-foreground">
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
