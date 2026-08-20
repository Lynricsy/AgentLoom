import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const executionStepAttemptErrorSchema = z.object({
  attempt: z.number().int(),
  error: z.string(),
  timestamp: z.string(),
});

const executionFieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

const executionTypeMismatchSchema = z.object({
  sourcePortId: z.string().optional(),
  targetPortId: z.string().optional(),
  sourceType: z.string(),
  targetType: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  edgeId: z.string().optional(),
});

const executionStructuredErrorSchema = z
  .object({
    message: z.string().optional(),
    title: z.string().optional(),
    detail: z.string().optional(),
    type: z.string().optional(),
    nodeId: z.string().optional(),
    stack: z.string().optional(),
    attempts: z.array(executionStepAttemptErrorSchema).optional(),
    errors: z.array(executionFieldErrorSchema).optional(),
    typeMismatch: executionTypeMismatchSchema.optional(),
  })
  .nullable();

const executionStepErrorMessageSchema = executionStructuredErrorSchema;

const executionErrorMessageSchema = executionStructuredErrorSchema;

export const ExecutionStepResponseSwaggerSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  nodeId: z.string(),
  stepOrder: z.number().int(),
  status: z.enum([
    'pending',
    'queued',
    'running',
    'waiting_intervention',
    'completed',
    'failed',
    'skipped',
    'cancelled',
  ]),
  // 步骤输入、节点数据、结果与检查点均来自动态 JSONB。
  input: z.record(z.string(), z.unknown()).nullable(),
  nodeType: z.string().nullable(),
  nodeData: z.record(z.string(), z.unknown()).nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  checkpointData: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: executionStepErrorMessageSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ExecutionResponseSwaggerSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowDefinitionId: z.string().uuid(),
  workflowVersionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: z.enum([
    'pending',
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled',
  ]),
  triggerType: z.enum(['manual', 'api', 'webhook', 'system']),
  // 执行参数与定义快照来自动态 JSONB。
  inputParams: z.record(z.string(), z.unknown()),
  definitionSnapshot: z.record(z.string(), z.unknown()),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  errorMessage: executionErrorMessageSchema,
  totalSteps: z.number().int(),
  completedSteps: z.number().int(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(ExecutionStepResponseSwaggerSchema).optional(),
});

export const ExecutionEnvelopeResponseSwaggerSchema = z.object({
  data: ExecutionResponseSwaggerSchema,
});

export const ExecutionListMetaSwaggerSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export const ExecutionListResponseSwaggerSchema = z.object({
  data: z.array(ExecutionResponseSwaggerSchema),
  meta: ExecutionListMetaSwaggerSchema,
});

export class ExecutionEnvelopeResponseSwaggerDto extends createZodDto(
  ExecutionEnvelopeResponseSwaggerSchema,
) {}

export class ExecutionListResponseSwaggerDto extends createZodDto(
  ExecutionListResponseSwaggerSchema,
) {}

export const executionStepSchema = ExecutionStepResponseSwaggerSchema;
export const executionResponseSchema = ExecutionResponseSwaggerSchema;

export type ExecutionResponseDto = z.infer<
  typeof ExecutionResponseSwaggerSchema
>;
export type ExecutionStepResponseDto = z.infer<
  typeof ExecutionStepResponseSwaggerSchema
>;
export type ExecutionStepErrorResponseDto = z.infer<
  typeof executionStepErrorMessageSchema
>;
export type ExecutionEnvelopeResponseDto = z.infer<
  typeof ExecutionEnvelopeResponseSwaggerSchema
>;
export type ExecutionListResponseDto = z.infer<
  typeof ExecutionListResponseSwaggerSchema
>;
