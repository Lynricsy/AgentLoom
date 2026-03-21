import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'

function AgentListPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">Agent 列表</h1>
      <p className="text-sm text-muted-foreground">智能体管理页面</p>
    </div>
  )
}

export const agentsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/',
  component: AgentListPage,
})
