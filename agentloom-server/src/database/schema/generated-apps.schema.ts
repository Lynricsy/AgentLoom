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

export interface GeneratedAppGenerationPlan {
  planVersion: 1;
  appSpecVersion: number;
  frontend: {
    stack: 'react-vite-agentloom-runtime';
    runtimeSurface: {
      kind: 'generated-app';
      publicAccess: 'private-token-after-gates';
      dataUseNoticeRequired: boolean;
    };
    pages: Array<{
      pageId: string;
      name: string;
      purpose: string;
      route: string;
      requirementIds: string[];
      scenarioIds: string[];
    }>;
  };
  orchestration: {
    target: 'workflow';
    strategy: 'generated-workflow-with-agent-capability';
    inputContract: {
      source: 'public-runtime-submission';
      requiredFields: string[];
      scenarioIds: string[];
    };
    outputContract: {
      destinations: string[];
      reportRequired: boolean;
    };
    steps: Array<{
      stepId: string;
      label: string;
      purpose: string;
      requirementIds: string[];
      scenarioIds: string[];
    }>;
  };
  pluginTools: {
    tools: Array<{
      toolId: string;
      purpose: string;
      requirementIds: string[];
      permissionNotes: string[];
    }>;
    emptyReason: string | null;
    permissionPolicy: string[];
  };
  dataPersistence: {
    publicSubmissionsPersisted: boolean;
    creatorCanDeleteSubmissions: boolean;
    endUserLoginRequired: boolean;
    tenantScoped: boolean;
    tokenSnapshotRequired: boolean;
    softDeleteRequired: boolean;
  };
  testGates: {
    blockingGateIds: string[];
    gatePlan: Array<{
      gateId: string;
      purpose: string;
      evidenceKind: GeneratedAppGateEvidence['kind'];
    }>;
    acceptanceScenarioIds: string[];
  };
  traceability: Array<{
    requirementId: string;
    scenarioIds: string[];
    pageIds: string[];
    orchestrationStepIds: string[];
    planEvidenceIds: string[];
  }>;
  staticContracts?: GeneratedAppStaticContracts;
  buildUnitPlan?: GeneratedAppBuildUnitPlan;
  integrationPlan?: GeneratedAppIntegrationPlan;
  browserAcceptancePlan?: GeneratedAppBrowserAcceptancePlan;
}

export interface GeneratedAppStaticContracts {
  contractVersion: 1;
  appSpecVersion: number;
  generationPlanVersion: number;
  publicRuntime: {
    input: {
      source: 'public-runtime-submission';
      requiredFields: string[];
      scenarioIds: string[];
      dataUseNoticeRequired: boolean;
      anonymousSessionRequired: boolean;
      endUserLoginRequired: boolean;
    };
    output: {
      destinations: string[];
      reportRequired: boolean;
      errorStateRequired: boolean;
    };
  };
  frontendRoutes: Array<{
    pageId: string;
    name: string;
    route: string;
    requirementIds: string[];
    scenarioIds: string[];
  }>;
  orchestration: {
    target: 'workflow';
    strategy: 'generated-workflow-with-agent-capability';
    inputContract: GeneratedAppGenerationPlan['orchestration']['inputContract'];
    outputContract: GeneratedAppGenerationPlan['orchestration']['outputContract'];
    nodes: Array<{
      nodeId: string;
      stepId: string;
      label: string;
      requirementIds: string[];
      scenarioIds: string[];
      inputHandle: string;
      outputHandle: string;
    }>;
    edges: Array<{
      fromNodeId: string;
      toNodeId: string;
    }>;
  };
  pluginToolPermissions: {
    tools: Array<{
      toolId: string;
      purpose: string;
      requirementIds: string[];
      permissions: string[];
      manifestRequired: boolean;
      sandboxSmokeTestRequired: boolean;
    }>;
    emptyReason: string | null;
    permissionPolicy: string[];
    implicitPermissionsAllowed: false;
  };
  submissionPersistence: {
    publicSubmissionsPersisted: boolean;
    creatorCanDeleteSubmissions: boolean;
    endUserLoginRequired: boolean;
    tenantScoped: boolean;
    tokenSnapshotRequired: boolean;
    softDeleteRequired: boolean;
    fields: string[];
  };
  testEntry: {
    staticCheckCommand: string;
    buildGateCommand: string;
    unitGateCommand: string;
    integrationGateCommand: string;
    browserGateCommand: string;
    verifierGateCommand: string;
    publishCandidateGateCommand: string;
    acceptanceScenarioIds: string[];
    blockingGateIds: string[];
  };
  traceability: Array<{
    requirementId: string;
    scenarioIds: string[];
    pageIds: string[];
    orchestrationNodeIds: string[];
    staticContractIds: string[];
  }>;
}

