import { sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const resourceSourceKindEnum = pgEnum('resource_source_kind', [
  'manual',
  'share_imported',
]);

export const resourceSourceResourceTypeEnum = pgEnum(
  'resource_source_resource_type',
  [
    'workflow_definition',
    'agent_definition',
    'knowledge_base',
    'memory_instance',
    'mcp_server_config',
    'skill',
  ],
);

export const resourceSourceShareTypeEnum = pgEnum(
  'resource_source_share_type',
  ['workflow', 'agent'],
);

export const resourceSourceRecords = pgTable(
  'resource_source_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    resourceType: resourceSourceResourceTypeEnum('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    originKind: resourceSourceKindEnum('origin_kind').notNull(),
    currentKind: resourceSourceKindEnum('current_kind').notNull(),
    sourceShareType: resourceSourceShareTypeEnum('source_share_type'),
    sourceShareId: uuid('source_share_id'),
    sourceShareToken: text('source_share_token'),
    sourceResourceType: resourceSourceResourceTypeEnum('source_resource_type'),
    sourceResourceId: uuid('source_resource_id'),
    sourceResourceTitle: text('source_resource_title'),
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
    uniqueIndex('uq_resource_source_records_resource').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
    ),
    index('idx_resource_source_records_kind').on(
      table.tenantId,
      table.resourceType,
      table.currentKind,
    ),
    index('idx_resource_source_records_source_share').on(
      table.tenantId,
      table.sourceShareType,
      table.sourceShareId,
    ),
    ...createDirectTenantPolicies('resource_source_records'),
  ],
);

export type ResourceSourceKind = typeof resourceSourceKindEnum.enumValues[number];
export type ResourceSourceResourceType =
  typeof resourceSourceResourceTypeEnum.enumValues[number];
export type ResourceSourceShareType =
  typeof resourceSourceShareTypeEnum.enumValues[number];
export type ResourceSourceRecord = typeof resourceSourceRecords.$inferSelect;
export type NewResourceSourceRecord = typeof resourceSourceRecords.$inferInsert;
