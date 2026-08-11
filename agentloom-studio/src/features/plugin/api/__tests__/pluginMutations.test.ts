import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pluginKeys } from '../pluginKeys'
import {
  useDeletePlugin,
  useRegisterPlugin,
  useUpdatePluginStatus,
} from '../pluginMutations'

const { registerMock, updateStatusMock, deleteMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  updateStatusMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('../pluginApi', () => ({
  registerPlugin: registerMock,
  updatePluginStatus: updateStatusMock,
  deletePlugin: deleteMock,
}))

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  return {
    invalidateSpy,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRegisterPlugin', () => {
  it('注册成功后让整棵插件缓存失效', async () => {
    registerMock.mockResolvedValue({ id: 'plugin-1', name: '翻译插件' })
    const { wrapper, invalidateSpy } = createHarness()

    const { result } = renderHook(() => useRegisterPlugin(), { wrapper })
    const file = new File(['bytes'], 'demo.alp')
    result.current.mutate({ file, status: 'active' })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(registerMock).toHaveBeenCalledWith({ file, status: 'active' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pluginKeys.all })
  })

  it('注册失败时不失效缓存', async () => {
    registerMock.mockRejectedValue(new Error('插件签名验证失败'))
    const { wrapper, invalidateSpy } = createHarness()

    const { result } = renderHook(() => useRegisterPlugin(), { wrapper })
    result.current.mutate({ file: new File(['bytes'], 'demo.alp') })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useUpdatePluginStatus', () => {
  it('把 occVersion 透传给 PATCH 并在成功后失效缓存', async () => {
    updateStatusMock.mockResolvedValue({ data: { id: 'plugin-1' } })
    const { wrapper, invalidateSpy } = createHarness()

    const { result } = renderHook(() => useUpdatePluginStatus(), { wrapper })
    result.current.mutate({ id: 'plugin-1', status: 'disabled', occVersion: 7 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(updateStatusMock).toHaveBeenCalledWith('plugin-1', {
      status: 'disabled',
      occVersion: 7,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pluginKeys.all })
  })
})

describe('useDeletePlugin', () => {
  it('删除成功后失效缓存', async () => {
    deleteMock.mockResolvedValue(undefined)
    const { wrapper, invalidateSpy } = createHarness()

    const { result } = renderHook(() => useDeletePlugin(), { wrapper })
    result.current.mutate('plugin-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(deleteMock).toHaveBeenCalledWith('plugin-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pluginKeys.all })
  })
})
