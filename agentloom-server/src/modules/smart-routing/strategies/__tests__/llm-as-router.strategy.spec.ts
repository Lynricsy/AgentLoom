import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    strategy = new LlmAsRouterStrategy();
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

  it('configSchema 应该允许可选 promptTemplate', () => {
    const result = strategy.configSchema.safeParse({
      routerModelId: 'gpt-4o-mini',
      promptTemplate: '自定义提示词: {candidates}',
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

  it('LLM 超时时应该回退到随机选择', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBeTruthy();
    expect(
      candidates.some((c) => c.id === decision.selectedModelId),
    ).toBe(true);
    expect(decision.reasoning).toContain('超时');
    expect(decision.scores).toHaveLength(3);
  });

  it('LLM 返回无效 JSON 时应该回退到随机选择', async () => {
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

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBeTruthy();
    expect(
      candidates.some((c) => c.id === decision.selectedModelId),
    ).toBe(true);
    expect(decision.reasoning).toContain('回退');
  });

  it('LLM 返回不存在的模型 ID 时应该回退到随机选择', async () => {
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

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBeTruthy();
    expect(
      candidates.some((c) => c.id === decision.selectedModelId),
    ).toBe(true);
    expect(decision.reasoning).toContain('回退');
  });

  it('fetch 网络错误时应该回退到随机选择', async () => {
    mockFetch.mockRejectedValueOnce(new Error('网络连接失败'));

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBeTruthy();
    expect(
      candidates.some((c) => c.id === decision.selectedModelId),
    ).toBe(true);
    expect(decision.reasoning).toContain('回退');
  });

  it('HTTP 非 200 响应时应该回退到随机选择', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const candidates = makeCandidates();
    const context = makeContext({
      strategyConfig: { routerModelId: 'gpt-4o-mini' },
    });

    const decision = await strategy.route(candidates, context);

    expect(decision.selectedModelId).toBeTruthy();
    expect(decision.reasoning).toContain('回退');
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
