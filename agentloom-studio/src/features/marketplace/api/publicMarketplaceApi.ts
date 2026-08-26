import { apiClient, toSnakeBody } from '@/shared/api/client'

import type {
  InstallMarketplaceListingRequest,
  InstallMarketplaceListingResponse,
  MarketplaceListingUpgradeStatus,
  PublicListingsFilters,
  PublicListingsResponse,
  PublicMarketplaceListingDetail,
  ReviewsResponse,
  SubmittedMarketplaceReview,
  SubmitReviewRequest,
  UninstallMarketplaceListingResponse,
  UpgradeMarketplaceListingResponse,
} from '../types'

const MARKETPLACE_BROWSE_PATH = 'marketplace/browse'
const MARKETPLACE_LISTINGS_PATH = 'marketplace/listings'

type QueryParamValue = string | number | boolean

function cleanParams(params: PublicListingsFilters): Record<string, QueryParamValue> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  ) as Record<string, QueryParamValue>
}

export async function fetchPublicListings(
  filters: PublicListingsFilters,
): Promise<PublicListingsResponse> {
  return apiClient
    .get(MARKETPLACE_BROWSE_PATH, {
      searchParams: cleanParams(filters),
    })
    .json<PublicListingsResponse>()
}

export async function fetchPublicListingDetail(
  id: string,
): Promise<PublicMarketplaceListingDetail> {
  return apiClient
    .get(`${MARKETPLACE_BROWSE_PATH}/${id}`)
    .json<PublicMarketplaceListingDetail>()
}

export async function fetchListingReviews(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<ReviewsResponse> {
  return apiClient
    .get(`${MARKETPLACE_BROWSE_PATH}/${id}/reviews`, {
      searchParams: { page, pageSize },
    })
    .json<ReviewsResponse>()
}

export async function installMarketplaceListing(
  id: string,
  body?: InstallMarketplaceListingRequest,
): Promise<InstallMarketplaceListingResponse> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${id}/install`, {
      json: body ? toSnakeBody(body) : {},
    })
    .json<InstallMarketplaceListingResponse>()
}

/** 停用租户内来自该 listing 的插件副本；不删行、不删产物，可重新启用 */
export async function uninstallMarketplaceListing(
  id: string,
): Promise<UninstallMarketplaceListingResponse> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${id}/uninstall`)
    .json<UninstallMarketplaceListingResponse>()
}

export async function checkMarketplaceListingUpgrade(
  id: string,
): Promise<MarketplaceListingUpgradeStatus> {
  return apiClient
    .get(`${MARKETPLACE_LISTINGS_PATH}/${id}/upgrade-check`)
    .json<MarketplaceListingUpgradeStatus>()
}

export async function upgradeMarketplaceListing(
  id: string,
): Promise<UpgradeMarketplaceListingResponse> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${id}/upgrade`)
    .json<UpgradeMarketplaceListingResponse>()
}

export async function submitMarketplaceReview(
  id: string,
  body: SubmitReviewRequest,
): Promise<SubmittedMarketplaceReview> {
  return apiClient
    .post(`${MARKETPLACE_LISTINGS_PATH}/${id}/reviews`, {
      json: body,
    })
    .json<SubmittedMarketplaceReview>()
}

export { cleanParams }
