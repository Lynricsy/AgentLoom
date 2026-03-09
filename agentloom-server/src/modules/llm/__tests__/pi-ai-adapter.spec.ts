import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultApiKeyNotConfiguredException } from '../../api-key/api-key.exceptions';
import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmProviderException } from '../llm.exceptions';
import { PiAiAdapter } from '../pi-ai-adapter';
import type { LlmModelConfig } from '../../../database/schema/llm-model-configs.schema';

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
  const fn = vi.fn().mockReturnValue(model);
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
  });

  describe('getModel - 各提供商', () => {
    it('应当为 openai 创建模型', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'openai' }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 anthropic 创建模型', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'anthropic', modelName: 'claude-3-opus' }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 google 创建模型', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'google', modelName: 'gemini-pro' }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateGoogle).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-key' }),
      );
    });

    it('应当为 deepseek 使用 OpenAI SDK 及自定义 baseURL', async () => {
      const result = await adapter.getModel(
        createConfig({ provider: 'deepseek', modelName: 'deepseek-chat' }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
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

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://my-llm.example.com/v1' }),
      );
    });
  });

  describe('getModel - 错误处理', () => {
    it('应当在未显式传入 apiKey 时通过 DecryptionBoundary 解密配置绑定的密钥', async () => {
      await adapter.getModel(createConfig({ apiKeyId: 'config-key-id' }));

      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: 'config-key-id',
          organizationId: 'org-id',
          tenantId: 'tenant-id',
          provider: 'openai',
        },
        'PiAiAdapter',
      );
    });

    it('应当在配置未绑定 apiKey 时回退到组织默认 API Key', async () => {
      await adapter.getModel(createConfig({ apiKeyId: null }));

      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: null,
          organizationId: 'org-id',
          tenantId: 'tenant-id',
          provider: 'openai',
        },
        'PiAiAdapter',
      );
    });

    it('应当透传默认 API Key 未配置错误', async () => {
      decryptionBoundaryService.decryptConfiguredApiKey.mockRejectedValue(
        new DefaultApiKeyNotConfiguredException('openai'),
      );

      await expect(
        adapter.getModel(createConfig({ apiKeyId: null })),
      ).rejects.toBeInstanceOf(DefaultApiKeyNotConfiguredException);
    });

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

    it('应当在 openai 提供商可传入自定义 baseURL', async () => {
      const result = await adapter.getModel(
        createConfig({
          provider: 'openai',
          parameters: { baseUrl: 'https://my-proxy.com/v1' },
        }),
        'sk-key',
      );

      expect(result).toBeTypeOf('object');
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://my-proxy.com/v1' }),
      );
    });
  });
});
