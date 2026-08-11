import { createRoute } from '@tanstack/react-router'
import { NotificationPreferencesPage } from '@/features/notification'
import { rootRoute } from '../__root'

export const notificationPreferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/notifications',
  component: NotificationPreferencesPage,
})
