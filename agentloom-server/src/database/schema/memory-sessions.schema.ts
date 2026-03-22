import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { agentConversations } from './agent-conversations.schema';
import { agentMemoryInstances } from './agent-memory-instances.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { workflowExecutions } from './workflow-executions.schema';

export const memorySessionRoleEnum = pgEnum('memory_session_role_enum', [
  'primary',
  'readonly',
]);

export const memorySessionStatusEnum = pgEnum('memory_session_status_enum', [
  'active',
  'disconnected',
  'expired',
]);

export interface MemorySessionConfig {
  bootUris: string[];
  fusionPriority: number;
}

export const memorySessions = pgTable(
  'memory_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    memoryInstanceId: uuid('memory_instance_id')
      .notNull()
      .references(() => agentMemoryInstances.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id').references(() => workflowExecutions.id, {
      onDelete: 'cascade',
    }),
    agentConversationId: uuid('agent_conversation_id').references(
      () => agentConversations.id,
      { onDelete: 'cascade' },
    ),
    role: memorySessionRoleEnum('role').notNull().default('primary'),
    status: memorySessionStatusEnum('status').notNull().default('active'),
    config: jsonb('config').$type<MemorySessionConfig>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_memory_sessions_instance_execution_active')
      .on(table.memoryInstanceId, table.executionId)
      .where(sql`status = 'active'`),
    uniqueIndex('uq_memory_sessions_instance_conversation_active')
      .on(table.memoryInstanceId, table.agentConversationId)
      .where(sql`status = 'active'`),
    index('idx_memory_sessions_execution_id').on(table.executionId),
    index('idx_memory_sessions_agent_conversation_id').on(
      table.agentConversationId,
    ),
    index('idx_memory_sessions_instance_status').on(
      table.memoryInstanceId,
      table.status,
    ),
    check(
      'chk_memory_sessions_fk',
      sql`execution_id IS NOT NULL OR agent_conversation_id IS NOT NULL`,
    ),
    ...createDirectTenantPolicies('memory_sessions'),
  ],
);

export type MemorySession = typeof memorySessions.$inferSelect;
export type NewMemorySession = typeof memorySessions.$inferInsert;
