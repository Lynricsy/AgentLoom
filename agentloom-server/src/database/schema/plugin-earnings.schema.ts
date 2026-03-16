import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { plugins } from './plugins.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const pluginEarnings = pgTable(
  'plugin_earnings',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    pluginDbId: uuid('plugin_db_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 255 }).notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    totalExecutions: integer('total_executions').notNull().default(0),
    totalRevenue: numeric('total_revenue', { precision: 18, scale: 8 }).notNull().default('0'),
    developerShare: numeric('developer_share', { precision: 18, scale: 8 }).notNull().default('0'),
    platformShare: numeric('platform_share', { precision: 18, scale: 8 }).notNull().default('0'),
    listingCommission: numeric('listing_commission', { precision: 18, scale: 8 }).notNull().default('0'),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    payoutStatus: payoutStatusEnum('payout_status').notNull().default('pending'),
    payoutReference: varchar('payout_reference', { length: 255 }),
    payoutAt: timestamp('payout_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plugin_earnings_tenant_plugin_idx').on(table.tenantId, table.pluginDbId),
    index('plugin_earnings_org_idx').on(table.orgId),
    index('plugin_earnings_period_idx').on(table.periodStart, table.periodEnd),
    index('plugin_earnings_payout_status_idx').on(table.payoutStatus),
    check(
      'plugin_earnings_total_executions_non_negative',
      sql`${table.totalExecutions} >= 0`,
    ),
    check(
      'plugin_earnings_total_revenue_non_negative',
      sql`${table.totalRevenue} >= 0`,
    ),
    check(
      'plugin_earnings_developer_share_non_negative',
      sql`${table.developerShare} >= 0`,
    ),
    check(
      'plugin_earnings_platform_share_non_negative',
      sql`${table.platformShare} >= 0`,
    ),
    ...createDirectTenantPolicies('plugin_earnings'),
  ],
);

export type PluginEarning = typeof pluginEarnings.$inferSelect;
export type NewPluginEarning = typeof pluginEarnings.$inferInsert;
