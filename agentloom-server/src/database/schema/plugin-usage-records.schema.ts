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

import { createAppendOnlyTenantPolicies } from './rls-policies';
import { users } from './users.schema';

/**
 * 插件计费流水，只追加：RLS 不开放 UPDATE/DELETE。
 *
 * `plugin_db_id` 按值记录执行时的插件记录，不设外键——插件（含市场副本）
 * 被删除时流水必须原样保留，月结依赖 `source_*` 列把收入归给开发者。
 */
export const pluginUsageRecords = pgTable(
  'plugin_usage_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    pluginDbId: uuid('plugin_db_id').notNull(),
    pluginId: varchar('plugin_id', { length: 255 }).notNull(),
    sourceTenantId: uuid('source_tenant_id'),
    sourceOrgId: uuid('source_org_id'),
    sourcePluginDbId: uuid('source_plugin_db_id'),
    sourcePluginId: varchar('source_plugin_id', { length: 255 }),
    sourceListingId: uuid('source_listing_id'),
    executionId: uuid('execution_id').notNull(),
    stepId: uuid('step_id'),
    executedBy: uuid('executed_by').references(() => users.id),
    billingAmount: numeric('billing_amount', { precision: 18, scale: 8 }),
    currency: varchar('currency', { length: 10 }).default('USD'),
    executionDurationMs: numeric('execution_duration_ms', {
      precision: 12,
      scale: 0,
    }),
    inputTokens: numeric('input_tokens', { precision: 12, scale: 0 }),
    outputTokens: numeric('output_tokens', { precision: 12, scale: 0 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plugin_usage_records_tenant_plugin_idx').on(
      table.tenantId,
      table.pluginDbId,
    ),
    index('plugin_usage_records_source_plugin_idx').on(
      table.sourceTenantId,
      table.sourcePluginDbId,
    ),
    index('plugin_usage_records_source_org_created_at_idx').on(
      table.sourceOrgId,
      table.createdAt,
    ),
    index('plugin_usage_records_execution_idx').on(table.executionId),
    index('plugin_usage_records_created_at_idx').on(table.createdAt),
    index('plugin_usage_records_plugin_id_idx').on(table.pluginId),
    ...createAppendOnlyTenantPolicies('plugin_usage_records'),
  ],
);

export type PluginUsageRecord = typeof pluginUsageRecords.$inferSelect;
export type NewPluginUsageRecord = typeof pluginUsageRecords.$inferInsert;
