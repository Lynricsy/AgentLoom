import { createRoute } from '@tanstack/react-router'

import { DeveloperEarningsPage } from '@/features/developer-console'
import { rootRoute } from '../__root'

export const developerEarningsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer-console/earnings',
  component: DeveloperEarningsPage,
})
