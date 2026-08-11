import { createRoute } from '@tanstack/react-router'

import { OrganizationSettingsPage } from '@/features/organization'

import { rootRoute } from '../__root'

export const organizationSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/organization',
  component: OrganizationSettingsPage,
})
