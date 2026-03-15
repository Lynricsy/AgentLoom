export const MARKETPLACE_LISTING_STATUSES = [
  'pending_review',
  'review_failed',
  'listed',
  'unlisted',
] as const;

export type MarketplaceListingStatus =
  (typeof MARKETPLACE_LISTING_STATUSES)[number];

export const MARKETPLACE_REVIEW_CODES = [
  'WORKFLOW_VERSION_NOT_PUBLISHED',
  'WORKFLOW_VERSION_ARCHIVED',
  'WORKFLOW_EMPTY_NODE_DETECTED',
  'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE',
  'RECENT_SUCCESSFUL_EXECUTION_MISSING',
  'TITLE_INVALID',
  'SUMMARY_INVALID',
  'TAGS_INVALID',
] as const;

export type MarketplaceReviewCode = (typeof MARKETPLACE_REVIEW_CODES)[number];

export interface MarketplaceReviewCheck {
  code: MarketplaceReviewCode;
  status: 'passed' | 'failed';
  message: string;
  fixHint?: string;
  field?: string;
  nodeId?: string;
  nodeType?: string;
  missingFields?: string[];
}

export interface MarketplaceReviewResult {
  outcome: 'passed' | 'failed';
  checks: MarketplaceReviewCheck[];
  reviewedAt: string;
  recentSuccessfulExecutionId?: string;
  recentSuccessfulExecutionAt?: string;
}

export const MARKETPLACE_REVIEW_LIMITS = {
  titleMinLength: 5,
  titleMaxLength: 120,
  summaryMinLength: 30,
  summaryMaxLength: 500,
  minTags: 1,
  maxTags: 8,
  tagMaxLength: 32,
  successfulExecutionLookbackDays: 30,
} as const;

export interface MarketplaceListing {
  id: string;
  workflowVersionId: string;
  tenantId: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  status: MarketplaceListingStatus;
  reviewResult: MarketplaceReviewResult | null;
  submittedBy: string;
  submittedAt: string;
  publishedAt: string | null;
  unlistedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyMarketplaceListingItem extends MarketplaceListing {
  workflowDefinitionId: string | null;
  workflowName: string | null;
  versionNumber: number | null;
}

export interface SubmitMarketplaceListingRequest {
  workflowVersionId: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl?: string;
}

export interface MarketplaceListingListResponse {
  data: MyMarketplaceListingItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface SubmitMarketplaceListingResponse {
  data: MarketplaceListing;
  reviewResult: MarketplaceReviewResult;
}

export interface MarketplaceListingResponse {
  data: MarketplaceListing;
}

export interface MyListingsFilters {
  page?: number;
  pageSize?: number;
  status?: MarketplaceListingStatus;
}
