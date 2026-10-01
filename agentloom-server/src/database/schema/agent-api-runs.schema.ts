import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { agentApiKeys } from './agent-api-keys.schema';
import {
  agentConversations,
  agentMessages,
} from './agent-conversations.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const agentApiRunStatusEnum = pgEnum('agent_api_run_status_enum', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/** run 失败原因，字段与 RFC 9457 problem 的 type/title/detail 对齐 */
export interface AgentApiRunError {
  type: string;
  title: string;
  detail?: string;
}

/**
 * 对外 API 的一次调用：一条用户输入 → 一次 assistant 回复。
 * 部分唯一索引保证同一对话同一时刻至多一个 queued/running 的 run。
 */
export const agentApiRuns = pgTable(
  'agent_api_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),

    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => agentApiKeys.id),

    userMessageId: uuid('user_message_id')
      .notNull()
      .references(() => agentMessages.id, { onDelete: 'cascade' }),

    assistantMessageId: uuid('assistant_message_id').references(
      () => agentMessages.id,
      { onDelete: 'set null' },
    ),

    /** 实际执行的已发布版本，进入 running 时写入 */
    agentVersionId: uuid('agent_version_id'),

    status: agentApiRunStatusEnum('status').notNull().default('queued'),

    stopReason: varchar('stop_reason', { length: 32 }),

    error: jsonb('error').$type<AgentApiRunError | null>().default(null),

    idempotencyKey: varchar('idempotency_key', { length: 255 }),

    /** 请求体 SHA-256，用于判定同一 Idempotency-Key 是否配了不同 body */
    requestHash: varchar('request_hash', { length: 64 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_agent_api_runs_user_message').on(table.userMessageId),
    uniqueIndex('uq_agent_api_runs_active_conversation')
      .on(table.conversationId)
      .where(sql`${table.status} in ('queued', 'running')`),
    uniqueIndex('uq_agent_api_runs_idempotency')
      .on(table.apiKeyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('idx_agent_api_runs_key_status').on(table.apiKeyId, table.status),
    index('idx_agent_api_runs_conversation_created').on(
      table.conversationId,
      table.createdAt,
    ),
    index('idx_agent_api_runs_status_created').on(
      table.status,
      table.createdAt,
    ),
    ...createDirectTenantPolicies('agent_api_runs'),
  ],
);

export type AgentApiRun = typeof agentApiRuns.$inferSelect;
export type NewAgentApiRun = typeof agentApiRuns.$inferInsert;