export interface GeneratedAppBuildUnitPlan {
  planVersion: 1;
  appSpecVersion: number;
  generationPlanVersion: number;
  staticContractsVersion: number;
  executionLevel: 'contract-skeleton';
  frontendBuild: {
    command: string;
    workingDirectory: string;
    routeIds: string[];
    requirementIds: string[];
    scenarioIds: string[];
    expectedArtifacts: string[];
  };
  typecheck: {
    command: string;
    tsconfigPath: string;
    requirementIds: string[];
  };
  unitTests: {
    command: string;
    entry: string;
    requirementIds: string[];
    scenarioIds: string[];
  };
  componentGoldenTests: {
    command: string;
    entry: string;
    scenarioIds: string[];
    goldenArtifactPath: string;
  };
  artifactExpectations: Array<{
    artifactId: string;
    kind:
      | 'frontend_build'
      | 'unit_test_report'
      | 'component_golden_report'
      | 'coverage_report'
      | 'plugin_bundle';
    path: string;
    required: boolean;
  }>;
  staticContractsCoverage: Array<{
    staticContractId: string;
    coveredBy: string[];
  }>;
  acceptanceScenarioCoverage: Array<{
    scenarioId: string;
    requirementIds: string[];
    coveredBy: string[];
  }>;
  pluginBuildExpectations: {
    tools: Array<{
      toolId: string;
      command: string;
      manifestPath: string;
      artifactPath: string;
      goldenTestCommand: string;
      requirementIds: string[];
    }>;
    emptyReason: string | null;
  };
  failureCaptureFields: string[];
}

export interface GeneratedAppIntegrationPlan {
  planVersion: 1;
  appSpecVersion: number;
  generationPlanVersion: number;
  staticContractsVersion: number;
  buildUnitPlanVersion: number;
  executionLevel: 'integration-skeleton';
  skeletonDisclaimer: string;
  testTenant: {
    tenantKind: 'synthetic';
    tenantAlias: string;
    authMode: 'tenant-scoped-synthetic-no-real-token';
    usesRealTokens: false;
    noProductionResources: true;
  };
  testResources: {
    resourceIsolation: 'ephemeral-test-resources-only';
    usesRealTokens: false;
    generatedAppWorkspacePath: string;
    fixtureDirectory: string;
    requiredScenarioIds: string[];
  };
  publicRuntimeApiChecks: Array<{
    checkId: string;
    kind:
      | 'public_runtime_read'
      | 'public_runtime_submit'
      | 'public_submission_detail';
    method: 'GET' | 'POST';
    pathTemplate: string;
    staticContractIds: string[];
    requirementIds: string[];
    scenarioIds: string[];
    expectedStatus: number;
    payloadContractRefs: string[];
  }>;
  creatorManagementApiChecks: Array<{
    checkId: string;
    kind:
      | 'creator_generation_run_query'
      | 'creator_gate_run_query'
      | 'creator_submission_query';
    method: 'GET';
    pathTemplate: string;
    staticContractIds: string[];
    requirementIds: string[];
    expectedStatus: number;
  }>;
  agentWorkflowDryRunExpectations: {
    expectationLevel: 'dry-run-fixture-skeleton';
    orchestrationNodeIds: string[];
    orchestrationEdgeRefs: string[];
    fixtures: Array<{
      fixtureId: string;
      scenarioId: string;
      requirementIds: string[];
      orchestrationNodeIds: string[];
      orchestrationEdgeRefs: string[];
      inputMapping: {
        staticContractId: string;
        requiredFields: string[];
      };
      outputMapping: {
        staticContractId: string;
        destinations: string[];
      };
      traceArtifactIds: string[];
    }>;
  };
  pluginSandboxSmokeExpectations: {
    tools: Array<{
      toolId: string;
      smokeCheckId: string;
      artifactId: string;
      fixturePath: string;
      expectedTraceArtifactId: string;
      requirementIds: string[];
      sandboxRuntime: 'wasm-extism';
    }>;
    emptyReason: string | null;
  };
  dependencyArtifacts: Array<{
    artifactId: string;
    kind:
      | 'frontend_build'
      | 'unit_test_report'
      | 'component_golden_report'
      | 'coverage_report'
      | 'plugin_bundle';
    sourceGateId: 'gate-3';
    path: string;
    required: boolean;
  }>;
  acceptanceScenarioCoverage: Array<{
    scenarioId: string;
    requirementIds: string[];
    coveredByCheckIds: string[];
    fixtureIds: string[];
  }>;
  requirementCoverage: Array<{
    requirementId: string;
    scenarioIds: string[];
    coveredByCheckIds: string[];
    dependencyArtifactIds: string[];
  }>;
  orchestrationCoverage: Array<{
    nodeId: string;
    edgeRefs: string[];
    coveredByFixtureIds: string[];
    coveredByCheckIds: string[];
  }>;
  traceArtifacts: Array<{
    artifactId: string;
    kind:
      | 'public_runtime_api_trace'
      | 'creator_management_api_trace'
      | 'agent_workflow_dry_run_trace'
      | 'plugin_sandbox_smoke_trace';
    path: string;
    producedByCheckIds: string[];
  }>;
  failureCaptureFields: string[];
}

