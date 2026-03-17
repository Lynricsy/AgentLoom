import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMarketplaceListingById,
  fetchMyMarketplaceListings,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import {
  MARKETPLACE_DETAIL_STALE_TIME,
  MARKETPLACE_LIST_STALE_TIME,
  useMarketplaceListingDetail,
  useMyMarketplaceListings,
} from './marketplaceQueries';
import type { MarketplaceListing } from '../types';

vi.mock('./marketplaceApi', () => ({
  fetchMarketplaceListingById: vi.fn(),
  fetchMyMarketplaceListings: vi.fn(),
}));

function createMarketplaceListing(
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    id: 'listing-1',
    workflowVersionId: 'version-1',
    pluginDbId: null,
    tenantId: 'tenant-1',
    title: 'Agent 工作流模板',
    summary: '这是一个满足 marketplace 审查要求的工作流摘要描述。',
    tags: ['agent', 'automation'],
    coverImageUrl: null,
    category: 'analysis',
    listingType: 'workflow',
    pricingModel: 'free',
    pricePerExecution: null,
    status: 'listed',
    reviewResult: null,
    submittedBy: 'user-1',
    submittedAt: '2026-03-15T00:00:00.000Z',
    publishedAt: '2026-03-15T00:00:00.000Z',
    unlistedAt: null,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  };
}

describe('marketplaceQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches my marketplace listings with default filters and stale time', async () => {
    const response = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
    vi.mocked(fetchMyMarketplaceListings).mockResolvedValue(response);

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useMyMarketplaceListings(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMyMarketplaceListings).toHaveBeenCalledWith({});
    expect(result.current.data).toEqual(response);

    const query = queryClient.getQueryCache().find({
      queryKey: marketplaceKeys.list({}),
    });
    expect(query?.options).toMatchObject({
      staleTime: MARKETPLACE_LIST_STALE_TIME,
    });
  });

  it('passes filters to the listings query API', async () => {
    const response = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
    vi.mocked(fetchMyMarketplaceListings).mockResolvedValue(response);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useMyMarketplaceListings({ status: 'listed', page: 2, pageSize: 10 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMyMarketplaceListings).toHaveBeenCalledWith({
      status: 'listed',
      page: 2,
      pageSize: 10,
    });
  });

  it('fetches marketplace listing detail when id exists', async () => {
    const response = {
      data: createMarketplaceListing(),
    };
    vi.mocked(fetchMarketplaceListingById).mockResolvedValue(response);

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(
      () => useMarketplaceListingDetail('listing-1'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMarketplaceListingById).toHaveBeenCalledWith('listing-1');
    expect(result.current.data).toEqual(response);

    const query = queryClient.getQueryCache().find({
      queryKey: marketplaceKeys.detail('listing-1'),
    });
    expect(query?.options).toMatchObject({
      staleTime: MARKETPLACE_DETAIL_STALE_TIME,
    });
  });

  it('does not fetch listing detail when id is undefined', () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMarketplaceListingDetail(undefined), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMarketplaceListingById).not.toHaveBeenCalled();
  });
});
