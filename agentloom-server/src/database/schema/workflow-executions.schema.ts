import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  jsonb,
  timestamp,
  integer,
  index,
  check,
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

/**
 * 执行所运行定义的来源。
 * - `version`：运行某个工作流版本的快照（发布版本，或评测指定的候选版本），`workflow_version_id` 指向该版本。
 * - `draft`：Studio 以当前画布草稿运行，没有对应版本，`workflow_version_id` 为 NULL；
 *   实际运行的定义只在 `definition_snapshot` 中。
 */
export const executionDefinitionSourceEnum = pgEnum(
  'execution_definition_source_enum',
  ['version', 'draft'],
);

export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

    // 草稿运行（definitionSource = 'draft'）没有版本，为 NULL；
    // resume/retry 一律以 definitionSnapshot 为准，不回读版本。
    workflowVersionId: uuid('workflow_version_id').references(
      () => workflowVersions.id,
      { onDelete: 'cascade' },
    ),

    definitionSource: executionDefinitionSourceEnum('definition_source')
      .notNull()
      .default('version'),

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
    index('idx_workflow_executions_workflow_version').on(
      table.workflowVersionId,
    ),
    check(
      'chk_workflow_executions_definition_source_version',
      sql`(${table.definitionSource} = 'draft') = (${table.workflowVersionId} IS NULL)`,
    ),
    ...createDirectTenantPolicies('workflow_executions'),
  ],
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
