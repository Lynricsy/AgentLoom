import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchPlugins, fetchPluginById } from '../pluginApi'
import { pluginKeys } from '../pluginKeys'
import { usePlugins, useActivePlugins, usePluginById } from '../pluginQueries'
import type { PluginListItem, PluginRecord } from '../../types'

const { getMock, patchMock, deleteMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
  toSnakeBodyMock: vi.fn((value: unknown) => value),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    patch: patchMock,
    delete: deleteMock,
  },
  toSnakeBody: (value: unknown) => toSnakeBodyMock(value),
}))

function makePlugin(overrides: Partial<PluginListItem> = {}): PluginListItem {
  return {
    id: 'plugin-1',
    pluginId: 'com.example.test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: '酒狐',
    description: '一个测试插件',
    status: 'active',
    nodeDefinitions: [
      {
        type: 'test-processor',
        label: '测试处理器',
        category: 'tool',
        description: '用于测试的处理器节点',
        inputPorts: [
          { id: 'input-0', label: '输入', dataType: 'text', required: true },
        ],
        outputPorts: [
          { id: 'output-0', label: '输出', dataType: 'text' },
        ],
      },
    ],
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

function makePluginRecord(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    ...makePlugin(),
    license: 'MIT',
    manifest: {},
    permissions: [],
    metadata: null,
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

describe('pluginKeys', () => {
  it('generates base key', () => {
    expect(pluginKeys.all).toEqual(['plugins'])
  })

  it('generates list key without filters', () => {
    expect(pluginKeys.lists()).toEqual(['plugins', 'list'])
  })

  it('generates list key with filters', () => {
    const filters = { status: 'active', page: 1 }
    expect(pluginKeys.list(filters)).toEqual(['plugins', 'list', filters])
  })

  it('generates detail key', () => {
    expect(pluginKeys.detail('plugin-1')).toEqual(['plugins', 'detail', 'plugin-1'])
  })
})

describe('fetchPlugins', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('calls GET plugins with search params', async () => {
    const response = { data: [makePlugin()], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const result = await fetchPlugins({ page: 1, pageSize: 20, status: 'active', search: 'test' })

    expect(getMock).toHaveBeenCalledWith('plugins', expect.objectContaining({
      searchParams: expect.any(URLSearchParams),
    }))
    expect(result).toEqual(response)
  })

  it('calls GET plugins without params', async () => {
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    await fetchPlugins()

    expect(getMock).toHaveBeenCalledWith('plugins', expect.objectContaining({
      searchParams: expect.any(URLSearchParams),
    }))
  })
})

describe('fetchPluginById', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('calls GET plugins/:id', async () => {
    const record = makePluginRecord()
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: record }) })

    const result = await fetchPluginById('plugin-1')

    expect(getMock).toHaveBeenCalledWith('plugins/plugin-1')
    expect(result.data).toEqual(record)
  })
})

describe('usePlugins', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('fetches plugins with provided params', async () => {
    const response = { data: [makePlugin()], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const { result } = renderHook(() => usePlugins({ status: 'active' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(response)
  })
})

describe('useActivePlugins', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('fetches only active plugins with pageSize 100', async () => {
    const response = { data: [makePlugin()], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue(response) })

    const { result } = renderHook(() => useActivePlugins(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const callArgs = getMock.mock.calls[0]!
    expect(callArgs[0]).toBe('plugins')
    const params = callArgs[1].searchParams as URLSearchParams
    expect(params.get('status')).toBe('active')
    expect(params.get('pageSize')).toBe('100')
  })
})

describe('usePluginById', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('fetches plugin by id when id is provided', async () => {
    const record = makePluginRecord()
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: record }) })

    const { result } = renderHook(() => usePluginById('plugin-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data).toEqual(record)
  })

  it('does not fetch when id is empty', () => {
    const { result } = renderHook(() => usePluginById(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(getMock).not.toHaveBeenCalled()
  })
})
