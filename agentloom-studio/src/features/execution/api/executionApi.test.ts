import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelExecution,
  getExecution,
  getExecutionStepWorkspaceFile,
  getExecutionStepWorkspaceTree,
  resolveIntervention,
  resolveToolPermission,
  runWorkflow,
} from './executionApi'

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

    it('带 launch payload 发送请求（转为 snake_case）', async () => {
      await runWorkflow('wf-001', {
        inputParams: { myParam: 'value' },
        schemaVersion: 3,
        launchSource: 'web-studio',
      })

      expect(mocks.postMock).toHaveBeenCalledWith('workflow-definitions/wf-001/run', {
        json: {
          input_params: { myParam: 'value' },
          schema_version: 3,
          launch_source: 'web-studio',
        },
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

  describe('resolveIntervention', () => {
    it('发送 POST 请求到正确路径并转换请求体为 snake_case', async () => {
      await resolveIntervention('exec-001', 'step-001', {
        action: 'modify',
        modifiedContent: '修改内容',
        feedback: '修改原因',
      })

      expect(mocks.postMock).toHaveBeenCalledWith(
        'executions/exec-001/steps/step-001/intervene',
        {
          json: {
            action: 'modify',
            modified_content: '修改内容',
            feedback: '修改原因',
          },
        },
      )
    })

    it('返回 API 响应', async () => {
      const result = await resolveIntervention('exec-001', 'step-001', {
        action: 'approve',
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('resolveToolPermission', () => {
    it('发送 POST 请求到正确路径并转换请求体为 snake_case', async () => {
      await resolveToolPermission('exec-001', 'step-001', 'tool-001', {
        action: 'approve',
      })

      expect(mocks.postMock).toHaveBeenCalledWith(
        'executions/exec-001/steps/step-001/tool-calls/tool-001/resolve',
        {
          json: {
            action: 'approve',
          },
        },
      )
    })

    it('在传入 rememberScope 时一并发送', async () => {
      await resolveToolPermission('exec-001', 'step-001', 'tool-001', {
        action: 'approve',
        rememberScope: 'conversation_category',
      })

      expect(mocks.postMock).toHaveBeenCalledWith(
        'executions/exec-001/steps/step-001/tool-calls/tool-001/resolve',
        {
          json: {
            action: 'approve',
            remember_scope: 'conversation_category',
          },
        },
      )
    })
  })

  describe('workspace', () => {
    it('发送 GET 请求到 step workspace tree 路径', async () => {
      await getExecutionStepWorkspaceTree('exec-001', 'step-001')

      expect(mocks.getMock).toHaveBeenCalledWith(
        'executions/exec-001/steps/step-001/workspace/tree',
      )
    })

    it('发送 GET 请求到 step workspace file 路径并保留目录分隔符', async () => {
      await getExecutionStepWorkspaceFile('exec-001', 'step-001', 'src/main.ts')

      expect(mocks.getMock).toHaveBeenCalledWith(
        'executions/exec-001/steps/step-001/workspace/files/src/main.ts',
      )
    })
  })
})
