import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultApiKeyNotConfiguredException } from '../../api-key/api-key.exceptions';
import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmProviderException } from '../llm.exceptions';
import { PiAiAdapter, type ResolvedModelConfig } from '../pi-ai-adapter';

type WrappedModel = {
  doGenerate: (...args: unknown[]) => Promise<unknown>;
  doStream: (...args: unknown[]) => Promise<unknown>;
  provider: string;
};

const {
  mockProviderFn,
  mockCreateOpenAI,
  mockCreateAnthropic,
  mockCreateGoogle,
  mockModel,
} = vi.hoisted(() => {
  const model = {
    doGenerate: vi.fn().mockResolvedValue('generated'),
    doStream: vi.fn().mockResolvedValue('streamed'),
    provider: 'mock-provider',
  };
  // OpenAI provider 对象：可作为函数调用，也有 .chat() / .responses() 方法
  const fn = Object.assign(vi.fn().mockReturnValue(model), {
    chat: vi.fn().mockReturnValue(model),
    responses: vi.fn().mockReturnValue(model),
  });
  return {
    mockProviderFn: fn,
    mockCreateOpenAI: vi.fn().mockReturnValue(fn),
    mockCreateAnthropic: vi.fn().mockReturnValue(fn),
    mockCreateGoogle: vi.fn().mockReturnValue(fn),
    mockModel: model,
  };
});

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mockCreateAnthropic }));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mockCreateGoogle,
}));

function createConfig(
  overrides: Partial<ResolvedModelConfig> & {
    providerOverrides?: Record<string, unknown>;
  } = {},
): ResolvedModelConfig {
  const { providerOverrides, ...configOverrides } = overrides;
  const providerSlug =
    (providerOverrides?.slug as string | undefined) ?? 'openai';

  return {
    id: 'config-id',
    orgId: 'org-id',
    tenantId: 'tenant-id',
    name: 'Test Config',
    providerId: 'provider-id',
    modelId: 'gpt-4o',
    parameters: {},
    isEnabled: true,
    isDefault: false,
    capabilities: {},
    contextWindow: null,
    maxOutputTokens: null,
    pricing: null,
    metadataSource: null,
    timeoutMs: null,
    modelType: 'chat',
    embeddingDimensions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...configOverrides,
    provider: {
      id: 'provider-id',
      orgId: 'org-id',
      tenantId: 'tenant-id',
      slug: providerSlug,
      name: providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1),
      iconUrl: null,
      baseUrl: null,
      defaultBaseUrl: null,
      isBuiltin: true,
      isEnabled: true,
      apiProtocol: 'openai_chat' as const,
      apiKeyId: 'provider-api-key-id',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...providerOverrides,
    },
  };
}

