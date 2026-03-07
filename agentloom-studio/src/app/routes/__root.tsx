import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { indexRoute } from './index'
import { workflowCanvasRoute } from './workflows/$workflowId'

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

export const routeTree = rootRoute.addChildren([indexRoute, workflowCanvasRoute])
