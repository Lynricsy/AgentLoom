import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  bigint,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.schema';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const workspaceSnapshotStatusEnum = pgEnum(
  'workspace_snapshot_status_enum',
  ['creating', 'ready', 'archived', 'deleted'],
);

export const workspaceSnapshots = pgTable(
  'workspace_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    name: varchar('name', { length: 255 }).notNull(),

    description: text('description'),

    storageKey: varchar('storage_key', { length: 512 }).notNull(),

    sizeBytes: bigint('size_bytes', { mode: 'number' }),

    status: workspaceSnapshotStatusEnum('status').notNull().default('creating'),

    config: jsonb('config')
      .$type<Record<string, unknown> | null>()
      .default(null),

    createdById: uuid('created_by_id')
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
    index('idx_workspace_snapshots_org_id').on(table.organizationId),
    index('idx_workspace_snapshots_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_workspace_snapshots_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('workspace_snapshots'),
  ],
);

export type WorkspaceSnapshot = typeof workspaceSnapshots.$inferSelect;
export type NewWorkspaceSnapshot = typeof workspaceSnapshots.$inferInsert;
