import { useCallback, useState } from 'react'

import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertCircle,
  Loader2,
  Package,
  Store,
  X,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  useRelistMarketplaceListing,
  useUnlistMarketplaceListing,
} from '../api/marketplaceMutations'
import { useMyMarketplaceListings } from '../api/marketplaceQueries'
import type {
  MarketplaceListingStatus,
  MarketplaceReviewCheck,
  MyListingsFilters,
  MyMarketplaceListingItem,
} from '../types'
import { ListingCard } from './ListingCard'

type StatusFilter = MarketplaceListingStatus | 'all'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'listed', label: '已上架' },
  { value: 'pending_review', label: '审核中' },
  { value: 'review_failed', label: '审核未通过' },
  { value: 'unlisted', label: '已下架' },
]

function ReviewResultView({
  checks,
}: {
  checks: MarketplaceReviewCheck[]
}) {
  const failed = checks.filter((c) => c.status === 'failed')
  const passed = checks.filter((c) => c.status === 'passed')

  return (
    <div className="space-y-3">
      {failed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-red-400">
            未通过项 ({failed.length})
          </p>
          {failed.map((check) => (
            <div
              key={check.code}
              className="rounded border border-red-500/20 bg-red-500/5 p-2"
            >
              <p className="text-xs text-red-400">{check.message}</p>
              {check.fixHint && (
                <p className="mt-1 text-xs text-muted-foreground">
                  💡 {check.fixHint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {passed.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-emerald-400">
            已通过项 ({passed.length})
          </p>
          {passed.map((check) => (
            <p key={check.code} className="text-xs text-muted-foreground">
              ✓ {check.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function MyMarketplaceListingsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [unlistTarget, setUnlistTarget] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] =
    useState<MyMarketplaceListingItem | null>(null)

  const { notify } = useToast()

  const filters: MyListingsFilters = {
    page,
    pageSize: 12,
    ...(statusFilter !== 'all' && { status: statusFilter }),
  }

  const { data, isLoading, isError, refetch } =
    useMyMarketplaceListings(filters)

  const unlistMutation = useUnlistMarketplaceListing()
  const relistMutation = useRelistMarketplaceListing()

  const listings = data?.data ?? []
  const meta = data?.meta

  const handleStatusChange = useCallback((status: StatusFilter) => {
    setStatusFilter(status)
    setPage(1)
  }, [])

  const handleUnlist = useCallback((id: string) => {
    setUnlistTarget(id)
  }, [])

  const handleConfirmUnlist = useCallback(async () => {
    if (!unlistTarget) return
    try {
      await unlistMutation.mutateAsync(unlistTarget)
      notify({
        title: '下架成功',
        description: '该发布已从市场下架',
        variant: 'success',
      })
      setUnlistTarget(null)
    } catch {
      notify({
        title: '下架失败',
        description: '请稍后重试',
        variant: 'error',
      })
    }
  }, [unlistTarget, unlistMutation, notify])

  const handleRelist = useCallback(
    async (id: string) => {
      try {
        const result = await relistMutation.mutateAsync(id)
        if (result.reviewResult.outcome === 'failed') {
          const failedListing = listings.find((l) => l.id === id)
          if (failedListing) {
            setReviewTarget({
              ...failedListing,
              reviewResult: result.reviewResult,
            })
          }
          notify({
            title: '重新上架审核未通过',
            description: '请查看审核结果并修复问题',
            variant: 'error',
          })
        } else {
          notify({
            title: '重新上架成功',
            description: '该发布已重新上架到市场',
            variant: 'success',
          })
        }
      } catch {
        notify({
          title: '重新上架失败',
          description: '请稍后重试',
          variant: 'error',
        })
      }
    },
    [relistMutation, listings, notify],
  )

  const handleViewReview = useCallback(
    (listing: MyMarketplaceListingItem) => {
      setReviewTarget(listing)
    },
    [],
  )

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-6"
      data-testid="my-marketplace-listings-page"
    >
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">我的市场发布</h1>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
            onClick={() => handleStatusChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${String(i)}`}
              className="h-48 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">加载失败</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )}

      {!isLoading && !isError && listings.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">暂无发布记录</p>
        </div>
      )}

      {!isLoading && !isError && listings.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onUnlist={handleUnlist}
              onRelist={handleRelist}
              onViewReview={handleViewReview}
            />
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}

      <Dialog.Root
        open={unlistTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnlistTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
              'rounded-lg border border-border bg-surface p-6 shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
            data-testid="unlist-confirm-dialog"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <Dialog.Title className="text-base font-medium">
                  确认下架
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  下架后该工作流将不再展示在市场中，你可以随时重新上架。
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                onClick={handleConfirmUnlist}
                disabled={unlistMutation.isPending}
              >
                {unlistMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                确认下架
              </button>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={reviewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
              'rounded-lg border border-border bg-surface p-6 shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'max-h-[80vh] overflow-y-auto',
            )}
            data-testid="review-result-dialog"
          >
            <Dialog.Title className="text-base font-medium">
              审核结果
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {reviewTarget?.title}
            </Dialog.Description>

            {reviewTarget?.reviewResult && (
              <div className="mt-4">
                <ReviewResultView
                  checks={reviewTarget.reviewResult.checks}
                />
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Dialog.Close asChild>
                <Button variant="outline" size="sm">
                  关闭
                </Button>
              </Dialog.Close>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
