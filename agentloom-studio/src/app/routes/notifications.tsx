import { createRoute } from '@tanstack/react-router'
import { NotificationCenterPage } from '@/features/notification'
import { rootRoute } from './__root'

export const notificationCenterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  component: NotificationCenterPage,
})
