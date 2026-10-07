import { createRoute } from '@tanstack/react-router'

import { TenantKeyManagement } from '@/features/tenant-key'

import { settingsLayoutRoute } from './layout'

export const encryptionSettingsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/encryption',
  component: TenantKeyManagement,
})
