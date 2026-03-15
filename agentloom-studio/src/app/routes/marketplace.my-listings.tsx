import { createRoute } from '@tanstack/react-router'

import { MyMarketplaceListingsPage } from '@/features/marketplace'
import { rootRoute } from './__root'

export const marketplaceMyListingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace/my-listings',
  component: MyMarketplaceListingsPage,
})
