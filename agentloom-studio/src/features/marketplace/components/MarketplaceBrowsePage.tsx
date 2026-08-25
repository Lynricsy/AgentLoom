import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Compass, Search, Store } from 'lucide-react'

import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import { staggerList } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import { usePublicListings } from '../api/publicMarketplaceQueries'
import {
  MARKETPLACE_LISTING_TYPE_TABS,
  type MarketplaceListingTypeFilter,
} from '../lib/display'
import type {
  BrowseCategoryFilter,
  BrowsePricingFilter,
  MarketplaceBrowseSearch,
} from '../lib/browseSearch'
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SORT_OPTIONS,
  type PublicListingsFilters,
  type MarketplaceSortOption,
} from '../types'
import { MarketplaceListingCard } from './MarketplaceListingCard'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'

const CATEGORY_TABS: { value: BrowseCategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  ...MARKETPLACE_CATEGORIES,
]

const PRICING_OPTIONS: { value: BrowsePricingFilter; label: string }[] = [
  { value: 'all', label: '全部定价' },
  { value: 'free', label: '免费' },
  { value: 'per_execution', label: '按次计费' },
]

const PAGE_SIZE = 12

export interface MarketplaceBrowsePageProps {
  mode?: 'marketplace' | 'discover'
  /** 由路由 search params 解析而来，是筛选与分页的唯一真相 */
  filters: MarketplaceBrowseSearch
  onFiltersChange: (updates: Partial<MarketplaceBrowseSearch>) => void
  onPageChange: (page: number) => void
}

