import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgEnum,
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

export const apiProtocolEnum = pgEnum('api_protocol', [
  'openai_chat',
  'openai_responses',
  'anthropic',
  'google',
  'cohere',
]);

export const llmProviders = pgTable(
  'llm_providers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    slug: varchar('slug', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    iconUrl: varchar('icon_url', { length: 2048 }),
    baseUrl: varchar('base_url', { length: 2048 }),
    defaultBaseUrl: varchar('default_base_url', { length: 2048 }),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    isEnabled: boolean('is_enabled').notNull().default(true),
    apiProtocol: apiProtocolEnum('api_protocol')
      .notNull()
      .default('openai_chat'),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('uq_llm_providers_org_slug').on(table.orgId, table.slug),
    index('idx_llm_providers_org_id').on(table.orgId),
    index('idx_llm_providers_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('llm_providers'),
  ],
);

export type LlmProvider = typeof llmProviders.$inferSelect;
export type NewLlmProvider = typeof llmProviders.$inferInsert;
