import type { TeamFailureReason, TeamNodeConfig } from '@agentloom/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { executionSteps } from './execution-steps.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { workflowExecutions } from './workflow-executions.schema';

export const teamRunStatusEnum = pgEnum('team_run_status_enum', [
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * 工作流 `team` 节点的一次团队运行。
 *
 * 同一步骤同时只能有一个 running 的运行（部分唯一索引）；恢复重跑会新建一行，
 * 旧行保留为历史。预算与累计用量都落在本行，由 TeamRunService 在事务内递增。
 */
export const teamRuns = pgTable(
  'team_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => executionSteps.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    status: teamRunStatusEnum('status').notNull().default('running'),
    /** 启动时解析后的节点配置快照 */
    config: jsonb('config').$type<TeamNodeConfig>().notNull(),
    taskText: text('task_text').notNull(),
    /** context-in 端口输入；超过上限时截断为 { truncated: true, text } */
    context: jsonb('context').$type<unknown>(),
    budgetMaxTotalTokens: integer('budget_max_total_tokens').notNull(),
    budgetMaxMessages: integer('budget_max_messages').notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    usedInputTokens: bigint('used_input_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    usedOutputTokens: bigint('used_output_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    usedCostUsd: numeric('used_cost_usd', {
      precision: 14,
      scale: 6,
      mode: 'number',
    })
      .notNull()
      .default(0),
    /** 已入库的未抑制消息数（按接收者计） */
    messageCount: integer('message_count').notNull().default(0),
    nudgeCount: integer('nudge_count').notNull().default(0),
    schemaInvalidCount: integer('schema_invalid_count').notNull().default(0),
    /** lead 经 team_submit_result 提交的结果 */
    result: jsonb('result').$type<Record<string, unknown>>(),
    failureReason: varchar('failure_reason', {
      length: 40,
    }).$type<TeamFailureReason>(),
    failureDetail: text('failure_detail'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_team_runs_execution_id').on(table.executionId),
    index('idx_team_runs_tenant_status').on(table.tenantId, table.status),
    uniqueIndex('uq_team_runs_running_step')
      .on(table.stepId)
      .where(sql`${table.status} = 'running'`),
    ...createDirectTenantPolicies('team_runs'),
  ],
);

export type TeamRun = typeof teamRuns.$inferSelect;
export type NewTeamRun = typeof teamRuns.$inferInsert;
