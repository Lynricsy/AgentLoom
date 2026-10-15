import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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

import { agentConversations } from './agent-conversations.schema';
import { agentDefinitions } from './agent-definitions.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { teamRuns } from './team-runs.schema';

export const teamMemberStatusEnum = pgEnum('team_member_status_enum', [
  'idle',
  'running',
  'ended',
  'failed',
]);

/**
 * 团队成员：一个固定角色，运行载体是一条 source='team' 的 agent_conversations。
 */
export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    teamRunId: uuid('team_run_id')
      .notNull()
      .references(() => teamRuns.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 64 }).notNull(),
    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: 'cascade' }),
    /** 启动时解析出的已发布版本 */
    agentVersionId: uuid('agent_version_id'),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),
    isLead: boolean('is_lead').notNull().default(false),
    /** 可发送的目标角色；'*' 表示全部成员 */
    canMessage: jsonb('can_message').$type<string[]>().notNull().default([]),
    instructions: text('instructions'),
    status: teamMemberStatusEnum('status').notNull().default('idle'),
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
    turnCount: integer('turn_count').notNull().default(0),
    lastTurnAt: timestamp('last_turn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_team_members_conversation').on(table.conversationId),
    uniqueIndex('uq_team_members_run_role').on(table.teamRunId, table.role),
    index('idx_team_members_agent_definition_id').on(table.agentDefinitionId),
    ...createDirectTenantPolicies('team_members'),
  ],
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
