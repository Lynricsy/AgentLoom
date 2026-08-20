import { createRoute } from '@tanstack/react-router'

import { DeveloperKeysPage } from '@/features/developer-console'
import { rootRoute } from '../__root'

export const developerKeysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer-console/keys',
  component: DeveloperKeysPage,
})
