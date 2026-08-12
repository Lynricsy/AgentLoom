import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const setTheme = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/shared/hooks/use-theme', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme }),
}))

import { CommandPalette } from './CommandPalette'

describe('CommandPalette', () => {
  beforeEach(() => {
    navigate.mockClear()
    setTheme.mockClear()
  })

  it('默认关闭，Cmd+K 唤起后再次按下关闭', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    expect(screen.queryByPlaceholderText(/跳转到页面/)).not.toBeInTheDocument()

    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByPlaceholderText(/跳转到页面/)).toBeInTheDocument()

    await user.keyboard('{Meta>}k{/Meta}')
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/跳转到页面/)).not.toBeInTheDocument(),
    )
  })

  it('选择导航项后跳转并关闭面板', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    await user.keyboard('{Control>}k{/Control}')
    await user.click(await screen.findByText('沙箱'))

    expect(navigate).toHaveBeenCalledWith({ to: '/resources/sandboxes' })
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/跳转到页面/)).not.toBeInTheDocument(),
    )
  })

  it('选择主题项调用 setTheme', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    await user.keyboard('{Control>}k{/Control}')
    await user.click(await screen.findByText('跟随系统'))

    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('输入关键字过滤条目', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByPlaceholderText(/跳转到页面/), '沙箱')

    await waitFor(() =>
      expect(screen.queryByText('工作流')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('沙箱')).toBeInTheDocument()
  })

  it('能检索并跳转到通知中心', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByPlaceholderText(/跳转到页面/), '通知')

    const item = await screen.findByText('通知')
    await user.click(item)

    expect(navigate).toHaveBeenCalledWith({ to: '/notifications' })
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/跳转到页面/)).not.toBeInTheDocument(),
    )
  })
})
