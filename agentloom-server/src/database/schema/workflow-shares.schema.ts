import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';
import { workflowDefinitions } from './workflow-definitions.schema';

export const shareTypeEnum = pgEnum('share_type', [
  'read_only',
  'copyable',
]);

// 公开访问通过 TenantMiddleware 排除 + @Public() 实现，管理端走 RLS
export const workflowShares = pgTable(
  'workflow_shares',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),

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
    uniqueIndex('uq_workflow_shares_token').on(table.shareToken),
    index('idx_workflow_shares_workflow_definition').on(
      table.workflowDefinitionId,
    ),
    index('idx_workflow_shares_tenant_id').on(table.tenantId),
    index('idx_workflow_shares_created_by').on(table.createdBy),
    check(
      'workflow_shares_view_count_non_negative',
      sql`${table.viewCount} >= 0`,
    ),
    check(
      'workflow_shares_copy_count_non_negative',
      sql`${table.copyCount} >= 0`,
    ),
  ],
);

export type WorkflowShare = typeof workflowShares.$inferSelect;
export type NewWorkflowShare = typeof workflowShares.$inferInsert;
