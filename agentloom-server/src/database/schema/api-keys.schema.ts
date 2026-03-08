import { sql } from 'drizzle-orm';
import {
  boolean,
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.schema';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

/**
 * bytea 自定义类型 — 用于存储加密数据的二进制字段
 * 支持 Buffer 和 PostgreSQL bytea hex 格式之间的转换
 */
export const bytea = customType<{ data: Buffer; driverParam: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') {
      // PostgreSQL bytea hex 格式: \x...
      if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
      return Buffer.from(value, 'hex');
    }
    throw new Error(`无法将值转换为 Buffer: ${typeof value}`);
  },
});

export const apiKeyStatusEnum = pgEnum('api_key_status', [
  'active',
  'revoked',
  'expired',
]);

export const llmProviderEnum = pgEnum('llm_provider', [
  'openai',
  'anthropic',
  'google',
  'azure-openai',
  'cohere',
  'mistral',
  'deepseek',
  'groq',
]);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: llmProviderEnum('provider').notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    keyPreview: varchar('key_preview', { length: 10 }).notNull(),
    // 信封加密字段 — 撤销时置空
    encryptedKey: bytea('encrypted_key'),
    encryptedDek: bytea('encrypted_dek'),
    iv: bytea('iv'),
    authTag: bytea('auth_tag'),
    isDefault: boolean('is_default').notNull().default(false),
    status: apiKeyStatusEnum('status').notNull().default('active'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_api_keys_tenant_id').on(table.tenantId),
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_user_id').on(table.userId),
    index('idx_api_keys_status').on(table.status),
    index('idx_api_keys_provider').on(table.provider),
    index('idx_api_keys_org_default').on(table.organizationId, table.isDefault),
    ...createDirectTenantPolicies('api_keys'),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
