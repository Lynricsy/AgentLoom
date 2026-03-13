import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea } from './api-keys.schema';
import { organizations } from './organizations.schema';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';
export const mcpTransportTypeEnum = pgEnum('mcp_transport_type', [
  'stdio',
  'sse',
  'streamable_http',
]);
export const mcpServerStatusEnum = pgEnum('mcp_server_status', [
  'active',
  'inactive',
  'error',
]);
export const mcpServerConfigs = pgTable(
  'mcp_server_configs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    transportType: mcpTransportTypeEnum('transport_type').notNull(),
    // stdio 传输字段
    command: text('command'),
    args: jsonb('args').$type<string[]>(),
    // HTTP 传输字段（SSE / Streamable HTTP）
    url: text('url'),
    connectionFingerprint: text('connection_fingerprint'),
    // 信封加密字段 — 存储加密的环境变量（stdio）或 HTTP 头部
    encryptedData: bytea('encrypted_data'),
    encryptedDek: bytea('encrypted_dek'),
    iv: bytea('iv'),
    authTag: bytea('auth_tag'),
    status: mcpServerStatusEnum('status').notNull().default('active'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_mcp_server_configs_tenant_id').on(table.tenantId),
    index('idx_mcp_server_configs_org_id').on(table.organizationId),
    index('idx_mcp_server_configs_created_by').on(table.createdBy),
    uniqueIndex('uq_mcp_server_configs_tenant_fingerprint').on(
      table.tenantId,
      table.connectionFingerprint,
    ),
    ...createDirectTenantPolicies('mcp_server_configs'),
  ],
);

export type McpServerConfig = typeof mcpServerConfigs.$inferSelect;
export type NewMcpServerConfig = typeof mcpServerConfigs.$inferInsert;
