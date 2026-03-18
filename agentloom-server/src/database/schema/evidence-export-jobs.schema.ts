import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const evidenceExportJobStatuses = [
  'queued',
  'running',
  'completed',
  'failed',
  'expired',
] as const;

export type EvidenceExportJobStatus =
  (typeof evidenceExportJobStatuses)[number];

export interface EvidenceExportFilters {
  workflowId?: string;
  executionIds?: string[];
  eventType?: string;
  resourceType?: string;
  resourceId?: string;
  actorType?: 'user' | 'system' | 'service';
  actorId?: string;
  includeAuditMetadata?: boolean;
  from?: string;
  to?: string;
}

export const evidenceExportJobStatusEnum = pgEnum(
  'evidence_export_job_status',
  evidenceExportJobStatuses,
);

export const evidenceExportJobs = pgTable(
  'evidence_export_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: evidenceExportJobStatusEnum('status').notNull().default('queued'),
    filters: jsonb('filters').$type<EvidenceExportFilters>().notNull(),
    storageKey: varchar('storage_key', { length: 512 }),
    artifactFormat: varchar('artifact_format', { length: 32 }).notNull(),
    fileName: varchar('file_name', { length: 255 }),
    mimeType: varchar('mime_type', { length: 255 }),
    matchedExecutionCount: integer('matched_execution_count')
      .notNull()
      .default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_evidence_export_jobs_tenant_status_requested_at').on(
      table.tenantId,
      table.status,
      table.requestedAt,
    ),
    index('idx_evidence_export_jobs_tenant_expires_at').on(
      table.tenantId,
      table.expiresAt,
    ),
    index('idx_evidence_export_jobs_tenant_requested_by').on(
      table.tenantId,
      table.requestedBy,
      table.requestedAt,
    ),
    ...createDirectTenantPolicies('evidence_export_jobs'),
  ],
);

export type EvidenceExportJob = typeof evidenceExportJobs.$inferSelect;
export type NewEvidenceExportJob = typeof evidenceExportJobs.$inferInsert;
