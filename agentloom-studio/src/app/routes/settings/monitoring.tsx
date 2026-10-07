import { createRoute } from '@tanstack/react-router'
import { MonitoringDashboardPage } from '@/features/monitoring'
import { settingsLayoutRoute } from './layout'

export const monitoringRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/monitoring',
  component: MonitoringDashboardPage,
})
