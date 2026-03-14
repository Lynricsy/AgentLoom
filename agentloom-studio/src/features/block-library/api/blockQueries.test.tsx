import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBlockById, fetchBlocks } from './blockApi';
import { blockKeys } from './blockKeys';
import { useBlockById, useBlocks } from './blockQueries';

vi.mock('./blockApi', () => ({
  fetchBlocks: vi.fn(),
  fetchBlockById: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

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

describe('block queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useBlocks', () => {
    it('should fetch blocks with the provided params', async () => {
      const response = {
        data: [
          {
            id: 'block-1',
            name: '客户洞察块',
            description: '生成客户洞察摘要',
            category: 'analysis',
            tags: ['customer'],
            metadata: { nodeCount: 3, version: 1 },
            version: 1,
            isPublished: true,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      vi.mocked(fetchBlocks).mockResolvedValue(response as never);

      const params = { category: 'analysis' as const, search: '客户', page: 1, pageSize: 20 };
      const { Wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useBlocks(params), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchBlocks).toHaveBeenCalledWith(params);
      expect(result.current.data).toEqual(response);

      const query = queryClient.getQueryCache().find({
        queryKey: blockKeys.list(params),
      });
      expect(query?.options).toMatchObject({
        staleTime: 5 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
      });
    });
  });

  describe('useBlockById', () => {
    it('should fetch block detail when id is provided', async () => {
      const response = {
        id: 'block-1',
        name: '客户洞察块',
        description: '生成客户洞察摘要',
        category: 'analysis',
        tags: ['customer'],
        metadata: { nodeCount: 3, version: 1 },
        version: 1,
        isPublished: true,
        createdAt: '2026-03-14T00:00:00.000Z',
        updatedAt: '2026-03-14T00:00:00.000Z',
        createdBy: 'user-1',
        definition: {
          nodes: [{ id: 'node-1' }],
          edges: [],
          inputPorts: [],
          outputPorts: [],
        },
      };
      vi.mocked(fetchBlockById).mockResolvedValue(response as never);

      const { Wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useBlockById('block-1'), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchBlockById).toHaveBeenCalledWith('block-1');
      expect(result.current.data).toEqual(response);

      const query = queryClient.getQueryCache().find({
        queryKey: blockKeys.detail('block-1'),
      });
      expect(query?.queryKey).toEqual(blockKeys.detail('block-1'));
      expect(query?.options).toMatchObject({
        staleTime: 5 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
      });
    });

    it('should not fetch when id is undefined', () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useBlockById(undefined), {
        wrapper: Wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchBlockById).not.toHaveBeenCalled();
    });
  });
});
