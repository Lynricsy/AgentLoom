import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAllWorkspaces, fetchWorkspaces } from './workspaceApi'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn(() => ({ json: jsonMock }))

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

describe('workspaceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchWorkspaces 应透传 includeAutoArchived 参数', async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })

    await fetchWorkspaces({
      page: 2,
      pageSize: 50,
      search: 'archive',
      includeAutoArchived: true,
    })

    expect(mocks.getMock).toHaveBeenCalledWith('workspaces', {
      searchParams: {
        page: 2,
        pageSize: 50,
        search: 'archive',
        includeAutoArchived: 'true',
      },
    })
  })

  it('fetchAllWorkspaces 默认应隐藏执行归档快照', async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    })

    await expect(fetchAllWorkspaces()).resolves.toEqual([])

    expect(mocks.getMock).toHaveBeenCalledWith('workspaces', {
      searchParams: {
        page: 1,
        pageSize: 100,
        includeAutoArchived: 'false',
      },
    })
  })
})
