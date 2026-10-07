import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteRuntimePlugin,
  fetchRuntimePlugin,
  fetchRuntimePlugins,
  updateRuntimePluginStatus,
} from '../runtimePluginApi'
import { runtimePluginKeys } from '../runtimePluginKeys'
import {
  useActiveRuntimePlugins,
  useRuntimePlugin,
  useRuntimePlugins,
} from '../runtimePluginQueries'
import type { RuntimePluginRecord } from '../../types'

const { getMock, patchMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    patch: patchMock,
    delete: deleteMock,
  },
  toSnakeBody: (value: unknown) => value,
}))

function makeRuntimePlugin(
  overrides: Partial<RuntimePluginRecord> = {},
): RuntimePluginRecord {
  return {
    id: 'rp-1',
    pluginId: 'com.example.demo-rt',
    name: 'Demo Runtime',
    version: '0.1.0',
    author: '酒狐',
    description: '示例 runtime 插件',
    license: 'MIT',
    status: 'active',
    configSchema: { type: 'object', properties: { greeting: { type: 'string' } } },
    sizeBytes: 2048,
    contentHash: 'a'.repeat(64),
    installedBy: 'user-1',
    occVersion: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('runtimePluginKeys', () => {
  it('以 runtime-plugins 为根，与节点插件缓存隔离', () => {
    expect(runtimePluginKeys.all).toEqual(['runtime-plugins'])
    expect(runtimePluginKeys.list({ status: 'active' })).toEqual([
      'runtime-plugins',
      'list',
      { status: 'active' },
    ])
    expect(runtimePluginKeys.detail('rp-1')).toEqual(['runtime-plugins', 'detail', 'rp-1'])
  })
})

describe('runtimePluginApi', () => {
  beforeEach(() => {
    getMock.mockReset()
    patchMock.mockReset()
    deleteMock.mockReset()
  })

  it('fetchRuntimePlugins 以 camelCase 查询参数调用 GET runtime-plugins', async () => {
    const response = {
      data: [makeRuntimePlugin()],
      meta: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const result = await fetchRuntimePlugins({
      page: 2,
      pageSize: 20,
      search: 'demo',
      status: 'disabled',
    })

    const [path, options] = getMock.mock.calls[0]!
    expect(path).toBe('runtime-plugins')
    const params = options.searchParams as URLSearchParams
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('20')
    expect(params.get('search')).toBe('demo')
    expect(params.get('status')).toBe('disabled')
    expect(result).toEqual(response)
  })

  it('fetchRuntimePlugin 调用 GET runtime-plugins/:id', async () => {
    const record = makeRuntimePlugin()
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: record }) })

    const result = await fetchRuntimePlugin('rp-1')

    expect(getMock).toHaveBeenCalledWith('runtime-plugins/rp-1')
    expect(result.data).toEqual(record)
  })

  it('updateRuntimePluginStatus 原样发送 camelCase 的 occVersion', async () => {
    const record = makeRuntimePlugin({ status: 'disabled', occVersion: 2 })
    patchMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: record }) })

    await updateRuntimePluginStatus('rp-1', { status: 'disabled', occVersion: 1 })

    expect(patchMock).toHaveBeenCalledWith('runtime-plugins/rp-1/status', {
      json: { status: 'disabled', occVersion: 1 },
    })
  })

  it('deleteRuntimePlugin 调用 DELETE runtime-plugins/:id', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteRuntimePlugin('rp-1')

    expect(deleteMock).toHaveBeenCalledWith('runtime-plugins/rp-1')
  })
})

describe('useRuntimePlugins', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('返回分页列表', async () => {
    const response = {
      data: [makeRuntimePlugin()],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const { result } = renderHook(() => useRuntimePlugins({ page: 1 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(response)
  })
})

describe('useActiveRuntimePlugins', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('只拉取 active 状态，pageSize 100', async () => {
    const response = {
      data: [makeRuntimePlugin()],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const { result } = renderHook(() => useActiveRuntimePlugins(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [path, options] = getMock.mock.calls[0]!
    expect(path).toBe('runtime-plugins')
    const params = options.searchParams as URLSearchParams
    expect(params.get('status')).toBe('active')
    expect(params.get('pageSize')).toBe('100')
    expect(result.current.data?.data).toHaveLength(1)
  })
})

describe('useRuntimePlugin', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('id 为空时不发请求', () => {
    const { result } = renderHook(() => useRuntimePlugin(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('按 id 拉取详情', async () => {
    const record = makeRuntimePlugin()
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: record }) })

    const { result } = renderHook(() => useRuntimePlugin('rp-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data).toEqual(record)
  })
})
