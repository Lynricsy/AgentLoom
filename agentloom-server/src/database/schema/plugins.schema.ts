import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
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

export const pluginStatusEnum = pgEnum('plugin_status', [
  'registered',
  'active',
  'disabled',
  'error',
]);

export const plugins = pgTable(
  'plugins',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    pluginId: varchar('plugin_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    description: text('description'),
    license: varchar('license', { length: 100 }),
    status: pluginStatusEnum('status').notNull().default('registered'),
    manifest: jsonb('manifest').notNull().$type<Record<string, unknown>>(),
    nodeDefinitions: jsonb('node_definitions')
      .notNull()
      .$type<Array<Record<string, unknown>>>()
      .default(sql`'[]'::jsonb`),
    storageKey: varchar('storage_key', { length: 500 }),
    signature: text('signature'),
    contentHash: varchar('content_hash', { length: 64 }),
    wasmBundleUrl: varchar('wasm_bundle_url', { length: 512 }),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    installedBy: uuid('installed_by').references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occVersion: integer('occ_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('plugins_org_plugin_id_idx').on(table.orgId, table.pluginId),
    index('plugins_tenant_status_idx').on(table.tenantId, table.status),
    index('plugins_installed_by_idx').on(table.installedBy),
    ...createDirectTenantPolicies('plugins'),
  ],
);

export type PluginRecord = typeof plugins.$inferSelect;
export type NewPlugin = typeof plugins.$inferInsert;
