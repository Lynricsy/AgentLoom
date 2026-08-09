import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { sandboxSessions } from './sandbox-sessions.schema';
import { workspaceSnapshots } from './workspace-snapshots.schema';

export const workspaceRuntimeLeases = pgTable(
  'workspace_runtime_leases',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaceSnapshots.id, { onDelete: 'cascade' }),
    sandboxSessionId: uuid('sandbox_session_id')
      .notNull()
      .references(() => sandboxSessions.id, { onDelete: 'cascade' }),
    fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex('uq_workspace_runtime_leases_workspace').on(table.workspaceId),
    index('idx_workspace_runtime_leases_tenant_expiry').on(
      table.tenantId,
      table.leaseExpiresAt,
    ),
    index('idx_workspace_runtime_leases_session').on(table.sandboxSessionId),
    ...createDirectTenantPolicies('workspace_runtime_leases'),
  ],
);

export type WorkspaceRuntimeLease = typeof workspaceRuntimeLeases.$inferSelect;
export type NewWorkspaceRuntimeLease =
  typeof workspaceRuntimeLeases.$inferInsert;
