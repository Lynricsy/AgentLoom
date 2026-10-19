import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ZodValidationException } from 'nestjs-zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  executionResponseSchema,
  executionStepSchema,
} from '../dto/execution-response.dto';
import { listExecutionsQuerySchema } from '../dto/list-executions-query.dto';
import { resolveToolPermissionSchema } from '../dto/resolve-tool-permission.dto';
import { InterveneStepDto } from '../dto/intervene-step.dto';
import { RunWorkflowDto } from '../dto/run-workflow.dto';
import { ListDeadLetterJobsQueryDto } from '../dto/list-dead-letter-jobs-query.dto';
import { PtyBufferDumpDto, PtyWriteDto } from '../dto/pty-proxy.dto';

const executionId = '019391d4-d000-7000-8000-000000000004';
const workflowId = '019391d4-c000-7000-8000-000000000003';
const workflowVersionId = '019391d4-e000-7000-8000-000000000005';
const tenantId = '019391d4-a000-7000-8000-000000000001';
const userId = '019391d4-b000-7000-8000-000000000002';
const stepId = '019391d4-f000-7000-8000-000000000006';
const timestamp = '2025-01-01T00:00:00.000Z';
const pipe = new ZodValidationPipe();

function transformWithDto<T>(
  value: unknown,
  metatype: new (...args: never[]) => T,
  type: ArgumentMetadata['type'],
): T {
  return pipe.transform(value, {
    type,
    metatype,
    data: undefined,
  }) as T;
}

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

  it('应解析按版本与定义来源筛选的 query 参数', () => {
    expect(
      listExecutionsQuerySchema.parse({
        workflow_version_id: workflowVersionId,
        definitionSource: 'draft',
      }),
    ).toEqual({
      page: 1,
      limit: 20,
      status: undefined,
      workflowVersionId,
      definitionSource: 'draft',
    });
    expect(() =>
      listExecutionsQuerySchema.parse({ workflowVersionId: 'not-a-uuid' }),
    ).toThrow();
    expect(() =>
      listExecutionsQuerySchema.parse({ definitionSource: 'published' }),
    ).toThrow();
  });

  it('应兼容 run workflow body 的 snake_case 与 camelCase', () => {
    expect(
      transformWithDto(
        {
          input_params: { topic: 'AI 趋势' },
          launch_source: 'mobile',
        },
        RunWorkflowDto,
        'body',
      ),
    ).toEqual({
      inputParams: { topic: 'AI 趋势' },
      launchSource: 'mobile',
    });

    expect(
      transformWithDto(
        {
          inputParams: { topic: 'AgentLoom' },
          launchSource: 'api',
        },
        RunWorkflowDto,
        'body',
      ),
    ).toEqual({
      inputParams: { topic: 'AgentLoom' },
      launchSource: 'api',
    });
  });

  it('应兼容 resolve tool permission body 的 snake_case 与 camelCase rememberScope', () => {
    expect(
      resolveToolPermissionSchema.parse({
        action: 'approve',
        remember_scope: 'conversation_category',
      }),
    ).toEqual({
      action: 'approve',
      rememberScope: 'conversation_category',
    });

    expect(
      resolveToolPermissionSchema.parse({
        action: 'deny',
        rememberScope: 'none',
      }),
    ).toEqual({
      action: 'deny',
      rememberScope: 'none',
    });
  });

  it('intervene body 的跨字段约束应由全局管道拦截（AllExceptionsFilter 映射为 422），而不是 controller 内裸 parse 抛 500', () => {
    const invalidBodies = [
      { action: 'modify' },
      { action: 'approve', modifiedContent: 'x' },
    ];
    for (const body of invalidBodies) {
      expect(() => transformWithDto(body, InterveneStepDto, 'body')).toThrow(
        ZodValidationException,
      );
    }

    expect(
      transformWithDto(
        { action: 'modify', modifiedContent: '改写' },
        InterveneStepDto,
        'body',
      ),
    ).toEqual({ action: 'modify', modifiedContent: '改写' });
  });

  it('dlq 列表 query 应拒绝非法分页（D-081），合法值转为数字并带默认值', () => {
    for (const query of [
      { limit: 'abc' },
      { page: '-1' },
      { page: '0' },
      { limit: '0' },
      { limit: '100000' },
      { page: '1.5' },
    ]) {
      expect(() =>
        transformWithDto(query, ListDeadLetterJobsQueryDto, 'query'),
      ).toThrow(ZodValidationException);
    }

    expect(transformWithDto({}, ListDeadLetterJobsQueryDto, 'query')).toEqual({
      page: 1,
      limit: 20,
    });
    expect(
      transformWithDto(
        { page: '2', limit: '100' },
        ListDeadLetterJobsQueryDto,
        'query',
      ),
    ).toEqual({ page: 2, limit: 100 });
  });

  it('pty buffer-dump/write body 缺 sessionId/data 或带未知字段应 422（D-088），并兼容 session_id', () => {
    for (const body of [
      {},
      { sessionId: '' },
      { sessionId: 's1', offset: -1 },
      { sessionId: 's1', bogus: 1 },
    ]) {
      expect(() => transformWithDto(body, PtyBufferDumpDto, 'body')).toThrow(
        ZodValidationException,
      );
    }
    for (const body of [{}, { sessionId: 's1' }, { data: 'ls\n' }]) {
      expect(() => transformWithDto(body, PtyWriteDto, 'body')).toThrow(
        ZodValidationException,
      );
    }

    expect(
      transformWithDto(
        { session_id: 's1', offset: 0, limit: 10 },
        PtyBufferDumpDto,
        'body',
      ),
    ).toEqual({ sessionId: 's1', offset: 0, limit: 10 });
    expect(
      transformWithDto({ sessionId: 's1', data: 'ls\n' }, PtyWriteDto, 'body'),
    ).toEqual({ sessionId: 's1', data: 'ls\n' });
    expect(
      transformWithDto({ session_id: 's1', data: '' }, PtyWriteDto, 'body'),
    ).toEqual({ sessionId: 's1', data: '' });
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
      attemptCount: 0,
      isEncrypted: false,
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
      definitionSource: 'version' as const,
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

    // 草稿运行没有对应版本
    const draftPayload = {
      ...payload,
      workflowVersionId: null,
      definitionSource: 'draft' as const,
    };
    expect(executionResponseSchema.parse(draftPayload)).toEqual(draftPayload);
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
      attemptCount: 1,
      isEncrypted: false,
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
      attemptCount: 0,
      isEncrypted: false,
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
      definitionSource: 'version' as const,
      tenantId,
      status: 'failed' as const,
      triggerType: 'manual' as const,
      inputParams: { source: 'csv' },
      definitionSnapshot: {
        nodes: [
          { id: 'node-source', type: 'agent', data: { label: '上游节点' } },
        ],
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
