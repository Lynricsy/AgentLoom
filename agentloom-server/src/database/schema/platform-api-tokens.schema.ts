import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

/**
 * 平台 API Token 表
 * 用于 Open API 访问认证，每个 token 绑定特定用户与租户。
 * 无 RLS，通过 AuthGuard + Service 层 userId 过滤保证隔离。
 */
export const platformApiTokens = pgTable(
  'platform_api_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    name: varchar('name', { length: 255 }).notNull(),

    /** SHA-256 哈希后的 token，用于验证 */
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),

    /** token 前缀 (al_xxxxxxxx)，用于列表展示识别 */
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),

    /** API Key 的权限范围 */
    scopes: varchar('scopes', { length: 1024 }),

    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    expiresAt: timestamp('expires_at', { withTimezone: true }),

    isRevoked: boolean('is_revoked').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_platform_api_tokens_hash').on(table.tokenHash),
    index('idx_platform_api_tokens_tenant_user_status').on(
      table.tenantId,
      table.userId,
      table.isRevoked,
    ),
    index('idx_platform_api_tokens_prefix').on(table.tokenPrefix),
  ],
);

export type PlatformApiToken = typeof platformApiTokens.$inferSelect;
export type NewPlatformApiToken = typeof platformApiTokens.$inferInsert;
