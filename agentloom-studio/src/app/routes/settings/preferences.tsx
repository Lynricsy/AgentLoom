import { createRoute } from '@tanstack/react-router'
import { UserPreferencesPage } from '@/features/user-preference'
import { settingsLayoutRoute } from './layout'

export const userPreferencesRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/preferences',
  component: UserPreferencesPage,
})
