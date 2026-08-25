import { useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'

import {
  MarketplaceBrowsePage,
  marketplaceBrowseSearchToParams,
  parseMarketplaceBrowseSearch,
  resolveMarketplaceBrowseSearch,
  type MarketplaceBrowseSearch,
} from '@/features/marketplace'
import { rootRoute } from './__root'

function MarketplacePage() {
  const search = marketplaceRoute.useSearch()
  const filters = resolveMarketplaceBrowseSearch(search)
  const navigate = marketplaceRoute.useNavigate()

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
    <MarketplaceBrowsePage
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onPageChange={handlePageChange}
    />
  )
}

export const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace',
  validateSearch: parseMarketplaceBrowseSearch,
  component: MarketplacePage,
})
