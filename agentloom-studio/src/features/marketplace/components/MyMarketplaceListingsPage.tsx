import { useCallback, useState } from 'react'

import { motion } from 'motion/react'
import { AlertCircle, Loader2, Package, Store } from 'lucide-react'

import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import { staggerList } from '@/shared/lib/motion'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import {
  useRelistPluginMarketplaceListing,
  useRelistMarketplaceListing,
  useUnlistPluginMarketplaceListing,
  useUnlistMarketplaceListing,
} from '../api/marketplaceMutations'
import { useMyMarketplaceListings } from '../api/marketplaceQueries'
import {
  MARKETPLACE_LISTING_TYPE_TABS,
  type MarketplaceListingTypeFilter,
} from '../lib/display'
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
    <div className="space-y-4">
      {failed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-error">
            未通过项 ({failed.length})
          </p>
          {failed.map((check) => (
            <div
              key={check.code}
              className="rounded-card border border-error/25 bg-error/5 p-2.5"
            >
              <p className="text-xs text-error">{check.message}</p>
              {check.fixHint && (
                <p className="mt-1 text-xs text-muted">💡 {check.fixHint}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {passed.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-success">
            已通过项 ({passed.length})
          </p>
          {passed.map((check) => (
            <p key={check.code} className="text-xs text-muted">
              ✓ {check.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function MyMarketplaceListingsPage() {
  const [listingTypeFilter, setListingTypeFilter] =
    useState<MarketplaceListingTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [unlistTarget, setUnlistTarget] = useState<MyMarketplaceListingItem | null>(null)
  const [reviewTarget, setReviewTarget] =
    useState<MyMarketplaceListingItem | null>(null)

  const { notify } = useToast()

  const filters: MyListingsFilters = {
    page,
    pageSize: 12,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(listingTypeFilter !== 'all' && { listingType: listingTypeFilter }),
  }

  const { data, isLoading, isError, refetch } =
    useMyMarketplaceListings(filters)

  const unlistMutation = useUnlistMarketplaceListing()
  const unlistPluginMutation = useUnlistPluginMarketplaceListing()
  const relistMutation = useRelistMarketplaceListing()
  const relistPluginMutation = useRelistPluginMarketplaceListing()

  const listings = data?.data ?? []
  const meta = data?.meta

  const handleListingTypeChange = useCallback((listingType: string) => {
    setListingTypeFilter(listingType as MarketplaceListingTypeFilter)
    setPage(1)
  }, [])

  const handleStatusChange = useCallback((status: string) => {
    setStatusFilter(status as StatusFilter)
    setPage(1)
  }, [])

  const handleUnlist = useCallback((listing: MyMarketplaceListingItem) => {
    setUnlistTarget(listing)
  }, [])

  const handleUnlistOpenChange = useCallback((open: boolean) => {
    if (!open) setUnlistTarget(null)
  }, [])

  const handleReviewOpenChange = useCallback((open: boolean) => {
    if (!open) setReviewTarget(null)
  }, [])

  const handleConfirmUnlist = useCallback(async () => {
    if (!unlistTarget) return
    try {
      if (unlistTarget.listingType === 'plugin') {
        await unlistPluginMutation.mutateAsync(unlistTarget.id)
      } else {
        await unlistMutation.mutateAsync(unlistTarget.id)
      }
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
  }, [notify, unlistMutation, unlistPluginMutation, unlistTarget])

  const handleRelist = useCallback(
    async (listing: MyMarketplaceListingItem) => {
      try {
        const result =
          listing.listingType === 'plugin'
            ? await relistPluginMutation.mutateAsync(listing.id)
            : await relistMutation.mutateAsync(listing.id)
        if (result.reviewResult.outcome === 'failed') {
          const failedListing = listings.find((item) => item.id === listing.id)
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
    [listings, notify, relistMutation, relistPluginMutation],
  )

  const handleViewReview = useCallback(
    (listing: MyMarketplaceListingItem) => {
      setReviewTarget(listing)
    },
    [],
  )

  const isUnlistPending =
    unlistMutation.isPending || unlistPluginMutation.isPending

  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6"
      data-testid="my-marketplace-listings-page"
    >
      <PageHeader
        icon={Store}
        title="我的市场发布"
        description="管理已提交到市场的工作流与插件，随时上下架或查看审核结果。"
      />

      <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-node sm:p-4">
        <Tabs
          value={listingTypeFilter}
          defaultValue="all"
          onValueChange={handleListingTypeChange}
        >
          <TabsList>
            {MARKETPLACE_LISTING_TYPE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs value={statusFilter} defaultValue="all" onValueChange={handleStatusChange}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${String(i)}`}
              className="space-y-3 rounded-card border border-border bg-card p-4"
              data-testid="listing-skeleton"
            >
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-2/3 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载失败"
          description="无法获取你的市场发布记录，请稍后重试。"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              重试
            </Button>
          }
        />
      )}

      {!isLoading && !isError && listings.length === 0 && (
        <EmptyState
          icon={Package}
          title="暂无发布记录"
          description="在工作流画布中点击「发布到市场」，通过审核后即可在这里管理上架内容。"
        />
      )}

      {!isLoading && !isError && listings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing, index) => (
            <motion.div key={listing.id} className="h-full" {...staggerList(index)}>
              <ListingCard
                listing={listing}
                onUnlist={handleUnlist}
                onRelist={handleRelist}
                onViewReview={handleViewReview}
              />
            </motion.div>
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

      <AlertDialog
        open={unlistTarget !== null}
        onOpenChange={handleUnlistOpenChange}
      >
        <AlertDialogContent data-testid="unlist-confirm-dialog">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--color-warning) 14%, transparent)',
                color: 'var(--color-warning)',
              }}
            >
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <AlertDialogTitle>确认下架</AlertDialogTitle>
              <AlertDialogDescription>
                下架后该发布将不再展示在市场中，你可以随时重新上架。
              </AlertDialogDescription>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">取消</Button>
            </AlertDialogCancel>
            <Button onClick={handleConfirmUnlist} disabled={isUnlistPending}>
              {isUnlistPending && <Loader2 className="h-4 w-4 animate-spin" />}
              确认下架
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reviewTarget !== null} onOpenChange={handleReviewOpenChange}>
        <DialogContent size="md" data-testid="review-result-dialog">
          <DialogHeader>
            <DialogTitle>审核结果</DialogTitle>
            <DialogDescription>{reviewTarget?.title}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {reviewTarget?.reviewResult && (
              <ReviewResultView checks={reviewTarget.reviewResult.checks} />
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                关闭
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
