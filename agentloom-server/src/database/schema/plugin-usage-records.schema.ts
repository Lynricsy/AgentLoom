import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { plugins } from './plugins.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const pluginUsageRecords = pgTable(
  'plugin_usage_records',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    pluginDbId: uuid('plugin_db_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 255 }).notNull(),
    executionId: uuid('execution_id').notNull(),
    stepId: uuid('step_id'),
    executedBy: uuid('executed_by').references(() => users.id),
    billingAmount: numeric('billing_amount', { precision: 18, scale: 8 }),
    currency: varchar('currency', { length: 10 }).default('USD'),
    executionDurationMs: numeric('execution_duration_ms', { precision: 12, scale: 0 }),
    inputTokens: numeric('input_tokens', { precision: 12, scale: 0 }),
    outputTokens: numeric('output_tokens', { precision: 12, scale: 0 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plugin_usage_records_tenant_plugin_idx').on(table.tenantId, table.pluginDbId),
    index('plugin_usage_records_execution_idx').on(table.executionId),
    index('plugin_usage_records_created_at_idx').on(table.createdAt),
    index('plugin_usage_records_plugin_id_idx').on(table.pluginId),
    ...createDirectTenantPolicies('plugin_usage_records'),
  ],
);

export type PluginUsageRecord = typeof pluginUsageRecords.$inferSelect;
export type NewPluginUsageRecord = typeof pluginUsageRecords.$inferInsert;
