import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';
import { workflowExecutions } from './workflow-executions.schema';
import { executionSteps } from './execution-steps.schema';

export type ToolCallRecordStatus = 'success' | 'error';

export type ExecutionRecordErrorType =
  | 'tool_error'
  | 'llm_error'
  | 'validation_error'
  | 'timeout';

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  status: ToolCallRecordStatus;
}

export interface ErrorRecord {
  errorType: ExecutionRecordErrorType;
  errorMessage: string;
  timestamp: string;
  nodeId: string;
  stepId: string;
}

export interface RepairAttempt {
  attemptNumber: number;
  result: unknown;
  success: boolean;
}

export interface SelfRepairRecord {
  originalOutput: unknown;
  validationError: string;
  repairAttempts: RepairAttempt[];
}

export interface IoSnapshots {
  stepInput: unknown;
  stepOutput: unknown;
}

export interface LlmInteractionRecord {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface StepTelemetryData {
  toolCalls: ToolCallRecord[];
  errors: ErrorRecord[];
  selfRepairs: SelfRepairRecord[];
  ioSnapshots: IoSnapshots;
  llmInteractions: LlmInteractionRecord;
}

export interface ExecutionSummaryData {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  totalToolCalls: number;
  totalErrors: number;
  totalSelfRepairs: number;
  totalTokens: number;
  totalLatencyMs: number;
  avgStepLatencyMs: number;
  executionDurationMs: number;
}

export const recordTypeEnum = pgEnum('record_type', [
  'step_telemetry',
  'execution_summary',
]);

export const agentExecutionRecords = pgTable(
  'agent_execution_records',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').references(() => executionSteps.id, {
      onDelete: 'set null',
    }),
    nodeId: text('node_id'),
    recordType: recordTypeEnum('record_type').notNull(),
    telemetryData: jsonb('telemetry_data').$type<StepTelemetryData | null>(),
    summaryData: jsonb('summary_data').$type<ExecutionSummaryData | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_execution_records_tenant_id').on(table.tenantId),
    index('idx_execution_records_tenant_execution_id').on(
      table.tenantId,
      table.executionId,
    ),
    index('idx_execution_records_execution_id').on(table.executionId),
    index('idx_execution_records_step_id').on(table.stepId),
    index('idx_execution_records_record_type').on(table.recordType),
    index('idx_execution_records_created_at').on(table.createdAt),
    check(
      'agent_execution_records_payload_check',
      sql`(
        (${table.recordType} = 'step_telemetry' AND ${table.telemetryData} IS NOT NULL AND ${table.summaryData} IS NULL)
        OR
        (${table.recordType} = 'execution_summary' AND ${table.summaryData} IS NOT NULL AND ${table.telemetryData} IS NULL)
      )`,
    ),
    ...createDirectTenantPolicies('agent_execution_records'),
  ],
);

export type AgentExecutionRecord = typeof agentExecutionRecords.$inferSelect;
export type NewAgentExecutionRecord = typeof agentExecutionRecords.$inferInsert;
