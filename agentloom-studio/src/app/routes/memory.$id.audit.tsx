import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { MemoryAuditPage } from '@/features/agent-memory'

function MemoryAuditRoute() {
  return (
    <div className="h-full w-full bg-background">
      <MemoryAuditPage />
    </div>
  )
}

export const memoryAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory/$id/audit',
  component: MemoryAuditRoute,
})
