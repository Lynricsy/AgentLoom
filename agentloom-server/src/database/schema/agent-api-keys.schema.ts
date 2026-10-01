import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { agentDefinitions } from './agent-definitions.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

/**
 * Agent 专用 API Key 表
 *
 * 每个 Key 只绑定一个 Agent，以服务身份调用 `/agent-api/**` 对外接口。
 * 校验发生在租户上下文建立之前，因此由 AgentApiKeyGuard 经 globalDb 按 key_hash 查找；
 * 管理接口走租户事务，受 RLS 约束。
 */
export const agentApiKeys = pgTable(
  'agent_api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),

    /** SHA-256(hex) 后的明文 key */
    keyHash: varchar('key_hash', { length: 64 }).notNull(),

    /** `alak_` + 8 位 hex，用于展示与节流 tracker */
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),

    /** 为 null 时使用租户 apiRateLimitPerMinute */
    rateLimitPerMinute: integer('rate_limit_per_minute'),

    maxConcurrentRuns: integer('max_concurrent_runs').notNull().default(5),

    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    /** 创建人被删除后 Key 继续有效 */
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_agent_api_keys_hash').on(table.keyHash),
    index('idx_agent_api_keys_agent_revoked').on(
      table.agentDefinitionId,
      table.revokedAt,
    ),
    index('idx_agent_api_keys_prefix').on(table.keyPrefix),
    ...createDirectTenantPolicies('agent_api_keys'),
  ],
);

export type AgentApiKey = typeof agentApiKeys.$inferSelect;
export type NewAgentApiKey = typeof agentApiKeys.$inferInsert;
