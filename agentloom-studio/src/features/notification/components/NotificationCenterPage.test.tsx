import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import type { NotificationType } from '../types'
import { NotificationCenterPage } from './NotificationCenterPage'

const {
  listNotificationsMock,
  getUnreadCountMock,
  markAsReadMock,
  markAllAsReadMock,
  getPreferencesMock,
  upsertPreferenceMock,
} = vi.hoisted(() => ({
  listNotificationsMock: vi.fn(),
  getUnreadCountMock: vi.fn(),
  markAsReadMock: vi.fn(),
  markAllAsReadMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  upsertPreferenceMock: vi.fn(),
}))

vi.mock('../api/notificationApi', () => ({
  listNotifications: listNotificationsMock,
  getUnreadCount: getUnreadCountMock,
  markAsRead: markAsReadMock,
  markAllAsRead: markAllAsReadMock,
  getPreferences: getPreferencesMock,
  upsertPreference: upsertPreferenceMock,
}))

/** 永不落定的请求，用于断言加载中与乐观中间态（lib 为 ES2022，无 Promise.withResolvers） */
const PENDING_FOREVER: Promise<never> = new Promise(() => {})

function makeNotification(
  overrides: Partial<NotificationType> = {},
): NotificationType {
  return {
    id: 'notification-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    type: 'execution_completed',
    title: '工作流执行完成',
    body: null,
    isRead: false,
    createdAt: '2026-08-10T00:00:00Z',
    ...overrides,
  }
}

function makePage(data: NotificationType[], total = data.length) {
  return {
    data,
    meta: { page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) },
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NotificationCenterPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('NotificationCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUnreadCountMock.mockResolvedValue({ data: { count: 2 } })
    markAsReadMock.mockResolvedValue({
      data: makeNotification({ isRead: true }),
    })
    markAllAsReadMock.mockResolvedValue({ data: undefined })
  })

  it('加载中渲染骨架行', () => {
    listNotificationsMock.mockReturnValue(PENDING_FOREVER)

    const { container } = renderPage()

    expect(screen.getByTestId('notification-center-page')).toBeInTheDocument()
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThan(0)
  })

  it('加载失败渲染错误态与重试入口', async () => {
    listNotificationsMock.mockRejectedValue(new Error('通知服务不可用'))

    renderPage()

    expect(await screen.findByText('加载通知失败')).toBeInTheDocument()
    expect(screen.getByText('通知服务不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('无数据时渲染空状态', async () => {
    listNotificationsMock.mockResolvedValue(makePage([]))

    renderPage()

    expect(await screen.findByText('暂无通知')).toBeInTheDocument()
  })

  it('渲染通知列表并区分未读', async () => {
    listNotificationsMock.mockResolvedValue(
      makePage([
        makeNotification({ id: 'notification-1', title: '工作流执行完成' }),
        makeNotification({
          id: 'notification-2',
          title: '执行失败了',
          type: 'execution_failed',
          isRead: true,
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('工作流执行完成')).toBeInTheDocument()
    expect(screen.getByText('执行失败了')).toBeInTheDocument()
    // 未读行有「未读」徽标与标记按钮，已读行只显示「已读」
    expect(screen.getByTestId('mark-read-notification-1')).toBeInTheDocument()
    expect(
      screen.queryByTestId('mark-read-notification-2'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('已读')).toBeInTheDocument()
  })

  it('单条标记已读会调用接口', async () => {
    listNotificationsMock.mockResolvedValue(
      makePage([makeNotification({ id: 'notification-1' })]),
    )

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('mark-read-notification-1'))

    expect(markAsReadMock).toHaveBeenCalledWith('notification-1')
  })

  it('全部标记已读会调用接口并提示成功', async () => {
    listNotificationsMock.mockResolvedValue(
      makePage([makeNotification({ id: 'notification-1' })]),
    )

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('mark-all-read'))

    expect(markAllAsReadMock).toHaveBeenCalled()
    expect(
      await screen.findByText('已将全部通知标记为已读'),
    ).toBeInTheDocument()
  })

  it('无未读时禁用「全部标记已读」', async () => {
    getUnreadCountMock.mockResolvedValue({ data: { count: 0 } })
    listNotificationsMock.mockResolvedValue(
      makePage([makeNotification({ id: 'notification-1', isRead: true })]),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read')).toBeDisabled()
    })
  })

  it('切换到未读筛选时只请求未读并重置页码', async () => {
    listNotificationsMock.mockResolvedValue(
      makePage([makeNotification({ id: 'notification-1' })]),
    )

    const user = userEvent.setup()
    renderPage()

    await screen.findByText('工作流执行完成')
    await user.click(screen.getByRole('button', { name: /未读/ }))

    await waitFor(() => {
      expect(listNotificationsMock).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        isRead: false,
      })
    })
  })
})
