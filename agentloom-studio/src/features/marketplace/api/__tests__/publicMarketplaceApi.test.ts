import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cleanParams,
  fetchListingReviews,
  fetchPublicListingDetail,
  fetchPublicListings,
  installMarketplaceListing,
  submitMarketplaceReview,
} from '../publicMarketplaceApi'
import { publicMarketplaceKeys } from '../marketplaceKeys'
import {
  PUBLIC_MARKETPLACE_DETAIL_STALE_TIME,
  PUBLIC_MARKETPLACE_LIST_STALE_TIME,
  PUBLIC_MARKETPLACE_REVIEWS_STALE_TIME,
  useListingReviews,
  usePublicListingDetail,
  usePublicListings,
} from '../publicMarketplaceQueries'
import { useInstallListing, useSubmitReview } from '../publicMarketplaceMutations'
import { pluginKeys } from '@/features/plugin'
import type {
  MarketplaceReview,
  PublicMarketplaceListingItem,
  PublicWorkflowListingDetail,
  SubmittedMarketplaceReview,
} from '../../types'

const { getMock, postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((value: unknown) => value),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
  toSnakeBody: (value: unknown) => toSnakeBodyMock(value),
}))

function makeListing(
  overrides: Partial<PublicMarketplaceListingItem> = {},
): PublicMarketplaceListingItem {
  return {
    id: 'listing-1',
    title: 'Agent Workflow',
    summary: 'A marketplace workflow for public browse testing.',
    tags: ['agent', 'automation'],
    coverImageUrl: null,
    category: 'analysis',
    useCount: 42,
    avgRating: '4.5',
    reviewCount: 2,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '酒狐' },
    listingType: 'workflow',
    pricingModel: 'free',
    pricePerExecution: null,
    plugin: null,
    ...overrides,
  }
}

function makeReview(overrides: Partial<MarketplaceReview> = {}): MarketplaceReview {
  return {
    id: 'review-1',
    rating: 5,
    content: 'Excellent workflow.',
    createdAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '测试用户' },
    ...overrides,
  }
}

function makeSubmittedReview(
  overrides: Partial<SubmittedMarketplaceReview> = {},
): SubmittedMarketplaceReview {
  return {
    id: 'review-1',
    rating: 5,
    content: 'Excellent workflow.',
    createdAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

function makeListingDetail(
  overrides: Partial<PublicWorkflowListingDetail> = {},
): PublicWorkflowListingDetail {
  return {
    ...makeListing(),
    listingType: 'workflow',
    definition: {
      nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    reviews: [makeReview()],
    ...overrides,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    },
  }
}

describe('publicMarketplaceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes undefined values from search params', () => {
    expect(
      cleanParams({
        category: 'analysis',
        search: undefined,
        page: 1,
        pageSize: 12,
      }),
    ).toEqual({
      category: 'analysis',
      page: 1,
      pageSize: 12,
    })
  })

  it('fetches public listings with cleaned filters', async () => {
    const response = {
      data: [makeListing()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await fetchPublicListings({
      category: 'analysis',
      listingType: 'plugin',
      search: undefined,
      sort: 'popular',
      page: 1,
      pageSize: 12,
    })

    expect(getMock).toHaveBeenCalledWith('marketplace/browse', {
      searchParams: {
        category: 'analysis',
        listingType: 'plugin',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      },
    })
    expect(result).toEqual(response)
  })

  it('forwards pricingModel to the server as a query param', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, pageSize: 12, totalPages: 0 },
      }),
    })

    await fetchPublicListings({
      pricingModel: 'per_execution',
      sort: 'popular',
      page: 1,
      pageSize: 12,
    })

    expect(getMock).toHaveBeenCalledWith('marketplace/browse', {
      searchParams: {
        pricingModel: 'per_execution',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      },
    })
  })

  it('fetches public listing detail', async () => {
    const response = makeListingDetail()
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await fetchPublicListingDetail('listing-1')

    expect(getMock).toHaveBeenCalledWith('marketplace/browse/listing-1')
    expect(result).toEqual(response)
  })

  it('fetches public listing reviews', async () => {
    const response = {
      data: [makeReview()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    }
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await fetchListingReviews('listing-1')

    expect(getMock).toHaveBeenCalledWith('marketplace/browse/listing-1/reviews', {
      searchParams: { page: 1, pageSize: 20 },
    })
    expect(result).toEqual(response)
  })

  it('installs a marketplace listing with snake-cased body payload', async () => {
    const request = {
      name: 'Agent Workflow',
      description: 'Install this workflow into my workspace.',
    }
    const response = {
      workflowDefinitionId: 'workflow-1',
      name: 'Agent Workflow',
      message: 'Workflow installed successfully',
    }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await installMarketplaceListing('listing-1', request)

    expect(toSnakeBodyMock).toHaveBeenCalledWith(request)
    expect(postMock).toHaveBeenCalledWith('marketplace/listings/listing-1/install', {
      json: request,
    })
    expect(result).toEqual(response)
  })

  it('installs a plugin listing and returns plugin install response', async () => {
    const request = {
      name: 'Text Uppercase Plugin',
    }
    const response = {
      pluginDbId: 'plugin-db-1',
      pluginId: 'text-uppercase',
      name: 'Text Uppercase Plugin',
      message: 'Plugin installed successfully',
    }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await installMarketplaceListing('listing-plugin-1', request)

    expect(postMock).toHaveBeenCalledWith('marketplace/listings/listing-plugin-1/install', {
      json: request,
    })
    expect(result).toEqual(response)
    expect(result).toHaveProperty('pluginDbId')
    expect(result).toHaveProperty('pluginId')
    expect(result).not.toHaveProperty('workflowDefinitionId')
  })

  it('submits a marketplace review', async () => {
    const response = makeSubmittedReview()
    const request = { rating: 5, content: 'Great workflow.' }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await submitMarketplaceReview('listing-1', request)

    expect(postMock).toHaveBeenCalledWith('marketplace/listings/listing-1/reviews', {
      json: request,
    })
    expect(result).toEqual(response)
  })
})

