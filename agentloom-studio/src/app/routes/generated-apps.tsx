import { createRoute } from '@tanstack/react-router'

import { GeneratedAppListPage } from '@/features/generated-app'
import { rootRoute } from './__root'

export const generatedAppsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/generated-apps',
  component: GeneratedAppListPage,
})
