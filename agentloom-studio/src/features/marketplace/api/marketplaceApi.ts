import { apiClient } from '@/shared/api/client';

import type {
  MarketplaceListingListResponse,
  MarketplaceListingResponse,
  MyListingsFilters,
  SubmitMarketplaceListingRequest,
  SubmitMarketplaceListingResponse,
  SubmitPluginListingRequest,
  UpdatePluginListingRequest,
} from '../types';

const MARKETPLACE_LISTINGS_PATH = 'marketplace/listings';
const MARKETPLACE_MY_LISTINGS_PATH = 'marketplace/my-listings';
const PLUGIN_MARKETPLACE_LISTINGS_PATH = 'plugins/marketplace/listings';

export function submitMarketplaceListing(
  request: SubmitMarketplaceListingRequest,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .post(MARKETPLACE_LISTINGS_PATH, {
      json: request,
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
  if (filters.listingType) searchParams.listingType = filters.listingType;

  return apiClient
    .get(MARKETPLACE_MY_LISTINGS_PATH, { searchParams })
    .json<MarketplaceListingListResponse>();
}

export function unlistPluginMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListingResponse> {
  return apiClient
    .post(`${PLUGIN_MARKETPLACE_LISTINGS_PATH}/${listingId}/unlist`)
    .json<MarketplaceListingResponse>();
}

export function relistPluginMarketplaceListing(
  listingId: string,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .post(`${PLUGIN_MARKETPLACE_LISTINGS_PATH}/${listingId}/relist`)
    .json<SubmitMarketplaceListingResponse>();
}

export function submitPluginMarketplaceListing(
  request: SubmitPluginListingRequest,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .post(PLUGIN_MARKETPLACE_LISTINGS_PATH, {
      json: request,
    })
    .json<SubmitMarketplaceListingResponse>();
}

/**
 * 编辑已上架的插件 listing。服务端会**重新审查**，
 * 响应里的 status 可能从 listed 掉到 review_failed。
 */
export function updatePluginMarketplaceListing(
  listingId: string,
  request: UpdatePluginListingRequest,
): Promise<SubmitMarketplaceListingResponse> {
  return apiClient
    .patch(`${PLUGIN_MARKETPLACE_LISTINGS_PATH}/${listingId}`, {
      json: request,
    })
    .json<SubmitMarketplaceListingResponse>();
}

export function fetchMarketplaceListingById(
  listingId: string,
): Promise<MarketplaceListingResponse> {
  return apiClient
    .get(`${MARKETPLACE_LISTINGS_PATH}/${listingId}`)
    .json<MarketplaceListingResponse>();
}
