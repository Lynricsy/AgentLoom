import { createRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { ChevronRight } from 'lucide-react'
import { rootRoute } from '../__root'
import { AgentCanvas, useAgentCanvasStore } from '@/features/agent-canvas'

function AgentBreadcrumb() {
  const agentName = useAgentCanvasStore((s) => s.agentName)

  return (
    <nav className="absolute top-3 left-3 z-20 flex items-center gap-1 rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
      <Link
        to="/agents"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        智能体
      </Link>
      <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
      <span className="max-w-[200px] truncate font-medium text-foreground">
        {agentName || '加载中…'}
      </span>
    </nav>
  )
}

function AgentCanvasPage() {
  const { agentId } = agentDetailRoute.useParams()

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <AgentBreadcrumb />
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
