import { createRoute } from '@tanstack/react-router'
import { PrivateDeploymentPage } from '@/features/private-deployment'
import { rootRoute } from '../__root'

export const privateDeploymentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/private-deployment',
  component: PrivateDeploymentPage,
})
