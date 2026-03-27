import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { llmModelConfigs } from './llm-model-configs.schema';
import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';

export interface RouterModelRoutingMeta {
  contextWindow: number;
  costs: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
  };
  qualityRank: number;
  avgLatencyMs: number;
  maxInputTokens: number;
}

export const routerModels = pgTable(
  'router_models',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.tenantId, { onDelete: 'cascade' }),

    modelId: uuid('model_id')
      .notNull()
      .references(() => llmModelConfigs.id, { onDelete: 'cascade' }),

    providerName: varchar('provider_name', { length: 50 }).notNull(),

    routingMeta: jsonb('routing_meta')
      .notNull()
      .$type<RouterModelRoutingMeta>(),

    eloRating: numeric('elo_rating', { precision: 10, scale: 4 })
      .notNull()
      .default('1500'),

    totalMatches: integer('total_matches').notNull().default(0),

    isActive: boolean('is_active').notNull().default(true),

    occVersion: integer('occ_version').notNull().default(0),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_router_models_tenant_model').on(
      table.tenantId,
      table.modelId,
    ),
    index('idx_router_models_tenant_id').on(table.tenantId),
    index('idx_router_models_provider_name').on(table.providerName),
    index('idx_router_models_is_active').on(table.isActive),
    ...createDirectTenantPolicies('router_models'),
  ],
);

export type RouterModel = typeof routerModels.$inferSelect;
export type NewRouterModel = typeof routerModels.$inferInsert;
