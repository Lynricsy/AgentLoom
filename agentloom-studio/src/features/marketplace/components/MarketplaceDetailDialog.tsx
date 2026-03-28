import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import * as Dialog from '@radix-ui/react-dialog'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react'
import { Download, Loader2, Puzzle, Workflow, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/hooks/use-theme'
import {
  useListingReviews,
  usePublicListingDetail,
} from '../api/publicMarketplaceQueries'
import { formatMarketplacePrice } from '../lib/display'
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
  type PublicMarketplaceListingDetail as ListingDetailType,
} from '../types'
import { MarketplaceInstallDialog } from './MarketplaceInstallDialog'
import { ReviewForm } from './ReviewForm'
import { ReviewList } from './ReviewList'
import { StarRating } from './StarRating'

interface MarketplaceDetailDialogProps {
  listingId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CATEGORY_LABELS = Object.fromEntries(
  MARKETPLACE_CATEGORIES.map((category) => [category.value, category.label]),
) as Record<MarketplaceCategory, string>

function parseRating(value: string | null): number | null {
  if (value == null) return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toPreviewNodes(nodes: unknown[] | undefined): Node[] {
  if (!nodes) {
    return []
  }

  return nodes
    .filter(isRecord)
    .filter((node) => typeof node.id === 'string' && isRecord(node.position))
    .map((node) => {
      const position = isRecord(node.position) ? node.position : {}
      const data = isRecord(node.data) ? node.data : {}

      return {
        id: node.id as string,
        type: 'default',
        position: {
          x: typeof position.x === 'number' ? position.x : 0,
          y: typeof position.y === 'number' ? position.y : 0,
        },
        data: {
          label:
            (typeof data.label === 'string' && data.label) ||
            (typeof data.nodeType === 'string' && data.nodeType) ||
            (typeof data.name === 'string' && data.name) ||
            'Node',
        },
      } satisfies Node
    })
}

function toPreviewEdges(edges: unknown[] | undefined): Edge[] {
  if (!edges) {
    return []
  }

  return edges
    .filter(isRecord)
    .filter(
      (edge) =>
        typeof edge.id === 'string' &&
        typeof edge.source === 'string' &&
        typeof edge.target === 'string',
    )
    .map((edge) => ({
      id: edge.id as string,
      source: edge.source as string,
      target: edge.target as string,
      sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : undefined,
      targetHandle: typeof edge.targetHandle === 'string' ? edge.targetHandle : undefined,
    }))
}

function isWorkflowListing(
  listing: ListingDetailType,
): listing is ListingDetailType & { listingType: 'workflow' } {
  return listing.listingType === 'workflow'
}

function WorkflowPreviewSection({
  listing,
  onInstallClick,
}: {
  listing: ListingDetailType & { listingType: 'workflow' }
  onInstallClick: () => void
}) {
  const { resolvedTheme } = useTheme()
  const previewNodes = useMemo(
    () => toPreviewNodes(listing.definition.nodes),
    [listing.definition.nodes],
  )
  const previewEdges = useMemo(
    () => toPreviewEdges(listing.definition.edges),
    [listing.definition.edges],
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">工作流预览</h3>
          <p className="text-xs text-muted-foreground">
            这是一个只读预览，安装后可以在画布中继续编辑。
          </p>
        </div>
        <button
          type="button"
          onClick={onInstallClick}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          安装到工作区
        </button>
      </div>

      {previewNodes.length > 0 ? (
        <div className="h-[320px] overflow-hidden rounded-lg border border-border" data-testid="marketplace-preview">
          <ReactFlowProvider>
            <ReactFlow
              nodes={previewNodes}
              edges={previewEdges}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              connectOnClick={false}
              edgesReconnectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
              colorMode={resolvedTheme}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      ) : (
        <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-card/40 text-sm text-muted-foreground">
          暂无可预览的工作流结构。
        </div>
      )}
    </section>
  )
}

function PluginDetailSection({
  listing,
  onInstallClick,
}: {
  listing: ListingDetailType & { listingType: 'plugin' }
  onInstallClick: () => void
}) {
  const { plugin } = listing
  const pricingLabel = formatMarketplacePrice(
    listing.pricingModel,
    listing.pricePerExecution,
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">插件信息</h3>
          <p className="text-xs text-muted-foreground">
            安装后可在工作流画布中使用该插件节点。
          </p>
        </div>
        <button
          type="button"
          onClick={onInstallClick}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          安装到工作区
        </button>
      </div>

      <div
        className="space-y-3 rounded-lg border border-border bg-card/40 p-4"
        data-testid="plugin-detail-metadata"
      >
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-violet-400" />
          <span className="text-sm font-medium text-foreground">{plugin.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            v{plugin.version}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">插件 ID</dt>
          <dd className="font-mono text-xs text-foreground">{plugin.pluginId}</dd>

          <dt className="text-muted-foreground">开发者</dt>
          <dd className="text-foreground">{plugin.author}</dd>

          <dt className="text-muted-foreground">许可协议</dt>
          <dd className="text-foreground">{plugin.license ?? '未指定'}</dd>

          <dt className="text-muted-foreground">计费模式</dt>
          <dd>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                listing.pricingModel === 'free'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400',
              )}
            >
              {pricingLabel}
            </span>
          </dd>
        </dl>

        {plugin.description ? (
          <p className="border-t border-border/50 pt-3 text-sm text-muted-foreground">
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
  const reviewsTotal = reviewsQuery.data?.meta.total ?? listing?.reviewCount ?? reviews.length

  useEffect(() => {
    if (!open) {
      setInstallOpen(false)
    }
  }, [open])

  const handleInstallOpenChange = useCallback((nextOpen: boolean) => {
    setInstallOpen(nextOpen)
  }, [])

  const listingTypeLabel = listing?.listingType === 'plugin' ? '插件' : '工作流'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0"
          data-testid="marketplace-detail-dialog"
        >
          <Dialog.Close className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </Dialog.Close>

          {detailQuery.isLoading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-20" data-testid="marketplace-detail-loading">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在加载详情…</span>
            </div>
          ) : detailQuery.isError || !listing ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center" data-testid="marketplace-detail-error">
              <p className="text-base font-medium text-foreground">无法加载详情</p>
              <p className="text-sm text-muted-foreground">请稍后重试，或返回列表后重新打开。</p>
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 px-6 py-5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      listing.listingType === 'plugin'
                        ? 'bg-violet-500/15 text-violet-400'
                        : 'bg-sky-500/15 text-sky-400',
                    )}
                    data-testid="detail-listing-type-badge"
                  >
                    {listing.listingType === 'plugin' ? (
                      <Puzzle className="h-3 w-3" />
                    ) : (
                      <Workflow className="h-3 w-3" />
                    )}
                    {listingTypeLabel}
                  </span>
                  <Dialog.Title className="text-xl font-semibold text-foreground">
                    {listing.title}
                  </Dialog.Title>
                </div>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  {listing.summary}
                </Dialog.Description>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>作者：{listing.author.displayName}</span>
                  {listing.category ? (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABELS[listing.category]}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    <span>{listing.useCount} 次安装</span>
                  </span>
                  <StarRating rating={parseRating(listing.avgRating)} count={listing.reviewCount} />
                </div>

                {listing.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {listing.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                {isWorkflowListing(listing) ? (
                  <WorkflowPreviewSection
                    listing={listing}
                    onInstallClick={() => setInstallOpen(true)}
                  />
                ) : (
                  <PluginDetailSection
                    listing={listing}
                    onInstallClick={() => setInstallOpen(true)}
                  />
                )}

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">用户评价</h3>
                    <p className="text-xs text-muted-foreground">
                      {reviewsQuery.isLoading ? '正在加载评价…' : `共 ${reviewsTotal} 条评价`}
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
              </div>

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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
