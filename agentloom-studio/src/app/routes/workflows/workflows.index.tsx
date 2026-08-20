import { useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import { WorkflowListPage } from '@/features/workflow'
import {
  parseWorkflowListSearch,
  resolveWorkflowListSearch,
  type WorkflowListSearch,
} from '@/features/workflow'

function WorkflowsIndexPage() {
  const search = workflowsIndexRoute.useSearch()
  const filters = resolveWorkflowListSearch(search)
  const navigate = workflowsIndexRoute.useNavigate()

  const handleFiltersChange = useCallback(
    (updates: Partial<WorkflowListSearch>) => {
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
    <WorkflowListPage
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onPageChange={handlePageChange}
    />
  )
}

export const workflowsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/',
  validateSearch: parseWorkflowListSearch,
  component: WorkflowsIndexPage,
})
