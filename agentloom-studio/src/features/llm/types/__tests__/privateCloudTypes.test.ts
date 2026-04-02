import { describe, expect, it } from 'vitest'
import {
  getLlmConfigState,
  getProviderInfo,
  isLlmProvider,
  LLM_PROVIDERS,
  parseLlmModelConfig,
  toLlmModelConfig,
  type LlmModelInfo,
  type LlmProviderEntity,
} from '..'

describe('LLM 类型与辅助函数', () => {
  it('isLlmProvider 接受任意非空字符串', () => {
    expect(isLlmProvider('openai')).toBe(true)
    expect(isLlmProvider('anthropic')).toBe(true)
    expect(isLlmProvider('private_cloud')).toBe(true)
    expect(isLlmProvider('my-custom-provider')).toBe(true)
    expect(isLlmProvider('')).toBe(false)
    expect(isLlmProvider(null)).toBe(false)
    expect(isLlmProvider(123)).toBe(false)
  })

  it('getProviderInfo 从静态列表返回 provider 信息', () => {
    const info = getProviderInfo('private_cloud')
    expect(info).not.toBeNull()
    expect(info?.id).toBe('private_cloud')
    expect(info?.name).toBe('Private Cloud')
    expect(info?.models).toEqual([])
  })

  it('getProviderInfo 优先从动态 providers 列表查找', () => {
    const dynamicProviders: LlmProviderEntity[] = [
      {
        id: 'uuid-1',
        orgId: 'org-1',
        tenantId: 'tenant-1',
        slug: 'my-provider',
        name: 'My Custom Provider',
        iconUrl: null,
        baseUrl: 'https://custom.api.com/v1',
        defaultBaseUrl: null,
        isBuiltin: false,
        isEnabled: true,
        apiProtocol: 'openai_chat',
        apiKeyId: null,
        sortOrder: 99,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]

    const info = getProviderInfo('my-provider', dynamicProviders)
    expect(info).not.toBeNull()
    expect(info?.id).toBe('my-provider')
    expect(info?.name).toBe('My Custom Provider')
  })

  it('getProviderInfo 动态列表找不到时 fallback 到静态列表', () => {
    const info = getProviderInfo('openai', [])
    expect(info).not.toBeNull()
    expect(info?.id).toBe('openai')
    expect(info?.name).toBe('OpenAI')
  })

  it('LLM_PROVIDERS 包含 private_cloud', () => {
    expect(LLM_PROVIDERS.some((p) => p.id === 'private_cloud')).toBe(true)
  })

  describe('getLlmConfigState -- private_cloud', () => {
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

    it('api_key 模式缺少 apiKeyId 且无默认 key 时返回 warning', () => {
      const config = {
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://my-vllm:8000/v1',
        authMethod: 'api_key',
      }
      expect(getLlmConfigState(config)).toBe('warning')
    })

    it('api_key 模式缺少 apiKeyId 但存在默认 key 时返回 configured', () => {
      const config = {
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://my-vllm:8000/v1',
        authMethod: 'api_key',
      }
      expect(getLlmConfigState(config, true)).toBe('configured')
    })

    it('none 模式有 endpointUrl 和 modelName 返回 configured', () => {
      const config = {
        provider: 'private_cloud',
        modelName: 'llama-3-70b',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://my-vllm:8000/v1',
        authMethod: 'none',
      }
      expect(getLlmConfigState(config)).toBe('configured')
    })

    it('有 endpointUrl 但无 modelName 返回 unconfigured', () => {
      const config = {
        provider: 'private_cloud',
        modelName: '',
        name: 'test',
        llmConfigId: 'id-1',
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: null,
        isDefault: false,
        endpointUrl: 'https://my-vllm:8000/v1',
      }
      expect(getLlmConfigState(config)).toBe('unconfigured')
    })
  })

  describe('parseLlmModelConfig', () => {
    it('解析旧格式 (provider 为字符串)', () => {
      const raw = {
        provider: 'private_cloud',
        modelName: 'qwen-2.5-72b',
        name: 'My Private Model',
        llmConfigId: 'cfg-1',
        parameters: { temperature: 0.5, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        apiKeyId: 'key-ref-1',
        isDefault: false,
        endpointUrl: 'https://vllm.internal:8000/v1',
        authMethod: 'api_key',
        authConfig: null,
        timeoutMs: 60000,
      }

      const parsed = parseLlmModelConfig(raw)
      expect(parsed).not.toBeNull()
      expect(parsed?.provider).toBe('private_cloud')
      expect(parsed?.modelName).toBe('qwen-2.5-72b')
      expect(parsed?.endpointUrl).toBe('https://vllm.internal:8000/v1')
      expect(parsed?.authMethod).toBe('api_key')
      expect(parsed?.apiKeyId).toBe('key-ref-1')
      expect(parsed?.authConfig).toBeNull()
      expect(parsed?.timeoutMs).toBe(60000)
    })

    it('解析新格式 (provider 为嵌套对象)', () => {
      const raw = {
        id: 'model-uuid',
        name: 'GPT-4o',
        modelId: 'gpt-4o',
        modelType: 'chat',
        provider: {
          slug: 'openai',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          apiKeyId: 'key-1',
        },
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        isDefault: true,
      }

      const parsed = parseLlmModelConfig(raw)
      expect(parsed).not.toBeNull()
      expect(parsed?.provider).toBe('openai')
      expect(parsed?.modelName).toBe('gpt-4o')
      expect(parsed?.llmConfigId).toBe('model-uuid')
      expect(parsed?.endpointUrl).toBe('https://api.openai.com/v1')
      expect(parsed?.apiKeyId).toBe('key-1')
      expect(parsed?.isDefault).toBe(true)
    })

    it('缺失 provider 字段时返回 null', () => {
      const raw = {
        modelName: 'gpt-4o',
        name: 'GPT-4o',
      }
      expect(parseLlmModelConfig(raw)).toBeNull()
    })

    it('缺失 modelName 和 modelId 时返回 null', () => {
      const raw = {
        provider: 'openai',
        name: 'GPT-4o',
      }
      expect(parseLlmModelConfig(raw)).toBeNull()
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

  describe('toLlmModelConfig', () => {
    it('映射 LlmModelInfo 的字段', () => {
      const model = {
        id: 'model-1',
        orgId: 'org-1',
        tenantId: 'tenant-1',
        providerId: 'provider-uuid',
        name: 'Private LLM',
        modelId: 'llama-3-70b',
        modelType: 'chat' as const,
        isEnabled: true,
        isDefault: false,
        capabilities: {},
        contextWindow: 4096,
        maxOutputTokens: 2048,
        pricing: null,
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        metadataSource: null,
        embeddingDimensions: null,
        timeoutMs: 120000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        provider: {
          id: 'provider-uuid',
          orgId: 'org-1',
          tenantId: 'tenant-1',
          slug: 'private_cloud',
          name: 'Private Cloud',
          iconUrl: null,
          baseUrl: 'https://vllm:8000/v1',
          defaultBaseUrl: null,
          isBuiltin: false,
          isEnabled: true,
          apiProtocol: 'openai_chat' as const,
          apiKeyId: 'key-ref-1',
          sortOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        // compat 字段
        modelName: 'llama-3-70b',
      } as LlmModelInfo

      const config = toLlmModelConfig(model)
      expect(config.llmConfigId).toBe('model-1')
      expect(config.provider).toBe('private_cloud')
      expect(config.modelName).toBe('llama-3-70b')
      expect(config.endpointUrl).toBe('https://vllm:8000/v1')
      expect(config.apiKeyId).toBe('key-ref-1')
      expect(config.timeoutMs).toBe(120000)
    })

    it('null/undefined 字段映射为 null', () => {
      const model = {
        id: 'model-2',
        orgId: 'org-1',
        tenantId: 'tenant-1',
        providerId: 'provider-uuid',
        name: 'Standard Model',
        modelId: 'gpt-4o',
        modelType: 'chat' as const,
        isEnabled: true,
        isDefault: true,
        capabilities: {},
        contextWindow: null,
        maxOutputTokens: null,
        pricing: null,
        parameters: { temperature: 0.7, topP: 1, frequencyPenalty: 0, presencePenalty: 0, stop: [] },
        metadataSource: null,
        embeddingDimensions: null,
        timeoutMs: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        provider: {
          id: 'provider-uuid',
          orgId: 'org-1',
          tenantId: 'tenant-1',
          slug: 'openai',
          name: 'OpenAI',
          iconUrl: null,
          baseUrl: null,
          defaultBaseUrl: 'https://api.openai.com/v1',
          isBuiltin: true,
          isEnabled: true,
          apiProtocol: 'openai_chat' as const,
          apiKeyId: 'key-1',
          sortOrder: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        // compat 字段
        modelName: 'gpt-4o',
      } as LlmModelInfo

      const config = toLlmModelConfig(model)
      expect(config.endpointUrl).toBeNull()
      expect(config.authMethod).toBeNull()
      expect(config.authConfig).toBeNull()
      expect(config.timeoutMs).toBeNull()
    })
  })
})
