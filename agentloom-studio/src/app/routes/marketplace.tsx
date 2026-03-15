import { createRoute } from '@tanstack/react-router'

import { MarketplaceBrowsePage } from '@/features/marketplace'
import { rootRoute } from './__root'

export const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace',
  component: MarketplaceBrowsePage,
})
