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
import { useSandboxStats, useSandboxes } from './sandboxQueries'
import type { SandboxListResponse, SandboxSession } from '../types'

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

type SandboxesQuery = Query<unknown, Error, unknown, readonly unknown[]>
type SandboxesQueryWithRefetchInterval = SandboxesQuery & {
  options: SandboxesQuery['options'] & {
    refetchInterval?:
      | ((query: SandboxesQuery) => false | number)
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

function makeSession(
  overrides: Partial<SandboxSession> = {},
): SandboxSession {
  return {
    id: 'session-1',
    executionId: null,
    agentConversationId: null,
    sandboxNodeId: null,
    containerId: 'container-1',
    status: 'ready',
    config: {
      name: 'Persistent Sandbox',
      cpu: 2,
      memory: 2048,
      disk: 20,
      timeout: 24,
      lifecycleMode: 'persistent',
    },
    bindingType: 'resource',
    workspacePath: '/workspace/',
    startedAt: '2025-01-01T00:00:00.000Z',
    stoppedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
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

describe('useSandboxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('存在 creating/stopping 沙箱时应持续轮询列表', async () => {
    const params = { bindingType: 'resource' as const }
    fetchSandboxesMock.mockResolvedValue({
      data: [makeSession({ status: 'creating' })],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } satisfies SandboxListResponse)

    const { Wrapper, queryClient } = createWrapper()
    renderHook(() => useSandboxes(params), { wrapper: Wrapper })

    await waitFor(() => {
      expect(fetchSandboxesMock).toHaveBeenCalledWith(params)
    })

    const query = queryClient.getQueryCache().find({
      queryKey: sandboxKeys.list(params),
    })
    const typedQuery = query as SandboxesQueryWithRefetchInterval | undefined

    expect(typeof typedQuery?.options.refetchInterval).toBe('function')

    if (!typedQuery || typeof typedQuery.options.refetchInterval !== 'function') {
      throw new Error('expected sandboxes query refetchInterval function')
    }

    expect(typedQuery.options.refetchInterval(typedQuery)).toBe(3_000)
  })

  it('状态稳定后应停止列表轮询', async () => {
    const params = { bindingType: 'resource' as const }
    fetchSandboxesMock.mockResolvedValue({
      data: [makeSession({ status: 'stopped' })],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } satisfies SandboxListResponse)

    const { Wrapper, queryClient } = createWrapper()
    renderHook(() => useSandboxes(params), { wrapper: Wrapper })

    await waitFor(() => {
      expect(fetchSandboxesMock).toHaveBeenCalledWith(params)
    })

    const query = queryClient.getQueryCache().find({
      queryKey: sandboxKeys.list(params),
    })
    const typedQuery = query as SandboxesQueryWithRefetchInterval | undefined

    expect(typeof typedQuery?.options.refetchInterval).toBe('function')

    if (!typedQuery || typeof typedQuery.options.refetchInterval !== 'function') {
      throw new Error('expected sandboxes query refetchInterval function')
    }

    expect(typedQuery.options.refetchInterval(typedQuery)).toBe(false)
  })
})

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
