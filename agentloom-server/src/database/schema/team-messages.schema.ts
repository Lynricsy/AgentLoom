import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { agentMessages } from './agent-conversations.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { teamMembers } from './team-members.schema';
import { teamRuns } from './team-runs.schema';

export const teamMessageKindEnum = pgEnum('team_message_kind_enum', [
  'observation',
  'request',
  'reply',
  'artifact',
  'system',
]);

export const teamMessageDeliveryStatusEnum = pgEnum(
  'team_message_delivery_status_enum',
  ['pending', 'delivered', 'consumed', 'suppressed', 'expired'],
);

/**
 * 团队邮箱：每个接收者一行，本表即 Outbox。
 *
 * pending → delivered 与接收者 agent_messages 插入同事务提交；接收者下一回合
 * 处理该 agent_message 后置 consumed。清扫 worker 重投超时 pending 行。
 */
export const teamMessages = pgTable(
  'team_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    teamRunId: uuid('team_run_id')
      .notNull()
      .references(() => teamRuns.id, { onDelete: 'cascade' }),
    /** null 表示系统消息（TeamRunService 发出） */
    senderMemberId: uuid('sender_member_id').references(() => teamMembers.id, {
      onDelete: 'cascade',
    }),
    recipientMemberId: uuid('recipient_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    kind: teamMessageKindEnum('kind').notNull(),
    content: text('content').notNull(),
    refs: jsonb('refs').$type<string[]>().notNull().default([]),
    replyToMessageId: uuid('reply_to_message_id'),
    deliveryStatus: teamMessageDeliveryStatusEnum('delivery_status')
      .notNull()
      .default('pending'),
    /** 投递时写入接收者对话的 agent_messages 行 */
    agentMessageId: uuid('agent_message_id').references(
      () => agentMessages.id,
      { onDelete: 'set null' },
    ),
    /** 关联的 decision_records 行；该表 append-only，不建外键 */
    decisionRecordId: uuid('decision_record_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_team_messages_run_created').on(table.teamRunId, table.createdAt),
    index('idx_team_messages_recipient_status').on(
      table.recipientMemberId,
      table.deliveryStatus,
    ),
    index('idx_team_messages_pending')
      .on(table.createdAt)
      .where(sql`${table.deliveryStatus} = 'pending'`),
    uniqueIndex('uq_team_messages_agent_message').on(table.agentMessageId),
    ...createDirectTenantPolicies('team_messages'),
  ],
);

export type TeamMessage = typeof teamMessages.$inferSelect;
export type NewTeamMessage = typeof teamMessages.$inferInsert;
