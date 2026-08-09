import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { sandboxSessions } from './sandbox-sessions.schema';

export const sandboxRuntimeMigrationStatusEnum = pgEnum(
  'sandbox_runtime_migration_status_enum',
  [
    'pending',
    'archiving',
    'archived',
    'restoring',
    'verified',
    'finalized',
    'failed',
    'rolled_back',
  ],
);

export const sandboxRuntimeMigrations = pgTable(
  'sandbox_runtime_migrations',
  {
    sandboxSessionId: uuid('sandbox_session_id')
      .primaryKey()
      .references(() => sandboxSessions.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    legacyContainerId: varchar('legacy_container_id', {
      length: 128,
    }).notNull(),
    sourceWorkspaceIdentity: varchar('source_workspace_identity', {
      length: 512,
    }).notNull(),
    archiveObjectKey: varchar('archive_object_key', { length: 1024 }),
    manifestObjectKey: varchar('manifest_object_key', { length: 1024 }),
    archiveSha256: varchar('archive_sha256', { length: 64 }),
    manifestSha256: varchar('manifest_sha256', { length: 64 }),
    fileCount: bigint('file_count', { mode: 'number' }),
    totalBytes: bigint('total_bytes', { mode: 'number' }),
    status: sandboxRuntimeMigrationStatusEnum('status')
      .notNull()
      .default('pending'),
    error: text('error'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_sandbox_runtime_migrations_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_sandbox_runtime_migrations_workspace').on(
      table.tenantId,
      table.sourceWorkspaceIdentity,
    ),
    ...createDirectTenantPolicies('sandbox_runtime_migrations'),
  ],
);

export type SandboxRuntimeMigration =
  typeof sandboxRuntimeMigrations.$inferSelect;
export type NewSandboxRuntimeMigration =
  typeof sandboxRuntimeMigrations.$inferInsert;
