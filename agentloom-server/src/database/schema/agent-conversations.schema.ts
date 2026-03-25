import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { agentDefinitions } from './agent-definitions.schema';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const conversationStatusEnum = pgEnum('conversation_status_enum', [
  'active',
  'paused',
  'ended',
  'failed',
]);

export const messageRoleEnum = pgEnum('message_role_enum', [
  'user',
  'assistant',
  'system',
  'tool',
]);

export const messageContentTypeEnum = pgEnum('message_content_type_enum', [
  'text',
  'image',
  'file',
  'tool_call',
  'tool_result',
  'system',
]);

export const agentConversations = pgTable(
  'agent_conversations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    title: varchar('title', { length: 255 }),

    status: conversationStatusEnum('status').notNull().default('active'),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

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
    index('idx_agent_conversations_agent_id').on(table.agentDefinitionId),
    index('idx_agent_conversations_tenant_updated').on(
      table.tenantId,
      table.updatedAt,
    ),
    index('idx_agent_conversations_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    ...createDirectTenantPolicies('agent_conversations'),
  ],
);

export type AgentConversation = typeof agentConversations.$inferSelect;
export type NewAgentConversation = typeof agentConversations.$inferInsert;

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    role: messageRoleEnum('role').notNull(),

    contentType: messageContentTypeEnum('content_type').notNull().default('text'),

    content: text('content').notNull(),

    toolCalls: jsonb('tool_calls')
      .$type<Record<string, unknown>[] | null>()
      .default(null),

    toolResults: jsonb('tool_results')
      .$type<Record<string, unknown>[] | null>()
      .default(null),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    parentMessageId: uuid('parent_message_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentMessageId],
      foreignColumns: [table.id],
    }),
    index('idx_agent_messages_conversation_id').on(table.conversationId),
    index('idx_agent_messages_tenant_created').on(
      table.tenantId,
      table.createdAt,
    ),
    ...createDirectTenantPolicies('agent_messages'),
  ],
);

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
