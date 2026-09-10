import { createRoute } from '@tanstack/react-router'
import { OrganizationAutonomyPolicyPage } from '@/features/organization-autonomy-policy'
import { settingsLayoutRoute } from '../layout'

export const organizationAutonomyPolicyRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/security/autonomy-policy',
  component: OrganizationAutonomyPolicyPage,
})
