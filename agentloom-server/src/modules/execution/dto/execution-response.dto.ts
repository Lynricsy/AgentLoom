import { z } from 'zod';

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
  nodeType: z.string().nullable(),
  nodeData: z.record(z.string(), z.unknown()).nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  checkpointData: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: z
    .object({ message: z.string(), stack: z.string().optional() })
    .nullable(),
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
  errorMessage: z
    .object({ message: z.string(), stack: z.string().optional() })
    .nullable(),
  totalSteps: z.number().int(),
  completedSteps: z.number().int(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(executionStepSchema).optional(),
});

export type ExecutionResponseDto = z.infer<typeof executionResponseSchema>;
export type ExecutionStepResponseDto = z.infer<typeof executionStepSchema>;
