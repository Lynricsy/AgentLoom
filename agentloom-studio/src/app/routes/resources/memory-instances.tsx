import { createRoute } from '@tanstack/react-router'
import { MemoryInstanceManagementPage } from '@/features/memory-instance'
import { rootRoute } from '../__root'

export const memoryInstancesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/memory-instances',
  component: MemoryInstanceManagementPage,
})
