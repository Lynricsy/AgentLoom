import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockExchangeCodeForSession = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  createRoute: vi.fn().mockReturnValue({
    options: { path: '/auth/callback' },
  }),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
    },
  },
}))

vi.mock('@/app/routes/__root', () => ({
  rootRoute: {},
}))

import { AuthCallbackPage } from '@/app/routes/auth/callback'

interface LocationMock {
  search: string
  href: string
}

describe('AuthCallbackPage', () => {
  let locationMock: LocationMock

  beforeEach(() => {
    vi.clearAllMocks()
    locationMock = { search: '', href: '' }
    vi.stubGlobal('location', locationMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loading 状态: 渲染旋转 spinner 和文字', () => {
    locationMock.search = '?code=some-code'
    // 永不 resolve，保持 loading 状态
    mockExchangeCodeForSession.mockReturnValue(new Promise(() => {}))

    render(<AuthCallbackPage />)

    expect(screen.getByText('正在完成登录…')).toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('成功交换 code: 调用 exchangeCodeForSession(code) 并 navigate 到 /', async () => {
    locationMock.search = '?code=valid-auth-code'
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-auth-code')
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })
  })

  it('code 交换返回 error: 重定向到 /login?error=...', async () => {
    locationMock.search = '?code=bad-code'
    mockExchangeCodeForSession.mockResolvedValue({
      data: null,
      error: { message: 'Invalid authorization code' },
    })

    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(locationMock.href).toBe(
        '/login?error=Invalid%20authorization%20code',
      )
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('exchangeCodeForSession 抛出异常(catch): 重定向到 /login', async () => {
    locationMock.search = '?code=throws-code'
    mockExchangeCodeForSession.mockRejectedValue(new Error('network error'))

    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(locationMock.href).toBe('/login')
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('URL 中没有 code 参数: 立即重定向到 /login 且不调用 exchangeCodeForSession', async () => {
    locationMock.search = ''

    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(locationMock.href).toBe('/login')
    })
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('URL 中有其他参数但无 code: 立即重定向到 /login', async () => {
    locationMock.search = '?other_param=value'

    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(locationMock.href).toBe('/login')
    })
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })
})
