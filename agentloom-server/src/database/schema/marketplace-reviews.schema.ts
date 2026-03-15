import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { marketplaceListings } from './marketplace-listings.schema';
import { users } from './users.schema';

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
  ],
);

export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
export type NewMarketplaceReview = typeof marketplaceReviews.$inferInsert;
