import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPreference, NotificationType } from '../types'
import {
  getPreferences,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  upsertPreference,
} from './notificationApi'

const { getMock, patchMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    patch: patchMock,
    put: putMock,
  },
  toSnakeBody: (input: unknown) => input,
}))

const mockNotification: NotificationType = {
  id: 'notification-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  type: 'execution_completed',
  title: '执行完成',
  body: { executionId: 'exec-1' },
  isRead: false,
  createdAt: '2026-03-10T00:00:00Z',
}

const mockPreference: NotificationPreference = {
  id: 'preference-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  type: 'system',
  channel: 'in_app',
  enabled: true,
}

describe('notificationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('请求通知列表时附带分页与已读过滤参数', async () => {
    const response = {
      data: [mockNotification],
      meta: {
        page: 2,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      },
    }

    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await listNotifications({
      page: 2,
      pageSize: 10,
      isRead: false,
    })

    expect(getMock).toHaveBeenCalledWith('notifications', {
      searchParams: {
        page: '2',
        page_size: '10',
        is_read: 'false',
      },
    })
    expect(result).toEqual(response)
  })

  it('请求未读数量接口', async () => {
    const response = { data: { count: 4 } }

    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await getUnreadCount()

    expect(getMock).toHaveBeenCalledWith('notifications/unread-count')
    expect(result).toEqual(response)
  })

  it('标记单条通知已读', async () => {
    const response = { data: { ...mockNotification, isRead: true } }

    patchMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await markAsRead('notification-1')

    expect(patchMock).toHaveBeenCalledWith('notifications/notification-1/read')
    expect(result).toEqual(response)
  })

  it('标记全部通知已读', async () => {
    const response = { data: undefined }

    patchMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await markAllAsRead()

    expect(patchMock).toHaveBeenCalledWith('notifications/read-all')
    expect(result).toEqual(response)
  })

  it('获取通知偏好列表', async () => {
    const response = { data: [mockPreference] }

    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const result = await getPreferences()

    expect(getMock).toHaveBeenCalledWith('notifications/preferences')
    expect(result).toEqual(response)
  })

  it('更新通知偏好', async () => {
    const response = { data: mockPreference }

    putMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    const input = {
      type: 'system' as const,
      channel: 'in_app',
      enabled: false,
    }

    const result = await upsertPreference(input)

    expect(putMock).toHaveBeenCalledWith('notifications/preferences', {
      json: input,
    })
    expect(result).toEqual(response)
  })
})
