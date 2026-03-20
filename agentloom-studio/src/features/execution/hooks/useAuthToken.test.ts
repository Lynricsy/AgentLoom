import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken, useAuthToken } from './useAuthToken'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

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

describe('useAuthToken (re-export backward compat)', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('无 token 时返回 undefined', () => {
    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBeUndefined()
  })

  describe('setAuthToken', () => {
    it('设置 token 写入 localStorage', () => {
      setAuthToken('new-token')
      expect(mockStorage.getItem('auth_token')).toBe('new-token')
    })

    it('传入 null 时移除 token', () => {
      mockStorage.setItem('auth_token', 'old-token')
      setAuthToken(null)
      expect(mockStorage.getItem('auth_token')).toBeNull()
    })
  })

  it('函数签名保持 string | undefined 返回类型', () => {
    const { result } = renderHook(() => useAuthToken())
    const token: string | undefined = result.current
    expect(token).toBeUndefined()
  })
})
