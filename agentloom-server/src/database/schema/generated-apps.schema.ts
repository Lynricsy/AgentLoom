import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentDefinitions } from './agent-definitions.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';
import { workflowDefinitions } from './workflow-definitions.schema';
import type {
  GeneratedAppGenerationPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateResult,
  GeneratedAppGateRunFailure,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
  GeneratedAppSpec,
} from '../../modules/generated-app/types/generated-app.types';

export const generatedAppStatusEnum = pgEnum('generated_app_status', [
  'app_spec_ready',
  'preview_ready',
  'trial_ready',
  'publish_candidate',
  'published',
  'failed',
]);

export type GeneratedAppStatus =
  (typeof generatedAppStatusEnum.enumValues)[number];

export const generatedAppSubmissionStatusEnum = pgEnum(
  'generated_app_submission_status',
  ['received', 'running', 'completed', 'failed'],
);

export type GeneratedAppSubmissionStatus =
  (typeof generatedAppSubmissionStatusEnum.enumValues)[number];

export const generatedAppGateRunStatusEnum = pgEnum(
  'generated_app_gate_run_status',
  ['running', 'passed', 'failed', 'warning', 'skipped'],
);

export type GeneratedAppGateRunStatus =
  (typeof generatedAppGateRunStatusEnum.enumValues)[number];

export const generatedAppGenerationRunStatusEnum = pgEnum(
  'generated_app_generation_run_status',
  ['queued', 'running', 'repairing', 'passed', 'failed', 'cancelled'],
);

export type GeneratedAppGenerationRunStatus =
  (typeof generatedAppGenerationRunStatusEnum.enumValues)[number];

export const generatedAppGenerationRunTriggerEnum = pgEnum(
  'generated_app_generation_run_trigger',
  ['initial', 'manual', 'retry', 'system'],
);

export type GeneratedAppGenerationRunTrigger =
  (typeof generatedAppGenerationRunTriggerEnum.enumValues)[number];

export const generatedAppRepairAttemptStatusEnum = pgEnum(
  'generated_app_repair_attempt_status',
  ['planned', 'running', 'completed', 'failed', 'skipped'],
);

export type GeneratedAppRepairAttemptStatus =
  (typeof generatedAppRepairAttemptStatusEnum.enumValues)[number];

export const generatedApps = pgTable(
  'generated_apps',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    prompt: text('prompt').notNull(),

    appName: varchar('app_name', { length: 255 }).notNull(),

    description: text('description').notNull(),

    status: generatedAppStatusEnum('status')
      .notNull()
      .default('app_spec_ready'),

    appSpec: jsonb('app_spec').$type<GeneratedAppSpec>().notNull(),

    generationPlan: jsonb('generation_plan')
      .$type<GeneratedAppGenerationPlan | Record<string, unknown> | null>()
      .default(null),

    gateResults: jsonb('gate_results')
      .$type<GeneratedAppGateResult[]>()
      .notNull()
      .default([]),

    readiness: jsonb('readiness').$type<GeneratedAppReadiness>().notNull(),

    preview: jsonb('preview').$type<GeneratedAppPreview>().notNull(),

    agentDefinitionId: uuid('agent_definition_id').references(
      () => agentDefinitions.id,
      { onDelete: 'set null' },
    ),

    workflowDefinitionId: uuid('workflow_definition_id').references(
      () => workflowDefinitions.id,
      { onDelete: 'set null' },
    ),

    pluginIds: jsonb('plugin_ids').$type<string[]>().notNull().default([]),

    publicShareToken: text('public_share_token'),

    publicShareEnabled: boolean('public_share_enabled')
      .notNull()
      .default(false),

    publicShareCreatedAt: timestamp('public_share_created_at', {
      withTimezone: true,
    }),

    publicShareDisabledAt: timestamp('public_share_disabled_at', {
      withTimezone: true,
    }),

    publicViewCount: integer('public_view_count').notNull().default(0),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    updatedBy: uuid('updated_by')
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
    uniqueIndex('uq_generated_apps_public_share_token').on(
      table.publicShareToken,
    ),
    index('idx_generated_apps_tenant_updated').on(
      table.tenantId,
      table.updatedAt,
    ),
    index('idx_generated_apps_tenant_status').on(table.tenantId, table.status),
    index('idx_generated_apps_created_by').on(table.createdBy),
    ...createDirectTenantPolicies('generated_apps'),
  ],
);

export type GeneratedApp = typeof generatedApps.$inferSelect;
export type NewGeneratedApp = typeof generatedApps.$inferInsert;

export const generatedAppSubmissions = pgTable(
  'generated_app_submissions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    generatedAppId: uuid('generated_app_id')
      .notNull()
      .references(() => generatedApps.id, { onDelete: 'cascade' }),

    appSpecVersion: integer('app_spec_version').notNull(),

    publicShareToken: text('public_share_token').notNull(),

    anonymousSessionId: varchar('anonymous_session_id', {
      length: 128,
    }).notNull(),

    status: generatedAppSubmissionStatusEnum('status')
      .notNull()
      .default('received'),

    input: jsonb('input')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    result: jsonb('result').$type<Record<string, unknown> | null>(),

    report: jsonb('report').$type<Record<string, unknown> | null>(),

    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_generated_app_submissions_tenant_app_created').on(
      table.tenantId,
      table.generatedAppId,
      table.createdAt,
    ),
    index('idx_generated_app_submissions_app_deleted').on(
      table.generatedAppId,
      table.deletedAt,
    ),
    index('idx_generated_app_submissions_anonymous_session').on(
      table.anonymousSessionId,
    ),
    ...createDirectTenantPolicies('generated_app_submissions'),
  ],
);

