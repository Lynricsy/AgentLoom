import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTemplates, fetchTemplateBySlug } from './templateApi';
import { templateKeys } from './templateKeys';
import {
  useTemplateBySlug,
  useTemplateDetail,
  useTemplates,
} from './templateQueries';

vi.mock('./templateApi', () => ({
  fetchTemplates: vi.fn(),
  fetchTemplateBySlug: vi.fn(),
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

describe('template queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTemplates', () => {
    it('should fetch templates with default params', async () => {
      const response = {
        data: [{ id: 't-1', slug: 'test-template', name: 'Test' }],
        meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      };
      vi.mocked(fetchTemplates).mockResolvedValue(response as never);

      const { Wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useTemplates(), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchTemplates).toHaveBeenCalledWith({});
      expect(result.current.data).toEqual(response);

      const query = queryClient.getQueryCache().find({
        queryKey: templateKeys.list({}),
      });
      expect(query?.options).toMatchObject({
        staleTime: 10 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      });
    });

    it('should pass category filter to API', async () => {
      const response = {
        data: [],
        meta: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
      };
      vi.mocked(fetchTemplates).mockResolvedValue(response as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(
        () => useTemplates({ category: 'analysis' }),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchTemplates).toHaveBeenCalledWith({ category: 'analysis' });
    });

    it('should pass pagination params to API', async () => {
      const response = {
        data: [],
        meta: { page: 2, pageSize: 5, total: 10, totalPages: 2 },
      };
      vi.mocked(fetchTemplates).mockResolvedValue(response as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(
        () => useTemplates({ page: 2, pageSize: 5 }),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchTemplates).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
    });
  });

  describe('useTemplateBySlug', () => {
    it('should fetch template detail when slug is provided', async () => {
      const response = {
        id: 't-1',
        slug: 'daily-competitor-analysis',
        name: '每日竞品分析',
        definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      };
      vi.mocked(fetchTemplateBySlug).mockResolvedValue(response as never);

      const { Wrapper, queryClient } = createWrapper();
      const { result } = renderHook(
        () => useTemplateBySlug('daily-competitor-analysis'),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchTemplateBySlug).toHaveBeenCalledWith(
        'daily-competitor-analysis',
      );
      expect(result.current.data).toEqual(response);

      const query = queryClient.getQueryCache().find({
        queryKey: templateKeys.detail('daily-competitor-analysis'),
      });
      expect(query?.options).toMatchObject({
        staleTime: 10 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      });
    });

    it('should not fetch when slug is undefined', () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useTemplateBySlug(undefined), {
        wrapper: Wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchTemplateBySlug).not.toHaveBeenCalled();
    });

    it('should keep useTemplateDetail as a compatibility alias', async () => {
      const response = {
        id: 't-2',
        slug: 'tech-blog-writer',
        name: '技术博客创作工作流',
        definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      };
      vi.mocked(fetchTemplateBySlug).mockResolvedValue(response as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useTemplateDetail('tech-blog-writer'), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchTemplateBySlug).toHaveBeenCalledWith('tech-blog-writer');
      expect(result.current.data).toEqual(response);
    });
  });
});
