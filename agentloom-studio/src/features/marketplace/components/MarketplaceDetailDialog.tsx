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
import { Loader2, X } from 'lucide-react'

import {
  useListingReviews,
  usePublicListingDetail,
} from '../api/publicMarketplaceQueries'
import { MARKETPLACE_CATEGORIES, type MarketplaceCategory } from '../types'
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
  const previewNodes = useMemo(() => toPreviewNodes(listing?.definition.nodes), [listing?.definition.nodes])
  const previewEdges = useMemo(() => toPreviewEdges(listing?.definition.edges), [listing?.definition.edges])

  useEffect(() => {
    if (!open) {
      setInstallOpen(false)
    }
  }, [open])

  const handleInstallOpenChange = useCallback((nextOpen: boolean) => {
    setInstallOpen(nextOpen)
  }, [])

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
              <span className="text-sm text-muted-foreground">正在加载工作流详情…</span>
            </div>
          ) : detailQuery.isError || !listing ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center" data-testid="marketplace-detail-error">
              <p className="text-base font-medium text-foreground">无法加载工作流详情</p>
              <p className="text-sm text-muted-foreground">请稍后重试，或返回列表后重新打开。</p>
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 px-6 py-5">
                <Dialog.Title className="text-xl font-semibold text-foreground">
                  {listing.title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  {listing.summary}
                </Dialog.Description>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>by {listing.author.displayName}</span>
                  {listing.category ? (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABELS[listing.category]}
                    </span>
                  ) : null}
                  <StarRating rating={listing.avgRating} count={listing.reviewCount} />
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
                      onClick={() => setInstallOpen(true)}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      一键使用
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
                          colorMode="dark"
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

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">用户评价</h3>
                    <p className="text-xs text-muted-foreground">
                      {reviewsQuery.isLoading ? '正在加载评价…' : `共 ${reviews.length} 条评价`}
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
