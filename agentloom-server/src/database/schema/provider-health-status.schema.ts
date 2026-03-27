import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { routerModels } from './router-models.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const PROVIDER_HEALTH_STATUS_STATES = [
  'healthy',
  'degraded',
  'open',
] as const;

export type ProviderHealthState =
  (typeof PROVIDER_HEALTH_STATUS_STATES)[number];

export const providerHealthStatus = pgTable(
  'provider_health_status',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.tenantId, { onDelete: 'cascade' }),

    providerName: varchar('provider_name', { length: 50 }).notNull(),

    modelId: uuid('model_id').references(() => routerModels.id, {
      onDelete: 'cascade',
    }),

    status: varchar('status', { length: 20 })
      .notNull()
      .default('healthy')
      .$type<ProviderHealthState>(),

    failureCount: integer('failure_count').notNull().default(0),

    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),

    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),

    circuitOpenedAt: timestamp('circuit_opened_at', { withTimezone: true }),

    windowStartAt: timestamp('window_start_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_provider_health_status_tenant_provider_model').on(
      table.tenantId,
      table.providerName,
      table.modelId,
    ),
    index('idx_provider_health_status_tenant_id').on(table.tenantId),
    index('idx_provider_health_status_provider_name').on(table.providerName),
    index('idx_provider_health_status_status').on(table.status),
    ...createDirectTenantPolicies('provider_health_status'),
  ],
);

export type ProviderHealthStatus = typeof providerHealthStatus.$inferSelect;
export type NewProviderHealthStatus = typeof providerHealthStatus.$inferInsert;
