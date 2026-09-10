import { createRoute } from '@tanstack/react-router'
import { NotificationPreferencesPage } from '@/features/notification'
import { settingsLayoutRoute } from './layout'

export const notificationPreferencesRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/notifications',
  component: NotificationPreferencesPage,
})
