import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { DeveloperConsoleLayout } from './DeveloperConsoleLayout'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('DeveloperConsoleLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
