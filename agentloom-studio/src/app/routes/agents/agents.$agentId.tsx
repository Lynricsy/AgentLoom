import { createRoute } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { rootRoute } from '../__root'
import { AgentCanvas } from '@/features/agent-canvas'

function AgentCanvasPage() {
  const { agentId } = agentDetailRoute.useParams()

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen">
        <AgentCanvas agentId={agentId} />
      </div>
    </ReactFlowProvider>
  )
}

export const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId',
  component: AgentCanvasPage,
})
