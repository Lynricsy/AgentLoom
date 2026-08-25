import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  relistMarketplaceListing,
  submitMarketplaceListing,
  submitPluginMarketplaceListing,
  unlistMarketplaceListing,
  updatePluginMarketplaceListing,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import {
  useRelistMarketplaceListing,
  useSubmitMarketplaceListing,
  useSubmitPluginMarketplaceListing,
  useUnlistMarketplaceListing,
  useUpdatePluginMarketplaceListing,
} from './marketplaceMutations';
import type { MarketplaceListing } from '../types';

vi.mock('./marketplaceApi', () => ({
  relistMarketplaceListing: vi.fn(),
  submitMarketplaceListing: vi.fn(),
  submitPluginMarketplaceListing: vi.fn(),
  unlistMarketplaceListing: vi.fn(),
  updatePluginMarketplaceListing: vi.fn(),
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

  it('submitting a plugin listing invalidates marketplace lists', async () => {
    vi.mocked(submitPluginMarketplaceListing).mockResolvedValue({
      data: createMarketplaceListing({ listingType: 'plugin' }),
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSubmitPluginMarketplaceListing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        pluginDbId: 'plugin-db-1',
        title: '高质量机器翻译节点',
        summary: '把机器翻译能力接进画布，支持二十种语言互译并保留术语表。',
        tags: ['翻译'],
        pricingModel: 'free',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketplaceKeys.lists(),
      });
    });
  });

  it('updating a plugin listing invalidates lists and its detail', async () => {
    vi.mocked(updatePluginMarketplaceListing).mockResolvedValue({
      data: createMarketplaceListing({
        listingType: 'plugin',
        status: 'review_failed',
      }),
      reviewResult: {
        outcome: 'failed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdatePluginMarketplaceListing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        listingId: 'listing-1',
        request: { title: '新的标题' },
      });
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
