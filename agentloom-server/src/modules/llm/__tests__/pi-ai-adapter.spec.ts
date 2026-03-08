import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmProviderException } from '../llm.exceptions';
import { PiAiAdapter } from '../pi-ai-adapter';
import type { LlmModelConfig } from '../../../database/schema/llm-model-configs.schema';

const { mockProviderFn, mockCreateOpenAI, mockCreateAnthropic, mockCreateGoogle } = vi.hoisted(() => {
  const fn = vi.fn().mockReturnValue('mock-model');
  return {
    mockProviderFn: fn,
    mockCreateOpenAI: vi.fn().mockReturnValue(fn),
    mockCreateAnthropic: vi.fn().mockReturnValue(fn),
    mockCreateGoogle: vi.fn().mockReturnValue(fn),
  };
});

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mockCreateAnthropic }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mockCreateGoogle }));

function createConfig(overrides: Partial<LlmModelConfig> = {}): LlmModelConfig {
  return {
    id: 'config-id',
    orgId: 'org-id',
    tenantId: 'tenant-id',
    name: 'Test Config',
    provider: 'openai',
    modelName: 'gpt-4o',
    parameters: {},
    apiKeyId: null,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PiAiAdapter', () => {
  let adapter: PiAiAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProviderFn.mockReturnValue('mock-model');
    adapter = new PiAiAdapter();
    // 跳过 sleep 延迟，加速重试测试
    vi.spyOn(adapter as never, 'sleep' as never).mockResolvedValue(undefined as never);
  });

  describe('getModel - 各提供商', () => {
    it('应当为 openai 创建模型', async () => {
      const result = await adapter.getModel(createConfig({ provider: 'openai' }), 'sk-key');

      expect(result).toBe('mock-model');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 anthropic 创建模型', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'anthropic', modelName: 'claude-3-opus' }),
        'sk-key',
      );

      expect(result).toBe('mock-model');
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 google 创建模型', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'google', modelName: 'gemini-pro' }),
        'sk-key',
      );

      expect(result).toBe('mock-model');
      expect(mockCreateGoogle).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 deepseek 使用 OpenAI SDK 及自定义 baseURL', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'deepseek', modelName: 'deepseek-chat' }),
        'sk-key',
      );

      expect(result).toBe('mock-model');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.deepseek.com/v1' }),
      );
    });

    it('应当为 custom 使用参数中的 baseUrl', async () => {
      const result = await adapter.getModel(
        createConfig({
          provider: 'custom',
          modelName: 'custom-model',
          parameters: { baseUrl: 'https://my-llm.example.com/v1' },
        }),
        'sk-key',
      );

      expect(result).toBe('mock-model');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://my-llm.example.com/v1' }),
      );
    });
  });

  describe('getModel - 错误处理', () => {
    it('应当在 custom 缺少 baseUrl 时抛出 LlmProviderException', async () => {
      await expect(
        adapter.getModel(createConfig({ provider: 'custom' }), 'sk-key'),
      ).rejects.toBeInstanceOf(LlmProviderException);
    });

    it('应当在不支持的提供商时抛出 LlmProviderException', async () => {
      await expect(
        adapter.getModel(createConfig({ provider: 'unknown' }), 'sk-key'),
      ).rejects.toBeInstanceOf(LlmProviderException);
    });

    it('应当在 5xx 错误时重试', async () => {
      mockProviderFn
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('Server Error'), { status: 500 });
        })
        .mockReturnValueOnce('mock-model');

      const result = await adapter.getModel(createConfig(), 'sk-key');
      expect(result).toBe('mock-model');
      expect(mockProviderFn).toHaveBeenCalledTimes(2);
    });

    it('应当在 4xx 错误时不重试，直接包装为 LlmProviderException', async () => {
      mockProviderFn.mockImplementation(() => {
        throw Object.assign(new Error('Bad Request'), { status: 400 });
      });

      await expect(
        adapter.getModel(createConfig(), 'sk-key'),
      ).rejects.toBeInstanceOf(LlmProviderException);

      // 仅调用一次（无重试）
      expect(mockProviderFn).toHaveBeenCalledTimes(1);
    });

    it('应当在超出最大重试次数后抛出 LlmProviderException', async () => {
      mockProviderFn.mockImplementation(() => {
        throw Object.assign(new Error('Server Error'), { status: 500 });
      });

      await expect(
        adapter.getModel(createConfig(), 'sk-key'),
      ).rejects.toBeInstanceOf(LlmProviderException);

      // 1 initial + 2 retries = 3 calls
      expect(mockProviderFn).toHaveBeenCalledTimes(3);
    });

    it('应当在 openai 提供商可传入自定义 baseURL', async () => {
      const result = await adapter.getModel(
        createConfig({
          provider: 'openai',
          parameters: { baseUrl: 'https://my-proxy.com/v1' },
        }),
        'sk-key',
      );

      expect(result).toBe('mock-model');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://my-proxy.com/v1' }),
      );
    });
  });
});
