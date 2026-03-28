import { createRoute } from '@tanstack/react-router'
import { WorkspaceManagementPage } from '@/features/workspace'
import { rootRoute } from '../__root'

export const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/workspaces',
  component: WorkspaceManagementPage,
})
