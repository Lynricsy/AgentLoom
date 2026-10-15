import { sql } from 'drizzle-orm';
import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createAppendOnlyTenantPolicies } from './rls-policies';

/**
 * DecisionService 的决策记录（append-only，只有 SELECT/INSERT 策略）。
 *
 * 规则 provider 写 mode='primary'；Jev 影子写 mode='shadow'，只记录不控制行为。
 */
export const decisionRecords = pgTable(
  'decision_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    /** 决策种类，如 team.message_relevance、routing.model_choice */
    kind: varchar('kind', { length: 64 }).notNull(),
    /** 决策主体类型，如 team_message、routing_decision */
    subjectType: varchar('subject_type', { length: 32 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    provider: varchar('provider', { length: 16 })
      .$type<'rule' | 'jev'>()
      .notNull(),
    model: varchar('model', { length: 64 }),
    mode: varchar('mode', { length: 16 })
      .$type<'primary' | 'shadow'>()
      .notNull(),
    definitionVersion: integer('definition_version').notNull(),
    /** sha256(canonicalJson(buildState(input))) 的十六进制 */
    inputDigest: char('input_digest', { length: 64 }).notNull(),
    outcome: jsonb('outcome').$type<Record<string, unknown>>(),
    confidence: real('confidence'),
    latencyMs: integer('latency_ms').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_decision_records_tenant_kind_created').on(
      table.tenantId,
      table.kind,
      table.createdAt,
    ),
    index('idx_decision_records_subject').on(
      table.subjectType,
      table.subjectId,
    ),
    ...createAppendOnlyTenantPolicies('decision_records'),
  ],
);

export type DecisionRecord = typeof decisionRecords.$inferSelect;
export type NewDecisionRecord = typeof decisionRecords.$inferInsert;
