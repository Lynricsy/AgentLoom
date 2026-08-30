import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmProvider } from '../../../database/schema/llm-providers.schema';
import { LlmProviderException, LlmTimeoutException } from '../llm.exceptions';
import { ModelDiscoveryService } from '../model-discovery.service';

describe('ModelDiscoveryService', () => {
  let service: ModelDiscoveryService;
  let decryptConfiguredApiKey: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    decryptConfiguredApiKey = vi.fn();
    service = new ModelDiscoveryService(
      {
        decryptConfiguredApiKey,
      } as never,
      {
        get: vi.fn(),
      } as never,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lookupModelMetadata 应解析缓存价格与基于 token 阈值的阶梯定价', async () => {
    vi.spyOn(
      service as unknown as { getLiteLLMData: () => Promise<unknown> },
      'getLiteLLMData',
    ).mockResolvedValue({
      'claude-sonnet-4-20250514': {
        input_cost_per_token: 3e-6,
        output_cost_per_token: 1.5e-5,
        cache_read_input_token_cost: 3e-7,
        cache_creation_input_token_cost: 3.75e-6,
        input_cost_per_token_above_200k_tokens: 6e-6,
        output_cost_per_token_above_200k_tokens: 2.25e-5,
        cache_read_input_token_cost_above_200k_tokens: 6e-7,
        cache_creation_input_token_cost_above_200k_tokens: 7.5e-6,
        max_input_tokens: 1_000_000,
        max_output_tokens: 64_000,
        supports_vision: true,
        supports_function_calling: true,
        supports_response_schema: true,
      },
    });

    const result = await service.lookupModelMetadata(
      'anthropic',
      'claude-sonnet-4-20250514',
    );

    expect(result).toEqual({
      modelId: 'claude-sonnet-4-20250514',
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      pricing: {
        inputPer1MTokens: 3,
        outputPer1MTokens: 15,
        cachedReadPer1MTokens: 0.3,
        cachedWritePer1MTokens: 3.75,
        tiers: [
          {
            aboveTokens: 200_000,
            inputPer1MTokens: 6,
            outputPer1MTokens: 22.5,
            cachedReadPer1MTokens: 0.6,
            cachedWritePer1MTokens: 7.5,
          },
        ],
      },
      capabilities: {
        vision: true,
        functionCalling: true,
        reasoning: false,
        structuredOutput: true,
      },
    });
  });

  it('lookupModelMetadata 应忽略非 token 阈值的价格字段', async () => {
    vi.spyOn(
      service as unknown as { getLiteLLMData: () => Promise<unknown> },
      'getLiteLLMData',
    ).mockResolvedValue({
      'gpt-4o': {
        input_cost_per_token: 2.5e-6,
        output_cost_per_token: 1e-5,
        cache_read_input_token_cost: 1.25e-6,
        input_cost_per_token_priority: 4.25e-6,
        output_cost_per_token_batches: 5e-6,
        cache_creation_input_token_cost_above_1hr: 6e-6,
        max_input_tokens: 128_000,
        max_output_tokens: 16_384,
      },
    });

    const result = await service.lookupModelMetadata('openai', 'gpt-4o');

    expect(result?.pricing).toEqual({
      inputPer1MTokens: 2.5,
      outputPer1MTokens: 10,
      cachedReadPer1MTokens: 1.25,
    });
  });

  const provider = (overrides: Partial<LlmProvider> = {}): LlmProvider =>
    ({
      id: 'provider-id',
      orgId: 'org-id',
      tenantId: 'tenant-id',
      slug: 'openai',
      name: 'OpenAI',
      iconUrl: null,
      baseUrl: 'https://api.example.test///',
      defaultBaseUrl: 'https://default.example.test/',
      isBuiltin: false,
      isEnabled: true,
      apiProtocol: 'openai_chat',
      apiKeyId: null,
      sortOrder: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as LlmProvider;

  const response = (
    status: number,
    body: unknown,
    ok = status >= 200 && status < 300,
  ): Response =>
    ({
      ok,
      status,
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as Response;

  describe('provider protocol discovery and connection', () => {
    it.each(['anthropic', 'google', 'cohere'] as const)(
      '%s 协议不请求 OpenAI 模型目录',
      async (apiProtocol) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(
          service.discoverModels(provider({ apiProtocol })),
        ).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('使用自定义 base URL、Bearer 认证并保留部分模型字段', async () => {
      decryptConfiguredApiKey.mockResolvedValue('secret-token');
      const fetchMock = vi.fn().mockResolvedValue(
        response(200, {
          data: [{ id: 'gpt-4o', owned_by: 'openai' }, { id: 'proxy-model' }],
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        service.discoverModels(provider({ apiKeyId: 'key-id' })),
      ).resolves.toEqual([
        { id: 'gpt-4o', name: 'gpt-4o', ownedBy: 'openai' },
        { id: 'proxy-model', name: 'proxy-model', ownedBy: undefined },
      ]);
      expect(decryptConfiguredApiKey).toHaveBeenCalledWith(
        {
          apiKeyId: 'key-id',
          organizationId: 'org-id',
          tenantId: 'tenant-id',
          provider: 'openai',
        },
        'ModelDiscoveryService',
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer secret-token' },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('baseUrl 缺失时回退 defaultBaseUrl，无密钥时不发送认证头', async () => {
      const fetchMock = vi.fn().mockResolvedValue(response(200, { data: [] }));
      vi.stubGlobal('fetch', fetchMock);

      await service.discoverModels(
        provider({ baseUrl: null, defaultBaseUrl: 'https://fallback.test///' }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://fallback.test/v1/models',
        expect.objectContaining({ headers: {} }),
      );
      expect(decryptConfiguredApiKey).not.toHaveBeenCalled();
    });

    it('缺失或非数组 data 的目录响应视为空列表', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(200, {}))
        .mockResolvedValueOnce(response(200, { data: 'invalid' }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(service.discoverModels(provider())).resolves.toEqual([]);
      await expect(service.discoverModels(provider())).resolves.toEqual([]);
    });

    it('JSON null 与损坏模型项被包装为模型目录异常', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(200, null))
        .mockResolvedValueOnce(response(200, { data: [null] }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(service.discoverModels(provider())).rejects.toMatchObject({
        detail: expect.stringContaining('无法获取模型列表:'),
      });
      await expect(service.discoverModels(provider())).rejects.toMatchObject({
        detail: expect.stringContaining('无法获取模型列表:'),
      });
    });

    it.each([401, 403])('目录认证状态 %s 抛出认证异常', async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, {})));

      const error = await service.discoverModels(provider()).catch((e) => e);

      expect(error).toBeInstanceOf(LlmProviderException);
      expect(error.detail).toContain(`认证失败 (${status})`);
      expect(error.extensions).toEqual({ authenticationFailed: true });
    });

    it('目录非成功状态保留 provider 状态错误契约', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response(503, { error: 'unavailable' })),
      );

      await expect(service.discoverModels(provider())).rejects.toMatchObject({
        detail: '获取模型列表失败，状态码 503',
      });
    });

    it('目录网络错误包装为 provider 异常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('socket disconnected')),
      );

      await expect(service.discoverModels(provider())).rejects.toMatchObject({
        detail: '无法获取模型列表: socket disconnected',
      });
    });

    it('目录 AbortError 保留 timeout 异常', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      const error = await service.discoverModels(provider()).catch((e) => e);
      expect(error).toBeInstanceOf(LlmTimeoutException);
      expect(error.detail).toContain('连接超时 (15000ms)');
    });

    it('Anthropic 连接带凭据打 /v1/models，并从响应体提取服务器信息', async () => {
      decryptConfiguredApiKey.mockResolvedValue('anthropic-secret');
      const fetchMock = vi.fn().mockResolvedValue(
        response(200, {
          version: '1.2.3',
          status: 'ready',
          data: [
            { id: 'claude-3-7' },
            { id: 42 },
            ...Array.from({ length: 12 }, (_, index) => ({
              id: `model-${index}`,
            })),
          ],
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await service.testConnection(
        provider({
          slug: 'anthropic',
          apiProtocol: 'anthropic',
          apiKeyId: 'anthropic-key',
        }),
        1234,
      );

      expect(result.success).toBe(true);
      expect(result.serverInfo).toEqual({
        version: '1.2.3',
        status: 'ready',
        models: [
          'claude-3-7',
          'model-0',
          'model-1',
          'model-2',
          'model-3',
          'model-4',
          'model-5',
          'model-6',
          'model-7',
          'model-8',
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'x-api-key': 'anthropic-secret',
            'anthropic-version': '2023-06-01',
          },
        }),
      );
    });

    // D-11 关键回归：/health 通常不鉴权，绝不能让它替带凭据探测下结论。
    it('health 可用但带凭据探测 401 时必须失败', async () => {
      decryptConfiguredApiKey.mockResolvedValue('bad-key');
      const fetchMock = vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith('/health')
              ? response(200, { status: 'ok' })
              : response(401, { error: 'invalid api key' }),
          ),
        );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        service.testConnection(provider({ apiKeyId: 'key-id' })),
      ).rejects.toMatchObject({ detail: '认证失败 (401)，请检查认证配置' });
      expect(
        fetchMock.mock.calls.every(
          (call) => !String(call[0]).endsWith('/health'),
        ),
      ).toBe(true);
    });

    it.each([
      [
        'openai_chat',
        'https://api.example.test/v1/models',
        'GET',
        { data: [{ id: 'gpt-4o' }] },
      ],
      [
        'openai_responses',
        'https://api.example.test/v1/models',
        'GET',
        { data: [] },
      ],
      ['anthropic', 'https://api.example.test/v1/models', 'GET', { data: [] }],
      [
        'google',
        'https://api.example.test/v1beta/models',
        'GET',
        { models: [{ name: 'gemini-2.0' }] },
      ],
      [
        'cohere',
        'https://api.example.test/v1/check-api-key',
        'POST',
        { valid: true },
      ],
    ] as const)(
      '%s 协议探测 %s (%s)',
      async (apiProtocol, expectedUrl, expectedMethod, body) => {
        decryptConfiguredApiKey.mockResolvedValue('secret');
        const fetchMock = vi.fn().mockResolvedValue(response(200, body));
        vi.stubGlobal('fetch', fetchMock);

        const result = await service.testConnection(
          provider({ apiProtocol, apiKeyId: 'key-id' }),
        );

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          expectedUrl,
          expect.objectContaining({ method: expectedMethod }),
        );
      },
    );

    it('google 协议使用 x-goog-api-key 而非 Bearer', async () => {
      decryptConfiguredApiKey.mockResolvedValue('google-secret');
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(200, { models: [{ name: 'gemini' }] }));
      vi.stubGlobal('fetch', fetchMock);

      await service.testConnection(
        provider({ apiProtocol: 'google', apiKeyId: 'key-id' }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/v1beta/models',
        expect.objectContaining({
          headers: { 'x-goog-api-key': 'google-secret' },
        }),
      );
    });

    it('cohere 的 valid !== true 视为失败', async () => {
      decryptConfiguredApiKey.mockResolvedValue('secret');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response(200, { valid: false })),
      );

      await expect(
        service.testConnection(
          provider({ apiProtocol: 'cohere', apiKeyId: 'key-id' }),
        ),
      ).rejects.toBeInstanceOf(LlmProviderException);
    });

    it('2xx 但响应体形状不匹配时视为失败而不是成功', async () => {
      const malformed = response(200, {});
      vi.mocked(malformed.json).mockRejectedValue(new SyntaxError('bad json'));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(malformed));

      await expect(service.testConnection(provider())).rejects.toMatchObject({
        detail: '鉴权探测端点返回了无法识别的响应体，可能不是该协议的兼容端点',
      });
    });

    it('探测超时保留 timeout 异常', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      await expect(
        service.testConnection(provider(), 25),
      ).rejects.toMatchObject({ detail: '连接超时 (25ms)' });
    });

    it('探测非成功状态抛出 provider 异常', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(502, {})));

      await expect(service.testConnection(provider())).rejects.toMatchObject({
        detail: '鉴权探测端点返回状态码 502',
      });
    });

    it('网络失败包装为 provider 异常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network down')),
      );

      await expect(service.testConnection(provider())).rejects.toMatchObject({
        detail: '无法连接到提供商端点: network down',
      });
    });

    it('凭据只出现在 header，不进 URL', async () => {
      decryptConfiguredApiKey.mockResolvedValue('super-secret-key');
      const fetchMock = vi.fn().mockResolvedValue(response(200, { data: [] }));
      vi.stubGlobal('fetch', fetchMock);

      await service.testConnection(provider({ apiKeyId: 'key-id' }));

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).not.toContain('super-secret-key');
    });
  });

  describe('LiteLLM catalog lookup, filtering and cache', () => {
    it('构建目录键时保持优先级并去除重复 provider 前缀', () => {
      const privateService = service as unknown as {
        buildLiteLLMKeys: (providerSlug: string, modelId: string) => string[];
      };

      expect(privateService.buildLiteLLMKeys('openai', 'gpt-4o')).toEqual([
        'gpt-4o',
        'openai/gpt-4o',
      ]);
      expect(privateService.buildLiteLLMKeys('anthropic', 'claude')).toEqual([
        'claude',
        'anthropic/claude',
      ]);
    });

    it('按 direct、slug 前缀和 LiteLLM provider 前缀优先级查找', async () => {
      const getData = vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      );
      getData.mockResolvedValue({
        'deepseek/deepseek-chat': { max_tokens: 64_000 },
      });

      await expect(
        service.lookupModelMetadata('deepseek', 'deepseek-chat'),
      ).resolves.toEqual(
        expect.objectContaining({
          modelId: 'deepseek/deepseek-chat',
          contextWindow: 64_000,
          maxOutputTokens: null,
          pricing: null,
        }),
      );
    });

    it('忽略 primitive 条目且不存在时返回 null', async () => {
      vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      ).mockResolvedValue({
        'gpt-missing': 'invalid',
        'openai/gpt-missing': null,
      });

      await expect(
        service.lookupModelMetadata('openai', 'gpt-missing'),
      ).resolves.toBeNull();
    });

    it('未知 provider 搜索返回空列表', async () => {
      vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      ).mockResolvedValue({});

      await expect(service.searchLiteLLMModels('unknown')).resolves.toEqual([]);
    });

    it('按 provider 过滤无效、空值和其他目录条目', async () => {
      vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      ).mockResolvedValue({
        invalid: 'text',
        empty: null,
        other: { litellm_provider: 'anthropic' },
        'gpt-4o': {
          litellm_provider: 'openai',
          max_tokens: 128_000,
          supports_vision: 1,
        },
        'azure-gpt': {
          litellm_provider: 'azure',
          max_output_tokens: 4096,
        },
      });

      const result = await service.searchLiteLLMModels('openai');

      expect(result.map(({ modelId }) => modelId)).toEqual(['gpt-4o']);
      expect(result.some(({ modelId }) => modelId === 'azure-gpt')).toBe(false);
      expect(result[0]).toEqual(
        expect.objectContaining({
          contextWindow: 128_000,
          maxOutputTokens: null,
          capabilities: expect.objectContaining({ vision: true }),
        }),
      );
    });

    it('目录搜索最多返回 100 个匹配模型', async () => {
      vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      ).mockResolvedValue(
        Object.fromEntries(
          Array.from({ length: 105 }, (_, index) => [
            `model-${index}`,
            { litellm_provider: 'openai' },
          ]),
        ),
      );

      const result = await service.searchLiteLLMModels('openai');
      expect(result).toHaveLength(100);
      expect(result.at(-1)?.modelId).toBe('model-99');
    });

    it('解析 k、m 与无单位阈值，并以阈值升序去重合并 tier', async () => {
      vi.spyOn(
        service as unknown as { getLiteLLMData: () => Promise<unknown> },
        'getLiteLLMData',
      ).mockResolvedValue({
        tiered: {
          input_cost_per_token: 1e-6,
          output_cost_per_token: 2e-6,
          input_cost_per_token_above_2m_tokens: 5e-6,
          output_cost_per_token_above_10k_tokens: 4e-6,
          cache_read_input_token_cost_above_10k_tokens: 0.5e-6,
          cache_creation_input_token_cost_above_500_tokens: 0.25e-6,
          input_cost_per_token_above_bad_tokens: 99,
          output_cost_per_token_above_1k_tokens: 'invalid',
        },
      });

      const result = await service.lookupModelMetadata('custom', 'tiered');

      expect(result?.pricing?.tiers).toEqual([
        {
          aboveTokens: 500,
          inputPer1MTokens: 1,
          outputPer1MTokens: 2,
          cachedWritePer1MTokens: 0.25,
        },
        {
          aboveTokens: 10_000,
          inputPer1MTokens: 1,
          outputPer1MTokens: 4,
          cachedReadPer1MTokens: 0.5,
        },
        {
          aboveTokens: 2_000_000,
          inputPer1MTokens: 5,
          outputPer1MTokens: 2,
        },
      ]);
    });

    it('成功获取目录后复用 24 小时内缓存', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(200, { cached: { max_tokens: 8192 } }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        service.lookupModelMetadata('custom', 'cached'),
      ).resolves.toEqual(expect.objectContaining({ contextWindow: 8192 }));
      await service.lookupModelMetadata('custom', 'cached');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('过期缓存刷新失败时回退最后成功目录', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(200, { cached: { max_tokens: 4096 } }))
        .mockResolvedValueOnce(response(503, {}));
      vi.stubGlobal('fetch', fetchMock);

      await service.lookupModelMetadata('custom', 'cached');
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

      await expect(
        service.lookupModelMetadata('custom', 'cached'),
      ).resolves.toEqual(expect.objectContaining({ contextWindow: 4096 }));
    });

    it('首次目录状态失败时回退空目录', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, {})));

      await expect(service.searchLiteLLMModels('openai')).resolves.toEqual([]);
    });

    it('首次目录网络失败时回退空目录', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

      await expect(
        service.lookupModelMetadata('custom', 'missing'),
      ).resolves.toBeNull();
    });
  });
});
