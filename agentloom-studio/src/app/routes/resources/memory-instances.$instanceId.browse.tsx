import { createRoute } from '@tanstack/react-router'
import { MemoryBrowser } from '@/features/memory-instance/components/browser/MemoryBrowser'
import { rootRoute } from '../__root'

export const memoryInstanceBrowseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/memory-instances/$instanceId/browse',
  component: MemoryBrowser,
})
