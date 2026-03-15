import { describe, expect, it } from 'vitest'
import {
  AUTH_METHODS,
  getLlmConfigState,
  getProviderInfo,
  isLlmProvider,
  LLM_PROVIDER_IDS,
  parseLlmModelConfig,
  toLlmModelConfig,
  type LlmModelInfo,
} from '..'

describe('private_cloud 类型与辅助函数', () => {
  it('LLM_PROVIDER_IDS 包含 private_cloud', () => {
    expect(LLM_PROVIDER_IDS).toContain('private_cloud')
  })

  it('AUTH_METHODS 包含三种认证方式', () => {
    expect(AUTH_METHODS).toEqual(['api_key', 'mtls', 'none'])
  })

  it('isLlmProvider 识别 private_cloud', () => {
    expect(isLlmProvider('private_cloud')).toBe(true)
  })

  it('getProviderInfo 返回 private_cloud 信息', () => {
    const info = getProviderInfo('private_cloud')
    expect(info).not.toBeNull()
    expect(info?.id).toBe('private_cloud')
    expect(info?.name).toBe('Private Cloud')
    expect(info?.models).toEqual([])
  })

  describe('getLlmConfigState — private_cloud', () => {
    it('无 endpointUrl 返回 warning', () => {
      const config = {
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
      }
      expect(getLlmConfigState(config)).toBe('warning')
    })

    it('有 endpointUrl 返回 configured（即使无 apiKeyId）', () => {
      const config = {
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://my-vllm:8000/v1',
      }
      expect(getLlmConfigState(config)).toBe('configured')
    })
  })

  describe('parseLlmModelConfig — private_cloud 字段', () => {
    it('解析包含 private_cloud 字段的配置', () => {
      const raw = {
        provider: 'private_cloud',
        modelName: 'qwen-2.5-72b',
        name: 'My Private Model',
        llmConfigId: 'cfg-1',
        parameters: { temperature: 0.5, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://vllm.internal:8000/v1',
        authMethod: 'api_key',
        authConfig: { apiKey: 'sk-secret' },
        timeoutMs: 60000,
      }

      const parsed = parseLlmModelConfig(raw)
      expect(parsed).not.toBeNull()
      expect(parsed?.endpointUrl).toBe('https://vllm.internal:8000/v1')
      expect(parsed?.authMethod).toBe('api_key')
      expect(parsed?.authConfig).toEqual({ apiKey: 'sk-secret' })
      expect(parsed?.timeoutMs).toBe(60000)
    })

    it('缺失 private_cloud 字段时返回 null 值', () => {
      const raw = {
        provider: 'openai',
        modelName: 'gpt-4o',
        name: 'GPT-4o',
        llmConfigId: 'cfg-2',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: 'key-1',
        isDefault: false,
      }

      const parsed = parseLlmModelConfig(raw)
      expect(parsed).not.toBeNull()
      expect(parsed?.endpointUrl).toBeNull()
      expect(parsed?.authMethod).toBeNull()
      expect(parsed?.authConfig).toBeNull()
      expect(parsed?.timeoutMs).toBeNull()
    })
  })

  describe('toLlmModelConfig — private_cloud 字段', () => {
    it('映射 LlmModelInfo 的 private_cloud 字段', () => {
      const model: LlmModelInfo = {
        id: 'model-1',
        name: 'Private LLM',
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        endpointUrl: 'https://vllm:8000/v1',
        authMethod: 'mtls',
        authConfig: { certPath: '/cert.pem', keyPath: '/key.pem' },
        timeoutMs: 120000,
      }

      const config = toLlmModelConfig(model)
      expect(config.endpointUrl).toBe('https://vllm:8000/v1')
      expect(config.authMethod).toBe('mtls')
      expect(config.authConfig).toEqual({ certPath: '/cert.pem', keyPath: '/key.pem' })
      expect(config.timeoutMs).toBe(120000)
    })

    it('null/undefined 字段映射为 null', () => {
      const model: LlmModelInfo = {
        id: 'model-2',
        name: 'Standard Model',
        provider: 'openai',
        modelName: 'gpt-4o',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: 'key-1',
        isDefault: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }

      const config = toLlmModelConfig(model)
      expect(config.endpointUrl).toBeNull()
      expect(config.authMethod).toBeNull()
      expect(config.authConfig).toBeNull()
      expect(config.timeoutMs).toBeNull()
    })
  })
})
