import { createRoute } from '@tanstack/react-router'
import { OrganizationAutonomyPolicyPage } from '@/features/organization-autonomy-policy'
import { rootRoute } from '../../__root'

export const organizationAutonomyPolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/security/autonomy-policy',
  component: OrganizationAutonomyPolicyPage,
})
