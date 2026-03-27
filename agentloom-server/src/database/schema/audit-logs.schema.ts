import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { createAppendOnlyTenantPolicies } from './rls-policies';
import { users } from './users.schema';
import { workflowExecutions } from './workflow-executions.schema';

export const auditActorTypes = ['user', 'system', 'service'] as const;

export type AuditActorType = (typeof auditActorTypes)[number];
export type AuditLogJson = Record<string, unknown>;

export const auditActorTypeEnum = pgEnum('audit_actor_type', auditActorTypes);

function createAuditLogColumns() {
  return {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    executionId: uuid('execution_id').references(() => workflowExecutions.id, {
      onDelete: 'set null',
    }),
    summary: text('summary').notNull(),
    before: jsonb('before').$type<AuditLogJson | null>(),
    after: jsonb('after').$type<AuditLogJson | null>(),
    metadata: jsonb('metadata').$type<AuditLogJson | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  };
}

export const auditLogs = pgTable(
  'audit_logs',
  createAuditLogColumns(),
  (table) => [
    index('idx_audit_logs_tenant_created_at').on(
      table.tenantId,
      table.createdAt,
    ),
    index('idx_audit_logs_tenant_event_created_at').on(
      table.tenantId,
      table.eventType,
      table.createdAt,
    ),
    index('idx_audit_logs_tenant_resource_created_at').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
    index('idx_audit_logs_tenant_execution_created_at').on(
      table.tenantId,
      table.executionId,
      table.createdAt,
    ),
    ...createAppendOnlyTenantPolicies('audit_logs'),
  ],
);

export const auditLogArchives = pgTable(
  'audit_log_archives',
  createAuditLogColumns(),
  (table) => [
    index('idx_audit_log_archives_tenant_created_at').on(
      table.tenantId,
      table.createdAt,
    ),
    index('idx_audit_log_archives_tenant_event_created_at').on(
      table.tenantId,
      table.eventType,
      table.createdAt,
    ),
    index('idx_audit_log_archives_tenant_resource_created_at').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
    index('idx_audit_log_archives_tenant_execution_created_at').on(
      table.tenantId,
      table.executionId,
      table.createdAt,
    ),
    ...createAppendOnlyTenantPolicies('audit_log_archives'),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type AuditLogArchive = typeof auditLogArchives.$inferSelect;
export type NewAuditLogArchive = typeof auditLogArchives.$inferInsert;
