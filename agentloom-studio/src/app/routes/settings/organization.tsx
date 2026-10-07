import { createRoute } from '@tanstack/react-router'

import { OrganizationSettingsPage } from '@/features/organization'

import { settingsLayoutRoute } from './layout'

export const organizationSettingsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/organization',
  component: OrganizationSettingsPage,
})
