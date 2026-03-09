import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useAuthToken } from '@/features/execution'
import { NotificationBell, useNotificationSocket } from '@/features/notification'
import { indexRoute } from './index'
import { workflowCanvasRoute } from './workflows/$workflowId'
import { knowledgeBasesRoute } from './settings/knowledge-bases'
import { knowledgeBaseDetailRoute } from './settings/knowledge-bases/$knowledgeBaseId'
import { executionDebugRoute } from './executions/$executionId'

function RootLayout() {
  const authToken = useAuthToken()

  useNotificationSocket({ authToken })

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center justify-end px-4 sm:px-6">
          <NotificationBell />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>

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
  executionDebugRoute,
  knowledgeBasesRoute,
  knowledgeBaseDetailRoute,
])
