import { createRoute, useParams } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { rootRoute } from './__root'
import { MemoryGraphPage } from '@/features/agent-memory/components/graph/MemoryGraphPage'

function MemoryGraphRoute() {
  const { id } = useParams({ from: '/memory/$id/graph' })
  return (
    <ReactFlowProvider>
      <div className="h-full w-full bg-background">
        <MemoryGraphPage instanceId={id} />
      </div>
    </ReactFlowProvider>
  )
}

export const memoryGraphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory/$id/graph',
  component: MemoryGraphRoute,
})
