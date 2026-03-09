export type {
  NotificationListParams,
  NotificationPreference,
  NotificationType,
  NotificationTypeEnum,
  UnreadCountPayload,
  UpsertNotificationPreferenceInput,
} from './types'

export {
  getPreferences,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  upsertPreference,
} from './api/notificationApi'
export { notificationKeys } from './api/notificationKeys'
export {
  useMarkAllAsRead,
  useMarkAsRead,
  useUpsertPreference,
} from './api/notificationMutations'
export {
  useNotificationPreferences,
  useNotifications,
  useUnreadCount,
} from './api/notificationQueries'

export {
  resolveNotificationSocketUrl,
  useNotificationSocket,
} from './hooks/useNotificationSocket'

export { NotificationBell } from './components/NotificationBell'
export { NotificationDropdown } from './components/NotificationDropdown'
export { NotificationItem } from './components/NotificationItem'

export {
  useNotificationActions,
  useNotificationCount,
  useNotificationList,
  useIsDropdownOpen,
  useNotificationStore,
} from './stores/notificationStore'
