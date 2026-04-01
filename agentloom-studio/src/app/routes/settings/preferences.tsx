import { createRoute } from '@tanstack/react-router'
import { UserPreferencesPage } from '@/features/user-preference'
import { rootRoute } from '../__root'

export const userPreferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/preferences',
  component: UserPreferencesPage,
})
