import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateLlmModelInput,
  TestConnectionInput,
} from '../types'
import {
  createLlmModel,
  testPrivateCloudConnection,
} from './llmModelApi'

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    post: postMock,
  },
}))

describe('llmModelApi', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('创建模型时应保留 camelCase 字段名', async () => {
    const payload: CreateLlmModelInput = {
      name: 'QA SiliconFlow Qwen3 Embedding 8B',
      provider: 'private_cloud',
      modelType: 'embedding',
      modelName: 'Qwen/Qwen3-Embedding-8B',
      parameters: {
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stop: [],
      },
      apiKeyId: 'key-1',
      embeddingDimensions: 4096,
      endpointUrl: 'https://api.siliconflow.cn',
      authMethod: 'api_key',
      timeoutMs: 15000,
      isDefault: false,
    }

    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { id: 'cfg-1' } }),
    })

    await createLlmModel(payload)

    expect(postMock).toHaveBeenCalledWith('llm-models', {
      json: payload,
    })
  })

  it('测试私有云连接时应保留 camelCase 字段名', async () => {
    const payload: TestConnectionInput = {
      endpointUrl: 'https://api.siliconflow.cn',
      authMethod: 'api_key',
      apiKeyId: 'key-1',
      timeoutMs: 15000,
    }

    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: { success: true, latencyMs: 80 },
      }),
    })

    await testPrivateCloudConnection(payload)

    expect(postMock).toHaveBeenCalledWith('llm/test-connection', {
      json: payload,
    })
  })
})
