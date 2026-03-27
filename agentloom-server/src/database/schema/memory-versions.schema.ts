import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { memoryNodes } from './memory-nodes.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const memoryReviewStatusEnum = pgEnum('memory_review_status', [
  'pending',
  'approved',
  'rejected',
]);

export const memoryVersions = pgTable(
  'memory_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => memoryNodes.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    content: text('content').notNull(),
    version: integer('version').notNull().default(1),
    deprecated: boolean('deprecated').notNull().default(false),
    migratedTo: uuid('migrated_to'),
    reviewStatus: memoryReviewStatusEnum('review_status')
      .notNull()
      .default('pending'),
    patchSummary: text('patch_summary'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.migratedTo],
      foreignColumns: [table.id],
      name: 'memory_versions_migrated_to_fkey',
    }).onDelete('set null'),
    index('idx_memory_versions_node_id').on(table.nodeId),
    index('idx_memory_versions_tenant_id').on(table.tenantId),
    index('idx_memory_versions_review_status').on(table.reviewStatus),
    ...createDirectTenantPolicies('memory_versions'),
  ],
);

export type MemoryVersion = typeof memoryVersions.$inferSelect;
export type NewMemoryVersion = typeof memoryVersions.$inferInsert;
