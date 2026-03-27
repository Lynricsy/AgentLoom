import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';
import { organizations } from './organizations.schema';
import { users } from './users.schema';

export const tenantQuotas = pgTable(
  'tenant_quotas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    apiRateLimitPerMinute: integer('api_rate_limit_per_minute')
      .notNull()
      .default(100),

    maxConcurrentExecutions: integer('max_concurrent_executions'),

    dailyExecutionLimit: integer('daily_execution_limit'),

    dailyApiCallLimit: integer('daily_api_call_limit'),

    storageQuotaMb: integer('storage_quota_mb'),

    maxSandboxCpuPercent: integer('max_sandbox_cpu_percent'),

    maxSandboxMemoryMb: integer('max_sandbox_memory_mb'),

    version: integer('version').notNull().default(1),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),

    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_quotas_org').on(table.organizationId),
    index('idx_tenant_quotas_tenant').on(table.tenantId),
    ...createDirectTenantPolicies('tenant_quotas'),
  ],
);

export type TenantQuota = typeof tenantQuotas.$inferSelect;
export type NewTenantQuota = typeof tenantQuotas.$inferInsert;
