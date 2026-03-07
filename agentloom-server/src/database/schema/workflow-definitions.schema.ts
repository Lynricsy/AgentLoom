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
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export interface ReactFlowPosition {
  x: number;
  y: number;
}

/** @see https://reactflow.dev/api-reference/types/node */
export interface ReactFlowNode {
  id: string;
  type?: string;
  position: ReactFlowPosition;
  data: Record<string, unknown>;
  width?: number;
  height?: number;
  selected?: boolean;
  dragging?: boolean;
  parentId?: string;
  expandParent?: boolean;
  extent?: 'parent' | [ReactFlowPosition, ReactFlowPosition];
  sourcePosition?: 'top' | 'right' | 'bottom' | 'left';
  targetPosition?: 'top' | 'right' | 'bottom' | 'left';
  hidden?: boolean;
  zIndex?: number;
  className?: string;
  style?: Record<string, unknown>;
}

/** @see https://reactflow.dev/api-reference/types/edge */
export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  data?: Record<string, unknown>;
  selected?: boolean;
  hidden?: boolean;
  label?: string;
  labelStyle?: Record<string, unknown>;
  labelBgStyle?: Record<string, unknown>;
  style?: Record<string, unknown>;
  className?: string;
  zIndex?: number;
  markerStart?: string | Record<string, unknown>;
  markerEnd?: string | Record<string, unknown>;
}

/** @see https://reactflow.dev/api-reference/types/viewport */
export interface ReactFlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export const workflowStatusEnum = pgEnum('workflow_status_enum', [
  'draft',
  'published',
  'archived',
]);

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),

    nodes: jsonb('nodes').$type<ReactFlowNode[]>().notNull().default([]),
    edges: jsonb('edges').$type<ReactFlowEdge[]>().notNull().default([]),
    viewport: jsonb('viewport').$type<ReactFlowViewport>(),

    version: integer('version').notNull().default(1),
    status: workflowStatusEnum('status').notNull().default('draft'),

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
    uniqueIndex('uq_workflow_definitions_tenant_slug').on(
      table.tenantId,
      table.slug,
    ),
    index('idx_workflow_definitions_tenant_updated').on(
      table.tenantId,
      table.updatedAt,
    ),
    index('idx_workflow_definitions_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_workflow_definitions_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('workflow_definitions'),
  ],
);

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type NewWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
