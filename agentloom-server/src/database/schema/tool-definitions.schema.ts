import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.schema';
import { mcpServerConfigs } from './mcp-server-configs.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const toolSourceEnum = pgEnum('tool_source', [
  'mcp',
  'builtin',
  'custom',
]);

export const toolDefinitions = pgTable(
  'tool_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    mcpServerConfigId: uuid('mcp_server_config_id').references(
      () => mcpServerConfigs.id,
      { onDelete: 'set null' },
    ),
    source: toolSourceEnum('source').notNull().default('mcp'),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),
    inputSchema: jsonb('input_schema'),
    outputSchema: jsonb('output_schema'),
    portMappingMetadata: jsonb('port_mapping_metadata'),
    annotations: jsonb('annotations'),
    isActive: boolean('is_active').notNull().default(true),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_tool_definitions_tenant_id').on(table.tenantId),
    index('idx_tool_definitions_org_id').on(table.organizationId),
    index('idx_tool_definitions_mcp_server_config_id').on(
      table.mcpServerConfigId,
    ),
    index('idx_tool_definitions_source').on(table.source),
    uniqueIndex('uq_tool_definitions_active_mcp_identity')
      .on(table.tenantId, table.mcpServerConfigId, table.name)
      .where(sql`${table.source} = 'mcp' AND ${table.isActive} = true`),
    ...createDirectTenantPolicies('tool_definitions'),
  ],
);

export type ToolDefinition = typeof toolDefinitions.$inferSelect;
export type NewToolDefinition = typeof toolDefinitions.$inferInsert;
