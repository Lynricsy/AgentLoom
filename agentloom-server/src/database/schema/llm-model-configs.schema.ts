import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  timestamp,
  unique,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

import { llmProviders } from './llm-providers.schema';
import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const llmModelTypeEnum = pgEnum('llm_model_type', ['chat', 'embedding']);

export const metadataSourceEnum = pgEnum('metadata_source', [
  'api_discovery',
  'litellm',
  'manual',
]);

/**
 * 模型能力标记
 */
export interface ModelCapabilities {
  vision?: boolean;
  functionCalling?: boolean;
  reasoning?: boolean;
  structuredOutput?: boolean;
}

/**
 * 阶梯定价（per 1M tokens, USD）
 */
export interface PricingTier {
  aboveTokens: number;
  inputPer1MTokens: number;
  outputPer1MTokens: number;
  cachedReadPer1MTokens?: number;
  cachedWritePer1MTokens?: number;
}

/**
 * 模型定价结构（支持阶梯 + 缓存读写分离）
 */
export interface ModelPricing {
  inputPer1MTokens: number;
  outputPer1MTokens: number;
  cachedReadPer1MTokens?: number;
  cachedWritePer1MTokens?: number;
  tiers?: PricingTier[];
}

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
    providerId: uuid('provider_id')
      .notNull()
      .references(() => llmProviders.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    modelId: varchar('model_id', { length: 100 }).notNull(),
    modelType: llmModelTypeEnum('model_type').notNull().default('chat'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    capabilities: jsonb('capabilities').$type<ModelCapabilities>().default({}),
    contextWindow: integer('context_window'),
    maxOutputTokens: integer('max_output_tokens'),
    pricing: jsonb('pricing').$type<ModelPricing>(),
    parameters: jsonb('parameters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metadataSource: metadataSourceEnum('metadata_source'),
    embeddingDimensions: integer('embedding_dimensions'),
    timeoutMs: integer('timeout_ms'),
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
    index('idx_llm_model_configs_provider_id').on(table.providerId),
    ...createDirectTenantPolicies('llm_model_configs'),
  ],
);

export type LlmModelConfig = typeof llmModelConfigs.$inferSelect;
export type NewLlmModelConfig = typeof llmModelConfigs.$inferInsert;
