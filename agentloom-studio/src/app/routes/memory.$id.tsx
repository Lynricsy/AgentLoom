import { createRoute, useParams } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { MemoryInstanceDetailPage } from '@/features/agent-memory'

function MemoryDetailRoute() {
  const { id } = useParams({ from: '/memory/$id' })
  return <MemoryInstanceDetailPage memoryInstanceId={id} />
}

export const memoryDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory/$id',
  component: MemoryDetailRoute,
})
