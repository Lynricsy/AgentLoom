import { useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'

import {
  PluginUsagePage,
  parsePluginUsageSearch,
  resolvePluginUsageSearch,
  type PluginUsageSearch,
} from '@/features/plugin'
import { rootRoute } from '../__root'

function PluginUsageRoutePage() {
  const { pluginId } = pluginUsageRoute.useParams()
  const search = resolvePluginUsageSearch(pluginUsageRoute.useSearch())
  const navigate = pluginUsageRoute.useNavigate()

  const handleSearchChange = useCallback(
    (updates: Partial<PluginUsageSearch>) => {
      void navigate({
        search: { ...search, ...updates, page: 1 },
        replace: true,
      })
    },
    [navigate, search],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      void navigate({ search: { ...search, page }, replace: true })
    },
    [navigate, search],
  )

  return (
    <PluginUsagePage
      pluginDbId={pluginId}
      search={search}
      onSearchChange={handleSearchChange}
      onPageChange={handlePageChange}
    />
  )
}

export const pluginUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/plugins/$pluginId/usage',
  validateSearch: parsePluginUsageSearch,
  component: PluginUsageRoutePage,
})
