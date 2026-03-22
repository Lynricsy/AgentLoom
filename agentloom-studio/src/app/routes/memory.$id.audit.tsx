import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { MemoryAuditPage } from '@/features/agent-memory/components/audit/MemoryAuditPage'

function MemoryAuditRoute() {
  return (
    <div className="h-screen w-screen bg-background">
      <MemoryAuditPage />
    </div>
  )
}

export const memoryAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory/$id/audit',
  component: MemoryAuditRoute,
})
