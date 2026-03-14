import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workflowDefinitions } from './workflow-definitions.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const triggerTypeEnum = pgEnum('trigger_type_enum', [
  'cron',
  'webhook',
  'api_event',
]);

export interface CronTriggerConfig {
  expression: string;
  timezone: string;
}

export interface WebhookTriggerConfig {
  token: string;
  secret: string;
  ipWhitelist: string[];
}

export interface ApiEventTriggerConfig {
  eventSource: string;
  eventType: string;
  filterExpression?: string;
}

export type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | ApiEventTriggerConfig;

export const workflowTriggers = pgTable(
  'workflow_triggers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    type: triggerTypeEnum('type').notNull(),
    config: jsonb('config').$type<TriggerConfig>().notNull(),

    isEnabled: boolean('is_enabled').notNull().default(true),

    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    nextFireAt: timestamp('next_fire_at', { withTimezone: true }),
    triggerCount: integer('trigger_count').notNull().default(0),

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
    index('idx_workflow_triggers_workflow_id').on(table.workflowDefinitionId),
    index('idx_workflow_triggers_tenant_id').on(table.tenantId),
    index('idx_workflow_triggers_type').on(table.tenantId, table.type),
    index('idx_workflow_triggers_enabled').on(
      table.tenantId,
      table.isEnabled,
    ),
    ...createDirectTenantPolicies('workflow_triggers'),
  ],
);

export type WorkflowTrigger = typeof workflowTriggers.$inferSelect;
export type NewWorkflowTrigger = typeof workflowTriggers.$inferInsert;

export const triggerHistoryStatusEnum = pgEnum('trigger_history_status_enum', [
  'success',
  'failed',
  'skipped',
  'signature_failed',
]);

export const workflowTriggerHistory = pgTable(
  'workflow_trigger_history',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    triggerId: uuid('trigger_id')
      .notNull()
      .references(() => workflowTriggers.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    status: triggerHistoryStatusEnum('status').notNull(),

    executionId: uuid('execution_id'),
    errorMessage: text('error_message'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),

    triggeredAt: timestamp('triggered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_trigger_history_trigger_id').on(table.triggerId),
    index('idx_trigger_history_tenant_id').on(table.tenantId),
    index('idx_trigger_history_triggered_at').on(
      table.triggerId,
      table.triggeredAt,
    ),
    ...createDirectTenantPolicies('workflow_trigger_history'),
  ],
);

export type WorkflowTriggerHistory =
  typeof workflowTriggerHistory.$inferSelect;
export type NewWorkflowTriggerHistory =
  typeof workflowTriggerHistory.$inferInsert;
