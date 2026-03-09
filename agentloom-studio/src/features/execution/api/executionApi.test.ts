import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelExecution, getExecution, runWorkflow } from './executionApi'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn((..._args: unknown[]) => ({ json: jsonMock }))
  const postMock = vi.fn((..._args: unknown[]) => ({ json: jsonMock }))

  return {
    jsonMock,
    getMock,
    postMock,
  }
})

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: mocks.getMock,
    post: mocks.postMock,
  },
  toSnakeBody: (data: Record<string, unknown>) => {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      result[snakeKey] = value
    }
    return result
  },
}))

const mockResponse = {
  data: {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    status: 'pending',
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
}

describe('executionApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.jsonMock.mockResolvedValue(mockResponse)
  })

  describe('runWorkflow', () => {
    it('发送 POST 请求到正确的路径', async () => {
      await runWorkflow('wf-001')

      expect(mocks.postMock).toHaveBeenCalledWith('workflow-definitions/wf-001/run', {
        json: undefined,
      })
    })

    it('带 inputParams 发送请求（转为 snake_case）', async () => {
      await runWorkflow('wf-001', { myParam: 'value' })

      expect(mocks.postMock).toHaveBeenCalledWith('workflow-definitions/wf-001/run', {
        json: { input_params: { myParam: 'value' } },
      })
    })

    it('返回 API 响应', async () => {
      const result = await runWorkflow('wf-001')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getExecution', () => {
    it('发送 GET 请求到正确的路径', async () => {
      await getExecution('exec-001')

      expect(mocks.getMock).toHaveBeenCalledWith('executions/exec-001')
    })

    it('返回 API 响应', async () => {
      const result = await getExecution('exec-001')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('cancelExecution', () => {
    it('发送 POST 请求到正确的路径', async () => {
      await cancelExecution('exec-001')

      expect(mocks.postMock).toHaveBeenCalledWith('executions/exec-001/cancel')
    })

    it('返回 API 响应', async () => {
      const result = await cancelExecution('exec-001')
      expect(result).toEqual(mockResponse)
    })
  })
})