export type GeneratedAppSubmission =
  typeof generatedAppSubmissions.$inferSelect;
export type NewGeneratedAppSubmission =
  typeof generatedAppSubmissions.$inferInsert;

export const generatedAppGenerationRuns = pgTable(
  'generated_app_generation_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    generatedAppId: uuid('generated_app_id')
      .notNull()
      .references(() => generatedApps.id, { onDelete: 'cascade' }),

    runNumber: integer('run_number').notNull().default(1),

    status: generatedAppGenerationRunStatusEnum('status')
      .notNull()
      .default('running'),

    triggerSource: generatedAppGenerationRunTriggerEnum('trigger_source')
      .notNull()
      .default('manual'),

    maxRepairAttempts: integer('max_repair_attempts').notNull().default(3),

    maxRuntimeSeconds: integer('max_runtime_seconds').notNull().default(1800),

    summary: text('summary').notNull(),

    failureReason: text('failure_reason'),

    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_generated_app_generation_runs_tenant_app_created').on(
      table.tenantId,
      table.generatedAppId,
      table.createdAt,
    ),
    index('idx_generated_app_generation_runs_tenant_app_status').on(
      table.tenantId,
      table.generatedAppId,
      table.status,
    ),
    index('idx_generated_app_generation_runs_tenant_app_run_number').on(
      table.tenantId,
      table.generatedAppId,
      table.runNumber,
    ),
    ...createDirectTenantPolicies('generated_app_generation_runs'),
  ],
);

export type GeneratedAppGenerationRun =
  typeof generatedAppGenerationRuns.$inferSelect;
export type NewGeneratedAppGenerationRun =
  typeof generatedAppGenerationRuns.$inferInsert;

export const generatedAppRepairAttempts = pgTable(
  'generated_app_repair_attempts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    generatedAppId: uuid('generated_app_id')
      .notNull()
      .references(() => generatedApps.id, { onDelete: 'cascade' }),

    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => generatedAppGenerationRuns.id, { onDelete: 'cascade' }),

    attemptNumber: integer('attempt_number').notNull().default(1),

    targetGateId: varchar('target_gate_id', { length: 64 }).notNull(),

    status: generatedAppRepairAttemptStatusEnum('status')
      .notNull()
      .default('running'),

    failureSummary: text('failure_summary').notNull(),

    changeSummary: text('change_summary'),

    verificationSummary: text('verification_summary'),

    repairPlan: jsonb('repair_plan').$type<GeneratedAppRepairPlan | null>(),

    reverificationPlan: jsonb(
      'reverification_plan',
    ).$type<GeneratedAppReverificationPlan | null>(),

    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_generated_app_repair_attempts_tenant_app_run').on(
      table.tenantId,
      table.generatedAppId,
      table.generationRunId,
    ),
    index('idx_generated_app_repair_attempts_tenant_app_gate').on(
      table.tenantId,
      table.generatedAppId,
      table.targetGateId,
    ),
    index('idx_generated_app_repair_attempts_tenant_app_status').on(
      table.tenantId,
      table.generatedAppId,
      table.status,
    ),
    ...createDirectTenantPolicies('generated_app_repair_attempts'),
  ],
);

export type GeneratedAppRepairAttempt =
  typeof generatedAppRepairAttempts.$inferSelect;
export type NewGeneratedAppRepairAttempt =
  typeof generatedAppRepairAttempts.$inferInsert;

export const generatedAppGateRuns = pgTable(
  'generated_app_gate_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    generatedAppId: uuid('generated_app_id')
      .notNull()
      .references(() => generatedApps.id, { onDelete: 'cascade' }),

    generationRunId: uuid('generation_run_id').references(
      () => generatedAppGenerationRuns.id,
      { onDelete: 'set null' },
    ),

    repairAttemptId: uuid('repair_attempt_id').references(
      () => generatedAppRepairAttempts.id,
      { onDelete: 'set null' },
    ),

    gateId: varchar('gate_id', { length: 64 }).notNull(),

    gateOrder: integer('gate_order').notNull(),

    gateName: varchar('gate_name', { length: 255 }).notNull(),

    blocking: boolean('blocking').notNull(),

    attemptNumber: integer('attempt_number').notNull().default(1),

    status: generatedAppGateRunStatusEnum('status').notNull(),

    summary: text('summary').notNull(),

    evidence: jsonb('evidence')
      .$type<GeneratedAppGateEvidence[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    failure: jsonb('failure').$type<GeneratedAppGateRunFailure | null>(),

    repairInstructions: text('repair_instructions'),

    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_generated_app_gate_runs_tenant_app_created').on(
      table.tenantId,
      table.generatedAppId,
      table.createdAt,
    ),
    index('idx_generated_app_gate_runs_generation_run').on(
      table.tenantId,
      table.generationRunId,
    ),
    index('idx_generated_app_gate_runs_repair_attempt').on(
      table.tenantId,
      table.repairAttemptId,
    ),
    index('idx_generated_app_gate_runs_tenant_app_gate').on(
      table.tenantId,
      table.generatedAppId,
      table.gateId,
    ),
    index('idx_generated_app_gate_runs_tenant_app_status').on(
      table.tenantId,
      table.generatedAppId,
      table.status,
    ),
    ...createDirectTenantPolicies('generated_app_gate_runs'),
  ],
);

export type GeneratedAppGateRun = typeof generatedAppGateRuns.$inferSelect;
export type NewGeneratedAppGateRun = typeof generatedAppGateRuns.$inferInsert;
