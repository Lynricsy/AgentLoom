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

export type GeneratedAppReadinessState =
  | 'preview'
  | 'trial'
  | 'publish_candidate'
  | 'blocked';

export type GeneratedAppGateStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'warning'
  | 'skipped';

export interface GeneratedAppAcceptanceScenario {
  id: string;
  title: string;
  requirementIds: string[];
  given: string[];
  when: string[];
  then: string[];
}

export interface GeneratedAppSpec {
  version: 1;
  appName: string;
  summary: string;
  userGoal: string;
  actors: string[];
  coreRequirements: Array<{
    id: string;
    text: string;
  }>;
  pages: Array<{
    id: string;
    name: string;
    purpose: string;
  }>;
  dataPolicy: {
    publicSubmissionsPersisted: boolean;
    creatorCanDeleteSubmissions: boolean;
    endUserLoginRequired: boolean;
  };
  nonGoals: string[];
  acceptanceScenarios: GeneratedAppAcceptanceScenario[];
  traceability: Array<{
    requirementId: string;
    scenarioIds: string[];
    evidenceIds: string[];
  }>;
}

export interface GeneratedAppGateEvidence {
  id: string;
  label: string;
  kind:
    | 'app_spec'
    | 'plan'
    | 'static_check'
    | 'build'
    | 'test'
    | 'browser'
    | 'verifier'
    | 'manual';
  url: string | null;
  summary: string;
}

export interface GeneratedAppGateResult {
  gateId: string;
  order: number;
  name: string;
  blocking: boolean;
  status: GeneratedAppGateStatus;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  updatedAt: string;
}

export interface GeneratedAppReadiness {
  state: GeneratedAppReadinessState;
  canCreatePublicShare: boolean;
  blockingIssueCount: number;
  warningCount: number;
  summary: string;
  blockers: Array<{
    gateId: string;
    name: string;
    status: GeneratedAppGateStatus;
    summary: string;
  }>;
  warnings: Array<{
    gateId: string;
    name: string;
    status: GeneratedAppGateStatus;
    summary: string;
  }>;
}

export interface GeneratedAppPreview {
  previewUrl: string | null;
  sourceArtifactUrl: string | null;
  testReportUrl: string | null;
}

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
      .$type<Record<string, unknown> | null>()
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
