import { createRoute } from '@tanstack/react-router'

import { DeveloperEarningsPage } from '@/features/developer-console/pages/DeveloperEarningsPage'
import { rootRoute } from '../__root'

export const developerEarningsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer-console/earnings',
  component: DeveloperEarningsPage,
})
