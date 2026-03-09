import { useQuery } from '@tanstack/react-query'
import {
  getPreferences,
  getUnreadCount,
  listNotifications,
} from './notificationApi'
import { notificationKeys } from './notificationKeys'
import type { NotificationListParams } from '../types'

export function useNotifications(params?: NotificationListParams) {
  const filters = params
    ? ({ ...params } as Record<string, unknown>)
    : {}

  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => listNotifications(params),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
  })
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: getPreferences,
  })
}
