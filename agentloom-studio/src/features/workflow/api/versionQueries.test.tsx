import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { VersionListResponse, WorkflowVersion } from '../types'

import { usePublishedVersion, useWorkflowVersions } from './versionQueries'

const getMock = vi.fn()

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  }
}

function makeVersion(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'ver-001',
    workflowDefinitionId: 'wf-001',
    versionNumber: 1,
    label: null,
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    },
    publishedAt: null,
    archivedAt: null,
    createdBy: 'user-001',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeVersionListResponse(data: WorkflowVersion[], page: number, total: number, pageSize = 20): VersionListResponse {
  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

afterEach(() => {
  getMock.mockReset()
})

describe('versionQueries', () => {
  it('请求版本列表并返回 data/meta 结构', async () => {
    const response = makeVersionListResponse([makeVersion()], 2, 25, 10)
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () => useWorkflowVersions('wf-001', { page: 2, pageSize: 10 }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(getMock).toHaveBeenCalledWith('workflow-definitions/wf-001/versions', {
      searchParams: { page: '2', pageSize: '10' },
    })
    expect(result.current.data).toEqual(response)
  })

  it('分页切换时保留上一页数据直到下一页返回', async () => {
    const pageOne = makeVersionListResponse([makeVersion({ id: 'ver-001', versionNumber: 1 })], 1, 2, 1)
    const pageTwo = makeVersionListResponse([makeVersion({ id: 'ver-002', versionNumber: 2 })], 2, 2, 1)
    const deferred = createDeferred<VersionListResponse>()

    getMock.mockImplementation((_url: string, options?: { searchParams?: Record<string, string> }) => {
      if (options?.searchParams?.page === '2') {
        return { json: vi.fn().mockReturnValue(deferred.promise) }
      }

      return { json: vi.fn().mockResolvedValue(pageOne) }
    })

    const { wrapper } = createWrapper()
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useWorkflowVersions('wf-001', { page, pageSize: 1 }),
      {
        wrapper,
        initialProps: { page: 1 },
      },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(pageOne)
    })

    rerender({ page: 2 })

    expect(result.current.data).toEqual(pageOne)

    deferred.resolve(pageTwo)

    await waitFor(() => {
      expect(result.current.data).toEqual(pageTwo)
    })
  })

  it('published version 查询返回 response.data', async () => {
    const version = makeVersion({ id: 'ver-published', publishedAt: '2024-01-01T00:00:00Z' })
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: version }),
    })

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => usePublishedVersion('wf-001'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(getMock).toHaveBeenCalledWith('workflow-definitions/wf-001/published-version')
    expect(result.current.data).toEqual(version)
  })
})
