import { createRoute } from '@tanstack/react-router'

import { TenantKeyManagement } from '@/features/tenant-key'

import { rootRoute } from '../__root'

function EncryptionSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <TenantKeyManagement />
    </div>
  )
}

export const encryptionSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/encryption',
  component: EncryptionSettingsPage,
})
