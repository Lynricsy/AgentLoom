import { describe, expect, it } from 'vitest'
import { normalizeExecutionDetail } from './normalizeExecutionDetail'

describe('normalizeExecutionDetail', () => {
  it('优先使用 execution step 的真实 input，而不是 nodeData', () => {
    const normalized = normalizeExecutionDetail({
      id: 'exec-1',
      tenantId: 'tenant-1',
      workflowDefinitionId: 'wf-1',
      workflowVersionId: 'ver-1',
      status: 'completed',
      triggerType: 'manual',
      inputParams: null,
      result: null,
      definitionSnapshot: {
        nodes: [
          {
            id: 'node-1',
            type: 'agent',
            data: { label: 'Node One', nodeType: 'agent' },
          },
        ],
        edges: [],
      },
      startedAt: '2026-03-10T10:00:00.000Z',
      completedAt: '2026-03-10T10:00:05.000Z',
      errorMessage: null,
      createdAt: '2026-03-10T10:00:00.000Z',
      updatedAt: '2026-03-10T10:00:05.000Z',
      steps: [
        {
          id: 'step-1',
          executionId: 'exec-1',
          nodeId: 'node-1',
          stepOrder: 0,
          status: 'completed',
          input: { prompt: '真实输入' },
          nodeType: 'agent',
          nodeData: { label: '配置元数据' },
          result: { answer: 'done' },
          checkpointData: null,
          errorMessage: null,
          startedAt: '2026-03-10T10:00:00.000Z',
          completedAt: '2026-03-10T10:00:05.000Z',
          createdAt: '2026-03-10T10:00:00.000Z',
          updatedAt: '2026-03-10T10:00:05.000Z',
        },
      ],
    })

    expect(normalized.steps[0]?.input).toEqual({ prompt: '真实输入' })
    expect(normalized.steps[0]?.input).not.toEqual({ label: '配置元数据' })
  })

  it('保留 nodeData 与结构化 errorDetail 以支持时间线展示', () => {
    const normalized = normalizeExecutionDetail({
      id: 'exec-1',
      tenantId: 'tenant-1',
      workflowDefinitionId: 'wf-1',
      workflowVersionId: 'ver-1',
      status: 'failed',
      triggerType: 'manual',
      inputParams: null,
      result: null,
      definitionSnapshot: {
        nodes: [],
        edges: [],
      },
      startedAt: '2026-03-10T10:00:00.000Z',
      completedAt: '2026-03-10T10:00:05.000Z',
      errorMessage: null,
      createdAt: '2026-03-10T10:00:00.000Z',
      updatedAt: '2026-03-10T10:00:05.000Z',
      steps: [
        {
          id: 'step-1',
          executionId: 'exec-1',
          nodeId: 'node-1',
          stepOrder: 0,
          status: 'failed',
          input: null,
          nodeType: 'agent',
          nodeData: { autonomyMode: 'LLM_DECIDE' },
          result: null,
          checkpointData: null,
          errorMessage: {
            message: '请求超限',
            title: 'Rate Limit',
            detail: 'Too many requests',
            type: 'https://example.com/errors/rate-limit',
            nodeId: 'node-1',
            errors: [{ field: 'provider', message: '超过速率限制' }],
            typeMismatch: {
              sourceNodeId: 'node-source',
              sourcePortId: 'answer',
              sourceType: 'text',
              targetNodeId: 'node-1',
              targetPortId: 'input',
              targetType: 'json',
            },
            attempts: [
              {
                attempt: 1,
                message: '第一次失败',
                timestamp: '2026-03-10T10:00:02.000Z',
              },
            ],
          },
          startedAt: '2026-03-10T10:00:00.000Z',
          completedAt: '2026-03-10T10:00:05.000Z',
          createdAt: '2026-03-10T10:00:00.000Z',
          updatedAt: '2026-03-10T10:00:05.000Z',
        },
      ],
    })

    expect(normalized.steps[0]?.nodeData).toEqual({ autonomyMode: 'LLM_DECIDE' })
    expect(normalized.steps[0]?.errorMessage).toBe('Too many requests')
    expect(normalized.steps[0]?.errorDetail).toMatchObject({
      title: 'Rate Limit',
      detail: 'Too many requests',
      nodeId: 'node-1',
      errors: [{ field: 'provider', message: '超过速率限制' }],
      typeMismatch: {
        sourceType: 'text',
        targetType: 'json',
      },
    })
    expect(normalized.steps[0]?.retryHistory).toEqual([
      {
        attempt: 1,
        error: '第一次失败',
        timestamp: '2026-03-10T10:00:02.000Z',
      },
    ])
  })
})
