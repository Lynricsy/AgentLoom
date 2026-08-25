import { useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'

import { DiscoverPage } from '@/features/discover'
import {
  marketplaceBrowseSearchToParams,
  parseMarketplaceBrowseSearch,
  resolveMarketplaceBrowseSearch,
  type MarketplaceBrowseSearch,
} from '@/features/marketplace'
import { rootRoute } from './__root'

function DiscoverRoutePage() {
  const search = discoverRoute.useSearch()
  const filters = resolveMarketplaceBrowseSearch(search)
  const navigate = discoverRoute.useNavigate()

  const handleFiltersChange = useCallback(
    (updates: Partial<MarketplaceBrowseSearch>) => {
      void navigate({
        search: marketplaceBrowseSearchToParams({
          ...filters,
          ...updates,
          page: 1,
        }),
        replace: true,
      })
    },
    [filters, navigate],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      void navigate({
        search: marketplaceBrowseSearchToParams({ ...filters, page }),
        replace: true,
      })
    },
    [filters, navigate],
  )

  return (
    <DiscoverPage
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onPageChange={handlePageChange}
    />
  )
}

export const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover',
  validateSearch: parseMarketplaceBrowseSearch,
  component: DiscoverRoutePage,
})
