import { createRoute } from '@tanstack/react-router'
import { ApiTokenPage } from '@/features/platform-api-token'
import { settingsLayoutRoute } from './layout'

export const apiTokensRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/api-tokens',
  component: ApiTokenPage,
})
