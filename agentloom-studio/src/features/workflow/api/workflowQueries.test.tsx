import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowInputSchema } from './workflowQueries'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn((..._args: unknown[]) => ({ json: jsonMock }))

  return {
    getMock,
    jsonMock,
  }
})

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: mocks.getMock,
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useWorkflowInputSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.jsonMock.mockResolvedValue({
      data: {
        version: 3,
        collectionMode: 'form',
        fields: [],
      },
    })
  })

  it('读取发布态 input schema', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useWorkflowInputSchema('wf-001'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual({
        version: 3,
        collectionMode: 'form',
        fields: [],
      })
    })

    expect(mocks.getMock).toHaveBeenCalledWith('workflow-definitions/wf-001/input-schema')
  })

  it('enabled=false 时不发请求', () => {
    const wrapper = createWrapper()
    renderHook(() => useWorkflowInputSchema('wf-001', { enabled: false }), { wrapper })

    expect(mocks.getMock).not.toHaveBeenCalled()
  })
})
