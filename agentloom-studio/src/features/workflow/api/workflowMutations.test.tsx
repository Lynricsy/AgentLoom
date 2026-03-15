import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import { useCreateWorkflow, useUpdateWorkflow } from './workflowMutations';
import type { WorkflowInputSchema } from '../types';

const { createWorkflowMock, patchMock, patchJsonMock } = vi.hoisted(() => ({
  createWorkflowMock: vi.fn(),
  patchMock: vi.fn(),
  patchJsonMock: vi.fn(),
}));

vi.mock('./workflowApi', () => ({
  createWorkflow: createWorkflowMock,
}));

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
  toSnakeBody: (data: Record<string, unknown>) => data,
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

  it('包含 shareToken 时应原样透传并保持缓存失效行为', async () => {
    createWorkflowMock.mockResolvedValue({ id: 'wf-3', name: '分享副本' });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        name: '分享副本',
        shareToken: 'share-token-123',
      });
    });

    expect(createWorkflowMock).toHaveBeenCalledWith(
      {
        name: '分享副本',
        shareToken: 'share-token-123',
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

describe('useUpdateWorkflow', () => {
  const inputSchema: WorkflowInputSchema = {
    version: 1,
    collectionMode: 'form',
    fields: [
      {
        id: 'topic',
        type: 'text',
        label: '主题',
        required: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    patchMock.mockReturnValue({ json: patchJsonMock });
  });

  it('提交 inputSchema 并更新 detail cache', async () => {
    const updatedWorkflow = {
      id: 'wf-1',
      tenantId: 'tenant-1',
      name: '测试工作流',
      slug: 'test-workflow',
      description: null,
      nodes: [],
      edges: [],
      viewport: null,
      inputSchema: {
        ...inputSchema,
        version: 2,
      },
      version: 8,
      status: 'draft',
      publishedVersionId: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt: '2026-03-10T00:00:00Z',
      updatedAt: '2026-03-10T00:00:00Z',
    };

    patchJsonMock.mockResolvedValue({ data: updatedWorkflow });

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useUpdateWorkflow('wf-1'), {
      wrapper: Wrapper,
    });

    await act(async () => {
      const data = await result.current.mutateAsync({
        version: 7,
        inputSchema,
      });
      expect(data).toEqual(updatedWorkflow);
    });

    expect(patchMock).toHaveBeenCalledWith('workflow-definitions/wf-1', {
      json: {
        version: 7,
        inputSchema,
      },
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['workflows', 'detail', 'wf-1'])).toEqual(updatedWorkflow);
    });
  });
});
