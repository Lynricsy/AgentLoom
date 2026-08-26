import { useQuery } from '@tanstack/react-query'

import { pluginKeys } from '@/features/plugin'
import {
  checkMarketplaceListingUpgrade,
  fetchListingReviews,
  fetchPublicListingDetail,
  fetchPublicListings,
} from './publicMarketplaceApi'
import { publicMarketplaceKeys } from './marketplaceKeys'
import type { PublicListingsFilters } from '../types'

export const PUBLIC_MARKETPLACE_LIST_STALE_TIME = 2 * 60 * 1000
export const PUBLIC_MARKETPLACE_DETAIL_STALE_TIME = 5 * 60 * 1000
export const PUBLIC_MARKETPLACE_REVIEWS_STALE_TIME = 2 * 60 * 1000
export const MARKETPLACE_UPGRADE_CHECK_STALE_TIME = 5 * 60 * 1000

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

/**
 * 已安装副本与 listing 源插件的版本差。
 *
 * 缓存挂在 pluginKeys 的插件详情层级下（而非 listing 层级）：这份判定描述的是
 * 「这个插件副本」的状态，升级/卸载后跟着 pluginKeys.all 一起失效。
 */
export function useMarketplaceListingUpgrade(
  pluginDbId: string | null,
  listingId: string | null,
) {
  return useQuery({
    queryKey: pluginKeys.marketplaceUpgrade(pluginDbId ?? '', listingId ?? ''),
    queryFn: () => checkMarketplaceListingUpgrade(listingId!),
    enabled: !!pluginDbId && !!listingId,
    staleTime: MARKETPLACE_UPGRADE_CHECK_STALE_TIME,
  })
}
