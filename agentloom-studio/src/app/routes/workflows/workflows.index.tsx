import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import { WorkflowListPage } from '@/features/workflow'

export const workflowsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/',
  component: WorkflowListPage,
})
