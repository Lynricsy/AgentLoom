import { describe, expect, it } from 'vitest';
import {
  executionResponseSchema,
  executionStepSchema,
} from '../dto/execution-response.dto';
import { listExecutionsQuerySchema } from '../dto/list-executions-query.dto';

const executionId = '019391d4-d000-7000-8000-000000000004';
const workflowId = '019391d4-c000-7000-8000-000000000003';
const workflowVersionId = '019391d4-e000-7000-8000-000000000005';
const tenantId = '019391d4-a000-7000-8000-000000000001';
const userId = '019391d4-b000-7000-8000-000000000002';
const stepId = '019391d4-f000-7000-8000-000000000006';
const timestamp = '2025-01-01T00:00:00.000Z';

describe('execution dto schemas', () => {
  it('应将 pageSize 和 page_size 兼容归一化为 limit', () => {
    expect(listExecutionsQuerySchema.parse({ pageSize: '10' })).toEqual({
      page: 1,
      limit: 10,
      status: undefined,
    });

    expect(listExecutionsQuerySchema.parse({ page_size: '15' })).toEqual({
      page: 1,
      limit: 15,
      status: undefined,
    });
  });

  it('应验证 execution 响应结构', () => {
    const step = {
      id: stepId,
      executionId,
      nodeId: 'node-with-unbounded-length-identifier-that-should-still-pass',
      stepOrder: 0,
      status: 'pending' as const,
      nodeType: 'trigger',
      nodeData: { label: 'Start' },
      result: null,
      checkpointData: { cursor: 'ckpt-1' },
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(executionStepSchema.parse(step)).toEqual(step);

    const payload = {
      id: executionId,
      workflowId,
      workflowDefinitionId: workflowId,
      workflowVersionId,
      tenantId,
      status: 'pending' as const,
      triggerType: 'manual' as const,
      inputParams: { source: 'csv' },
      definitionSnapshot: {
        nodes: [{ id: 'node-1', type: 'trigger', data: { label: 'Start' } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        metadata: { nodeCount: 1 },
      },
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      errorMessage: null,
      totalSteps: 1,
      completedSteps: 0,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      steps: [step],
    };

    expect(executionResponseSchema.parse(payload)).toEqual(payload);
  });
});
