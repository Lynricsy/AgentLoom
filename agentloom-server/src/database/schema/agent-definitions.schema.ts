import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  ReactFlowNode,
  ReactFlowEdge,
  ReactFlowViewport,
} from './workflow-definitions.schema';
import { users } from './users.schema';
import type { SandboxConfig } from './sandbox-sessions.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { workspaceSnapshots } from './workspace-snapshots.schema';

export const agentStatusEnum = pgEnum('agent_status_enum', [
  'draft',
  'published',
  'archived',
]);

export const agentDefinitions = pgTable(
  'agent_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),

    systemPrompt: text('system_prompt'),

    nodes: jsonb('nodes').$type<ReactFlowNode[]>().notNull().default([]),
    edges: jsonb('edges').$type<ReactFlowEdge[]>().notNull().default([]),
    viewport: jsonb('viewport').$type<ReactFlowViewport>(),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    sandboxConfig: jsonb('sandbox_config')
      .$type<SandboxConfig | null>()
      .default(null),

    workspaceSnapshotId: uuid('workspace_snapshot_id').references(
      () => workspaceSnapshots.id,
      { onDelete: 'set null' },
    ),

    version: integer('version').notNull().default(1),
    status: agentStatusEnum('status').notNull().default('draft'),

    publishedVersionId: uuid('published_version_id'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_agent_definitions_tenant_slug').on(
      table.tenantId,
      table.slug,
    ),
    index('idx_agent_definitions_tenant_updated').on(
      table.tenantId,
      table.updatedAt,
    ),
    index('idx_agent_definitions_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_agent_definitions_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('agent_definitions'),
  ],
);

export type AgentDefinition = typeof agentDefinitions.$inferSelect;
export type NewAgentDefinition = typeof agentDefinitions.$inferInsert;

export interface AgentVersionSnapshot {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport | null;
  systemPrompt?: string | null;
  sandboxConfig?: SandboxConfig | null;
  workspaceSnapshotId?: string | null;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    createdFromVersion: number;
    releaseNotes?: string | null;
  };
}

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    versionNumber: integer('version_number').notNull(),

    label: varchar('label', { length: 255 }),

    snapshot: jsonb('snapshot').$type<AgentVersionSnapshot>().notNull(),

    publishedAt: timestamp('published_at', { withTimezone: true }),

    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_agent_versions_agent_version').on(
      table.agentDefinitionId,
      table.versionNumber,
    ),
    index('idx_agent_versions_tenant_published').on(
      table.tenantId,
      table.publishedAt,
    ),
    index('idx_agent_versions_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('agent_versions'),
  ],
);

export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