export function MarketplaceBrowsePage({
  mode = 'marketplace',
  filters,
  onFiltersChange,
  onPageChange,
}: MarketplaceBrowsePageProps) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)

  const { notify } = useToast()

  // 已写入 URL 的搜索词；用于区分「用户正在输入」与「URL 被外部改写」
  const committedSearchRef = useRef(filters.search)
  const onFiltersChangeRef = useRef(onFiltersChange)
  onFiltersChangeRef.current = onFiltersChange

  // 前进/后退或清除筛选改写了 URL，把搜索框回灌成 URL 上的值
  useEffect(() => {
    if (filters.search === committedSearchRef.current) return

    committedSearchRef.current = filters.search
    setSearchInput(filters.search)
  }, [filters.search])

  // 输入防抖 300ms 才写回 URL，避免每敲一个字符都留下一条历史记录
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === committedSearchRef.current) return

    const timeoutId = window.setTimeout(() => {
      committedSearchRef.current = trimmed
      onFiltersChangeRef.current({ search: trimmed })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const listFilters = useMemo<PublicListingsFilters>(
    () => ({
      category: filters.category === 'all' ? undefined : filters.category,
      listingType: filters.listingType === 'all' ? undefined : filters.listingType,
      pricingModel:
        filters.pricingModel === 'all' ? undefined : filters.pricingModel,
      search: filters.search || undefined,
      sort: filters.sort,
      page: filters.page,
      pageSize: PAGE_SIZE,
    }),
    [filters],
  )

  const { data, isLoading, isError, refetch } = usePublicListings(listFilters)

  const listings = data?.data ?? []
  const total = data?.meta.total ?? 0
  const totalPages = data?.meta.totalPages ?? 0
  const isDiscover = mode === 'discover'

  const hasActiveFilters =
    filters.listingType !== 'all' ||
    filters.category !== 'all' ||
    filters.pricingModel !== 'all' ||
    filters.search.length > 0

  useEffect(() => {
    if (!isError) return

    notify({
      title: 'Marketplace 加载失败',
      description: '无法获取市场内容，请稍后重试。',
      variant: 'error',
    })
  }, [isError, notify])

  const handleCategoryChange = useCallback(
    (nextCategory: string) => {
      onFiltersChange({ category: nextCategory as BrowseCategoryFilter })
    },
    [onFiltersChange],
  )

  const handleListingTypeChange = useCallback(
    (nextListingType: string) => {
      onFiltersChange({
        listingType: nextListingType as MarketplaceListingTypeFilter,
      })
    },
    [onFiltersChange],
  )

  const handlePricingChange = useCallback(
    (nextPricing: string) => {
      onFiltersChange({ pricingModel: nextPricing as BrowsePricingFilter })
    },
    [onFiltersChange],
  )

  const handleSortChange = useCallback(
    (nextSort: string) => {
      onFiltersChange({ sort: nextSort as MarketplaceSortOption })
    },
    [onFiltersChange],
  )

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value)
  }, [])

  const handleResetFilters = useCallback(() => {
    committedSearchRef.current = ''
    setSearchInput('')
    onFiltersChange({
      listingType: 'all',
      category: 'all',
      pricingModel: 'all',
      search: '',
    })
  }, [onFiltersChange])

  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedListingId(null)
    }
  }, [])

  return (
    <div
      className="mx-auto flex h-full max-w-6xl flex-col gap-5 p-4 sm:p-6"
      data-testid="marketplace-browse-page"
    >
      <PageHeader
        icon={isDiscover ? Compass : Store}
        title={isDiscover ? '发现' : '市场'}
        description={
          isDiscover
            ? '浏览真实可用的上架工作流与插件，把公开内容当成你的下一条起点。'
            : '浏览社区共享的工作流与插件，并一键安装到你的工作区。'
        }
        actions={
          isDiscover ? (
            <Link
              to="/marketplace"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              打开 Marketplace
            </Link>
          ) : (
            <Link
              to="/marketplace/my-listings"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              我的发布
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-node sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="搜索市场工作流或插件"
              className="pl-9"
              data-testid="marketplace-search-input"
            />
          </div>

          <div className="flex gap-2">
            <Select value={filters.pricingModel} onValueChange={handlePricingChange}>
              <SelectTrigger
                className="flex-1 sm:w-36 sm:flex-none"
                aria-label="按定价筛选"
                data-testid="marketplace-pricing-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.sort} onValueChange={handleSortChange}>
              <SelectTrigger
                className="flex-1 sm:w-40 sm:flex-none"
                aria-label="排序市场内容"
                data-testid="marketplace-sort-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETPLACE_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs
          value={filters.listingType}
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

        <Tabs
          value={filters.category}
          defaultValue="all"
          onValueChange={handleCategoryChange}
        >
          <TabsList>
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="marketplace-browse-loading"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`marketplace-loading-${String(index)}`}
              className="overflow-hidden rounded-card border border-border bg-card"
              data-testid="marketplace-listing-skeleton"
            >
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="space-y-2.5 p-4">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-3 w-2/3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div data-testid="marketplace-browse-error">
          <EmptyState
            icon={Store}
            tone="var(--color-error)"
            title="Marketplace 加载失败"
            description="请稍后重试，或刷新页面后再试一次。"
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                重试
              </Button>
            }
          />
        </div>
      ) : listings.length === 0 ? (
        <div data-testid="marketplace-browse-empty">
          <EmptyState
            icon={isDiscover ? Compass : Store}
            title="未找到工作流或插件"
            description="尝试调整分类、定价、搜索词或排序方式。"
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>共 {String(total)} 个项目</span>
            <span>第 {filters.page} 页</span>
          </div>

          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="marketplace-browse-grid"
          >
            {listings.map((listing, index) => (
              <motion.div key={listing.id} className="h-full" {...staggerList(index)}>
                <MarketplaceListingCard
                  listing={listing}
                  onClick={() => setSelectedListingId(listing.id)}
                />
              </motion.div>
            ))}
          </div>

          {totalPages > 1 ? (
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          ) : null}
        </>
      )}

      <MarketplaceDetailDialog
        listingId={selectedListingId}
        open={selectedListingId !== null}
        onOpenChange={handleDetailOpenChange}
      />
    </div>
  )
}
