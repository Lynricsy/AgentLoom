import { createRoute } from '@tanstack/react-router'
import { MonitoringDashboardPage } from '@/features/monitoring'
import { rootRoute } from '../__root'

export const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/monitoring',
  component: MonitoringDashboardPage,
})
