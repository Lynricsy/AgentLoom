import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react'

import { Link } from '@tanstack/react-router'
import { Search, Store } from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { cn } from '@/shared/lib/utils'
import { usePublicListings } from '../api/publicMarketplaceQueries'
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SORT_OPTIONS,
  type MarketplaceCategory,
  type PublicListingsFilters,
  type MarketplaceSortOption,
} from '../types'
import { MarketplaceListingCard } from './MarketplaceListingCard'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'

type BrowseCategory = MarketplaceCategory | 'all'

const CATEGORY_TABS: { value: BrowseCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  ...MARKETPLACE_CATEGORIES,
]

const DEFAULT_SORT: MarketplaceSortOption = 'popular'
const PAGE_SIZE = 12

export function MarketplaceBrowsePage() {
  const [category, setCategory] = useState<BrowseCategory>('all')
  const [sort, setSort] = useState<MarketplaceSortOption>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const filters = useMemo<PublicListingsFilters>(
    () => ({
      category: category === 'all' ? undefined : category,
      search: debouncedSearch || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [category, debouncedSearch, page, sort],
  )

  const { data, isLoading, isError, refetch } = usePublicListings(filters)

  const listings = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data ? Math.max(1, Math.ceil(total / data.pageSize)) : 1

  const handleCategoryChange = useCallback((nextCategory: string) => {
    setCategory(nextCategory as BrowseCategory)
    setPage(1)
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

  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedListingId(null)
    }
  }, [])

  return (
    <div
      className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6"
      data-testid="marketplace-browse-page"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Marketplace</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            浏览社区共享工作流，并一键安装到你的工作区。
          </p>
        </div>

        <Link
          to="/marketplace/my-listings"
          className={cn(buttonVariants({ variant: 'outline', size: 'default' }))}
        >
          我的发布
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search marketplace listings"
            className="pl-9"
            data-testid="marketplace-search-input"
          />
        </div>

        <Select
          value={sort}
          onValueChange={handleSortChange}
          aria-label="Sort marketplace listings"
          data-testid="marketplace-sort-select"
        >
          {MARKETPLACE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Tabs value={category} defaultValue="all" onValueChange={handleCategoryChange}>
        <TabsList className="flex flex-wrap gap-1">
          {CATEGORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          data-testid="marketplace-browse-loading"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`marketplace-loading-${String(index)}`}
              className="h-64 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ) : isError ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
          data-testid="marketplace-browse-error"
        >
          <Store className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">Marketplace 加载失败</p>
            <p className="text-sm text-muted-foreground">请稍后重试，或刷新页面后再试一次。</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            重试
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
          data-testid="marketplace-browse-empty"
        >
          <Store className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">No listings found</p>
            <p className="text-sm text-muted-foreground">尝试调整分类、搜索词或排序方式。</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} listings</span>
            <span>Page {page}</span>
          </div>

          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            data-testid="marketplace-browse-grid"
          >
            {listings.map((listing) => (
              <MarketplaceListingCard
                key={listing.id}
                listing={listing}
                onClick={() => setSelectedListingId(listing.id)}
              />
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
