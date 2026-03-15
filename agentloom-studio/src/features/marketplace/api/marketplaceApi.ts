import { apiClient, toSnakeBody } from '@/shared/api/client';

import type {
  MarketplaceListingListResponse,
  MarketplaceListingResponse,
  MyListingsFilters,
  SubmitMarketplaceListingRequest,
  SubmitMarketplaceListingResponse,
} from '../types';

const MARKETPLACE_LISTINGS_PATH = 'marketplace/listings';
const MARKETPLACE_MY_LISTINGS_PATH = 'marketplace/my-listings';

export function submitMarketplaceListing(
  request: SubmitMarketplaceListingRequest,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .post(MARKETPLACE_LISTINGS_PATH, {
      json: toSnakeBody(request),
    })
    .json<SubmitMarketplaceListingResponse>();
}

export function unlistMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListingResponse> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${listingId}/unlist`)
    .json<MarketplaceListingResponse>();
}

export function relistMarketplaceListing(
  listingId: string,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${listingId}/relist`)
    .json<SubmitMarketplaceListingResponse>();
}

export function fetchMyMarketplaceListings(
  filters: MyListingsFilters = {},
): Promise<MarketplaceListingListResponse> {
  const searchParams: Record<string, string> = {};

  if (filters.page != null) searchParams.page = String(filters.page);
  if (filters.pageSize != null)
    searchParams.pageSize = String(filters.pageSize);
  if (filters.status) searchParams.status = filters.status;

  return apiClient
    .get(MARKETPLACE_MY_LISTINGS_PATH, { searchParams })
    .json<MarketplaceListingListResponse>();
}

export function fetchMarketplaceListingById(
  listingId: string,
): Promise<MarketplaceListingResponse> {
  return apiClient
    .get(`${MARKETPLACE_LISTINGS_PATH}/${listingId}`)
    .json<MarketplaceListingResponse>();
}
