import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import type { NotificationPreference } from '../types'
import { NotificationPreferencesPage } from './NotificationPreferencesPage'

const {
  getPreferencesMock,
  upsertPreferenceMock,
  getUnreadCountMock,
  listNotificationsMock,
  markAsReadMock,
  markAllAsReadMock,
} = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  upsertPreferenceMock: vi.fn(),
  getUnreadCountMock: vi.fn(),
  listNotificationsMock: vi.fn(),
  markAsReadMock: vi.fn(),
  markAllAsReadMock: vi.fn(),
}))

vi.mock('../api/notificationApi', () => ({
  getPreferences: getPreferencesMock,
  upsertPreference: upsertPreferenceMock,
  getUnreadCount: getUnreadCountMock,
  listNotifications: listNotificationsMock,
  markAsRead: markAsReadMock,
  markAllAsRead: markAllAsReadMock,
}))

/** 永不落定的请求，用于断言加载中与乐观中间态（lib 为 ES2022，无 Promise.withResolvers） */
const PENDING_FOREVER: Promise<never> = new Promise(() => {})

function makePreference(
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference {
  return {
    id: 'preference-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    type: 'execution_completed',
    channel: 'in_app',
    enabled: true,
    ...overrides,
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
        <NotificationPreferencesPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('NotificationPreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertPreferenceMock.mockResolvedValue({ data: makePreference() })
  })

  it('加载中渲染骨架占位', async () => {
    getPreferencesMock.mockImplementation(() => PENDING_FOREVER)

    renderPage()

    expect(await screen.findByText('加载通知偏好中…')).toBeInTheDocument()
  })

  it('加载失败渲染错误态与重试入口', async () => {
    getPreferencesMock.mockRejectedValue(new Error('偏好服务不可用'))

    renderPage()

    expect(await screen.findByText('加载通知偏好失败')).toBeInTheDocument()
    expect(screen.getByText('偏好服务不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('渲染 8 个通知类型 × 3 个渠道，未持久化的格子默认开启', async () => {
    getPreferencesMock.mockResolvedValue({ data: [] })

    renderPage()

    expect(await screen.findByText('执行完成')).toBeInTheDocument()
    expect(screen.getByText('执行被终止')).toBeInTheDocument()

    const switches = screen.getAllByRole('checkbox')
    expect(switches).toHaveLength(24)
    for (const item of switches) {
      expect(item).toBeChecked()
    }
  })

  it('切换开关立即生效并逐格提交 type/channel/enabled', async () => {
    getPreferencesMock.mockResolvedValue({
      data: [makePreference({ enabled: true })],
    })
    // 保持请求挂起，断言的必然是乐观更新而非服务端回填
    upsertPreferenceMock.mockImplementation(() => PENDING_FOREVER)

    const user = userEvent.setup()
    renderPage()

    const target = await screen.findByRole('checkbox', {
      name: '执行完成 · 站内',
    })
    await user.click(target)

    expect(target).not.toBeChecked()
    expect(upsertPreferenceMock).toHaveBeenCalledWith({
      type: 'execution_completed',
      channel: 'in_app',
      enabled: false,
    })
  })

  it('提交失败时回滚开关并弹出错误提示', async () => {
    // 只让首次查询成功；回滚后的选中态只可能来自快照，不可能来自重新拉取
    getPreferencesMock.mockImplementationOnce(async () => ({
      data: [makePreference({ enabled: true })],
    }))
    getPreferencesMock.mockImplementation(() => PENDING_FOREVER)
    upsertPreferenceMock.mockRejectedValue(new Error('写入偏好失败'))

    const user = userEvent.setup()
    renderPage()

    const target = await screen.findByRole('checkbox', {
      name: '执行完成 · 站内',
    })
    // 失败在同一轮 flush 内回滚，乐观中间态由上一条用例覆盖；
    // 这里断言开关回到关闭前的状态且未卡在错误值上
    await user.click(target)

    await waitFor(() => {
      expect(target).toBeChecked()
    })
    expect(await screen.findByText('写入偏好失败')).toBeInTheDocument()
  })
})
