import { z } from 'zod';

const executionStepAttemptErrorSchema = z.object({
  attempt: z.number().int(),
  error: z.string(),
  timestamp: z.string(),
});

const executionStepErrorMessageSchema = z
  .object({
    message: z.string(),
    stack: z.string().optional(),
    attempts: z.array(executionStepAttemptErrorSchema).optional(),
  })
  .nullable();

const executionErrorMessageSchema = z
  .object({ message: z.string(), stack: z.string().optional() })
  .nullable();

export const executionStepSchema = z.object({
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

export const executionResponseSchema = z.object({
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
  steps: z.array(executionStepSchema).optional(),
});

export type ExecutionResponseDto = z.infer<typeof executionResponseSchema>;
export type ExecutionStepResponseDto = z.infer<typeof executionStepSchema>;
export type ExecutionStepErrorResponseDto = z.infer<
  typeof executionStepErrorMessageSchema
>;
