import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';
import { workflowVersions } from './workflow-versions.schema';

export const marketplaceListingStatusEnum = pgEnum(
  'marketplace_listing_status',
  ['pending_review', 'review_failed', 'listed', 'unlisted'],
);

export type MarketplaceReviewCode =
  | 'WORKFLOW_VERSION_NOT_PUBLISHED'
  | 'WORKFLOW_VERSION_ARCHIVED'
  | 'WORKFLOW_EMPTY_NODE_DETECTED'
  | 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE'
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

    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => workflowVersions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    title: varchar('title', { length: 120 }).notNull(),

    summary: text('summary').notNull(),

    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    coverImageUrl: text('cover_image_url'),

    status: marketplaceListingStatusEnum('status')
      .notNull()
      .default('pending_review'),

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
    uniqueIndex('uq_marketplace_listings_workflow_version_id').on(
      table.workflowVersionId,
    ),
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
    index('idx_marketplace_listings_tags').using('gin', table.tags),
    ...createDirectTenantPolicies('marketplace_listings'),
  ],
);

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListing = typeof marketplaceListings.$inferInsert;
