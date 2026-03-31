import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { llmModelConfigs } from './llm-model-configs.schema';
import { createDirectTenantPolicies } from './rls-policies';

/**
 * 用户偏好设置表 - 每用户每租户一条记录
 * 使用 jsonb preferences 字段实现可扩展设计
 */
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    /** 标题生成使用的 LLM 模型配置，nullable 时 fallback 到组织默认模型 */
    titleModelConfigId: uuid('title_model_config_id').references(
      () => llmModelConfigs.id,
      { onDelete: 'set null' },
    ),

    /** 可扩展的 jsonb 偏好字段，用于未来扩展 */
    preferences: jsonb('preferences')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_preferences_user_tenant').on(
      table.userId,
      table.tenantId,
    ),
    index('idx_user_preferences_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('user_preferences'),
  ],
);

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
