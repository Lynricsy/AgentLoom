export const MarketplaceEventName = {
  SUBMITTED: 'marketplace.listing.submitted',
  LISTED: 'marketplace.listing.listed',
  REVIEW_FAILED: 'marketplace.listing.review-failed',
  UNLISTED: 'marketplace.listing.unlisted',
  RELISTED: 'marketplace.listing.relisted',
} as const;

export interface MarketplaceListingSubmittedPayload {
  tenantId: string;
  listingId: string;
  workflowVersionId: string;
  submittedBy: string;
  reviewOutcome: 'passed' | 'failed';
}

export interface MarketplaceListingListedPayload {
  tenantId: string;
  listingId: string;
  workflowVersionId: string;
  publishedAt: string;
}

export interface MarketplaceListingReviewFailedPayload {
  tenantId: string;
  listingId: string;
  workflowVersionId: string;
  failedChecks: string[];
}

export interface MarketplaceListingUnlistedPayload {
  tenantId: string;
  listingId: string;
  workflowVersionId: string;
  unlistedAt: string;
}

export interface MarketplaceListingRelistedPayload {
  tenantId: string;
  listingId: string;
  workflowVersionId: string;
  reviewOutcome: 'passed' | 'failed';
}
