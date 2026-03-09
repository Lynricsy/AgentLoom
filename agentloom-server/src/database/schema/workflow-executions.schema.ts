import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  jsonb,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { workflowDefinitions } from './workflow-definitions.schema';
import { workflowVersions } from './workflow-versions.schema';
import type { WorkflowVersionSnapshot } from './workflow-versions.schema';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const executionStatusEnum = pgEnum('execution_status_enum', [
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

export const executionTriggerTypeEnum = pgEnum('execution_trigger_type_enum', [
  'manual',
  'api',
  'webhook',
  'system',
]);

export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => workflowVersions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    status: executionStatusEnum('status').notNull().default('pending'),

    triggerType: executionTriggerTypeEnum('trigger_type')
      .notNull()
      .default('manual'),

    inputParams: jsonb('input_params')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    definitionSnapshot: jsonb('definition_snapshot')
      .$type<WorkflowVersionSnapshot>()
      .notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    failedAt: timestamp('failed_at', { withTimezone: true }),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    errorMessage: jsonb('error_message').$type<{
      message: string;
      stack?: string;
    }>(),

    totalSteps: integer('total_steps').notNull().default(0),

    completedSteps: integer('completed_steps').notNull().default(0),

    createdBy: uuid('created_by')
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
    index('idx_workflow_executions_tenant_id').on(table.tenantId),
    index('idx_workflow_executions_workflow_definition').on(
      table.workflowDefinitionId,
    ),
    index('idx_workflow_executions_status').on(table.tenantId, table.status),
    index('idx_workflow_executions_created_at').on(
      table.tenantId,
      table.createdAt,
    ),
    ...createDirectTenantPolicies('workflow_executions'),
  ],
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
