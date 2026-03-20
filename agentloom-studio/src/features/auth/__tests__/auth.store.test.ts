import { act, renderHook } from '@testing-library/react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useAuthStore,
  useAccessToken,
  useIsAuthenticated,
  useAuthLoading,
} from '../stores/auth.store'
import { useAuthToken, setAuthToken } from '../hooks/useAuthToken'
import { useAuth } from '../hooks/useAuth'
import * as barrelExports from '../index'

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void

const mockUnsubscribe = vi.fn()
let capturedAuthCallback: AuthCallback | null = null

const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
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

function makeFakeSession(overrides?: Partial<Session>): Session {
  return {
    access_token: 'fake-access-token-123',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'user-abc',
      email: 'fox@ling.plus',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    } as User,
    ...overrides,
  }
}

function setupSupabaseMocks(session: Session | null = null) {
  capturedAuthCallback = null

  mockGetSession.mockResolvedValue({ data: { session }, error: null })

  mockOnAuthStateChange.mockImplementation((callback: AuthCallback) => {
    capturedAuthCallback = callback
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
  })

  mockSignOut.mockResolvedValue({ error: null })
}

function resetStore() {
  useAuthStore.setState({
    session: null,
    user: null,
    accessToken: undefined,
    isLoading: true,
    isAuthenticated: false,
  })
}

describe('AuthStore', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.clearAllMocks()
    setupSupabaseMocks()
  })

  afterEach(() => {
    resetStore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('初始状态', () => {
    it('初始状态 isLoading=true, isAuthenticated=false', () => {
      const state = useAuthStore.getState()
      expect(state.isLoading).toBe(true)
      expect(state.isAuthenticated).toBe(false)
      expect(state.session).toBeNull()
      expect(state.user).toBeNull()
      expect(state.accessToken).toBeUndefined()
    })
  })

  describe('initialize()', () => {
    it('无现有 session 时: isLoading=false, isAuthenticated=false', async () => {
      setupSupabaseMocks(null)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      const state = useAuthStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.isAuthenticated).toBe(false)
      expect(state.session).toBeNull()
      expect(state.accessToken).toBeUndefined()
      expect(mockGetSession).toHaveBeenCalledOnce()
      expect(mockOnAuthStateChange).toHaveBeenCalledOnce()
    })

    it('存在 session 时: 水合 session/user/accessToken', async () => {
      const session = makeFakeSession()
      setupSupabaseMocks(session)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      const state = useAuthStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.isAuthenticated).toBe(true)
      expect(state.accessToken).toBe('fake-access-token-123')
      expect(state.user?.email).toBe('fox@ling.plus')
    })

    it('初始化时同步 token 到 localStorage', async () => {
      const session = makeFakeSession()
      setupSupabaseMocks(session)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      expect(mockStorage.getItem('auth_token')).toBe('fake-access-token-123')
    })

    it('无 session 时清除 localStorage token', async () => {
      mockStorage.setItem('auth_token', 'stale-token')
      setupSupabaseMocks(null)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      expect(mockStorage.getItem('auth_token')).toBeNull()
    })

    it('getSession 异常时: isLoading=false 不崩溃', async () => {
      mockGetSession.mockRejectedValue(new Error('network error'))

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      expect(useAuthStore.getState().isLoading).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('onAuthStateChange 事件', () => {
    it('SIGNED_IN: 更新 session 和 accessToken', async () => {
      setupSupabaseMocks(null)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      expect(useAuthStore.getState().isAuthenticated).toBe(false)

      const newSession = makeFakeSession({
        access_token: 'signed-in-token',
      })

      act(() => {
        capturedAuthCallback!('SIGNED_IN', newSession)
      })

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.accessToken).toBe('signed-in-token')
      expect(state.user?.email).toBe('fox@ling.plus')
      expect(mockStorage.getItem('auth_token')).toBe('signed-in-token')
    })

    it('TOKEN_REFRESHED: 更新 accessToken', async () => {
      const initialSession = makeFakeSession()
      setupSupabaseMocks(initialSession)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      const refreshedSession = makeFakeSession({
        access_token: 'refreshed-token-456',
      })

      act(() => {
        capturedAuthCallback!('TOKEN_REFRESHED', refreshedSession)
      })

      expect(useAuthStore.getState().accessToken).toBe('refreshed-token-456')
      expect(mockStorage.getItem('auth_token')).toBe('refreshed-token-456')
    })

    it('SIGNED_OUT: 清空所有认证状态', async () => {
      const session = makeFakeSession()
      setupSupabaseMocks(session)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      act(() => {
        capturedAuthCallback!('SIGNED_OUT', null)
      })

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.session).toBeNull()
      expect(state.user).toBeNull()
      expect(state.accessToken).toBeUndefined()
      expect(mockStorage.getItem('auth_token')).toBeNull()
    })

    it('未知事件: 不更新状态', async () => {
      const session = makeFakeSession()
      setupSupabaseMocks(session)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      const stateBefore = useAuthStore.getState()

      act(() => {
        capturedAuthCallback!('PASSWORD_RECOVERY' as AuthChangeEvent, null)
      })

      expect(useAuthStore.getState().accessToken).toBe(stateBefore.accessToken)
    })
  })

  describe('signOut()', () => {
    it('调用 supabase.auth.signOut()', async () => {
      await act(async () => {
        await useAuthStore.getState().signOut()
      })

      expect(mockSignOut).toHaveBeenCalledOnce()
    })
  })

  describe('便捷 selector hooks', () => {
    it('useAccessToken 返回 accessToken', async () => {
      const session = makeFakeSession()
      setupSupabaseMocks(session)

      await act(async () => {
        await useAuthStore.getState().initialize()
      })

      const { result } = renderHook(() => useAccessToken())
      expect(result.current).toBe('fake-access-token-123')
    })

    it('useIsAuthenticated 返回布尔值', () => {
      const { result } = renderHook(() => useIsAuthenticated())
      expect(result.current).toBe(false)
    })

    it('useAuthLoading 返回 isLoading', () => {
      const { result } = renderHook(() => useAuthLoading())
      expect(result.current).toBe(true)
    })
  })
})

