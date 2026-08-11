import { createRoute } from '@tanstack/react-router'
import { ApiTokenPage } from '@/features/platform-api-token'
import { rootRoute } from '../__root'

export const apiTokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/api-tokens',
  component: ApiTokenPage,
})
