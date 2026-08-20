import { createRoute, useParams } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { MemoryInstanceSettingsPage } from '@/features/agent-memory'

function MemorySettingsRoute() {
  const { id } = useParams({ from: '/memory/$id/settings' })
  return <MemoryInstanceSettingsPage memoryInstanceId={id} />
}

export const memorySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory/$id/settings',
  component: MemorySettingsRoute,
})
