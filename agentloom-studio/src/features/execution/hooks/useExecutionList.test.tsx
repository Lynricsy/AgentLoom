import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executionKeys } from '../api/executionKeys'
import { useExecution, useExecutionList } from './useExecutionList'
import type { ExecutionResponse } from '../api/executionApi'

const mocks = vi.hoisted(() => ({
  getExecutionMock: vi.fn(),
  listExecutionsMock: vi.fn(),
}))

vi.mock('../api/executionApi', () => ({
  getExecution: (...args: unknown[]) => mocks.getExecutionMock(...args),
  listExecutions: (...args: unknown[]) => mocks.listExecutionsMock(...args),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function createExecutionResponse(): ExecutionResponse {
  return {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    workflowId: 'workflow-001',
    workflowVersionId: 'ver-001',
    status: 'completed',
    triggerType: 'manual',
    inputParams: {},
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: '2026-03-10T10:01:00.000Z',
    failedAt: null,
    cancelledAt: null,
    errorMessage: null,
    totalSteps: 1,
    completedSteps: 0,
    createdBy: 'user-001',
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:01:00.000Z',
    definitionSnapshot: {
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { label: 'Agent Node', nodeType: 'agent' },
        },
      ],
      edges: [],
    },
    steps: [
      {
        id: 'step-1',
        executionId: 'exec-001',
        nodeId: 'node-1',
        stepOrder: 0,
        input: {},
        nodeType: 'agent',
        nodeData: { prompt: 'hello' },
        result: { text: 'world' },
        attemptCount: 1,
        isEncrypted: false,
        checkpointData: {
          attempts: [
            {
              attempt: 1,
              error: 'retry once',
              timestamp: '2026-03-10T10:00:20.000Z',
            },
          ],
        },
        errorMessage: { message: 'ignored because completed' },
        startedAt: '2026-03-10T10:00:00.000Z',
        completedAt: '2026-03-10T10:01:00.000Z',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:01:00.000Z',
        status: 'waiting_intervention',
      },
    ],
  }
}

describe('useExecutionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('根据 workflowDefinitionId 和分页参数查询执行列表', async () => {
    mocks.listExecutionsMock.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      },
    })

    const { result } = renderHook(
      () => useExecutionList('wf-001', { page: 1, pageSize: 10, status: 'completed' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mocks.listExecutionsMock).toHaveBeenCalledWith('wf-001', {
      page: 1,
      pageSize: 10,
      status: 'completed',
    })
  })

  it('归一化执行详情中的图结构与步骤名称', async () => {
    mocks.getExecutionMock.mockResolvedValue({
      data: createExecutionResponse(),
    })

    const { result } = renderHook(() => useExecution('exec-001'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.workflowVersion.graph.nodes).toHaveLength(1)
    expect(result.current.data?.steps[0]).toEqual(
      expect.objectContaining({
        nodeName: 'Agent Node',
        nodeType: 'agent',
        status: 'waiting_for_intervention',
        retryCount: 1,
      }),
    )
  })

  it('归一化已缓存的生成响应数据', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(
      executionKeys.detail('exec-001'),
      createExecutionResponse(),
    )

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useExecution('exec-001'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mocks.getExecutionMock).not.toHaveBeenCalled()
    expect(result.current.data?.workflowVersion.graph.nodes).toHaveLength(1)
    expect(result.current.data?.steps[0]).toEqual(
      expect.objectContaining({
        nodeName: 'Agent Node',
        nodeType: 'agent',
        status: 'waiting_for_intervention',
      }),
    )
  })
})
