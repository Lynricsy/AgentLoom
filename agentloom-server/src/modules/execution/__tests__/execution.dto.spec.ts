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
      input: { greeting: 'hello' },
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

  it('应允许步骤错误消息携带重试 attempts', () => {
    const step = {
      id: stepId,
      executionId,
      nodeId: 'node-1',
      stepOrder: 1,
      status: 'failed' as const,
      input: { prompt: '总结一下' },
      nodeType: 'agent',
      nodeData: { label: 'LLM' },
      result: null,
      checkpointData: {
        attempts: [
          {
            attempt: 1,
            error: '第一次失败',
            timestamp,
          },
        ],
      },
      errorMessage: {
        message: '节点执行失败',
        stack: 'Error: boom',
        attempts: [
          {
            attempt: 1,
            error: '第一次失败',
            timestamp,
          },
        ],
      },
      startedAt: timestamp,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(executionStepSchema.parse(step)).toEqual(step);
  });

  it('应允许结构化错误携带 field errors 与 typeMismatch', () => {
    const structuredError = {
      message: '端口类型不匹配',
      title: '端口类型不匹配',
      detail: '上游输出与下游输入的数据类型不兼容',
      type: 'https://agentloom.dev/errors/node-type-mismatch',
      nodeId: 'node-target',
      stack: 'Error: boom',
      attempts: [
        {
          attempt: 1,
          error: '第一次失败',
          timestamp,
        },
      ],
      errors: [
        {
          field: 'input.image',
          message: '图片输入无效',
        },
      ],
      typeMismatch: {
        sourcePortId: 'output-text',
        targetPortId: 'input-image',
        sourceType: 'text',
        targetType: 'image',
        sourceNodeId: 'node-source',
        targetNodeId: 'node-target',
        edgeId: 'edge-1',
      },
    };

    const step = {
      id: stepId,
      executionId,
      nodeId: 'node-target',
      stepOrder: 1,
      status: 'failed' as const,
      input: { prompt: '总结一下' },
      nodeType: 'agent',
      nodeData: { label: 'LLM' },
      result: null,
      checkpointData: null,
      errorMessage: structuredError,
      startedAt: timestamp,
      completedAt: timestamp,
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
      status: 'failed' as const,
      triggerType: 'manual' as const,
      inputParams: { source: 'csv' },
      definitionSnapshot: {
        nodes: [{ id: 'node-source', type: 'agent', data: { label: '上游节点' } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        metadata: { nodeCount: 1 },
      },
      startedAt: timestamp,
      completedAt: timestamp,
      failedAt: timestamp,
      cancelledAt: null,
      errorMessage: structuredError,
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
