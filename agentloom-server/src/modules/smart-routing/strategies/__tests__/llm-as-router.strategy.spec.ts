import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { LlmAsRouterStrategy } from '../llm-as-router.strategy';
import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';

function makeCandidates(): RoutingCandidate[] {
  return [
    {
      id: 'candidate-1',
      modelConfigId: 'config-1',
      name: 'gpt-4o',
      provider: 'openai',
      healthStatus: 'healthy',
      routingMeta: {
        contextWindow: 128000,
        costs: { input: 0.005, output: 0.015 },
        qualityRank: 95,
        avgLatencyMs: 800,
        maxInputTokens: 128000,
        eloRating: 1280,
      },
    },
    {
      id: 'candidate-2',
      modelConfigId: 'config-2',
      name: 'claude-sonnet',
      provider: 'anthropic',
      healthStatus: 'healthy',
      routingMeta: {
        contextWindow: 200000,
        costs: { input: 0.003, output: 0.015 },
        qualityRank: 92,
        avgLatencyMs: 1200,
        maxInputTokens: 200000,
        eloRating: 1260,
      },
    },
    {
      id: 'candidate-3',
      modelConfigId: 'config-3',
      name: 'deepseek-chat',
      provider: 'deepseek',
      healthStatus: 'healthy',
      routingMeta: {
        contextWindow: 64000,
        costs: { input: 0.0005, output: 0.001 },
        qualityRank: 78,
        avgLatencyMs: 600,
        maxInputTokens: 64000,
        eloRating: 1180,
      },
    },
  ];
}

