import { createRoute } from '@tanstack/react-router'
import { SecuritySettings } from '@/features/auth'
import { rootRoute } from '../__root'

export const securitySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/security',
  component: SecuritySettings,
})
