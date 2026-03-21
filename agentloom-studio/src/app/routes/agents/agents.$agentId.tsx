import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'

function AgentCanvasPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">Agent 画布</h1>
      <p className="text-sm text-muted-foreground">智能体配置与编排画布</p>
    </div>
  )
}

export const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId',
  component: AgentCanvasPage,
})
