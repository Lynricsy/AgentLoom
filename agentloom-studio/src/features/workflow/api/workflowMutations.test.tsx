import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import { useCreateWorkflow } from './workflowMutations';

const { createWorkflowMock } = vi.hoisted(() => ({
  createWorkflowMock: vi.fn(),
}));

vi.mock('./workflowApi', () => ({
  createWorkflow: createWorkflowMock,
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

  it('调用 createWorkflow 并在成功后刷新工作流列表', async () => {
    const mockResult = { id: 'wf-1', name: '测试工作流', status: 'draft' };
    createWorkflowMock.mockResolvedValue(mockResult);

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

    expect(createWorkflowMock).toHaveBeenCalledWith(
      {
        name: '测试工作流',
        description: '描述',
        templateSlug: 'my-template',
      },
      expect.objectContaining({
        mutationKey: ['workflow', 'create'],
      }),
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['workflows', 'list'],
      });
    });
  });

  it('不含模板时只发送 name', async () => {
    createWorkflowMock.mockResolvedValue({ id: 'wf-2', name: '空白' });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: '空白' });
    });

    expect(createWorkflowMock).toHaveBeenCalledWith(
      { name: '空白' },
      expect.objectContaining({
        mutationKey: ['workflow', 'create'],
      }),
    );
  });

  it('请求失败时抛出错误', async () => {
    createWorkflowMock.mockRejectedValue(new Error('Network error'));

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
