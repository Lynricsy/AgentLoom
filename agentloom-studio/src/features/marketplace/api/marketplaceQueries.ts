import {
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';

import {
  fetchMarketplaceListingById,
  fetchMyMarketplaceListings,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import type {
  MarketplaceListingListResponse,
  MarketplaceListingResponse,
  MyListingsFilters,
} from '../types';

export const MARKETPLACE_LIST_STALE_TIME = 2 * 60 * 1000;
export const MARKETPLACE_DETAIL_STALE_TIME = 60 * 1000;

type MyMarketplaceListingsQueryOptions<
  TData = MarketplaceListingListResponse,
> = Omit<
  UseQueryOptions<
    MarketplaceListingListResponse,
    Error,
    TData,
    ReturnType<typeof marketplaceKeys.list>
  >,
  'queryKey' | 'queryFn'
>;

type MarketplaceListingDetailQueryOptions<
  TData = MarketplaceListingResponse,
> = Omit<
  UseQueryOptions<
    MarketplaceListingResponse,
    Error,
    TData,
    ReturnType<typeof marketplaceKeys.detail>
  >,
  'queryKey' | 'queryFn'
>;

export function useMyMarketplaceListings<
  TData = MarketplaceListingListResponse,
>(
  filters: MyListingsFilters = {},
  options?: MyMarketplaceListingsQueryOptions<TData>,
) {
  return useQuery({
    queryKey: marketplaceKeys.list(filters),
    queryFn: () => fetchMyMarketplaceListings(filters),
    staleTime: MARKETPLACE_LIST_STALE_TIME,
    ...options,
  });
}

export function useMarketplaceListingDetail<
  TData = MarketplaceListingResponse,
>(
  listingId: string | undefined,
  options?: MarketplaceListingDetailQueryOptions<TData>,
) {
  const { enabled = true, ...restOptions } = options ?? {};

  return useQuery({
    queryKey: marketplaceKeys.detail(listingId ?? ''),
    queryFn: () => fetchMarketplaceListingById(listingId!),
    enabled: Boolean(listingId) && enabled,
    staleTime: MARKETPLACE_DETAIL_STALE_TIME,
    ...restOptions,
  });
}
