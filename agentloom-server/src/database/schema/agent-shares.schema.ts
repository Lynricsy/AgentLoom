import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { shareTypeEnum } from './workflow-shares.schema';
import { users } from './users.schema';
import { agentDefinitions } from './agent-definitions.schema';

export const agentShares = pgTable(
  'agent_shares',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    shareToken: text('share_token').notNull(),

    shareType: shareTypeEnum('share_type').notNull().default('read_only'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    expiresAt: timestamp('expires_at', { withTimezone: true }),

    isRevoked: boolean('is_revoked').notNull().default(false),

    viewCount: integer('view_count').notNull().default(0),

    copyCount: integer('copy_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_agent_shares_token').on(table.shareToken),
    index('idx_agent_shares_agent_definition').on(table.agentDefinitionId),
    index('idx_agent_shares_tenant_id').on(table.tenantId),
    index('idx_agent_shares_created_by').on(table.createdBy),
    check('agent_shares_view_count_non_negative', sql`${table.viewCount} >= 0`),
    check('agent_shares_copy_count_non_negative', sql`${table.copyCount} >= 0`),
  ],
);

export type AgentShare = typeof agentShares.$inferSelect;
export type NewAgentShare = typeof agentShares.$inferInsert;
