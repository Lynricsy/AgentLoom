import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executionKeys } from './executionKeys'
import { useCancelExecution, useRunWorkflow } from './executionMutations'

const mockRunWorkflow = vi.fn()
const mockCancelExecution = vi.fn()

vi.mock('./executionApi', () => ({
  runWorkflow: (...args: unknown[]) => mockRunWorkflow(...args),
  cancelExecution: (...args: unknown[]) => mockCancelExecution(...args),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  }
}

const mockExecutionResponse = {
  data: {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    workflowVersionId: 'ver-001',
    status: 'pending',
    inputParams: null,
    result: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    definitionSnapshot: {
      nodes: [],
      edges: [],
    },
    steps: [],
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
}

describe('executionMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useRunWorkflow', () => {
    it('调用 runWorkflow 并使执行详情缓存失效而不直接写入', async () => {
      mockRunWorkflow.mockResolvedValue(mockExecutionResponse)
      const { queryClient, wrapper } = createWrapper()
      queryClient.setQueryData(executionKeys.detail('exec-001'), { status: 'old' })
      const { result } = renderHook(() => useRunWorkflow(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({
          workflowId: 'wf-001',
          inputParams: { key: 'value' },
          schemaVersion: 2,
          launchSource: 'web-studio',
        })
      })

      expect(mockRunWorkflow).toHaveBeenCalledWith('wf-001', {
        inputParams: { key: 'value' },
        schemaVersion: 2,
        launchSource: 'web-studio',
      })

      const cached = queryClient.getQueryData(executionKeys.detail('exec-001'))
      expect(cached).toEqual({ status: 'old' })
      expect(
        queryClient.getQueryState(executionKeys.detail('exec-001'))?.isInvalidated,
      ).toBe(true)
    })

    it('mutation 失败时设置 error', async () => {
      mockRunWorkflow.mockRejectedValue(new Error('执行失败'))
      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useRunWorkflow(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({ workflowId: 'wf-001' }).catch(() => {})
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
        expect(result.current.error?.message).toBe('执行失败')
      })
    })
  })

  describe('useCancelExecution', () => {
    it('调用 cancelExecution 并使执行详情缓存失效而不直接写入', async () => {
      mockCancelExecution.mockResolvedValue(mockExecutionResponse)
      const { queryClient, wrapper } = createWrapper()
      queryClient.setQueryData(executionKeys.detail('exec-001'), { status: 'running' })
      const { result } = renderHook(() => useCancelExecution(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({ executionId: 'exec-001' })
      })

      expect(mockCancelExecution).toHaveBeenCalledWith('exec-001')

      const cached = queryClient.getQueryData(executionKeys.detail('exec-001'))
      expect(cached).toEqual({ status: 'running' })
      expect(
        queryClient.getQueryState(executionKeys.detail('exec-001'))?.isInvalidated,
      ).toBe(true)
    })
  })
})
