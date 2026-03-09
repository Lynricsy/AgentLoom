import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useIsDropdownOpen,
  useNotificationActions,
  useNotificationCount,
  useNotificationStore,
} from './notificationStore'
import type { NotificationType } from '../types'

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

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().actions.reset()
  })

  it('新增通知时会前插并增加未读数', () => {
    const { actions } = useNotificationStore.getState()

    actions.addNotification(makeNotification({ id: 'older' }))
    actions.addNotification(
      makeNotification({
        id: 'newer',
        createdAt: '2026-03-10T00:01:00Z',
      }),
    )

    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(2)
    expect(state.notifications.map((item) => item.id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('同步服务端列表时保留本地已读状态并补齐缺失项', () => {
    const { actions } = useNotificationStore.getState()

    actions.addNotification(makeNotification({ id: 'notification-1' }))
    actions.markAsRead('notification-1')
    actions.syncNotifications([
      makeNotification({ id: 'notification-1', isRead: false }),
      makeNotification({
        id: 'notification-2',
        createdAt: '2026-03-10T00:01:00Z',
      }),
    ])

    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(2)
    expect(state.notifications.find((item) => item.id === 'notification-1')?.isRead).toBe(true)
    expect(state.notifications[0]?.id).toBe('notification-2')
  })

  it('标记单条已读只会递减一次未读数', () => {
    const { actions } = useNotificationStore.getState()

    actions.addNotification(makeNotification({ id: 'notification-1' }))
    actions.markAsRead('notification-1')
    actions.markAsRead('notification-1')

    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(0)
    expect(state.notifications[0]?.isRead).toBe(true)
  })

  it('标记全部已读会清空未读数', () => {
    const { actions } = useNotificationStore.getState()

    actions.addNotification(makeNotification({ id: 'notification-1' }))
    actions.addNotification(makeNotification({ id: 'notification-2' }))
    actions.markAllAsRead()

    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(0)
    expect(state.notifications.every((item) => item.isRead)).toBe(true)
  })

  it('导出的 selectors 会返回当前状态与 actions', () => {
    const { result: countResult } = renderHook(() => useNotificationCount())
    const { result: openResult } = renderHook(() => useIsDropdownOpen())
    const { result: actionsResult } = renderHook(() => useNotificationActions())

    act(() => {
      actionsResult.current.setUnreadCount(3)
      actionsResult.current.setDropdownOpen(true)
    })

    expect(countResult.current).toBe(3)
    expect(openResult.current).toBe(true)
    expect(typeof actionsResult.current.addNotification).toBe('function')
  })

  it('reset 会恢复初始状态', () => {
    const { actions } = useNotificationStore.getState()

    actions.addNotification(makeNotification({ id: 'notification-1' }))
    actions.setDropdownOpen(true)
    actions.reset()

    const state = useNotificationStore.getState()
    expect(state.notifications).toEqual([])
    expect(state.unreadCount).toBe(0)
    expect(state.isDropdownOpen).toBe(false)
  })
})
