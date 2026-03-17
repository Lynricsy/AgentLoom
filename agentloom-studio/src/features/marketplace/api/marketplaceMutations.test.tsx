import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  relistMarketplaceListing,
  submitMarketplaceListing,
  unlistMarketplaceListing,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import {
  useRelistMarketplaceListing,
  useSubmitMarketplaceListing,
  useUnlistMarketplaceListing,
} from './marketplaceMutations';
import type { MarketplaceListing } from '../types';

vi.mock('./marketplaceApi', () => ({
  relistMarketplaceListing: vi.fn(),
  submitMarketplaceListing: vi.fn(),
  unlistMarketplaceListing: vi.fn(),
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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('marketplaceMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submitting a listing invalidates marketplace lists', async () => {
    vi.mocked(submitMarketplaceListing).mockResolvedValue({
      data: createMarketplaceListing(),
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSubmitMarketplaceListing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        workflowVersionId: 'version-1',
        title: 'Agent 工作流模板',
        summary: '这是一个满足 marketplace 审查要求的工作流摘要描述。',
        tags: ['agent'],
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.lists(),
      });
    });
  });

  it('unlisting a listing invalidates marketplace lists and detail', async () => {
    vi.mocked(unlistMarketplaceListing).mockResolvedValue({
      data: createMarketplaceListing({
        status: 'unlisted',
        unlistedAt: '2026-03-15T01:00:00.000Z',
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUnlistMarketplaceListing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('listing-1');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.detail('listing-1'),
      });
    });
  });

  it('relisting a listing invalidates marketplace lists and detail', async () => {
    vi.mocked(relistMarketplaceListing).mockResolvedValue({
      data: createMarketplaceListing(),
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRelistMarketplaceListing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('listing-1');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.detail('listing-1'),
      });
    });
  });
});
