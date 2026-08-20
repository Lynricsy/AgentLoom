import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '../stores/notificationStore'
import { NotificationBell } from './NotificationBell'

const { useUnreadCountMock } = vi.hoisted(() => ({
  useUnreadCountMock: vi.fn(),
}))

vi.mock('../api/notificationQueries', () => ({
  useUnreadCount: useUnreadCountMock,
}))

vi.mock('./NotificationDropdown', () => ({
  NotificationDropdown: () => (
    <div data-testid="notification-dropdown">dropdown</div>
  ),
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    useNotificationStore.getState().actions.reset()
    useUnreadCountMock.mockReturnValue({
      data: {
        data: {
          count: 3,
        },
      },
    })
  })

  it('directly renders the unread count from Query data', async () => {
    render(<NotificationBell />)

    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('3')
    expect('unreadCount' in useNotificationStore.getState()).toBe(false)
  })

  it('点击铃铛会切换下拉面板', async () => {
    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(screen.getByTestId('notification-bell'))
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument()
    expect(useNotificationStore.getState().isDropdownOpen).toBe(true)

    await user.click(screen.getByTestId('notification-bell'))
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument()
    expect(useNotificationStore.getState().isDropdownOpen).toBe(false)
  })

  it('未读数为 0 时不显示徽标', () => {
    useUnreadCountMock.mockReturnValue({
      data: {
        data: {
          count: 0,
        },
      },
    })

    render(<NotificationBell />)

    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })
})