export interface GeneratedAppBrowserAcceptancePlan {
  planVersion: 1;
  appSpecVersion: number;
  generationPlanVersion: number;
  staticContractsVersion: number;
  buildUnitPlanVersion: number;
  integrationPlanVersion: number;
  executionLevel: 'browser-acceptance-skeleton';
  skeletonDisclaimer: string;
  browserToolPlan: {
    runner: 'playwright';
    command: string;
    testEntry: string;
    workingDirectory: string;
    baseUrlShape: string;
    publicShareAccessPlaceholder: string;
    usesRealTokens: false;
    scenarioIds: string[];
  };
  viewportMatrix: Array<{
    viewportId: string;
    category: 'desktop' | 'mobile';
    deviceLabel: string;
    width: number;
    height: number;
    scenarioIds: string[];
    requirementIds: string[];
  }>;
  publicRuntimeJourneys: Array<{
    journeyId: string;
    kind:
      | 'public_runtime_open'
      | 'public_runtime_interaction_submit'
      | 'public_submission_result_detail';
    title: string;
    steps: string[];
    viewportIds: string[];
    scenarioIds: string[];
    requirementIds: string[];
    publicRuntimeApiCheckIds: string[];
    staticContractIds: string[];
  }>;
  creatorManagementJourneys: Array<{
    journeyId: string;
    kind:
      | 'creator_generation_run_review'
      | 'creator_gate_run_review'
      | 'creator_submission_review';
    title: string;
    steps: string[];
    viewportIds: string[];
    scenarioIds: string[];
    requirementIds: string[];
    creatorManagementApiCheckIds: string[];
    staticContractIds: string[];
  }>;
  consoleAssertions: Array<{
    assertionId: string;
    kind: 'no_unhandled_console_error' | 'allowed_warning_policy';
    journeyIds: string[];
    viewportIds: string[];
    allowedWarnings: string[];
    emptyAllowedWarningsReason: string | null;
  }>;
  networkAssertions: Array<{
    assertionId: string;
    kind:
      | 'core_requests_2xx'
      | 'public_journey_forbids_creator_internal_endpoints'
      | 'no_token_or_secret_leak';
    journeyIds: string[];
    apiCheckIds: string[];
    staticContractIds: string[];
    forbiddenEndpointPatterns: string[];
    expectedStatusRange: '2xx';
  }>;
  accessibilityInteractionAssertions: Array<{
    assertionId: string;
    kind:
      | 'critical_inputs_reachable'
      | 'critical_buttons_clickable'
      | 'main_content_not_occluded';
    journeyIds: string[];
    viewportIds: string[];
    staticContractIds: string[];
  }>;
  responsiveLayoutAssertions: Array<{
    assertionId: string;
    kind:
      | 'desktop_no_critical_overflow'
      | 'mobile_no_critical_overflow'
      | 'viewport_content_not_occluded';
    journeyIds: string[];
    viewportIds: string[];
    staticContractIds: string[];
  }>;
  artifactExpectations: Array<{
    artifactId: string;
    kind:
      | 'screenshot'
      | 'video'
      | 'playwright_trace'
      | 'console_log'
      | 'network_log'
      | 'failure_summary';
    path: string;
    required: boolean;
    producedByJourneyIds: string[];
    producedByAssertionIds: string[];
    referencesGate4TraceArtifactIds: string[];
  }>;
  acceptanceScenarioCoverage: Array<{
    scenarioId: string;
    requirementIds: string[];
    journeyIds: string[];
    viewportIds: string[];
    assertionIds: string[];
    artifactIds: string[];
  }>;
  requirementCoverage: Array<{
    requirementId: string;
    scenarioIds: string[];
    journeyIds: string[];
    assertionIds: string[];
    artifactIds: string[];
    staticContractIds: string[];
    gate4ApiCheckIds: string[];
  }>;
  journeyCoverage: Array<{
    journeyId: string;
    kind: string;
    scenarioIds: string[];
    requirementIds: string[];
    viewportIds: string[];
    assertionIds: string[];
    artifactIds: string[];
  }>;
  failureCaptureFields: string[];
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

export interface GeneratedAppGateRunFailure {
  code?: string;
  message: string;
  details?: unknown;
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
