import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrigger, updateTrigger } from './triggerApi'

const { postMock, postJsonMock, patchMock, patchJsonMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  postJsonMock: vi.fn(),
  patchMock: vi.fn(),
  patchJsonMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}))

describe('triggerApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    postMock.mockReturnValue({ json: postJsonMock })
    patchMock.mockReturnValue({ json: patchJsonMock })
  })

  it('创建 webhook trigger 时保留 camelCase 配置字段', async () => {
    postJsonMock.mockResolvedValue({
      data: {
        id: 'trigger-1',
        workflowDefinitionId: 'workflow-1',
        tenantId: 'tenant-1',
        name: 'Webhook Trigger',
        description: null,
        type: 'webhook',
        config: {
          authMode: 'simple',
          token: 'token-1',
          secret: 'secret-1',
          ipWhitelist: [],
        },
        isEnabled: true,
        lastTriggeredAt: null,
        nextFireAt: null,
        triggerCount: 0,
        createdBy: 'user-1',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    })

    await createTrigger('workflow-1', {
      name: 'Webhook Trigger',
      type: 'webhook',
      description: '用于验证序列化',
      isEnabled: true,
      config: {
        ipWhitelist: [],
      },
    })

    expect(postMock).toHaveBeenCalledWith('workflow-definitions/workflow-1/triggers', {
      json: {
        name: 'Webhook Trigger',
        type: 'webhook',
        description: '用于验证序列化',
        isEnabled: true,
        config: {
          ipWhitelist: [],
        },
      },
    })
  })

  it('更新 api_event trigger 时保留 camelCase 配置字段', async () => {
    patchJsonMock.mockResolvedValue({
      data: {
        id: 'trigger-2',
        workflowDefinitionId: 'workflow-1',
        tenantId: 'tenant-1',
        name: 'API Event Trigger',
        description: null,
        type: 'api_event',
        config: {
          eventSource: 'order-service',
          eventType: 'order.completed',
          filterExpression: 'payload.region == \"cn\"',
        },
        isEnabled: true,
        lastTriggeredAt: null,
        nextFireAt: null,
        triggerCount: 0,
        createdBy: 'user-1',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    })

    await updateTrigger('workflow-1', 'trigger-2', {
      config: {
        eventSource: 'order-service',
        eventType: 'order.completed',
        filterExpression: 'payload.region == \"cn\"',
      },
    })

    expect(patchMock).toHaveBeenCalledWith(
      'workflow-definitions/workflow-1/triggers/trigger-2',
      {
        json: {
          config: {
            eventSource: 'order-service',
            eventType: 'order.completed',
            filterExpression: 'payload.region == \"cn\"',
          },
        },
      },
    )
  })
})
