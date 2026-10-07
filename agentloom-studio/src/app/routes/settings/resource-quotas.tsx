import { createRoute } from '@tanstack/react-router'
import { ResourceGovernancePage } from '@/features/resource-governance'
import { settingsLayoutRoute } from './layout'

export const resourceGovernanceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/resource-quotas',
  component: ResourceGovernancePage,
})
