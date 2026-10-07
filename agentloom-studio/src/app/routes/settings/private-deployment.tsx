import { createRoute } from '@tanstack/react-router'
import { PrivateDeploymentPage } from '@/features/private-deployment'
import { settingsLayoutRoute } from './layout'

export const privateDeploymentRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/private-deployment',
  component: PrivateDeploymentPage,
})
