import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  jsonb,
  timestamp,
  integer,
  index,
  text,
} from 'drizzle-orm/pg-core';
import { createJoinTenantPolicies } from './rls-policies';
import { workflowExecutions } from './workflow-executions.schema';

export interface ExecutionStepAttemptError {
  attempt: number;
  error: string;
  timestamp: string;
}

export interface TypeMismatchInfo {
  sourcePortId: string;
  targetPortId: string;
  sourceType: string;
  targetType: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeId?: string;
}

export interface ExecutionStepErrorMessage {
  message: string;
  type?: string;
  title?: string;
  detail?: string;
  nodeId?: string;
  stack?: string;
  attempts?: ExecutionStepAttemptError[];
  typeMismatch?: TypeMismatchInfo;
}

export const stepStatusEnum = pgEnum('step_status_enum', [
  'pending',
  'queued',
  'running',
  'waiting_intervention',
  'completed',
  'failed',
  'skipped',
  'cancelled',
]);

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),

    nodeId: text('node_id').notNull(),

    stepOrder: integer('step_order').notNull(),

    status: stepStatusEnum('status').notNull().default('pending'),

    nodeType: jsonb('node_type').$type<string>(),

    nodeData: jsonb('node_data').$type<Record<string, unknown>>(),

    input: jsonb('input').$type<Record<string, unknown>>(),

    result: jsonb('result').$type<Record<string, unknown>>(),

    attemptCount: integer('attempt_count').notNull().default(0),

    checkpointData: jsonb('checkpoint_data').$type<Record<string, unknown>>(),

    errorMessage: jsonb('error_message').$type<ExecutionStepErrorMessage>(),

    startedAt: timestamp('started_at', { withTimezone: true }),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_execution_steps_execution_id').on(table.executionId),
    index('idx_execution_steps_status').on(table.executionId, table.status),
    ...createJoinTenantPolicies(
      'execution_steps',
      'execution_id',
      'workflow_executions',
    ),
  ],
);

export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
