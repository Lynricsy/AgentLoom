import { sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const pluginDeveloperKeyStatusEnum = pgEnum('plugin_developer_key_status', [
  'active',
  'revoked',
]);

export const pluginDeveloperKeys = pgTable(
  'plugin_developer_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    publicKey: text('public_key').notNull(),
    keyFingerprint: varchar('key_fingerprint', { length: 64 }).notNull(),
    label: varchar('label', { length: 255 }),
    status: pluginDeveloperKeyStatusEnum('status').notNull().default('active'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_plugin_developer_keys_org_fingerprint').on(
      table.orgId,
      table.keyFingerprint,
    ),
    index('idx_plugin_developer_keys_tenant_id').on(table.tenantId),
    index('idx_plugin_developer_keys_user_id').on(table.userId),
    index('idx_plugin_developer_keys_status').on(table.status),
    ...createDirectTenantPolicies('plugin_developer_keys'),
  ],
);

export type PluginDeveloperKey = typeof pluginDeveloperKeys.$inferSelect;
export type NewPluginDeveloperKey = typeof pluginDeveloperKeys.$inferInsert;
