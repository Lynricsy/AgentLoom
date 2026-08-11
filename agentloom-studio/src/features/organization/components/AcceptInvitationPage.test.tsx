import { render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  navigate: vi.fn(),
  notify: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  isAuthLoading: vi.fn(() => false),
  /** mutateAsync 被 mock 后不再驱动 react-query 状态，isSuccess 由用例显式控制 */
  acceptState: { isSuccess: false },
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ token: 'inv-token' }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/features/auth', () => ({
  useIsAuthenticated: () => mocks.isAuthenticated(),
  useAuthLoading: () => mocks.isAuthLoading(),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('../api/organizationQueries', () => ({
  useAcceptOrganizationInvitation: () => ({
    mutateAsync: mocks.accept,
    isSuccess: mocks.acceptState.isSuccess,
  }),
}))

import { makeHttpError } from '../testing/makeHttpError'
import { AcceptInvitationPage } from './AcceptInvitationPage'

describe('AcceptInvitationPage', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.acceptState.isSuccess = false
    mocks.isAuthenticated.mockReturnValue(true)
    mocks.isAuthLoading.mockReturnValue(false)
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/invitations/inv-token', search: '', href: '' },
    })
  })

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('未登录时跳登录页并带 returnUrl，不消费邀请', () => {
    mocks.isAuthenticated.mockReturnValue(false)

    render(<AcceptInvitationPage />)

    expect(window.location.href).toBe(
      '/login?returnUrl=%2Finvitations%2Finv-token',
    )
    expect(mocks.accept).not.toHaveBeenCalled()
  })

  it('接受成功后提示并跳转工作台', async () => {
    mocks.accept.mockResolvedValue({
      organization: { id: 'org-1', name: 'Acme 智能体' },
      member: { role: 'creator' },
    })

    render(<AcceptInvitationPage />)

    expect(screen.getByText('正在接受邀请')).toBeInTheDocument()

    await waitFor(() =>
      expect(mocks.accept).toHaveBeenCalledWith('inv-token'),
    )
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/workflows' }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '已加入组织', variant: 'success' }),
    )
  })

  it('邀请失效时展示错误卡而不跳转', async () => {
    mocks.accept.mockRejectedValue(
      makeHttpError(410, { detail: '邀请已过期或已被使用' }),
    )

    render(<AcceptInvitationPage />)

    expect(await screen.findByText('邀请无法接受')).toBeInTheDocument()
    expect(screen.getByText('邀请已过期或已被使用')).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('邀请只消费一次', async () => {
    mocks.accept.mockResolvedValue({
      organization: { id: 'org-1', name: 'Acme 智能体' },
      member: { role: 'creator' },
    })

    const { rerender } = render(<AcceptInvitationPage />)
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1))

    rerender(<AcceptInvitationPage />)
    expect(mocks.accept).toHaveBeenCalledTimes(1)
  })

  it('接受成功后渲染成功卡片', async () => {
    mocks.acceptState.isSuccess = true
    mocks.accept.mockResolvedValue({
      organization: { id: 'org-1', name: 'Acme 智能体' },
      member: { role: 'creator' },
    })

    render(<AcceptInvitationPage />)

    expect(await screen.findByText('已加入组织')).toBeInTheDocument()
  })

  it('登录态未就绪时不提前跳登录也不消费邀请', () => {
    mocks.isAuthLoading.mockReturnValue(true)
    mocks.isAuthenticated.mockReturnValue(false)

    render(<AcceptInvitationPage />)

    expect(window.location.href).toBe('')
    expect(mocks.accept).not.toHaveBeenCalled()
  })
})
