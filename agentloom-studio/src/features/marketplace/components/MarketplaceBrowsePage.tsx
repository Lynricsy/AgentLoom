import {
  useCallback,
  useEffect,
  useMemo,
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
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SORT_OPTIONS,
  type MarketplaceCategory,
  type MarketplacePricingModel,
  type PublicListingsFilters,
  type MarketplaceSortOption,
} from '../types'
import { MarketplaceListingCard } from './MarketplaceListingCard'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'

type BrowseCategory = MarketplaceCategory | 'all'
type PricingFilter = MarketplacePricingModel | 'all'

const CATEGORY_TABS: { value: BrowseCategory; label: string }[] = [
  { value: 'all', label: '全部' },
  ...MARKETPLACE_CATEGORIES,
]

const PRICING_OPTIONS: { value: PricingFilter; label: string }[] = [
  { value: 'all', label: '全部定价' },
  { value: 'free', label: '免费' },
  { value: 'per_execution', label: '按次计费' },
]

const DEFAULT_SORT: MarketplaceSortOption = 'popular'
const PAGE_SIZE = 12

export function MarketplaceBrowsePage({
  mode = 'marketplace',
}: {
  mode?: 'marketplace' | 'discover'
}) {
  const [listingType, setListingType] = useState<MarketplaceListingTypeFilter>('all')
  const [category, setCategory] = useState<BrowseCategory>('all')
  const [pricing, setPricing] = useState<PricingFilter>('all')
  const [sort, setSort] = useState<MarketplaceSortOption>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)

  const { notify } = useToast()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const filters = useMemo<PublicListingsFilters>(
    () => ({
      category: category === 'all' ? undefined : category,
      listingType: listingType === 'all' ? undefined : listingType,
      search: debouncedSearch || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [category, debouncedSearch, listingType, page, sort],
  )

  const { data, isLoading, isError, refetch } = usePublicListings(filters)

  const listings = data?.data ?? []
  const total = data?.meta.total ?? 0
  const totalPages = data?.meta.totalPages ?? 0
  const isDiscover = mode === 'discover'

  // 后端 browse 接口不支持定价过滤，定价作为当前页的本地视图筛选
  const visibleListings =
    pricing === 'all'
      ? listings
      : listings.filter((listing) => listing.pricingModel === pricing)

  const hasActiveFilters =
    listingType !== 'all' ||
    category !== 'all' ||
    pricing !== 'all' ||
    debouncedSearch.length > 0

  useEffect(() => {
    if (!isError) return

    notify({
      title: 'Marketplace 加载失败',
      description: '无法获取市场内容，请稍后重试。',
      variant: 'error',
    })
  }, [isError, notify])

  const handleCategoryChange = useCallback((nextCategory: string) => {
    setCategory(nextCategory as BrowseCategory)
    setPage(1)
  }, [])

  const handleListingTypeChange = useCallback((nextListingType: string) => {
    setListingType(nextListingType as MarketplaceListingTypeFilter)
    setPage(1)
  }, [])

  const handlePricingChange = useCallback((nextPricing: string) => {
    setPricing(nextPricing as PricingFilter)
  }, [])

  const handleSortChange = useCallback((nextSort: string) => {
    setSort(nextSort as MarketplaceSortOption)
    setPage(1)
  }, [])

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchInput(event.target.value)
      setPage(1)
    },
    [],
  )

  const handleResetFilters = useCallback(() => {
    setListingType('all')
    setCategory('all')
    setPricing('all')
    setSearchInput('')
    setPage(1)
  }, [])

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
            <Select value={pricing} onValueChange={handlePricingChange}>
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

            <Select value={sort} onValueChange={handleSortChange}>
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
          value={listingType}
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

        <Tabs value={category} defaultValue="all" onValueChange={handleCategoryChange}>
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
      ) : visibleListings.length === 0 ? (
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
            <span>
              {pricing === 'all'
                ? `共 ${String(total)} 个项目`
                : `当前页 ${String(visibleListings.length)} 个匹配项目`}
            </span>
            <span>第 {page} 页</span>
          </div>

          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="marketplace-browse-grid"
          >
            {visibleListings.map((listing, index) => (
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
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
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
