import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import { useCreateWorkflow } from './workflowMutations';

const { postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((body: unknown) => body),
}));

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    post: postMock,
  },
  toSnakeBody: toSnakeBodyMock,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

describe('useCreateWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('向 workflow-definitions 发送 POST 请求并使用 toSnakeBody', async () => {
    const mockResult = { id: 'wf-1', name: '测试工作流', status: 'draft' };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: mockResult }),
    });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      const data = await result.current.mutateAsync({
        name: '测试工作流',
        description: '描述',
        templateSlug: 'my-template',
      });
      expect(data).toEqual(mockResult);
    });

    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      name: '测试工作流',
      description: '描述',
      templateSlug: 'my-template',
    });

    expect(postMock).toHaveBeenCalledWith('workflow-definitions', {
      json: expect.objectContaining({ name: '测试工作流' }),
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['workflows', 'list'],
      });
    });
  });

  it('不含模板时只发送 name', async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { id: 'wf-2', name: '空白' } }),
    });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: '空白' });
    });

    expect(toSnakeBodyMock).toHaveBeenCalledWith({ name: '空白' });
  });

  it('请求失败时抛出错误', async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ name: '失败测试' });
      }),
    ).rejects.toThrow('Network error');
  });
});
