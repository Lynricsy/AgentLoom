import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionStore } from '../stores/executionStore'
import { useStartExecution } from './useStartExecution'

const mockMutateAsync = vi.fn()
const mockReset = vi.fn()

vi.mock('../api/executionMutations', () => ({
  useRunWorkflow: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
    reset: mockReset,
  }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const mockExecutionResponse = {
  data: {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    status: 'pending',
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
}

describe('useStartExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useExecutionStore.getState().actions.reset()
  })

  it('startExecution 调用 runWorkflow 并初始化 store', async () => {
    mockMutateAsync.mockResolvedValue(mockExecutionResponse)
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStartExecution(), { wrapper })

    let execResult: unknown

    await act(async () => {
      execResult = await result.current.startExecution('wf-001', { key: 'value' })
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      workflowId: 'wf-001',
      inputParams: { key: 'value' },
    })

    expect(useExecutionStore.getState().executionId).toBe('exec-001')
    expect(execResult).toEqual(mockExecutionResponse.data)
  })

  it('startExecution 不带 inputParams 时正常工作', async () => {
    mockMutateAsync.mockResolvedValue(mockExecutionResponse)
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStartExecution(), { wrapper })

    await act(async () => {
      await result.current.startExecution('wf-001')
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      workflowId: 'wf-001',
      inputParams: undefined,
    })

    expect(useExecutionStore.getState().executionId).toBe('exec-001')
  })

  it('mutation 失败时不初始化 store', async () => {
    mockMutateAsync.mockRejectedValue(new Error('API 错误'))
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStartExecution(), { wrapper })

    await act(async () => {
      await result.current.startExecution('wf-001').catch(() => {})
    })

    expect(useExecutionStore.getState().executionId).toBeNull()
  })

  it('reset 调用 mutation 的 reset', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useStartExecution(), { wrapper })

    result.current.reset()
    expect(mockReset).toHaveBeenCalled()
  })
})
