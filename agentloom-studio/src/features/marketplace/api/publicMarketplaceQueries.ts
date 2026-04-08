import { useQuery } from '@tanstack/react-query'

import {
  fetchListingReviews,
  fetchPublicListingDetail,
  fetchPublicListings,
  preflightMarketplaceListingInstall,
} from './publicMarketplaceApi'
import { publicMarketplaceKeys } from './marketplaceKeys'
import type { PublicListingsFilters } from '../types'

export const PUBLIC_MARKETPLACE_LIST_STALE_TIME = 2 * 60 * 1000
export const PUBLIC_MARKETPLACE_DETAIL_STALE_TIME = 5 * 60 * 1000
export const PUBLIC_MARKETPLACE_REVIEWS_STALE_TIME = 2 * 60 * 1000

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
    staleTime: PUBLIC_MARKETPLACE_DETAIL_STALE_TIME,
  })
}

export function useListingReviews(id: string | null) {
  return useQuery({
    queryKey: publicMarketplaceKeys.reviews(id ?? ''),
    queryFn: () => fetchListingReviews(id!),
    enabled: !!id,
    staleTime: PUBLIC_MARKETPLACE_REVIEWS_STALE_TIME,
  })
}

export function useInstallListingPreflight(id: string | null) {
  return useQuery({
    queryKey: publicMarketplaceKeys.installPreflight(id ?? ''),
    queryFn: () => preflightMarketplaceListingInstall(id!),
    enabled: !!id,
  })
}
