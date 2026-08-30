import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRefreshSession = vi.hoisted(() => vi.fn())
const mockSignOut = vi.hoisted(() => vi.fn())

type AnyFn = (...args: unknown[]) => unknown
const capturedHooks = vi.hoisted<{
  beforeRequest: AnyFn[]
  beforeRetry: AnyFn[]
  afterResponse: AnyFn[]
}>(() => ({ beforeRequest: [], beforeRetry: [], afterResponse: [] }))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
  },
}))

vi.mock('@/features/auth/stores/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ signOut: mockSignOut })),
  },
}))

vi.mock('ky', () => ({
  default: {
    create: vi.fn((options: Record<string, unknown>) => {
      const hooks = options?.hooks as Record<string, AnyFn[]> | undefined
      capturedHooks.beforeRequest = hooks?.beforeRequest ?? []
      capturedHooks.beforeRetry = hooks?.beforeRetry ?? []
      capturedHooks.afterResponse = hooks?.afterResponse ?? []
      return {} as unknown
    }),
  },
}))

import '@/shared/api/client'

function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
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

function createMockRequest() {
  const headersMap = new Map<string, string>()
  return {
    headers: {
      set: vi.fn((k: string, v: string) => headersMap.set(k.toLowerCase(), v)),
      get: vi.fn((k: string) => headersMap.get(k.toLowerCase()) ?? null),
    },
    _headersMap: headersMap,
  }
}

describe('beforeRequest hook', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds Authorization Bearer header when token exists in localStorage', () => {
    mockStorage.setItem('auth_token', 'test-access-token')
    const req = createMockRequest()

    ;(capturedHooks.beforeRequest[0] as AnyFn)({ request: req })

    expect(req.headers.set).toHaveBeenCalledWith(
      'Authorization',
      'Bearer test-access-token',
    )
  })

  it('does not set Authorization header when localStorage has no token', () => {
    const req = createMockRequest()

    ;(capturedHooks.beforeRequest[0] as AnyFn)({ request: req })

    expect(req.headers.set).not.toHaveBeenCalled()
  })

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    const req = createMockRequest()

    expect(() =>
      (capturedHooks.beforeRequest[0] as AnyFn)({ request: req }),
    ).not.toThrow()
    expect(req.headers.set).not.toHaveBeenCalled()
  })
})

describe('beforeRetry hook (401 token refresh)', () => {
  let mockStorage: Storage
  let mockLocation: { href: string }

  beforeEach(async () => {
    mockStorage = createMockStorage()
    mockLocation = { href: '' }
    vi.stubGlobal('localStorage', mockStorage)
    Object.defineProperty(globalThis.window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    })
    vi.clearAllMocks()
    const { useAuthStore } = await import('@/features/auth/stores/auth.store')
    ;(useAuthStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      signOut: mockSignOut,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes session and updates localStorage + Authorization header on success', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'new-access-token' } },
      error: null,
    })
    mockStorage.setItem('auth_token', 'old-token')
    const req = createMockRequest()

    await (capturedHooks.beforeRetry[0] as (ctx: { request: unknown }) => Promise<void>)({ request: req })

    expect(mockStorage.getItem('auth_token')).toBe('new-access-token')
    expect(req.headers.set).toHaveBeenCalledWith(
      'Authorization',
      'Bearer new-access-token',
    )
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('signs out and redirects to /login when refreshSession returns an error', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('Token expired'),
    })
    const req = createMockRequest()

    await (capturedHooks.beforeRetry[0] as (ctx: { request: unknown }) => Promise<void>)({ request: req })

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockLocation.href).toBe('/login')
    expect(req.headers.set).not.toHaveBeenCalled()
  })

  it('signs out and redirects to /login when refreshSession returns no session', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    })
    const req = createMockRequest()

    await (capturedHooks.beforeRetry[0] as (ctx: { request: unknown }) => Promise<void>)({ request: req })

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockLocation.href).toBe('/login')
    expect(req.headers.set).not.toHaveBeenCalled()
  })

  it('signs out and redirects when refreshSession returns session without access_token', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: {} },
      error: null,
    })
    const req = createMockRequest()

    await (capturedHooks.beforeRetry[0] as (ctx: { request: unknown }) => Promise<void>)({ request: req })

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockLocation.href).toBe('/login')
  })
})

describe('afterResponse hook (snake_case ↔ camelCase)', () => {
  it('converts snake_case response body to camelCase', async () => {
    const snakeBody = { user_id: 42, created_at: '2026-01-01', nested_obj: { some_key: 'val' } }
    const response = new Response(JSON.stringify(snakeBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const result = (await (capturedHooks.afterResponse[0] as AnyFn)({
      request: new Request('https://api.example.com'),
      options: {},
      response,
      retryCount: 0,
    })) as Response | undefined

    expect(result).not.toBeUndefined()
    const body = await result!.json()
    expect(body).toEqual({
      userId: 42,
      createdAt: '2026-01-01',
      nestedObj: { someKey: 'val' },
    })
  })

  it('returns undefined for non-JSON content-type (preserves original response)', async () => {
    const response = new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })

    const result = (await (capturedHooks.afterResponse[0] as AnyFn)({
      request: new Request('https://api.example.com'),
      options: {},
      response,
      retryCount: 0,
    })) as Response | undefined

    expect(result).toBeUndefined()
  })

  it('preserves status code on converted response', async () => {
    const response = new Response(JSON.stringify({ some_key: 'val' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })

    const result = (await (capturedHooks.afterResponse[0] as AnyFn)({
      request: new Request('https://api.example.com'),
      options: {},
      response,
      retryCount: 0,
    })) as Response | undefined

    expect(result?.status).toBe(201)
  })
})
