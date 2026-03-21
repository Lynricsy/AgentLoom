import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import { AgentListPage } from '@/features/agent/components/AgentListPage'

export const agentsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/',
  component: AgentListPage,
})
