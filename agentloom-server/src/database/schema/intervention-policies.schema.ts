import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';
import { workflowDefinitions } from './workflow-definitions.schema';

// 解析优先级: node-level → workflow-level → SYSTEM_DEFAULT_POLICY
export const interventionPolicies = pgTable(
  'intervention_policies',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    nodeId: varchar('node_id', { length: 255 }),

    allowedRoles: text('allowed_roles')
      .array()
      .notNull()
      .default(sql`'{"owner","admin"}'::text[]`),

    timeoutSeconds: integer('timeout_seconds').notNull().default(86400),

    timeoutAction: varchar('timeout_action', { length: 20 })
      .notNull()
      .default('reject'),

    escalateToRole: varchar('escalate_to_role', { length: 50 }),

    notifyChannels: text('notify_channels')
      .array()
      .notNull()
      .default(sql`'{"in_app"}'::text[]`),

    isActive: boolean('is_active').notNull().default(true),

    version: integer('version').notNull().default(1),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_intervention_policies_workflow_node').on(
      table.workflowId,
      sql`COALESCE(${table.nodeId}, '__workflow_level__')`,
    ),
    index('idx_intervention_policies_workflow').on(table.workflowId),
    index('idx_intervention_policies_tenant').on(table.tenantId),
    ...createDirectTenantPolicies('intervention_policies'),
  ],
);

export type InterventionPolicy = typeof interventionPolicies.$inferSelect;
export type NewInterventionPolicy = typeof interventionPolicies.$inferInsert;