describe('PiAiAdapter', () => {
  let adapter: PiAiAdapter;
  let decryptionBoundaryService: {
    decryptConfiguredApiKey: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel.doGenerate.mockResolvedValue('generated');
    mockModel.doStream.mockResolvedValue('streamed');
    mockProviderFn.mockReturnValue(mockModel);

    decryptionBoundaryService = {
      decryptConfiguredApiKey: vi.fn().mockResolvedValue('decrypted-key'),
    };
    adapter = new PiAiAdapter(
      decryptionBoundaryService as unknown as DecryptionBoundaryService,
    );
    vi.spyOn(
      adapter as unknown as { sleep: (ms: number) => Promise<void> },
      'sleep',
    ).mockResolvedValue(undefined as never);
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('getModel - 按协议路由', () => {
    it('应当为 openai_chat 协议使用 createOpenAI + provider.chat()', async () => {
      const result = await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_chat' as const,
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
      // openai_chat 应走 .chat() 方法
      expect(mockProviderFn.chat).toHaveBeenCalledWith('gpt-4o');
      expect(mockProviderFn.responses).not.toHaveBeenCalled();
    });

    it('应当为 openai_responses 协议使用 createOpenAI + provider.responses()', async () => {
      const result = await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_responses' as const,
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
      // openai_responses 应走 .responses() 方法
      expect(mockProviderFn.responses).toHaveBeenCalledWith('gpt-4o');
      expect(mockProviderFn.chat).not.toHaveBeenCalled();
    });

    it('应当为 anthropic 协议使用 createAnthropic', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'claude-3-opus',
          providerOverrides: {
            slug: 'anthropic',
            apiProtocol: 'anthropic' as const,
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 google 协议使用 createGoogleGenerativeAI', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'gemini-pro',
          providerOverrides: {
            slug: 'google',
            apiProtocol: 'google' as const,
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateGoogle).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 cohere 协议使用 createOpenAI + provider.chat()', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'command-r-plus',
          providerOverrides: {
            slug: 'cohere',
            apiProtocol: 'cohere' as const,
            baseUrl: 'https://api.cohere.com/v1',
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-key',
          baseURL: 'https://api.cohere.com/v1',
        }),
      );
      // cohere 走 Chat Completions 兼容模式
      expect(mockProviderFn.chat).toHaveBeenCalledWith('command-r-plus');
    });

    it('应当为 deepseek 等第三方 openai_chat 提供商自动走 openai_chat 路径', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'deepseek-chat',
          providerOverrides: {
            slug: 'deepseek',
            apiProtocol: 'openai_chat' as const,
            defaultBaseUrl: 'https://api.deepseek.com/v1',
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-key',
          baseURL: 'https://api.deepseek.com/v1',
        }),
      );
      expect(mockProviderFn.chat).toHaveBeenCalledWith('deepseek-chat');
    });

    it('应当为 custom 提供商通过 openai_chat 协议使用 provider.baseUrl', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'custom-model',
          providerOverrides: {
            slug: 'custom',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://my-llm.example.com/v1',
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-key',
          baseURL: 'https://my-llm.example.com/v1',
        }),
      );
      expect(mockProviderFn.chat).toHaveBeenCalledWith('custom-model');
    });
  });

  describe('getModel - 无认证 (private cloud / local)', () => {
    it('应当在无 apiKeyId 时使用占位符密钥并剥离 Authorization 头', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'local-model',
          providerOverrides: {
            slug: 'private_cloud',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://private-cloud.example.com/v1',
            apiKeyId: null,
          },
        }),
      );

      expect(result).toBeTypeOf('object');
      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).not.toHaveBeenCalled();

      const callOptions = mockCreateOpenAI.mock.calls.at(-1)?.[0] as
        | {
            apiKey: string;
            baseURL: string;
            fetch?: typeof fetch;
          }
        | undefined;

      expect(callOptions).toMatchObject({
        apiKey: '__agentloom_private_cloud_no_auth__',
        baseURL: 'https://private-cloud.example.com/v1',
      });
      expect(callOptions?.fetch).toBeTypeOf('function');

      // private_cloud 非 Claude 模型应与 runtime 对齐为 Responses API
      expect(mockProviderFn.responses).toHaveBeenCalledWith('local-model');
      expect(mockProviderFn.chat).not.toHaveBeenCalled();

      // 验证 fetch 代理确实剥离了 Authorization 头
      const rawFetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', rawFetch);

      await callOptions?.fetch?.(
        new Request('https://private-cloud.example.com/v1/responses', {
          headers: {
            Authorization: 'Bearer should-not-leak',
            'X-Test-Header': 'preserved',
          },
        }),
      );

      expect(rawFetch).toHaveBeenCalledTimes(1);
      const [, forwardedInit] = rawFetch.mock.calls[0];
      const forwardedHeaders = new Headers(forwardedInit?.headers);
      expect(forwardedHeaders.get('authorization')).toBeNull();
      expect(forwardedHeaders.get('x-test-header')).toBe('preserved');
    });

    it('应当在有 apiKeyId 的 private cloud 正常传递密钥', async () => {
      const result = await adapter.getModel(
        createConfig({
          modelId: 'private-model',
          providerOverrides: {
            slug: 'private_cloud',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://private-cloud.example.com/v1',
            apiKeyId: 'provider-api-key-id',
          },
        }),
        'sk-private-cloud',
      );

      expect(result).toBeTypeOf('object');
      const callOptions = mockCreateOpenAI.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(callOptions).toMatchObject({
        apiKey: 'sk-private-cloud',
        baseURL: 'https://private-cloud.example.com/v1',
      });
      // 有认证时不应注入 auth-stripping fetch
      expect(callOptions).not.toHaveProperty('fetch');
      expect(mockProviderFn.responses).toHaveBeenCalledWith('private-model');
    });

    it('应当在 openai_responses 协议无 apiKeyId 时同样剥离 Authorization', async () => {
      await adapter.getModel(
        createConfig({
          modelId: 'local-model',
          providerOverrides: {
            slug: 'ollama',
            apiProtocol: 'openai_responses' as const,
            baseUrl: 'http://localhost:11434/v1',
            apiKeyId: null,
          },
        }),
      );

      const callOptions = mockCreateOpenAI.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(callOptions).toMatchObject({
        apiKey: '__agentloom_private_cloud_no_auth__',
        baseURL: 'http://localhost:11434/v1',
      });
      expect(callOptions.fetch).toBeTypeOf('function');
      // openai_responses 应走 .responses() 方法
      expect(mockProviderFn.responses).toHaveBeenCalledWith('local-model');
    });

    it('应当让 private_cloud 的 Claude 模型与 runtime 对齐为 Anthropic Messages API', async () => {
      await adapter.getModel(
        createConfig({
          modelId: 'claude-opus-4-6',
          providerOverrides: {
            slug: 'private_cloud',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://private-cloud.example.com/v1',
            apiKeyId: null,
          },
        }),
      );

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: '__agentloom_private_cloud_no_auth__',
          baseURL: 'https://private-cloud.example.com',
          fetch: expect.any(Function),
        }),
      );
      expect(mockCreateOpenAI).not.toHaveBeenCalled();
    });

    it('应当在 anthropic 无 apiKeyId 时回退到 ANTHROPIC_API_KEY 环境变量', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';

      await adapter.getModel(
        createConfig({
          modelId: 'claude-3-opus',
          providerOverrides: {
            slug: 'anthropic',
            apiProtocol: 'anthropic' as const,
            apiKeyId: null,
            baseUrl: null,
            defaultBaseUrl: 'https://api.anthropic.com',
          },
        }),
      );

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'env-anthropic-key',
          baseURL: 'https://api.anthropic.com',
        }),
      );
      const callOptions = mockCreateAnthropic.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(callOptions).not.toHaveProperty('fetch');
    });

    it('应当在 provider baseUrl 缺失时回退到模型 parameters.baseUrl', async () => {
      await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'custom',
            apiProtocol: 'openai_chat' as const,
            baseUrl: null,
            defaultBaseUrl: null,
          },
          parameters: {
            baseUrl: 'https://model-level.example.com/v1',
          },
        }),
        'sk-key',
      );

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-key',
          baseURL: 'https://model-level.example.com/v1',
        }),
      );
    });
  });

  describe('getModel - 错误处理', () => {
    it('应当在未显式传入 apiKey 时通过 DecryptionBoundary 解密提供商绑定的密钥', async () => {
      await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_chat' as const,
            apiKeyId: 'provider-api-key-id',
          },
        }),
      );

      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: 'provider-api-key-id',
          organizationId: 'org-id',
          tenantId: 'tenant-id',
          provider: 'openai',
        },
        'PiAiAdapter',
      );
    });

    it('应当在提供商未绑定 apiKey 时跳过解密', async () => {
      await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_chat' as const,
            apiKeyId: null,
          },
        }),
      );

      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).not.toHaveBeenCalled();
    });

    it('应当透传默认 API Key 未配置错误', async () => {
      decryptionBoundaryService.decryptConfiguredApiKey.mockRejectedValue(
        new DefaultApiKeyNotConfiguredException('openai'),
      );

      await expect(
        adapter.getModel(
          createConfig({
            providerOverrides: {
              slug: 'openai',
              apiProtocol: 'openai_chat' as const,
              apiKeyId: 'provider-api-key-id',
            },
          }),
        ),
      ).rejects.toBeInstanceOf(DefaultApiKeyNotConfiguredException);
    });

    it('应当在不支持的 API 协议时抛出 LlmProviderException', async () => {
      await expect(
        adapter.getModel(
          createConfig({
            providerOverrides: {
              slug: 'unknown',
              apiProtocol: 'unsupported_protocol' as never,
            },
          }),
          'sk-key',
        ),
      ).rejects.toMatchObject({
        detail: '不支持的 API 协议: unsupported_protocol',
      });
    });

    it('应当在 5xx 错误时重试', async () => {
      mockModel.doGenerate
        .mockRejectedValueOnce(
          Object.assign(new Error('Server Error'), { status: 500 }),
        )
        .mockResolvedValueOnce('generated');

      const result = (await adapter.getModel(
        createConfig(),
        'sk-key',
      )) as WrappedModel;

      await expect(result.doGenerate('prompt')).resolves.toBe('generated');
      expect(mockModel.doGenerate).toHaveBeenCalledTimes(2);
    });

    it('应当在 4xx 错误时不重试，直接包装为 LlmProviderException', async () => {
      mockModel.doGenerate.mockRejectedValue(
        Object.assign(new Error('Bad Request'), { status: 400 }),
      );

      const result = (await adapter.getModel(
        createConfig(),
        'sk-key',
      )) as WrappedModel;

      await expect(result.doGenerate('prompt')).rejects.toBeInstanceOf(
        LlmProviderException,
      );

      expect(mockModel.doGenerate).toHaveBeenCalledTimes(1);
    });

    it('应当在超出最大重试次数后抛出 LlmProviderException', async () => {
      mockModel.doGenerate.mockRejectedValue(
        Object.assign(new Error('Server Error'), { status: 500 }),
      );

      const result = (await adapter.getModel(
        createConfig(),
        'sk-key',
      )) as WrappedModel;

      await expect(result.doGenerate('prompt')).rejects.toBeInstanceOf(
        LlmProviderException,
      );

      expect(mockModel.doGenerate).toHaveBeenCalledTimes(3);
    });

    it('应当对 doStream 应用相同的重试包装', async () => {
      mockModel.doStream
        .mockRejectedValueOnce(
          Object.assign(new Error('Server Error'), { statusCode: 500 }),
        )
        .mockResolvedValueOnce('streamed');

      const result = (await adapter.getModel(
        createConfig(),
        'sk-key',
      )) as WrappedModel;

      await expect(result.doStream('prompt')).resolves.toBe('streamed');
      expect(mockModel.doStream).toHaveBeenCalledTimes(2);
    });

    it('应当通过 provider.baseUrl 传入自定义 baseURL', async () => {
      const result = await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://my-proxy.com/v1',
          },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://my-proxy.com/v1' }),
      );
    });

    it('应当通过 provider.defaultBaseUrl 传入默认 baseURL（当 baseUrl 为空时）', async () => {
      await adapter.getModel(
        createConfig({
          providerOverrides: {
            slug: 'deepseek',
            apiProtocol: 'openai_chat' as const,
            baseUrl: null,
            defaultBaseUrl: 'https://api.deepseek.com/v1',
          },
        }),
        'sk-key',
      );

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.deepseek.com/v1' }),
      );
    });

    it('应当将 401 和 403 视为不可重试错误', () => {
      const isRetryableError = (
        adapter as unknown as { isRetryableError: (error: unknown) => boolean }
      ).isRetryableError.bind(adapter);

      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ statusCode: 403 })).toBe(false);
    });

    it('应当将 401 结构化包装为 authenticationFailed 错误', async () => {
      mockModel.doGenerate.mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      );

      const result = (await adapter.getModel(
        createConfig(),
        'sk-key',
      )) as WrappedModel;

      await expect(result.doGenerate('prompt')).rejects.toMatchObject({
        detail: 'Unauthorized',
        extensions: { authenticationFailed: true },
      });
      expect(mockModel.doGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPiRuntimeModel - 按协议生成 pi runtime 配置', () => {
    it('openai_responses 协议应生成 openai-responses runtime model', async () => {
      const result = await adapter.getPiRuntimeModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_responses' as const,
            baseUrl: 'https://models.example.test',
          },
        }),
        'sk-key',
      );

      expect(result.apiKey).toBe('sk-key');
      expect(result.model).toMatchObject({
        api: 'openai-responses',
        provider: 'openai',
        baseUrl: 'https://models.example.test/v1',
      });
    });

    it('openai_chat 协议应生成 openai-completions runtime model', async () => {
      const result = await adapter.getPiRuntimeModel(
        createConfig({
          providerOverrides: {
            slug: 'openai',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://api.openai.com',
          },
        }),
        'sk-key',
      );

      expect(result.model).toMatchObject({
        api: 'openai-completions',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      });
    });

    it('private_cloud 的 Claude 模型应生成 anthropic-messages runtime model', async () => {
      const result = await adapter.getPiRuntimeModel(
        createConfig({
          modelId: 'claude-sonnet-4-6',
          providerOverrides: {
            slug: 'private_cloud',
            apiProtocol: 'openai_chat' as const,
            baseUrl: 'https://private-cloud.example.com/v1',
            apiKeyId: null,
          },
        }),
      );

      expect(result.apiKey).toBe('__agentloom_private_cloud_no_auth__');
      expect(result.model).toMatchObject({
        api: 'anthropic-messages',
        provider: 'private_cloud',
        baseUrl: 'https://private-cloud.example.com',
        headers: { Authorization: '' },
      });
    });
  });
});
