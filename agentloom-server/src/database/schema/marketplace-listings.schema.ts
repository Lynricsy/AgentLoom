import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { plugins } from './plugins.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';
import { workflowVersions } from './workflow-versions.schema';

export const marketplaceListingStatusEnum = pgEnum(
  'marketplace_listing_status',
  ['pending_review', 'review_failed', 'listed', 'unlisted'],
);

export const marketplaceListingTypeEnum = pgEnum('marketplace_listing_type', [
  'workflow',
  'plugin',
]);

export const marketplacePricingModelEnum = pgEnum('marketplace_pricing_model', [
  'free',
  'per_execution',
]);

export const marketplaceCategoryEnum = pgEnum('marketplace_category_enum', [
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
]);

export type MarketplaceCategory =
  (typeof marketplaceCategoryEnum.enumValues)[number];

export type MarketplaceListingType =
  (typeof marketplaceListingTypeEnum.enumValues)[number];

export type MarketplacePricingModel =
  (typeof marketplacePricingModelEnum.enumValues)[number];

export type MarketplaceReviewCode =
  | 'WORKFLOW_VERSION_NOT_PUBLISHED'
  | 'WORKFLOW_VERSION_ARCHIVED'
  | 'WORKFLOW_EMPTY_NODE_DETECTED'
  | 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE'
  // 遗留节点需要独立审核码，避免被普通 Agent 绑定失败掩盖真实迁移原因。
  | 'WORKFLOW_LEGACY_LLM_AGENT_DETECTED'
  | 'RECENT_SUCCESSFUL_EXECUTION_MISSING'
  | 'TITLE_INVALID'
  | 'SUMMARY_INVALID'
  | 'TAGS_INVALID';

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

export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowVersionId: uuid('workflow_version_id').references(
      () => workflowVersions.id,
      { onDelete: 'cascade' },
    ),

    pluginDbId: uuid('plugin_db_id').references(() => plugins.id, {
      onDelete: 'cascade',
    }),

    listingType: marketplaceListingTypeEnum('listing_type')
      .notNull()
      .default('workflow'),

    pricingModel: marketplacePricingModelEnum('pricing_model')
      .notNull()
      .default('free'),

    pricePerExecution: numeric('price_per_execution', {
      precision: 18,
      scale: 8,
    }),

    tenantId: uuid('tenant_id').notNull(),

    title: varchar('title', { length: 120 }).notNull(),

    summary: text('summary').notNull(),

    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    coverImageUrl: text('cover_image_url'),

    category: marketplaceCategoryEnum('category'),

    status: marketplaceListingStatusEnum('status')
      .notNull()
      .default('pending_review'),

    useCount: integer('use_count').notNull().default(0),

    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }),

    reviewCount: integer('review_count').notNull().default(0),

    reviewResult: jsonb('review_result').$type<MarketplaceReviewResult>(),

    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    publishedAt: timestamp('published_at', { withTimezone: true }),

    unlistedAt: timestamp('unlisted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_marketplace_listings_workflow_version_id')
      .on(table.workflowVersionId)
      .where(sql`workflow_version_id IS NOT NULL`),
    uniqueIndex('uq_marketplace_listings_plugin_db_id')
      .on(table.pluginDbId)
      .where(sql`plugin_db_id IS NOT NULL`),
    index('idx_marketplace_listings_plugin_db_id')
      .on(table.pluginDbId)
      .where(sql`plugin_db_id IS NOT NULL`),
    index('idx_marketplace_listings_listing_type').on(table.listingType),
    index('idx_marketplace_listings_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_marketplace_listings_tenant_created_at').on(
      table.tenantId,
      table.createdAt,
    ),
    index('idx_marketplace_listings_listed')
      .on(table.status)
      .where(sql`status = 'listed'`),
    index('marketplace_listings_category_listed_idx')
      .on(table.category)
      .where(sql`status = 'listed'`),
    index('idx_marketplace_listings_tags').using('gin', table.tags),
    check(
      'marketplace_listings_use_count_non_negative',
      sql`${table.useCount} >= 0`,
    ),
    check(
      'marketplace_listings_review_count_non_negative',
      sql`${table.reviewCount} >= 0`,
    ),
    check(
      'marketplace_listings_avg_rating_range',
      sql`${table.avgRating} IS NULL OR (${table.avgRating} >= 1 AND ${table.avgRating} <= 5)`,
    ),
    check(
      'marketplace_listings_price_per_execution_non_negative',
      sql`${table.pricePerExecution} IS NULL OR ${table.pricePerExecution} >= 0`,
    ),
    check(
      'marketplace_listings_per_execution_price_required',
      sql`${table.pricingModel} <> 'per_execution' OR ${table.pricePerExecution} IS NOT NULL`,
    ),
    check(
      'marketplace_listings_listing_type_binding_check',
      sql`(
        ${table.listingType} = 'workflow'
        AND ${table.workflowVersionId} IS NOT NULL
        AND ${table.pluginDbId} IS NULL
      ) OR (
        ${table.listingType} = 'plugin'
        AND ${table.pluginDbId} IS NOT NULL
        AND ${table.workflowVersionId} IS NULL
      )`,
    ),
    ...createDirectTenantPolicies('marketplace_listings'),
  ],
);

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListing = typeof marketplaceListings.$inferInsert;
