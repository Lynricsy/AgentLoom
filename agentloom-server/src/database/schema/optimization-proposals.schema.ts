import { sql } from 'drizzle-orm';
import {
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

import {
  OPTIMIZATION_EVALUATION_ARMS,
  OPTIMIZATION_EVALUATION_RUN_STATUSES,
  OPTIMIZATION_EVALUATION_STATUSES,
  OPTIMIZATION_EVALUATION_VERDICTS,
  OPTIMIZATION_PROPOSAL_STATUSES,
  OPTIMIZATION_PROPOSAL_TYPES,
  type EvaluationCase,
  type EvaluationRunMetrics,
  type EvaluationSummary,
  type OptimizationEvaluationFailureReason,
  type OptimizationProposalNodeType,
  type ProposalEvidence,
  type ProposalPublishReport,
} from '../../modules/optimization-proposal/optimization-proposal.types';
import { createDirectTenantPolicies } from './rls-policies';
import { workflowDefinitions } from './workflow-definitions.schema';
import { workflowExecutions } from './workflow-executions.schema';
import { workflowVersions } from './workflow-versions.schema';

export const optimizationProposalTypeEnum = pgEnum(
  'optimization_proposal_type_enum',
  OPTIMIZATION_PROPOSAL_TYPES,
);

export const optimizationProposalStatusEnum = pgEnum(
  'optimization_proposal_status_enum',
  OPTIMIZATION_PROPOSAL_STATUSES,
);

export const optimizationEvaluationStatusEnum = pgEnum(
  'optimization_evaluation_status_enum',
  OPTIMIZATION_EVALUATION_STATUSES,
);

export const optimizationEvaluationRunStatusEnum = pgEnum(
  'optimization_evaluation_run_status_enum',
  OPTIMIZATION_EVALUATION_RUN_STATUSES,
);

export const optimizationEvaluationArmEnum = pgEnum(
  'optimization_evaluation_arm_enum',
  OPTIMIZATION_EVALUATION_ARMS,
);

export const optimizationEvaluationVerdictEnum = pgEnum(
  'optimization_evaluation_verdict_enum',
  OPTIMIZATION_EVALUATION_VERDICTS,
);

/**
 * 由运行证据生成的工作流节点配置修改提案。
 *
 * 提案针对 `base_version_id`（生成时的发布版本）的单个节点、单个配置路径；
 * 评测时从基线快照应用补丁建出未发布的 `candidate_version_id`，发布即把该版本置为发布版本。
 */
export const optimizationProposals = pgTable(
  'optimization_proposals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    nodeType: varchar('node_type', { length: 40 })
      .$type<OptimizationProposalNodeType>()
      .notNull(),
    proposalType: optimizationProposalTypeEnum('proposal_type').notNull(),
    status: optimizationProposalStatusEnum('status')
      .notNull()
      .default('proposed'),
    /** 相对节点 `data` 的点路径 */
    configPath: text('config_path').notNull(),
    /** 基线值；路由未配置回退模型时为 null */
    currentValue: jsonb('current_value').$type<unknown>(),
    proposedValue: jsonb('proposed_value').$type<unknown>().notNull(),
    rationale: text('rationale').notNull(),
    evidence: jsonb('evidence').$type<ProposalEvidence>().notNull(),
    baseVersionId: uuid('base_version_id')
      .notNull()
      .references(() => workflowVersions.id, { onDelete: 'cascade' }),
    candidateVersionId: uuid('candidate_version_id').references(
      () => workflowVersions.id,
      { onDelete: 'set null' },
    ),
    publishedVersionId: uuid('published_version_id'),
    /** 最近一次评测；评测超时失败后保留供查看 */
    currentEvaluationId: uuid('current_evaluation_id'),
    verdict: optimizationEvaluationVerdictEnum('verdict'),
    publishReport: jsonb('publish_report').$type<ProposalPublishReport>(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id'),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    rolledBackByUserId: uuid('rolled_back_by_user_id'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedByUserId: uuid('dismissed_by_user_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_optimization_proposals_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_optimization_proposals_workflow_node').on(
      table.workflowDefinitionId,
      table.nodeId,
    ),
    uniqueIndex('uq_optimization_proposals_active')
      .on(table.workflowDefinitionId, table.nodeId, table.proposalType)
      .where(sql`${table.status} IN ('proposed', 'evaluating', 'evaluated')`),
    ...createDirectTenantPolicies('optimization_proposals'),
  ],
);

/** 一次评测：基线与候选版本各回放同一组真实输入 */
export const optimizationEvaluations = pgTable(
  'optimization_evaluations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => optimizationProposals.id, { onDelete: 'cascade' }),
    status: optimizationEvaluationStatusEnum('status')
      .notNull()
      .default('running'),
    baseVersionId: uuid('base_version_id').notNull(),
    candidateVersionId: uuid('candidate_version_id').notNull(),
    cases: jsonb('cases').$type<EvaluationCase[]>().notNull(),
    summary: jsonb('summary').$type<EvaluationSummary>(),
    failureReason: varchar('failure_reason', {
      length: 40,
    }).$type<OptimizationEvaluationFailureReason>(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    startedByUserId: uuid('started_by_user_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_optimization_evaluations_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_optimization_evaluations_proposal_id').on(table.proposalId),
    ...createDirectTenantPolicies('optimization_evaluations'),
  ],
);

/** 评测中的一次执行（臂 × 用例） */
export const optimizationEvaluationRuns = pgTable(
  'optimization_evaluation_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => optimizationEvaluations.id, { onDelete: 'cascade' }),
    arm: optimizationEvaluationArmEnum('arm').notNull(),
    caseIndex: integer('case_index').notNull(),
    /** 启动失败时为 null */
    executionId: uuid('execution_id').references(() => workflowExecutions.id, {
      onDelete: 'set null',
    }),
    status: optimizationEvaluationRunStatusEnum('status')
      .notNull()
      .default('running'),
    metrics: jsonb('metrics').$type<EvaluationRunMetrics>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_optimization_evaluation_runs_case').on(
      table.evaluationId,
      table.arm,
      table.caseIndex,
    ),
    index('idx_optimization_evaluation_runs_execution_id').on(
      table.executionId,
    ),
    index('idx_optimization_evaluation_runs_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    ...createDirectTenantPolicies('optimization_evaluation_runs'),
  ],
);

export type OptimizationProposal = typeof optimizationProposals.$inferSelect;
export type NewOptimizationProposal = typeof optimizationProposals.$inferInsert;
export type OptimizationEvaluation =
  typeof optimizationEvaluations.$inferSelect;
export type NewOptimizationEvaluation =
  typeof optimizationEvaluations.$inferInsert;
export type OptimizationEvaluationRun =
  typeof optimizationEvaluationRuns.$inferSelect;
export type NewOptimizationEvaluationRun =
  typeof optimizationEvaluationRuns.$inferInsert;
