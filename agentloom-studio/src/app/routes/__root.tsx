import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { indexRoute } from './index'
import { workflowCanvasRoute } from './workflows/$workflowId'
import { knowledgeBasesRoute } from './settings/knowledge-bases'
import { knowledgeBaseDetailRoute } from './settings/knowledge-bases/$knowledgeBaseId'

function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Outlet />
      <TanStackRouterDevtools />
    </div>
  )
}

export const rootRoute = createRootRoute({
  component: RootLayout,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowCanvasRoute,
  knowledgeBasesRoute,
  knowledgeBaseDetailRoute,
])
