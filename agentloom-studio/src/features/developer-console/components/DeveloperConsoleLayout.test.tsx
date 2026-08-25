import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { DeveloperConsoleLayout } from './DeveloperConsoleLayout'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  role: 'owner' as string | null,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/features/auth', () => ({
  useAuthToken: () => 'token',
}))

vi.mock('@/features/intervention-policy', () => ({
  getInterventionPolicyRoleFromToken: () => mocks.role,
}))

describe('DeveloperConsoleLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'owner'
  })

  it('只渲染当前 tab 的内容', () => {
    render(
      <DeveloperConsoleLayout activeTab="keys">
        <p>密钥内容</p>
      </DeveloperConsoleLayout>,
    )

    expect(screen.getByText('开发者控制台')).toBeInTheDocument()
    expect(screen.getByText('密钥内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收益' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '开发者密钥' }),
    ).toBeInTheDocument()
  })

  it('切换到另一个 tab 时导航到对应路由', async () => {
    const user = userEvent.setup()
    render(
      <DeveloperConsoleLayout activeTab="earnings">
        <p>收益内容</p>
      </DeveloperConsoleLayout>,
    )

    await user.click(screen.getByRole('button', { name: '开发者密钥' }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/developer-console/keys',
    })
  })

  it('点击当前 tab 不重复导航', async () => {
    const user = userEvent.setup()
    render(
      <DeveloperConsoleLayout activeTab="earnings">
        <p>收益内容</p>
      </DeveloperConsoleLayout>,
    )

    await user.click(screen.getByRole('button', { name: '收益' }))

    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('页头操作区由调用方注入', () => {
    render(
      <DeveloperConsoleLayout
        activeTab="keys"
        actions={<button type="button">注册公钥</button>}
      >
        <p>密钥内容</p>
      </DeveloperConsoleLayout>,
    )

    expect(screen.getByRole('button', { name: '注册公钥' })).toBeInTheDocument()
  })

  it('creator 看不到收益 tab，但仍可管理开发者密钥', () => {
    mocks.role = 'creator'
    render(
      <DeveloperConsoleLayout activeTab="keys">
        <p>密钥内容</p>
      </DeveloperConsoleLayout>,
    )

    expect(screen.queryByRole('button', { name: '收益' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '开发者密钥' }),
    ).toBeInTheDocument()
    expect(screen.getByText('密钥内容')).toBeInTheDocument()
  })

  it('creator 直达收益页时渲染无权限提示而不是内容', () => {
    mocks.role = 'creator'
    render(
      <DeveloperConsoleLayout
        activeTab="earnings"
        actions={<button type="button">导出报表</button>}
      >
        <p>收益内容</p>
      </DeveloperConsoleLayout>,
    )

    expect(screen.getByTestId('developer-console-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问「收益」')).toBeInTheDocument()
    expect(screen.queryByText('收益内容')).not.toBeInTheDocument()
    // 无权时不渲染该 tab 的页头操作
    expect(
      screen.queryByRole('button', { name: '导出报表' }),
    ).not.toBeInTheDocument()
  })

  it('viewer 直达任一 tab 都没有可见 tab，只剩无权限提示', () => {
    mocks.role = 'viewer'
    render(
      <DeveloperConsoleLayout activeTab="keys">
        <p>密钥内容</p>
      </DeveloperConsoleLayout>,
    )

    expect(screen.queryByRole('button', { name: '收益' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '开发者密钥' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('developer-console-forbidden')).toBeInTheDocument()
    expect(screen.queryByText('密钥内容')).not.toBeInTheDocument()
  })
})
