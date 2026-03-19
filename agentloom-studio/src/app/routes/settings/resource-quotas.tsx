import { createRoute } from '@tanstack/react-router'
import { ResourceGovernancePage } from '@/features/resource-governance'
import { rootRoute } from '../__root'

export const resourceGovernanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/resource-quotas',
  component: ResourceGovernancePage,
})
