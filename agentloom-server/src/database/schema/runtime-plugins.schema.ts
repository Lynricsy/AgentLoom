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

export const runtimePluginStatusEnum = pgEnum('runtime_plugin_status', [
  'registered',
  'active',
  'disabled',
]);

/**
 * sandbox 运行态 dsh（DeepSeek Harness）runtime 插件包。
 *
 * 与节点插件（plugins 表，WASM）不同：runtime 插件是在 microVM 内 dsh 子进程中
 * 以 Cordis 插件形式加载的 ESM 代码包，按 (org, pluginId, version) 唯一。
 */
export const runtimePlugins = pgTable(
  'runtime_plugins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** manifest.id（reverse-domain） */
    pluginId: varchar('plugin_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    description: text('description'),
    license: varchar('license', { length: 100 }),
    status: runtimePluginStatusEnum('status').notNull().default('registered'),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    /** manifest.runtime.patch 指向的 cordis.patch.yml 原文 */
    bundlePatch: text('bundle_patch').notNull(),
    /** 插件声明的 config JSON Schema（manifest.runtime.configSchema），面板按此渲染 */
    configSchema: jsonb('config_schema').$type<Record<string, unknown>>(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    signature: text('signature').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    installedBy: uuid('installed_by').references(() => users.id),
    occVersion: integer('occ_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('runtime_plugins_org_plugin_id_version_idx').on(
      table.orgId,
      table.pluginId,
      table.version,
    ),
    index('runtime_plugins_tenant_status_idx').on(table.tenantId, table.status),
    ...createDirectTenantPolicies('runtime_plugins'),
  ],
);

export type RuntimePluginRecord = typeof runtimePlugins.$inferSelect;
export type NewRuntimePlugin = typeof runtimePlugins.$inferInsert;