describe('publicMarketplace query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns public listings data and sets stale time', async () => {
    const response = {
      data: [makeListing()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
    }
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const filters = { sort: 'popular' as const, page: 1, pageSize: 12 }
    const { queryClient, wrapper } = createWrapper()
    const { result } = renderHook(() => usePublicListings(filters), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(response)
    expect(getMock).toHaveBeenCalledWith('marketplace/browse', {
      searchParams: filters,
    })

    const query = queryClient.getQueryCache().find({
      queryKey: publicMarketplaceKeys.list(filters),
    })
    expect(query?.options).toMatchObject({
      staleTime: PUBLIC_MARKETPLACE_LIST_STALE_TIME,
    })
  })

  it('returns public listing detail data when id exists', async () => {
    const response = makeListingDetail()
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const { queryClient, wrapper } = createWrapper()
    const { result } = renderHook(() => usePublicListingDetail('listing-1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(response)
    expect(getMock).toHaveBeenCalledWith('marketplace/browse/listing-1')

    const query = queryClient.getQueryCache().find({
      queryKey: publicMarketplaceKeys.detail('listing-1'),
    })
    expect(query?.options).toMatchObject({
      staleTime: PUBLIC_MARKETPLACE_DETAIL_STALE_TIME,
    })
  })

  it('returns listing reviews data when id exists', async () => {
    const response = {
      data: [makeReview()],
      meta: {
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    }
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const { queryClient, wrapper } = createWrapper()
    const { result } = renderHook(() => useListingReviews('listing-1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(response)
    expect(getMock).toHaveBeenCalledWith('marketplace/browse/listing-1/reviews', {
      searchParams: { page: 1, pageSize: 20 },
    })

    const query = queryClient.getQueryCache().find({
      queryKey: publicMarketplaceKeys.reviews('listing-1'),
    })
    expect(query?.options).toMatchObject({
      staleTime: PUBLIC_MARKETPLACE_REVIEWS_STALE_TIME,
    })
  })
})

describe('publicMarketplace mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('install mutation invalidates public marketplace caches', async () => {
    const response = {
      workflowDefinitionId: 'workflow-1',
      name: 'Agent Workflow',
      message: 'Workflow installed successfully',
    }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const { queryClient, wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useInstallListing(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        id: 'listing-1',
        body: { name: 'Agent Workflow' },
      })
    })

    expect(postMock).toHaveBeenCalledWith('marketplace/listings/listing-1/install', {
      json: { name: 'Agent Workflow' },
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: publicMarketplaceKeys.all,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pluginKeys.all,
      })
    })
  })

  it('submit review mutation invalidates detail and review caches', async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(makeSubmittedReview()),
    })

    const { queryClient, wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSubmitReview(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        listingId: 'listing-1',
        body: { rating: 5, content: 'Excellent workflow.' },
      })
    })

    expect(postMock).toHaveBeenCalledWith('marketplace/listings/listing-1/reviews', {
      json: { rating: 5, content: 'Excellent workflow.' },
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: publicMarketplaceKeys.detail('listing-1'),
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: publicMarketplaceKeys.reviews('listing-1'),
      })
    })
  })
})
