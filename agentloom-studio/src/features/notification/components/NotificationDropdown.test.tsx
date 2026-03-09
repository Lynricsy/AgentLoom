import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '../stores/notificationStore'
import type { NotificationType } from '../types'
import { NotificationDropdown } from './NotificationDropdown'

const {
  useNotificationsMock,
  useMarkAsReadMock,
  useMarkAllAsReadMock,
} = vi.hoisted(() => ({
  useNotificationsMock: vi.fn(),
  useMarkAsReadMock: vi.fn(),
  useMarkAllAsReadMock: vi.fn(),
}))

vi.mock('../api/notificationQueries', () => ({
  useNotifications: useNotificationsMock,
}))

vi.mock('../api/notificationMutations', () => ({
  useMarkAsRead: useMarkAsReadMock,
  useMarkAllAsRead: useMarkAllAsReadMock,
}))

function makeNotification(
  overrides: Partial<NotificationType> = {},
): NotificationType {
  return {
    id: 'notification-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    type: 'system',
    title: '系统通知',
    body: null,
    isRead: false,
    createdAt: '2026-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('NotificationDropdown', () => {
  beforeEach(() => {
    useNotificationStore.getState().actions.reset()

    useMarkAsReadMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ data: undefined }),
      isPending: false,
    })
    useMarkAllAsReadMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ data: undefined }),
      isPending: false,
    })
  })

  it('渲染最近通知列表', async () => {
    useNotificationsMock.mockReturnValue({
      data: {
        data: [
          makeNotification({ id: 'notification-1', title: '执行完成' }),
          makeNotification({
            id: 'notification-2',
            title: '执行失败',
            type: 'execution_failed',
            createdAt: '2026-03-10T00:01:00Z',
          }),
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      },
      isLoading: false,
      error: null,
    })

    render(<NotificationDropdown />)

    expect(await screen.findByText('执行完成')).toBeInTheDocument()
    expect(
      screen.getByTestId('notification-item-notification-2'),
    ).toHaveTextContent('执行失败')
  })

  it('点击通知会调用 markAsRead 并更新本地已读状态', async () => {
    const markAsReadMutate = vi.fn().mockResolvedValue({ data: undefined })

    useMarkAsReadMock.mockReturnValue({
      mutateAsync: markAsReadMutate,
      isPending: false,
    })
    useNotificationsMock.mockReturnValue({
      data: {
        data: [makeNotification({ id: 'notification-1', title: '需要关注' })],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      },
      isLoading: false,
      error: null,
    })

    const user = userEvent.setup()
    render(<NotificationDropdown />)

    await user.click(await screen.findByTestId('notification-item-notification-1'))

    expect(markAsReadMutate).toHaveBeenCalledWith('notification-1')
    await waitFor(() => {
      expect(
        useNotificationStore.getState().notifications.find(
          (item) => item.id === 'notification-1',
        )?.isRead,
      ).toBe(true)
    })
  })

  it('空列表时显示空状态', async () => {
    useNotificationsMock.mockReturnValue({
      data: {
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
        },
      },
      isLoading: false,
      error: null,
    })

    render(<NotificationDropdown />)

    expect(await screen.findByTestId('notification-empty')).toHaveTextContent(
      '暂无通知',
    )
  })

  it('点击全部标记已读会调用批量 mutation 并清零未读数', async () => {
    const markAllAsReadMutate = vi.fn().mockResolvedValue({ data: undefined })

    useMarkAllAsReadMock.mockReturnValue({
      mutateAsync: markAllAsReadMutate,
      isPending: false,
    })
    useNotificationsMock.mockReturnValue({
      data: {
        data: [
          makeNotification({ id: 'notification-1', title: '第一条' }),
          makeNotification({ id: 'notification-2', title: '第二条' }),
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      },
      isLoading: false,
      error: null,
    })

    useNotificationStore.getState().actions.setUnreadCount(2)

    const user = userEvent.setup()
    render(<NotificationDropdown />)

    await user.click(await screen.findByTestId('mark-all-read'))

    expect(markAllAsReadMutate).toHaveBeenCalled()
    await waitFor(() => {
      expect(useNotificationStore.getState().unreadCount).toBe(0)
      expect(
        useNotificationStore.getState().notifications.every((item) => item.isRead),
      ).toBe(true)
    })
  })
})
