import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNotify = vi.fn()
const mockUseAuth = vi.fn()
const mockUseMfa = vi.fn()

const mockApiGet = vi.fn()
const mockApiPatch = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => ({
      json: () => mockApiGet(...args),
    }),
    patch: (...args: unknown[]) => ({
      json: () => mockApiPatch(...args),
    }),
    delete: (...args: unknown[]) => ({
      json: () => mockApiDelete(...args),
    }),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../hooks/useMfa', () => ({
  useMfa: () => mockUseMfa(),
}))

vi.mock('../MfaEnrollDialog', () => ({
  MfaEnrollDialog: ({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) =>
    open ? (
      <div data-testid="mfa-enroll-dialog">
        <button type="button" data-testid="mfa-dialog-close" onClick={onClose}>关闭</button>
        <button type="button" data-testid="mfa-dialog-success" onClick={onSuccess}>完成</button>
      </div>
    ) : null,
}))

import { SecuritySettings } from '../SecuritySettings'

const defaultMfa = {
  enrollTotp: vi.fn(),
  verifyTotp: vi.fn(),
  unenrollTotp: vi.fn(),
  checkAssuranceLevel: vi.fn(),
  isLoading: false,
  error: null,
  clearError: vi.fn(),
}

const mockSessions = [
  {
    id: 'session-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userAgent: 'Mozilla/5.0 Chrome/120',
    ip: '192.168.1.1',
    isCurrent: true,
  },
  {
    id: 'session-2',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    userAgent: 'Mozilla/5.0 Firefox/121',
    ip: '10.0.0.1',
    isCurrent: false,
  },
]

describe('SecuritySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' } })
    mockUseMfa.mockReturnValue({ ...defaultMfa })
    mockApiGet.mockImplementation((url: string) => {
      if (url === 'auth/security') {
        return Promise.resolve({ mfaEnabled: false, activeMfaFactors: [] })
      }
      if (url === 'auth/sessions') {
        return Promise.resolve(mockSessions)
      }
      return Promise.resolve(null)
    })
    mockApiPatch.mockResolvedValue({})
    mockApiDelete.mockResolvedValue({})
  })

  describe('页面结构', () => {
    it('渲染页面标题和三个区块', async () => {
      render(<SecuritySettings />)

      expect(screen.getByText('安全设置')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByTestId('password-section')).toBeInTheDocument()
        expect(screen.getByTestId('mfa-section')).toBeInTheDocument()
        expect(screen.getByTestId('sessions-section')).toBeInTheDocument()
      })
    })

    it('显示当前用户邮箱', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('security-user-email')).toHaveTextContent('test@example.com')
      })
    })
  })

  describe('密码修改区块', () => {
    it('渲染三个密码输入框和提交按钮', async () => {
      render(<SecuritySettings />)

      expect(screen.getByTestId('current-password')).toBeInTheDocument()
      expect(screen.getByTestId('new-password')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-password')).toBeInTheDocument()
      expect(screen.getByTestId('change-password-btn')).toBeInTheDocument()
    })

    it('空表单提交时显示验证错误', async () => {
      render(<SecuritySettings />)

      fireEvent.click(screen.getByTestId('change-password-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('current-password-error')).toBeInTheDocument()
      })
    })

    it('新密码不符合策略时显示错误', async () => {
      render(<SecuritySettings />)

      fireEvent.change(screen.getByTestId('current-password'), { target: { value: 'OldPass1' } })
      fireEvent.change(screen.getByTestId('new-password'), { target: { value: 'short' } })
      fireEvent.change(screen.getByTestId('confirm-password'), { target: { value: 'short' } })
      fireEvent.click(screen.getByTestId('change-password-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('new-password-error')).toBeInTheDocument()
      })
    })

    it('两次密码不一致时显示错误', async () => {
      render(<SecuritySettings />)

      fireEvent.change(screen.getByTestId('current-password'), { target: { value: 'OldPass1' } })
      fireEvent.change(screen.getByTestId('new-password'), { target: { value: 'NewPass123' } })
      fireEvent.change(screen.getByTestId('confirm-password'), { target: { value: 'Different1' } })
      fireEvent.click(screen.getByTestId('change-password-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('confirm-password-error')).toHaveTextContent('两次输入的密码不一致')
      })
    })

    it('提交有效表单时调用 API 并显示成功提示', async () => {
      render(<SecuritySettings />)

      fireEvent.change(screen.getByTestId('current-password'), { target: { value: 'OldPass1' } })
      fireEvent.change(screen.getByTestId('new-password'), { target: { value: 'NewPass123' } })
      fireEvent.change(screen.getByTestId('confirm-password'), { target: { value: 'NewPass123' } })
      fireEvent.click(screen.getByTestId('change-password-btn'))

      await waitFor(() => {
        expect(mockApiPatch).toHaveBeenCalledWith('auth/password', {
          json: { currentPassword: 'OldPass1', newPassword: 'NewPass123' },
        })
        expect(mockNotify).toHaveBeenCalledWith({
          description: '密码修改成功',
          variant: 'success',
        })
      })
    })

    it('API 失败时显示错误提示', async () => {
      mockApiPatch.mockRejectedValueOnce(new Error('wrong password'))

      render(<SecuritySettings />)

      fireEvent.change(screen.getByTestId('current-password'), { target: { value: 'OldPass1' } })
      fireEvent.change(screen.getByTestId('new-password'), { target: { value: 'NewPass123' } })
      fireEvent.change(screen.getByTestId('confirm-password'), { target: { value: 'NewPass123' } })
      fireEvent.click(screen.getByTestId('change-password-btn'))

      await waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith({
          description: '密码修改失败，请检查当前密码是否正确',
          variant: 'error',
        })
      })
    })
  })

  describe('MFA 区块', () => {
    it('MFA 未启用时显示启用按钮', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('mfa-disabled')).toBeInTheDocument()
        expect(screen.getByTestId('enable-mfa-btn')).toBeInTheDocument()
      })
    })

    it('MFA 已启用时显示禁用按钮', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url === 'auth/security') {
          return Promise.resolve({
            mfaEnabled: true,
            activeMfaFactors: [{ id: 'factor-1', type: 'totp', createdAt: new Date().toISOString() }],
          })
        }
        if (url === 'auth/sessions') return Promise.resolve(mockSessions)
        return Promise.resolve(null)
      })

      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('mfa-enabled')).toBeInTheDocument()
        expect(screen.getByTestId('disable-mfa-btn')).toBeInTheDocument()
      })
    })

    it('点击启用 MFA 按钮打开注册对话框', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('enable-mfa-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('enable-mfa-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('mfa-enroll-dialog')).toBeInTheDocument()
      })
    })

    it('MFA 注册成功后关闭对话框并刷新状态', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('enable-mfa-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('enable-mfa-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('mfa-dialog-success')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('mfa-dialog-success'))

      await waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith({
          description: 'MFA 已启用',
          variant: 'success',
        })
      })
    })

    it('禁用 MFA 调用 unenrollTotp 并显示成功提示', async () => {
      const mockUnenroll = vi.fn().mockResolvedValue(undefined)
      mockUseMfa.mockReturnValue({ ...defaultMfa, unenrollTotp: mockUnenroll })

      mockApiGet.mockImplementation((url: string) => {
        if (url === 'auth/security') {
          return Promise.resolve({
            mfaEnabled: true,
            activeMfaFactors: [{ id: 'factor-1', type: 'totp', createdAt: new Date().toISOString() }],
          })
        }
        if (url === 'auth/sessions') return Promise.resolve(mockSessions)
        return Promise.resolve(null)
      })

      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('disable-mfa-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('disable-mfa-btn'))

      await waitFor(() => {
        expect(mockUnenroll).toHaveBeenCalledWith('factor-1')
        expect(mockNotify).toHaveBeenCalledWith({
          description: 'MFA 已禁用',
          variant: 'success',
        })
      })
    })
  })

  describe('会话管理区块', () => {
    it('加载完成后渲染会话列表', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('sessions-list')).toBeInTheDocument()
        expect(screen.getByTestId('session-session-1')).toBeInTheDocument()
        expect(screen.getByTestId('session-session-2')).toBeInTheDocument()
      })
    })

    it('当前会话显示标记徽章', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('current-session-badge')).toHaveTextContent('当前会话')
      })
    })

    it('当前会话不显示撤销按钮', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('session-session-1')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('revoke-session-session-1')).not.toBeInTheDocument()
    })

    it('非当前会话显示撤销按钮', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('revoke-session-session-2')).toBeInTheDocument()
      })
    })

    it('撤销会话调用 API 并从列表移除', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('revoke-session-session-2')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('revoke-session-session-2'))

      await waitFor(() => {
        expect(mockApiDelete).toHaveBeenCalledWith('auth/sessions/session-2')
        expect(mockNotify).toHaveBeenCalledWith({
          description: '会话已撤销',
          variant: 'success',
        })
        expect(screen.queryByTestId('session-session-2')).not.toBeInTheDocument()
      })
    })

    it('会话列表为空时显示空态文案', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url === 'auth/security') {
          return Promise.resolve({ mfaEnabled: false, activeMfaFactors: [] })
        }
        if (url === 'auth/sessions') return Promise.resolve([])
        return Promise.resolve(null)
      })

      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByTestId('sessions-empty')).toHaveTextContent('暂无活跃会话')
      })
    })

    it('正确解析 User-Agent 显示浏览器名称', async () => {
      render(<SecuritySettings />)

      await waitFor(() => {
        expect(screen.getByText('Chrome 浏览器')).toBeInTheDocument()
        expect(screen.getByText('Firefox 浏览器')).toBeInTheDocument()
      })
    })

    it('加载会话失败时显示错误提示', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url === 'auth/security') {
          return Promise.resolve({ mfaEnabled: false, activeMfaFactors: [] })
        }
        if (url === 'auth/sessions') return Promise.reject(new Error('network error'))
        return Promise.resolve(null)
      })

      render(<SecuritySettings />)

      await waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith({
          description: '获取会话列表失败',
          variant: 'error',
        })
      })
    })
  })
})
