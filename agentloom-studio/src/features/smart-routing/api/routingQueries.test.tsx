import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProviderHealth } from './routingQueries'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn((..._args: unknown[]) => ({ json: jsonMock }))
  return { getMock, jsonMock }
})

vi.mock('@/shared/api/client', () => ({
  apiClient: { get: mocks.getMock },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useProviderHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.jsonMock.mockResolvedValue({
      data: [
        {
          providerName: 'openai',
          modelId: null,
          status: 'healthy',
          failureCount: 0,
          lastFailureAt: null,
        },
      ],
    })
  })

  it('通过 canonical smart-routing health fetcher 读取整条健康记录', async () => {
    const { result } = renderHook(() => useProviderHealth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual([
        expect.objectContaining({ providerName: 'openai', status: 'healthy' }),
      ])
    })
    expect(mocks.getMock).toHaveBeenCalledWith('smart-routing/health')
  })

  it('disabled 时不请求健康端点', () => {
    renderHook(() => useProviderHealth(false), { wrapper: createWrapper() })
    expect(mocks.getMock).not.toHaveBeenCalled()
  })
})