describe('useAuthToken 后向兼容', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.clearAllMocks()
    setupSupabaseMocks()
  })

  afterEach(() => {
    resetStore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('useAuthToken 返回 Zustand store 中的 accessToken', async () => {
    const session = makeFakeSession({ access_token: 'compat-token' })
    setupSupabaseMocks(session)

    await act(async () => {
      await useAuthStore.getState().initialize()
    })

    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBe('compat-token')
  })

  it('useAuthToken 无 session 时返回 undefined', () => {
    const { result } = renderHook(() => useAuthToken())
    expect(result.current).toBeUndefined()
  })

  it('setAuthToken 写入 localStorage', () => {
    setAuthToken('manual-token')
    expect(mockStorage.getItem('auth_token')).toBe('manual-token')

    setAuthToken(null)
    expect(mockStorage.getItem('auth_token')).toBeNull()
  })

  it('返回类型为 string | undefined (类型兼容)', () => {
    const { result } = renderHook(() => useAuthToken())
    const token: string | undefined = result.current
    expect(token).toBeUndefined()
  })
})

describe('useAuth hook', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockStorage())
    vi.clearAllMocks()
    setupSupabaseMocks()
  })

  afterEach(() => {
    resetStore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('返回完整认证状态对象', async () => {
    const session = makeFakeSession()
    setupSupabaseMocks(session)

    await act(async () => {
      await useAuthStore.getState().initialize()
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.accessToken).toBe('fake-access-token-123')
    expect(result.current.user?.email).toBe('fox@ling.plus')
    expect(result.current.isLoading).toBe(false)
    expect(typeof result.current.signOut).toBe('function')
  })
})

describe('barrel export 后向兼容', () => {
  it('从 @/features/auth barrel 导入的 useAuthToken 与直接导入相同', () => {
    expect(barrelExports.useAuthToken).toBe(useAuthToken)
    expect(barrelExports.setAuthToken).toBe(setAuthToken)
  })

  it('barrel export 包含所有预期的导出', () => {
    expect(barrelExports.useAuth).toBeDefined()
    expect(barrelExports.useAuthToken).toBeDefined()
    expect(barrelExports.setAuthToken).toBeDefined()
    expect(barrelExports.useAuthStore).toBeDefined()
    expect(barrelExports.useAccessToken).toBeDefined()
    expect(barrelExports.useIsAuthenticated).toBeDefined()
    expect(barrelExports.useAuthLoading).toBeDefined()
  })
})
