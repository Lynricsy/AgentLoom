import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  PublicListingsFilters,
  PublicListingsResponse,
  PublicMarketplaceListingItem,
} from '../../types'

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
    children?: React.ReactNode
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
    avgRating: 4.5,
    reviewCount: 12,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '狐娘测试者' },
    ...overrides,
  }
}

const { MarketplaceBrowsePage } = await import('../MarketplaceBrowsePage')

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
    listingsQueryMock.data = {
      data: [
        makeListing({ id: 'listing-1', title: 'Agent Workflow' }),
        makeListing({ id: 'listing-2', title: 'Content Pipeline', category: 'content' }),
      ],
      meta: {
        total: 2,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }

    render(<MarketplaceBrowsePage />)

    expect(screen.getByTestId('marketplace-browse-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('marketplace-listing-card')).toHaveLength(2)
    expect(screen.getByText('Agent Workflow')).toBeInTheDocument()
    expect(screen.getByText('Content Pipeline')).toBeInTheDocument()
  })

  it('applies search after the 300ms debounce window', () => {
    vi.useFakeTimers()
    listingsQueryMock.data = {
      data: [makeListing()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }

    render(<MarketplaceBrowsePage />)

    const input = screen.getByTestId('marketplace-search-input')
    fireEvent.change(input, { target: { value: 'agent search' } })

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      search: undefined,
      sort: 'popular',
    })

    act(() => {
      vi.advanceTimersByTime(299)
    })

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      search: undefined,
    })

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      search: 'agent search',
      page: 1,
      pageSize: 12,
    })

    vi.useRealTimers()
  })

  it('filters by category tab', () => {
    listingsQueryMock.data = {
      data: [makeListing()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }

    render(<MarketplaceBrowsePage />)

    fireEvent.click(screen.getByRole('button', { name: '分析' }))

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      category: 'analysis',
      page: 1,
    })
  })

  it('updates sort selection', () => {
    listingsQueryMock.data = {
      data: [makeListing()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }

    render(<MarketplaceBrowsePage />)

    fireEvent.change(screen.getByTestId('marketplace-sort-select'), {
      target: { value: 'newest' },
    })

    expect(usePublicListingsMock.mock.lastCall?.[0]).toMatchObject({
      sort: 'newest',
      page: 1,
    })
  })

  it('shows an empty state when no listings are returned', () => {
    listingsQueryMock.data = {
      data: [],
      meta: {
        total: 0,
        page: 1,
        pageSize: 12,
        totalPages: 0,
      },
    }

    render(<MarketplaceBrowsePage />)

    expect(screen.getByTestId('marketplace-browse-empty')).toBeInTheDocument()
    expect(screen.getByText('未找到工作流')).toBeInTheDocument()
  })

  it('shows loading state while listings are loading', () => {
    listingsQueryMock.isLoading = true

    render(<MarketplaceBrowsePage />)

    expect(screen.getByTestId('marketplace-browse-loading')).toBeInTheDocument()
  })
})
