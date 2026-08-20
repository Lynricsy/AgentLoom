export type {
  NotificationChannel,
  NotificationListParams,
  NotificationPreference,
  NotificationType,
  NotificationTypeEnum,
  UnreadCountPayload,
  UpsertNotificationPreferenceInput,
} from './types'

export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_META,
} from './lib/notificationMeta'

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
export { NotificationCenterPage } from './components/NotificationCenterPage'
export { NotificationPreferencesPage } from './components/NotificationPreferencesPage'

export {
  useNotificationActions,
  useIsDropdownOpen,
  useNotificationStore,
} from './stores/notificationStore'
