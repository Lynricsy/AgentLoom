import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

import { apiKeys } from './api-keys.schema';
import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const llmModelConfigs = pgTable(
  'llm_model_configs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 30 }).notNull(),
    modelName: varchar('model_name', { length: 100 }).notNull(),
    parameters: jsonb('parameters').notNull().default({}),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    endpointUrl: varchar('endpoint_url', { length: 2048 }),
    authMethod: varchar('auth_method', { length: 20 }),
    authConfig: jsonb('auth_config'),
    timeoutMs: integer('timeout_ms'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('uq_llm_model_configs_org_name').on(table.orgId, table.name),
    index('idx_llm_model_configs_org_id').on(table.orgId),
    index('idx_llm_model_configs_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('llm_model_configs'),
  ],
);

export type LlmModelConfig = typeof llmModelConfigs.$inferSelect;
export type NewLlmModelConfig = typeof llmModelConfigs.$inferInsert;
