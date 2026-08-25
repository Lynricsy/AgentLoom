import type {
  InstallMarketplaceListingDto,
  SubmitMarketplaceListingDto,
  SubmitMarketplaceListingDtoCategoryEnum,
  SubmitPluginListingDto,
  SubmitReviewDto,
  UpdatePluginListingDto,
} from "@agentloom/api-client";

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
  workflowVersionId: string | null;
  pluginDbId: string | null;
  tenantId: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  category?: MarketplaceCategory | null;
  listingType: MarketplaceListingType;
  pricingModel: MarketplacePricingModel;
  pricePerExecution: string | null;
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
  pluginId: string | null;
  pluginName: string | null;
  pluginVersion: string | null;
  pluginAuthor: string | null;
}

/**
 * POST /marketplace/listings 请求体（生成模型）。
 * 原手写类型漏掉了 server 接受的 `category`。
 */
export type SubmitMarketplaceListingRequest = SubmitMarketplaceListingDto

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

/**
 * POST /plugins/marketplace/listings 请求体（生成模型，strict）。
 * 不含 description，也不含 occVersion —— 多传字段服务端直接 422。
 */
export type SubmitPluginListingRequest = SubmitPluginListingDto

/** PATCH /plugins/marketplace/listings/:id 请求体（生成模型，字段全可选） */
export type UpdatePluginListingRequest = UpdatePluginListingDto

/**
 * 插件 listing 编辑态的预填值。
 * `MyMarketplaceListingItem` 结构上满足它，编辑入口直接传行数据即可。
 */
export interface PluginListingEditTarget {
  id: string;
  title: string;
  summary: string;
  category?: MarketplaceCategory | null;
  tags: string[];
  pricingModel: MarketplacePricingModel;
  pricePerExecution: string | null;
}

export interface MarketplaceListingResponse {
  data: MarketplaceListing;
}

export interface MyListingsFilters {
  page?: number;
  pageSize?: number;
  status?: MarketplaceListingStatus;
  listingType?: MarketplaceListingType;
}

export type MarketplaceCategory = SubmitMarketplaceListingDtoCategoryEnum

export type MarketplaceSortOption = 'popular' | 'rating' | 'newest';

export const MARKETPLACE_CATEGORIES: {
  value: MarketplaceCategory;
  label: string;
}[] = [
  { value: 'analysis', label: '分析' },
  { value: 'content', label: '内容' },
  { value: 'development', label: '开发' },
  { value: 'automation', label: '自动化' },
  { value: 'reporting', label: '报告' },
];

export const MARKETPLACE_SORT_OPTIONS: {
  value: MarketplaceSortOption;
  label: string;
}[] = [
  { value: 'popular', label: '最受欢迎' },
  { value: 'rating', label: '评分最高' },
  { value: 'newest', label: '最新发布' },
];

export type MarketplaceListingType = 'workflow' | 'plugin';

export type MarketplacePricingModel = 'free' | 'per_execution';

export interface MarketplacePublicPluginDescriptor {
  pluginId: string;
  name: string;
  version: string;
  author: string;
  description: string | null;
  license: string | null;
}

export interface PublicMarketplaceListingItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  category: MarketplaceCategory | null;
  useCount: number;
  avgRating: string | null;
  reviewCount: number;
  publishedAt: string;
  listingType: MarketplaceListingType;
  pricingModel: MarketplacePricingModel;
  pricePerExecution: string | null;
  plugin: MarketplacePublicPluginDescriptor | null;
  author: { displayName: string };
}

export interface MarketplaceReview {
  id: string;
  rating: number;
  content: string | null;
  createdAt: string;
  author: { displayName: string };
}

export interface PublicWorkflowListingDetail
  extends PublicMarketplaceListingItem {
  listingType: 'workflow';
  definition: {
    nodes: unknown[];
    edges: unknown[];
    viewport: { x: number; y: number; zoom: number };
  };
  reviews: MarketplaceReview[];
}

export interface PublicPluginListingDetail
  extends PublicMarketplaceListingItem {
  listingType: 'plugin';
  plugin: MarketplacePublicPluginDescriptor;
  reviews: MarketplaceReview[];
}

export type PublicMarketplaceListingDetail =
  | PublicWorkflowListingDetail
  | PublicPluginListingDetail;

export interface PublicListingsFilters {
  category?: MarketplaceCategory;
  search?: string;
  sort?: MarketplaceSortOption;
  listingType?: MarketplaceListingType;
  pricingModel?: MarketplacePricingModel;
  page?: number;
  pageSize?: number;
}

export interface MarketplacePaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PublicListingsResponse {
  data: PublicMarketplaceListingItem[];
  meta: MarketplacePaginationMeta;
}

export type InstallMarketplaceListingRequest = InstallMarketplaceListingDto

export interface InstallWorkflowListingResponse {
  workflowDefinitionId: string;
  name: string;
  message: string;
}

export interface InstallPluginListingResponse {
  pluginDbId: string;
  pluginId: string;
  name: string;
  message: string;
}

export type InstallMarketplaceListingResponse =
  | InstallWorkflowListingResponse
  | InstallPluginListingResponse;

export type SubmitReviewRequest = SubmitReviewDto

export interface SubmittedMarketplaceReview {
  id: string;
  rating: number;
  content: string | null;
  createdAt: string;
}

export interface ReviewsResponse {
  data: MarketplaceReview[];
  meta: MarketplacePaginationMeta;
}
