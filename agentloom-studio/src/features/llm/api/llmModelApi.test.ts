import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateLlmModelInput,
} from '../types'
import {
  createLlmModel,
  testProviderConnection,
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
      providerId: 'provider-uuid-1',
      modelId: 'Qwen/Qwen3-Embedding-8B',
      modelType: 'embedding',
      capabilities: {},
      embeddingDimensions: 4096,
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

  it('测试 Provider 连接时应传入 provider id 和可选 timeoutMs', async () => {
    const providerId = 'provider-uuid-1'
    const timeoutMs = 15000

    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: { success: true, latencyMs: 80 },
      }),
    })

    await testProviderConnection(providerId, timeoutMs)

    expect(postMock).toHaveBeenCalledWith(`llm-providers/${providerId}/test-connection`, {
      json: { timeoutMs },
    })
  })

  it('测试 Provider 连接不传 timeoutMs 时发送空对象', async () => {
    const providerId = 'provider-uuid-2'

    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: { success: true, latencyMs: 42 },
      }),
    })

    await testProviderConnection(providerId)

    expect(postMock).toHaveBeenCalledWith(`llm-providers/${providerId}/test-connection`, {
      json: {},
    })
  })
})
