import { createRoute } from '@tanstack/react-router'
import { SecuritySettings } from '@/features/auth'
import { settingsLayoutRoute } from './layout'

export const securitySettingsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/security',
  component: SecuritySettings,
})
