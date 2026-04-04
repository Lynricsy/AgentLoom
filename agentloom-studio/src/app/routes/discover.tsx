import { createRoute } from '@tanstack/react-router'
import { DiscoverPage } from '@/features/discover/components/DiscoverPage'
import { rootRoute } from './__root'

export const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover',
  component: DiscoverPage,
})