function makeContext(overrides?: Partial<RoutingContext>): RoutingContext {
  return {
    inputTokenCount: 1000,
    queryText: '帮我写一段代码',
    taskCategory: 'code_generation',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

const mockFetch = vi.fn();

describe('LlmAsRouterStrategy', () => {
  let strategy: LlmAsRouterStrategy;
  let findById: Mock;
  let decryptConfiguredApiKey: Mock;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    // routerModelId 现在会被解析成租户内的模型配置：端点与凭据都来自该配置。
    findById = vi.fn().mockResolvedValue({
      id: 'config-router',
      modelId: 'gpt-4o-mini',
      provider: {
        slug: 'openai',
        orgId: 'org-1',
        apiKeyId: 'key-1',
        baseUrl: 'https://router.example.test',
        defaultBaseUrl: null,
      },
    });
    decryptConfiguredApiKey = vi.fn().mockResolvedValue('router-secret');
    strategy = new LlmAsRouterStrategy(
      { findById } as never,
      { decryptConfiguredApiKey } as never,
    );
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应该有正确的元数据', () => {
    expect(strategy.name).toBe('llm_as_router');
    expect(strategy.category).toBe('simple');
    expect(strategy.requiresEmbedding).toBe(false);
  });

  it('configSchema 应该要求 routerModelId', () => {
    const valid = strategy.configSchema.safeParse({
      routerModelId: 'gpt-4o-mini',
    });
    expect(valid.success).toBe(true);

    const invalid = strategy.configSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it('configSchema 应该允许可选 promptTemplate、fallbackModelId 与 fallbackRules', () => {
    const result = strategy.configSchema.safeParse({
      routerModelId: 'gpt-4o-mini',
      promptTemplate: '自定义提示词: {candidates}',
      fallbackModelId: 'candidate-2',
      fallbackRules: [
        {
          condition: {
            field: 'taskCategory',
            operator: 'equals',
            value: 'code',
          },
          targetModelId: 'candidate-3',
          priority: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('LLM 返回有效选择时应该选择对应模型', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                selectedModelId: 'candidate-2',
                reasoning: 'claude-sonnet 最适合代码生成',
              }),
            },
          },
        ],
      }),
    });

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBe('candidate-2');
    expect(decision.reasoning).toContain('claude-sonnet');
    expect(decision.scores).toHaveLength(3);

    const selectedScore = decision.scores.find(
      (s) => s.modelId === 'candidate-2',
    );
    expect(selectedScore!.score).toBe(100);
  });

  function expectRulesFallback(
    decision: Awaited<ReturnType<LlmAsRouterStrategy['route']>>,
    reason: string,
  ) {
    // 未配置回退模型与规则：规则路由无匹配，确定性地取候选首位
    expect(decision.selectedModelId).toBe('candidate-1');
    expect(decision.fallback).toEqual({ reason, source: 'rules' });
    expect(decision.routerType).toBe('llm_as_router');
    expect(decision.reasoning).toContain(`LLM 路由回退（${reason}）`);
    expect(decision.scores).toHaveLength(3);
  }

  it('LLM 超时时应该确定性回退并标记 llm_timeout', async () => {
    const abortError = new DOMException(
      'The operation was aborted',
      'AbortError',
    );
    mockFetch.mockRejectedValueOnce(abortError);

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_timeout');
  });

  it('LLM 返回无效 JSON 时应该确定性回退并标记 llm_invalid_response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '这不是 JSON',
            },
          },
        ],
      }),
    });

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_invalid_response');
  });

  it('响应体不是 JSON 时应该标记 llm_invalid_response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_invalid_response');
  });

  it('LLM 返回不存在的模型 ID 时应该确定性回退并标记 llm_invalid_response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                selectedModelId: 'non-existent-model',
                reasoning: '选择了不存在的模型',
              }),
            },
          },
        ],
      }),
    });

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_invalid_response');
  });

  it('fetch 网络错误时应该确定性回退并标记 llm_http_error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('网络连接失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_http_error');
  });

  it('HTTP 非 200 响应时应该确定性回退并标记 llm_http_error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expectRulesFallback(decision, 'llm_http_error');
  });

  it('路由器模型配置解析失败时不发请求并标记 llm_config_error', async () => {
    findById.mockRejectedValueOnce(new Error('模型配置不存在'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expectRulesFallback(decision, 'llm_config_error');
  });

  it('凭据解密失败时标记 llm_config_error', async () => {
    decryptConfiguredApiKey.mockRejectedValueOnce(new Error('解密失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'gpt-4o-mini' } }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expectRulesFallback(decision, 'llm_config_error');
  });

  it('配置了候选内的 fallbackModelId 时优先使用该模型', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError'),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: {
          routerModelId: 'gpt-4o-mini',
          fallbackModelId: 'candidate-2',
          fallbackRules: [
            {
              condition: {
                field: 'taskCategory',
                operator: 'equals',
                value: 'code_generation',
              },
              targetModelId: 'candidate-3',
              priority: 0,
            },
          ],
        },
      }),
    );

    expect(decision.selectedModelId).toBe('candidate-2');
    expect(decision.fallback).toEqual({
      reason: 'llm_timeout',
      source: 'configured_model',
    });
    expect(decision.reasoning).toBe(
      'LLM 路由回退（llm_timeout）：使用已配置回退模型 claude-sonnet',
    );
  });

  it('fallbackModelId 不在候选内时改用 fallbackRules，规则命中目标', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError'),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: {
          routerModelId: 'gpt-4o-mini',
          fallbackModelId: 'not-a-candidate',
          fallbackRules: [
            {
              condition: {
                field: 'taskCategory',
                operator: 'equals',
                value: 'code_generation',
              },
              targetModelId: 'candidate-3',
              priority: 0,
            },
          ],
        },
      }),
    );

    expect(decision.selectedModelId).toBe('candidate-3');
    expect(decision.fallback).toEqual({ reason: 'llm_timeout', source: 'rules' });
    expect(decision.reasoning).toContain('LLM 路由回退（llm_timeout）：规则匹配');
  });

  it('同样的失败多次路由结果一致（不含随机）', async () => {
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });
    const selected = new Set<string | null>();
    for (let i = 0; i < 5; i += 1) {
      mockFetch.mockRejectedValueOnce(new Error('网络连接失败'));
      const decision = await strategy.route(makeCandidates(), context);
      selected.add(decision.selectedModelId);
    }
    expect([...selected]).toEqual(['candidate-1']);
  });

  it('应该在 fetch 调用中使用 AbortSignal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                selectedModelId: 'candidate-1',
                reasoning: '选择 gpt-4o',
              }),
            },
          },
        ],
      }),
    });

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    await strategy.route(candidates, context);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions).toHaveProperty('signal');
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('应该在提示词中包含候选模型信息', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                selectedModelId: 'candidate-1',
                reasoning: '选择 gpt-4o',
              }),
            },
          },
        ],
      }),
    });

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    await strategy.route(candidates, context);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMessage = fetchBody.messages.find(
      (m: { role: string }) => m.role === 'user',
    );

    expect(userMessage.content).toContain('gpt-4o');
    expect(userMessage.content).toContain('claude-sonnet');
    expect(userMessage.content).toContain('deepseek-chat');
  });

  it('自定义 promptTemplate 应该被使用', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                selectedModelId: 'candidate-1',
                reasoning: '自定义选择',
              }),
            },
          },
        ],
      }),
    });

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: {
        routerModelId: 'gpt-4o-mini',
        promptTemplate: '自定义模板: 请选择最佳模型',
      },
    });

    await strategy.route(candidates, context);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const systemMessage = fetchBody.messages.find(
      (m: { role: string }) => m.role === 'system',
    );

    expect(systemMessage.content).toContain('自定义模板');
  });
});
