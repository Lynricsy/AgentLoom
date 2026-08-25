import { useState, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarketplaceBrowseSearch } from '../../lib/browseSearch'
import type {
  PublicListingsFilters,
  PublicListingsResponse,
  PublicMarketplaceListingItem,
} from '../../types'
import { MarketplaceBrowsePage } from '../MarketplaceBrowsePage'

const { listingsQueryMock, usePublicListingsMock } = vi.hoisted(() => ({
  listingsQueryMock: {
    data: undefined as PublicListingsResponse | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  usePublicListingsMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children?: ReactNode
    to: string
    [key: string]: unknown
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../api/publicMarketplaceQueries', () => ({
  usePublicListings: (filters: PublicListingsFilters) => usePublicListingsMock(filters),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

vi.mock('../MarketplaceListingCard', () => ({
  MarketplaceListingCard: ({
    listing,
    onClick,
  }: {
    listing: PublicMarketplaceListingItem
    onClick: () => void
  }) => (
    <button type="button" data-testid="marketplace-listing-card" onClick={onClick}>
      {listing.title}
    </button>
  ),
}))

vi.mock('../MarketplaceDetailDialog', () => ({
  MarketplaceDetailDialog: ({
    listingId,
    open,
  }: {
    listingId: string | null
    open: boolean
  }) => (open ? <div data-testid="marketplace-detail-dialog">{listingId}</div> : null),
}))

function makeListing(
  overrides: Partial<PublicMarketplaceListingItem> = {},
): PublicMarketplaceListingItem {
  return {
    id: 'listing-1',
    title: 'Agent Workflow',
    summary: 'A marketplace workflow for testing browse page behavior.',
    tags: ['agent', 'automation'],
    coverImageUrl: null,
    category: 'analysis',
    useCount: 42,
    avgRating: '4.5',
    reviewCount: 12,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '狐娘测试者' },
    listingType: 'workflow' as const,
    pricingModel: 'free' as const,
    pricePerExecution: null,
    plugin: null,
    ...overrides,
  }
}

const DEFAULT_SEARCH: MarketplaceBrowseSearch = {
  page: 1,
  category: 'all',
  listingType: 'all',
  pricingModel: 'all',
  sort: 'popular',
  search: '',
}

/**
 * 路由替身：把 onFiltersChange/onPageChange 的语义（合并更新 + 改筛选时回到第一页）
 * 原样复刻，页面就能像挂在真实 search params 上一样被驱动。
 */
function renderBrowsePage(initial: Partial<MarketplaceBrowseSearch> = {}) {
  const onFiltersChange = vi.fn()
  const onPageChange = vi.fn()

  function Harness() {
    const [filters, setFilters] = useState<MarketplaceBrowseSearch>({
      ...DEFAULT_SEARCH,
      ...initial,
    })

    return (
      <MarketplaceBrowsePage
        filters={filters}
        onFiltersChange={(updates) => {
          onFiltersChange(updates)
          setFilters((prev) => ({ ...prev, ...updates, page: 1 }))
        }}
        onPageChange={(page) => {
          onPageChange(page)
          setFilters((prev) => ({ ...prev, page }))
        }}
      />
    )
  }

  render(<Harness />)

  return { onFiltersChange, onPageChange }
}

function makeResponse(
  listings: PublicMarketplaceListingItem[],
  meta: Partial<PublicListingsResponse['meta']> = {},
): PublicListingsResponse {
  return {
    data: listings,
    meta: {
      total: listings.length,
      page: 1,
      pageSize: 12,
      totalPages: listings.length === 0 ? 0 : 1,
      ...meta,
    },
  }
}

describe('MarketplaceBrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listingsQueryMock.data = undefined
    listingsQueryMock.isLoading = false
    listingsQueryMock.isError = false
    listingsQueryMock.refetch = vi.fn()
    usePublicListingsMock.mockImplementation(() => listingsQueryMock)
  })

  it('renders the listing grid when data is available', () => {
    listingsQueryMock.data = makeResponse([
      makeListing({ id: 'listing-1', title: 'Agent Workflow' }),
      makeListing({
        id: 'listing-2',
        title: 'Content Pipeline',
        category: 'content',
      }),
    ])

    renderBrowsePage()

    expect(screen.getByTestId('marketplace-browse-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('marketplace-listing-card')).toHaveLength(2)
    expect(screen.getByText('Agent Workflow')).toBeInTheDocument()
    expect(screen.getByText('Content Pipeline')).toBeInTheDocument()
  })

  it('applies search after the 300ms debounce window', () => {
    vi.useFakeTimers()
    listingsQueryMock.data = makeResponse([makeListing()])

    const { onFiltersChange } = renderBrowsePage()

    fireEvent.change(screen.getByTestId('marketplace-search-input'), {
      target: { value: 'agent search' },
    })

    expect(onFiltersChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })

    expect(onFiltersChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(onFiltersChange).toHaveBeenCalledWith({ search: 'agent search' })
    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      search: 'agent search',
      page: 1,
      pageSize: 12,
    })

    vi.useRealTimers()
  })

  it('filters by category tab', () => {
    listingsQueryMock.data = makeResponse([makeListing()])

    renderBrowsePage()

    fireEvent.click(screen.getByRole('button', { name: '分析' }))

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      category: 'analysis',
      page: 1,
    })
  })

  it('filters by listing type tab', () => {
    listingsQueryMock.data = makeResponse([makeListing()])

    renderBrowsePage()

    fireEvent.click(screen.getByRole('button', { name: '插件' }))

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      listingType: 'plugin',
      page: 1,
    })
  })

  it('updates sort selection', async () => {
    const user = userEvent.setup()
    listingsQueryMock.data = makeResponse([makeListing()])

    renderBrowsePage()

    await user.click(screen.getByTestId('marketplace-sort-select'))
    await user.click(await screen.findByRole('option', { name: '最新发布' }))

    await waitFor(() => {
      expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
        sort: 'newest',
        page: 1,
      })
    })
  })

  it('sends the pricing filter to the server instead of filtering locally', async () => {
    const user = userEvent.setup()
    listingsQueryMock.data = makeResponse([
      makeListing({ id: 'free-1', title: 'Free Workflow', pricingModel: 'free' }),
      makeListing({
        id: 'paid-1',
        title: 'Paid Workflow',
        pricingModel: 'per_execution',
        pricePerExecution: '0.01',
      }),
    ])

    const { onFiltersChange } = renderBrowsePage()

    await user.click(screen.getByTestId('marketplace-pricing-select'))
    await user.click(await screen.findByRole('option', { name: '按次计费' }))

    await waitFor(() => {
      expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
        pricingModel: 'per_execution',
        page: 1,
      })
    })
    expect(onFiltersChange).toHaveBeenCalledWith({
      pricingModel: 'per_execution',
    })
    // 服务端负责过滤：本地不再裁剪当前页，两张卡片仍按响应渲染
    expect(screen.getAllByTestId('marketplace-listing-card')).toHaveLength(2)
  })

  it('omits pricingModel from the request when the filter is 全部', () => {
    listingsQueryMock.data = makeResponse([makeListing()])

    renderBrowsePage()

    expect(usePublicListingsMock.mock.lastCall?.[0].pricingModel).toBeUndefined()
  })

  it('reports the server total rather than the current page length', () => {
    listingsQueryMock.data = makeResponse([makeListing()], {
      total: 37,
      totalPages: 4,
    })

    renderBrowsePage()

    expect(screen.getByText('共 37 个项目')).toBeInTheDocument()
  })

  it('delegates page changes to the route handler', () => {
    listingsQueryMock.data = makeResponse([makeListing()], {
      total: 37,
      totalPages: 4,
    })

    const { onPageChange } = renderBrowsePage()

    fireEvent.click(screen.getByRole('button', { name: /下一页|Next/ }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('restores the search box from the incoming filters', () => {
    listingsQueryMock.data = makeResponse([makeListing()])

    renderBrowsePage({ search: 'planner' })

    expect(screen.getByTestId('marketplace-search-input')).toHaveValue('planner')
    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      search: 'planner',
    })
  })

  it('shows an empty state when no listings are returned', () => {
    listingsQueryMock.data = makeResponse([])

    renderBrowsePage()

    expect(screen.getByTestId('marketplace-browse-empty')).toBeInTheDocument()
    expect(screen.getByText('未找到工作流或插件')).toBeInTheDocument()
  })

  it('clears every filter from the empty state', () => {
    listingsQueryMock.data = makeResponse([])

    const { onFiltersChange } = renderBrowsePage({ pricingModel: 'free' })

    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))

    expect(onFiltersChange).toHaveBeenCalledWith({
      listingType: 'all',
      category: 'all',
      pricingModel: 'all',
      search: '',
    })
  })

  it('shows loading state while listings are loading', () => {
    listingsQueryMock.isLoading = true

    renderBrowsePage()

    expect(screen.getByTestId('marketplace-browse-loading')).toBeInTheDocument()
  })
})
