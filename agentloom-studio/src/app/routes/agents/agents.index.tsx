import { useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import { AgentListPage } from '@/features/agent'
import {
  parseAgentListSearch,
  resolveAgentListSearch,
  type AgentListSearch,
} from '@/features/agent'

function AgentsIndexPage() {
  const search = agentsIndexRoute.useSearch()
  const filters = resolveAgentListSearch(search)
  const navigate = agentsIndexRoute.useNavigate()

  const handleFiltersChange = useCallback(
    (updates: Partial<AgentListSearch>) => {
      void navigate({
        search: { ...filters, ...updates, page: 1 },
        replace: true,
      })
    },
    [filters, navigate],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      void navigate({ search: { ...filters, page }, replace: true })
    },
    [filters, navigate],
  )

  return (
    <AgentListPage
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onPageChange={handlePageChange}
    />
  )
}

export const agentsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/',
  validateSearch: parseAgentListSearch,
  component: AgentsIndexPage,
})
