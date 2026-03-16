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

export const ExecutionRecordResponseSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid().nullable(),
  nodeId: z.string().nullable(),
  recordType: z.enum(['step_telemetry', 'execution_summary']),
  data: z.record(z.string(), z.unknown()),
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
