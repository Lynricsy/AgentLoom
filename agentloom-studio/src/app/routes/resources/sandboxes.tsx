import { createRoute } from '@tanstack/react-router'
import { SandboxManagementPage } from '@/features/sandbox'
import { rootRoute } from '../__root'

export const sandboxesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/sandboxes',
  component: SandboxManagementPage,
})
