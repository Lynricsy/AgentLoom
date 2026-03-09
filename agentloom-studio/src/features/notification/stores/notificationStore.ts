import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { NotificationType } from '../types'

const MAX_NOTIFICATIONS = 20

export interface NotificationStoreState {
  notifications: NotificationType[]
  unreadCount: number
  isDropdownOpen: boolean
}

export interface NotificationStoreActions {
  actions: {
    syncNotifications: (notifications: NotificationType[]) => void
    addNotification: (notification: NotificationType) => void
    markAsRead: (id: string) => void
    markAllAsRead: () => void
    setUnreadCount: (count: number) => void
    setDropdownOpen: (open: boolean) => void
    reset: () => void
  }
}

function createInitialState(): NotificationStoreState {
  return {
    notifications: [],
    unreadCount: 0,
    isDropdownOpen: false,
  }
}

function sortNotifications(notifications: NotificationType[]): NotificationType[] {
  return [...notifications].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

function mergeNotifications(
  incoming: NotificationType[],
  existing: NotificationType[],
  preferExisting = false,
): NotificationType[] {
  const entries = preferExisting
    ? [...incoming, ...existing]
    : [...existing, ...incoming]
  const notificationMap = new Map<string, NotificationType>()

  for (const notification of entries) {
    notificationMap.set(notification.id, notification)
  }

  return sortNotifications([...notificationMap.values()]).slice(
    0,
    MAX_NOTIFICATIONS,
  )
}

export const useNotificationStore = create<
  NotificationStoreState & NotificationStoreActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),
        actions: {
          syncNotifications: (notifications) => {
            set((state) => {
              state.notifications = mergeNotifications(
                notifications,
                state.notifications,
                true,
              )
            })
          },

          addNotification: (notification) => {
            set((state) => {
              const previous = state.notifications.find(
                (item) => item.id === notification.id,
              )

              state.notifications = mergeNotifications(
                [notification],
                state.notifications,
              )

              if (!notification.isRead && (!previous || previous.isRead)) {
                state.unreadCount += 1
              }
            })
          },

          markAsRead: (id) => {
            set((state) => {
              const target = state.notifications.find(
                (notification) => notification.id === id,
              )

              if (!target || target.isRead) {
                return
              }

              target.isRead = true
              state.unreadCount = Math.max(0, state.unreadCount - 1)
            })
          },

          markAllAsRead: () => {
            set((state) => {
              for (const notification of state.notifications) {
                notification.isRead = true
              }

              state.unreadCount = 0
            })
          },

          setUnreadCount: (count) => {
            set((state) => {
              state.unreadCount = count
            })
          },

          setDropdownOpen: (open) => {
            set((state) => {
              state.isDropdownOpen = open
            })
          },

          reset: () => {
            set((state) => {
              Object.assign(state, createInitialState())
            })
          },
        },
      })),
    ),
    { name: 'NotificationStore' },
  ),
)

export const useNotificationList = () =>
  useNotificationStore((state) => state.notifications)

export const useNotificationCount = () =>
  useNotificationStore((state) => state.unreadCount)

export const useIsDropdownOpen = () =>
  useNotificationStore((state) => state.isDropdownOpen)

export const useNotificationActions = () =>
  useNotificationStore((state) => state.actions)
