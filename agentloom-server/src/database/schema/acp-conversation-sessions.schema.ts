import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ConversationReplayEntry } from '../../modules/agent/types/conversation-history.types';
import { createDirectTenantPolicies } from './rls-policies';

export const acpConversationSessions = pgTable(
  'acp_conversation_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: text('agent_id').notNull(),
    sessionSnapshot: jsonb('session_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    replayEntries: jsonb('replay_entries')
      .$type<ConversationReplayEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_acp_conversation_sessions_tenant').on(table.tenantId),
    index('idx_acp_conversation_sessions_agent').on(table.agentId),
    ...createDirectTenantPolicies('acp_conversation_sessions'),
  ],
);

export type AcpConversationSession =
  typeof acpConversationSessions.$inferSelect;
export type NewAcpConversationSession =
  typeof acpConversationSessions.$inferInsert;
