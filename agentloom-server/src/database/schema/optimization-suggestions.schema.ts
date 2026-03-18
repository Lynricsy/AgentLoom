import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';

export interface ModelDowngradeValue {
  modelId: string;
  modelName: string;
  provider: string;
}

export interface TimeoutAdjustmentValue {
  timeoutMs: number;
}

export interface ToolPruningValue {
  tools: string[];
  removedTools?: string[];
}

export interface AutonomyUpgradeValue {
  autonomyMode: string;
}

export type SuggestionCurrentValue =
  | ModelDowngradeValue
  | TimeoutAdjustmentValue
  | ToolPruningValue
  | AutonomyUpgradeValue;

export type SuggestionSuggestedValue =
  | ModelDowngradeValue
  | TimeoutAdjustmentValue
  | ToolPruningValue
  | AutonomyUpgradeValue;

export interface ImpactEstimate {
  costSavingPct?: number;
  latencyImpactPct?: number;
  reliabilityImpactPct?: number;
}

export interface AnalysisMetadata {
  totalRecords: number;
  analyzerVersion: string;
  [key: string]: unknown;
}

export const suggestionTypeEnum = pgEnum('suggestion_type', [
  'model_downgrade',
  'timeout_adjustment',
  'tool_pruning',
  'autonomy_upgrade',
]);

export const suggestionStatusEnum = pgEnum('suggestion_status', [
  'pending',
  'applied',
  'dismissed',
  'blocked',
]);

export const optimizationSuggestions = pgTable(
  'optimization_suggestions',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    workflowDefinitionId: uuid('workflow_definition_id').notNull(),
    nodeId: text('node_id').notNull(),
    suggestionType: suggestionTypeEnum('suggestion_type').notNull(),
    status: suggestionStatusEnum('status').notNull().default('pending'),
    confidence: real('confidence').notNull(),
    currentValue: jsonb('current_value')
      .notNull()
      .$type<SuggestionCurrentValue>(),
    suggestedValue: jsonb('suggested_value')
      .notNull()
      .$type<SuggestionSuggestedValue>(),
    rationale: text('rationale').notNull(),
    impactEstimate: jsonb('impact_estimate').$type<ImpactEstimate | null>(),
    analysisMetadata: jsonb('analysis_metadata').$type<AnalysisMetadata | null>(),
    analysisPeriodStart: timestamp('analysis_period_start', {
      withTimezone: true,
    }).notNull(),
    analysisPeriodEnd: timestamp('analysis_period_end', {
      withTimezone: true,
    }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedByUserId: uuid('applied_by_user_id'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedByUserId: uuid('dismissed_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_optimization_suggestions_tenant_id').on(table.tenantId),
    index('idx_optimization_suggestions_tenant_workflow').on(
      table.tenantId,
      table.workflowDefinitionId,
    ),
    index('idx_optimization_suggestions_tenant_workflow_node').on(
      table.tenantId,
      table.workflowDefinitionId,
      table.nodeId,
    ),
    index('idx_optimization_suggestions_status').on(table.status),
    ...createDirectTenantPolicies('optimization_suggestions'),
  ],
);

export type OptimizationSuggestion =
  typeof optimizationSuggestions.$inferSelect;
export type NewOptimizationSuggestion =
  typeof optimizationSuggestions.$inferInsert;
