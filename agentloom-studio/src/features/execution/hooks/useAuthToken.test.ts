import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken, useAuthToken } from './useAuthToken'

function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, val)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

describe('useAuthToken', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('localStorage 中无 token 时返回 undefined', () => {
    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBeUndefined()
  })

  it('localStorage 中有 token 时返回该值', () => {
    mockStorage.setItem('auth_token', 'jwt-abc-123')
    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBe('jwt-abc-123')
  })

  describe('setAuthToken', () => {
    it('设置 token 后 hook 返回新值', () => {
      const { result } = renderHook(() => useAuthToken())
      expect(result.current).toBeUndefined()

      act(() => {
        setAuthToken('new-token')
      })

      expect(mockStorage.getItem('auth_token')).toBe('new-token')
    })

    it('传入 null 时移除 token', () => {
      mockStorage.setItem('auth_token', 'old-token')
      const { result } = renderHook(() => useAuthToken())
      expect(result.current).toBe('old-token')

      act(() => {
        setAuthToken(null)
      })

      expect(mockStorage.getItem('auth_token')).toBeNull()
    })
  })

  it('响应来自其他标签页的 storage 事件', () => {
    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBeUndefined()

    act(() => {
      mockStorage.setItem('auth_token', 'cross-tab-token')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'auth_token',
          newValue: 'cross-tab-token',
        }),
      )
    })

    expect(result.current).toBe('cross-tab-token')
  })

  it('忽略无关 key 的 storage 事件', () => {
    const { result } = renderHook(() => useAuthToken())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other_key',
          newValue: 'irrelevant',
        }),
      )
    })

    expect(result.current).toBeUndefined()
  })
})
