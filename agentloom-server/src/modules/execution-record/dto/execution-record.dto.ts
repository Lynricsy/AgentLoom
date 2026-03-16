import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const QueryExecutionRecordsSchema = z.object({
  executionId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  recordType: z.enum(['step_telemetry', 'execution_summary']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export class QueryExecutionRecordsDto extends createZodDto(
  QueryExecutionRecordsSchema,
) {}

export type QueryExecutionRecordsInput = z.infer<
  typeof QueryExecutionRecordsSchema
>;

const ToolCallRecordSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  durationMs: z.number(),
  status: z.enum(['success', 'error']),
});

const ErrorRecordSchema = z.object({
  errorType: z.enum([
    'tool_error',
    'llm_error',
    'validation_error',
    'timeout',
  ]),
  errorMessage: z.string(),
  timestamp: z.string().datetime(),
  nodeId: z.string(),
  stepId: z.string().uuid(),
});

const RepairAttemptSchema = z.object({
  attemptNumber: z.number().int(),
  result: z.unknown(),
  success: z.boolean(),
});

const SelfRepairRecordSchema = z.object({
  originalOutput: z.unknown(),
  validationError: z.string(),
  repairAttempts: z.array(RepairAttemptSchema),
});

const IoSnapshotsSchema = z.object({
  stepInput: z.unknown(),
  stepOutput: z.unknown(),
});

const LlmInteractionRecordSchema = z.object({
  modelId: z.string(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  latencyMs: z.number(),
});

export const StepTelemetryDataSchema = z.object({
  toolCalls: z.array(ToolCallRecordSchema),
  errors: z.array(ErrorRecordSchema),
  selfRepairs: z.array(SelfRepairRecordSchema),
  ioSnapshots: IoSnapshotsSchema,
  llmInteractions: LlmInteractionRecordSchema,
});

export const ExecutionSummaryDataSchema = z.object({
  totalSteps: z.number(),
  completedSteps: z.number(),
  failedSteps: z.number(),
  totalToolCalls: z.number(),
  totalErrors: z.number(),
  totalSelfRepairs: z.number(),
  totalTokens: z.number(),
  totalLatencyMs: z.number(),
  avgStepLatencyMs: z.number(),
  executionDurationMs: z.number(),
});

export const ExecutionRecordResponseSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid().nullable(),
  nodeId: z.string().nullable(),
  recordType: z.enum(['step_telemetry', 'execution_summary']),
  telemetryData: StepTelemetryDataSchema.nullable(),
  summaryData: ExecutionSummaryDataSchema.nullable(),
  createdAt: z.string().datetime(),
});

export const PaginatedExecutionRecordsResponseSchema = z.object({
  data: z.array(ExecutionRecordResponseSchema),
  meta: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});

export class PaginatedExecutionRecordsResponseDto extends createZodDto(
  PaginatedExecutionRecordsResponseSchema,
) {}
