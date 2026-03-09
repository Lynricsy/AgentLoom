import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { workflowDefinitions } from './workflow-definitions.schema';
import type {
  ReactFlowNode,
  ReactFlowEdge,
  ReactFlowViewport,
} from './workflow-definitions.schema';
import { createDirectTenantPolicies } from './rls-policies';

export interface WorkflowVersionSnapshot {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport | null;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    createdFromVersion: number;
    releaseNotes?: string | null;
  };
}

export const workflowVersions = pgTable(
  'workflow_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    versionNumber: integer('version_number').notNull(),

    label: varchar('label', { length: 255 }),

    snapshot: jsonb('snapshot').$type<WorkflowVersionSnapshot>().notNull(),

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
    uniqueIndex('uq_workflow_versions_workflow_version').on(
      table.workflowDefinitionId,
      table.versionNumber,
    ),
    index('idx_workflow_versions_tenant_published').on(
      table.tenantId,
      table.publishedAt,
    ),
    index('idx_workflow_versions_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('workflow_versions'),
  ],
);

export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type NewWorkflowVersion = typeof workflowVersions.$inferInsert;
