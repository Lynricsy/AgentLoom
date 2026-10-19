import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { LlmAsRouterStrategy } from '../llm-as-router.strategy';
import { PiAiAdapter } from '../../../llm/pi-ai-adapter';
import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import type { RoutingDecision } from '../../core/routing-decision';

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

/** 路由模型配置：端点、协议与凭据都来自租户内的模型配置 */
function makeRouterModel(provider: {
  slug: string;
  apiProtocol: string | null;
  baseUrl: string;
}) {
  return {
    id: 'config-router',
    name: 'router',
    modelId: 'router-model',
    orgId: 'org-1',
    tenantId: 'tenant-1',
    timeoutMs: null,
    parameters: null,
    provider: {
      ...provider,
      orgId: 'org-1',
      apiKeyId: 'key-1',
      defaultBaseUrl: null,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** OpenAI Chat Completions 报文 */
function chatCompletion(content: string) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model: 'router-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** OpenAI Responses 报文 */
function responsesOutput(text: string) {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: 1,
    model: 'router-model',
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg_1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

/** Anthropic Messages 报文 */
function anthropicMessage(text: string) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'router-model',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

const selection = (selectedModelId: string, reasoning = '理由') =>
  JSON.stringify({ selectedModelId, reasoning });

const mockFetch = vi.fn<typeof fetch>();

function lastRequest(): { url: string; body: Record<string, unknown> } {
  const [input, init] = mockFetch.mock.calls.at(-1)!;
  return {
    url: String(input),
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  };
}

describe('LlmAsRouterStrategy', () => {
  let strategy: LlmAsRouterStrategy;
  let findById: Mock;
  let decryptConfiguredApiKey: Mock;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    findById = vi.fn().mockResolvedValue(
      makeRouterModel({
        slug: 'axonhub',
        apiProtocol: 'openai_chat',
        baseUrl: 'https://router.example.test/v1',
      }),
    );
    decryptConfiguredApiKey = vi.fn().mockResolvedValue('router-secret');
    strategy = new LlmAsRouterStrategy(
      { findById } as never,
      new PiAiAdapter({ decryptConfiguredApiKey } as never, {} as never),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
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

  describe('按提供商 apiProtocol 与规范化 base URL 调用路由模型', () => {
    it('openai_chat：base URL 已含 /v1 时不重复拼接', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(chatCompletion(selection('candidate-2'))),
      );

      const decision = await strategy.route(
        makeCandidates(),
        makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
      );

      expect(decision.selectedModelId).toBe('candidate-2');
      expect(decision.fallback).toBeUndefined();
      const request = lastRequest();
      expect(request.url).toBe(
        'https://router.example.test/v1/chat/completions',
      );
      expect(request.body.model).toBe('router-model');
      expect(request.body.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      );
      const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer router-secret');
    });

    it('openai_responses：走 Responses API', async () => {
      findById.mockResolvedValueOnce(
        makeRouterModel({
          slug: 'codehub',
          apiProtocol: 'openai_responses',
          baseUrl: 'https://codehub.example.test/v1/',
        }),
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse(responsesOutput(selection('candidate-3'))),
      );

      const decision = await strategy.route(
        makeCandidates(),
        makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
      );

      expect(decision.selectedModelId).toBe('candidate-3');
      expect(decision.fallback).toBeUndefined();
      const request = lastRequest();
      expect(request.url).toBe('https://codehub.example.test/v1/responses');
      expect(request.body).toHaveProperty('input');
    });

    it('anthropic：走 Messages API 并带 x-api-key', async () => {
      findById.mockResolvedValueOnce(
        makeRouterModel({
          slug: 'vm2api-anthropic',
          apiProtocol: 'anthropic',
          baseUrl: 'https://anthropic.example.test',
        }),
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse(anthropicMessage(selection('candidate-1'))),
      );

      const decision = await strategy.route(
        makeCandidates(),
        makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
      );

      expect(decision.selectedModelId).toBe('candidate-1');
      expect(decision.fallback).toBeUndefined();
      const request = lastRequest();
      expect(request.url).toBe('https://anthropic.example.test/v1/messages');
      expect(request.body.system).toEqual(expect.anything());
      const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
      expect(headers.get('x-api-key')).toBe('router-secret');
    });
  });

  it('LLM 返回有效选择时应该选择对应模型', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        chatCompletion(
          selection('candidate-2', 'claude-sonnet 最适合代码生成'),
        ),
      ),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expect(decision.selectedModelId).toBe('candidate-2');
    expect(decision.reasoning).toContain('claude-sonnet');
    expect(decision.scores).toHaveLength(3);
    expect(
      decision.scores.find((s) => s.modelId === 'candidate-2')!.score,
    ).toBe(100);
  });

  function expectRulesFallback(decision: RoutingDecision, reason: string) {
    // 未配置回退模型与规则：规则路由无匹配，确定性地取候选首位
    expect(decision.selectedModelId).toBe('candidate-1');
    expect(decision.fallback).toEqual({ reason, source: 'rules' });
    expect(decision.routerType).toBe('llm_as_router');
    expect(decision.reasoning).toContain(`LLM 路由回退（${reason}）`);
    expect(decision.scores).toHaveLength(3);
  }

  function hangUntilAborted() {
    mockFetch.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );
  }

  it('LLM 超过默认 10 秒未响应时中止请求并标记 llm_timeout', async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    let settled = false;

    const pending = strategy
      .route(
        makeCandidates(),
        makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
      )
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);

    expectRulesFallback(await pending, 'llm_timeout');
  });

  it('strategyConfig.timeoutMs 覆盖默认超时', async () => {
    vi.useFakeTimers();
    hangUntilAborted();

    const pending = strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: { routerModelId: 'config-router', timeoutMs: 2_000 },
      }),
    );
    await vi.advanceTimersByTimeAsync(2_000);

    expectRulesFallback(await pending, 'llm_timeout');
  });

  it('LLM 返回无效 JSON 时应该确定性回退并标记 llm_invalid_response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(chatCompletion('这不是 JSON')),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expectRulesFallback(decision, 'llm_invalid_response');
  });

  it('LLM 返回不存在的模型 ID 时应该确定性回退并标记 llm_invalid_response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(chatCompletion(selection('non-existent-model'))),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expectRulesFallback(decision, 'llm_invalid_response');
  });

  it('网络错误时应该确定性回退并标记 llm_http_error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('网络连接失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expectRulesFallback(decision, 'llm_http_error');
  });

  it('HTTP 非 2xx 响应时只请求一次并标记 llm_http_error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'Too Many Requests' } }, 429),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expectRulesFallback(decision, 'llm_http_error');
  });

  it('路由器模型配置解析失败时不发请求并标记 llm_config_error', async () => {
    findById.mockRejectedValueOnce(new Error('模型配置不存在'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expectRulesFallback(decision, 'llm_config_error');
  });

  it('凭据解密失败时标记 llm_config_error', async () => {
    decryptConfiguredApiKey.mockRejectedValueOnce(new Error('解密失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expectRulesFallback(decision, 'llm_config_error');
  });

  it('不支持的 apiProtocol 标记 llm_config_error', async () => {
    findById.mockResolvedValueOnce(
      makeRouterModel({
        slug: 'mystery',
        apiProtocol: null,
        baseUrl: 'https://mystery.example.test',
      }),
    );

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({ strategyConfig: { routerModelId: 'config-router' } }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expectRulesFallback(decision, 'llm_config_error');
  });

  it('配置了候选内的 fallbackModelId 时优先使用该模型', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('网络连接失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: {
          routerModelId: 'config-router',
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
      reason: 'llm_http_error',
      source: 'configured_model',
    });
    expect(decision.reasoning).toBe(
      'LLM 路由回退（llm_http_error）：使用已配置回退模型 claude-sonnet',
    );
  });

  it('fallbackModelId 不在候选内时改用 fallbackRules，规则命中目标', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('网络连接失败'));

    const decision = await strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: {
          routerModelId: 'config-router',
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
    expect(decision.fallback).toEqual({
      reason: 'llm_http_error',
      source: 'rules',
    });
    expect(decision.reasoning).toContain(
      'LLM 路由回退（llm_http_error）：规则匹配',
    );
  });

  it('同样的失败多次路由结果一致（不含随机）', async () => {
    const context = makeContext({
      strategyConfig: { routerModelId: 'config-router' },
    });
    const selected = new Set<string | null>();
    for (let i = 0; i < 5; i += 1) {
      mockFetch.mockRejectedValueOnce(new TypeError('网络连接失败'));
      const decision = await strategy.route(makeCandidates(), context);
      selected.add(decision.selectedModelId);
    }
    expect([...selected]).toEqual(['candidate-1']);
  });

  it('提示词包含候选模型信息与自定义 promptTemplate', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(chatCompletion(selection('candidate-1'))),
    );

    await strategy.route(
      makeCandidates(),
      makeContext({
        strategyConfig: {
          routerModelId: 'config-router',
          promptTemplate: '自定义模板: 请选择最佳模型',
        },
      }),
    );

    const messages = lastRequest().body.messages as Array<{
      role: string;
      content: string;
    }>;
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessage = messages.find((m) => m.role === 'user');
    expect(systemMessage?.content).toContain('自定义模板');
    expect(JSON.stringify(userMessage?.content)).toContain('gpt-4o');
    expect(JSON.stringify(userMessage?.content)).toContain('claude-sonnet');
    expect(JSON.stringify(userMessage?.content)).toContain('deepseek-chat');
  });
});
