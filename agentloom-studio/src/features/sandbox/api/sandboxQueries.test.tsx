import {
  QueryClient,
  QueryClientProvider,
  type Query,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HTTPError } from 'ky'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sandboxKeys } from './sandboxKeys'
import { useSandboxStats } from './sandboxQueries'

const {
  fetchSandboxStatsMock,
  fetchSandboxesMock,
  fetchPersistentSandboxesMock,
} = vi.hoisted(() => ({
  fetchSandboxStatsMock: vi.fn(),
  fetchSandboxesMock: vi.fn(),
  fetchPersistentSandboxesMock: vi.fn(),
}))

vi.mock('./sandboxApi', () => ({
  fetchSandboxStats: fetchSandboxStatsMock,
  fetchSandboxes: fetchSandboxesMock,
  fetchPersistentSandboxes: fetchPersistentSandboxesMock,
}))

type StatsQuery = Query<unknown, Error, unknown, readonly unknown[]>
type StatsQueryWithRefetchInterval = StatsQuery & {
  options: StatsQuery['options'] & {
    refetchInterval?:
      | ((query: StatsQuery) => false | number)
      | false
      | number
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
    },
  }
}

function makeHttpError(status: number, statusText = 'Not Found') {
  const response = new Response(null, { status, statusText })
  const request = new Request(
    'http://localhost/api/v1/sandboxes/session-1/stats',
    { method: 'GET' },
  )

  return new HTTPError(response, request, {} as never)
}

describe('useSandboxStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('运行中的沙箱会拉取资源统计', async () => {
    fetchSandboxStatsMock.mockResolvedValue({
      cpuPercent: 12.5,
      memoryUsageMb: 64,
      memoryLimitMb: 256,
    })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () => useSandboxStats('session-1', 'ready'),
      { wrapper: Wrapper },
    )

    await waitFor(() =>
      expect(result.current.data).toMatchObject({
        cpuPercent: 12.5,
      }),
    )

    expect(fetchSandboxStatsMock).toHaveBeenCalledWith('session-1')
  })

  it('非运行状态不会主动请求资源统计', async () => {
    const { Wrapper } = createWrapper()
    renderHook(() => useSandboxStats('session-1', 'stopped'), {
      wrapper: Wrapper,
    })

    await waitFor(() => {
      expect(fetchSandboxStatsMock).not.toHaveBeenCalled()
    })
  })

  it('404 时应停止 stats 轮询并触发列表刷新', async () => {
    fetchSandboxStatsMock.mockRejectedValue(makeHttpError(404))

    const { Wrapper, queryClient } = createWrapper()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useSandboxStats('session-404', 'ready'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toBeNull()
    })

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.lists(),
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.persistent(),
    })

    const query = queryClient.getQueryCache().find({
      queryKey: sandboxKeys.stats('session-404'),
    })

    const typedQuery = query as StatsQueryWithRefetchInterval | undefined
    expect(typedQuery).toBeDefined()

    expect(typeof typedQuery?.options.refetchInterval).toBe('function')

    if (!typedQuery || typeof typedQuery.options.refetchInterval !== 'function') {
      throw new Error('expected sandbox stats query refetchInterval function')
    }

    expect(typedQuery.options.refetchInterval(typedQuery)).toBe(false)
  })

  it('409 时也应回退为 null 并刷新列表状态', async () => {
    fetchSandboxStatsMock.mockRejectedValue(makeHttpError(409, 'Conflict'))

    const { Wrapper, queryClient } = createWrapper()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useSandboxStats('session-409', 'busy'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toBeNull()
    })

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.lists(),
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.persistent(),
    })
  })
})
