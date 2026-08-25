import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { anonRole, authenticatedRole } from 'drizzle-orm/supabase';

import { marketplaceListings } from './marketplace-listings.schema';
import { users } from './users.schema';

// 服务层使用 raw db（service role 会绕过 RLS）；这些策略是纵深防御，不是唯一访问控制防线。
export const marketplaceReviews = pgTable(
  'marketplace_reviews',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    content: text('content'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('rating_range', sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
    uniqueIndex('marketplace_reviews_listing_user_idx').on(
      table.listingId,
      table.userId,
    ),
    index('marketplace_reviews_listing_idx').on(table.listingId),
    pgPolicy('marketplace_reviews_select_policy', {
      for: 'select',
      to: [authenticatedRole, anonRole],
      using: sql`true`,
    }),
    pgPolicy('marketplace_reviews_insert_policy', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`true`,
    }),
    pgPolicy('marketplace_reviews_update_policy', {
      for: 'update',
      to: authenticatedRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy('marketplace_reviews_delete_policy', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
).enableRLS();

export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
export type NewMarketplaceReview = typeof marketplaceReviews.$inferInsert;
