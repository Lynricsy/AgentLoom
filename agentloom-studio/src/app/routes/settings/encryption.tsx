import { createRoute } from '@tanstack/react-router'

import { TenantKeyManagement } from '@/features/tenant-key/components/TenantKeyManagement'

import { rootRoute } from '../__root'

function EncryptionSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <TenantKeyManagement />
    </div>
  )
}

export const encryptionSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/encryption',
  component: EncryptionSettingsPage,
})
