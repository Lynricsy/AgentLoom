import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { MemoryInstancesPage } from '@/features/agent-memory'

export const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory',
  component: MemoryInstancesPage,
})
