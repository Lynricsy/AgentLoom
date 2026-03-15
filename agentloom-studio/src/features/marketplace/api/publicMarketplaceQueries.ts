import { useQuery } from '@tanstack/react-query'

import {
  fetchListingReviews,
  fetchPublicListingDetail,
  fetchPublicListings,
} from './publicMarketplaceApi'
import { publicMarketplaceKeys } from './marketplaceKeys'
import type { PublicListingsFilters } from '../types'

export const PUBLIC_MARKETPLACE_LIST_STALE_TIME = 2 * 60 * 1000

export function usePublicListings(filters: PublicListingsFilters) {
  return useQuery({
    queryKey: publicMarketplaceKeys.list(filters),
    queryFn: () => fetchPublicListings(filters),
    staleTime: PUBLIC_MARKETPLACE_LIST_STALE_TIME,
  })
}

export function usePublicListingDetail(id: string | null) {
  return useQuery({
    queryKey: publicMarketplaceKeys.detail(id ?? ''),
    queryFn: () => fetchPublicListingDetail(id!),
    enabled: !!id,
  })
}

export function useListingReviews(id: string | null) {
  return useQuery({
    queryKey: publicMarketplaceKeys.reviews(id ?? ''),
    queryFn: () => fetchListingReviews(id!),
    enabled: !!id,
  })
}
