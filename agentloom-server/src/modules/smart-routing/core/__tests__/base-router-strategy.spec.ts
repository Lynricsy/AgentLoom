import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { BaseRouterStrategy } from '../base-router-strategy';
import type {
  ExtendedRoutingMeta,
  RoutingCandidate,
} from '../routing-candidate';
import type { RoutingContext } from '../routing-context';
import type { RoutingDecision } from '../routing-decision';

type CandidateOverrides = Partial<Omit<RoutingCandidate, 'routingMeta'>> & {
  routingMeta?: Partial<ExtendedRoutingMeta> & {
    costs?: Partial<ExtendedRoutingMeta['costs']>;
  };
};

class TestStrategy extends BaseRouterStrategy {
  readonly name = 'test-router';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({});

  readonly routeSingleMock = vi.fn(
    async (
      candidates: RoutingCandidate[],
      _context: RoutingContext,
    ): Promise<RoutingDecision> => ({
      selectedModelId: candidates[0]?.id ?? null,
      scores: candidates.map((candidate) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score: 100,
        reasoning: `候选 ${candidate.id}`,
      })),
      reasoning: `收到 ${candidates.length} 个候选`,
      routerType: 'placeholder',
      latencyMs: -1,
    }),
  );

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    return this.routeSingleMock(candidates, context);
  }
}

function createCandidate(
  id: string,
  overrides: CandidateOverrides = {},
): RoutingCandidate {
  const baseRoutingMeta: ExtendedRoutingMeta = {
    contextWindow: 16_000,
    costs: {
      input: 0.001,
      output: 0.002,
    },
    qualityRank: 80,
    avgLatencyMs: 500,
    maxInputTokens: 16_000,
    eloRating: 1_200,
  };

  return {
    id,
    modelConfigId: `${id}-config`,
    name: `${id}-name`,
    provider: 'openai',
    healthStatus: 'healthy',
    ...overrides,
    routingMeta: {
      ...baseRoutingMeta,
      ...overrides.routingMeta,
      costs: {
        ...baseRoutingMeta.costs,
        ...overrides.routingMeta?.costs,
      },
    },
  };
}

describe('BaseRouterStrategy', () => {
  let strategy: TestStrategy;
  let context: RoutingContext;

  beforeEach(() => {
    strategy = new TestStrategy();
    context = {
      inputTokenCount: 4_000,
      tenantId: 'tenant-1',
      queryText: '为当前请求选择合适模型',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('route() 会过滤掉 healthStatus 为 open 的候选', async () => {
    const candidates = [
      createCandidate('healthy-model'),
      createCandidate('degraded-model', { healthStatus: 'degraded' }),
      createCandidate('open-model', { healthStatus: 'open' }),
    ];

    await strategy.route(candidates, context);

    expect(strategy.routeSingleMock).toHaveBeenCalledWith(
      [candidates[0], candidates[1]],
      context,
    );
  });

  it('route() 会过滤掉上下文窗口不足的候选', async () => {
    const fittingCandidate = createCandidate('fits-model', {
      routingMeta: { contextWindow: 8_000 },
    });
    const tooSmallCandidate = createCandidate('small-model', {
      routingMeta: { contextWindow: 2_000 },
    });

    await strategy.route([fittingCandidate, tooSmallCandidate], context);

    expect(strategy.routeSingleMock).toHaveBeenCalledWith(
      [fittingCandidate],
      context,
    );
  });

  it('route() 在过滤后没有可用候选时抛出描述性错误', async () => {
    const candidates = [
      createCandidate('open-model', { healthStatus: 'open' }),
      createCandidate('too-small-model', {
        routingMeta: { contextWindow: 1_000 },
      }),
    ];

    await expect(strategy.route(candidates, context)).rejects.toThrow(
      'No valid candidates after filtering: 2 total, 1 healthy, 0 within token limit',
    );
    expect(strategy.routeSingleMock).not.toHaveBeenCalled();
  });

  it('route() 只把过滤后的候选传给 routeSingle()', async () => {
    const validCandidate = createCandidate('valid-model');
    const unhealthyCandidate = createCandidate('open-model', {
      healthStatus: 'open',
    });
    const tooSmallCandidate = createCandidate('too-small-model', {
      routingMeta: { contextWindow: 2_000 },
    });

    const decision = await strategy.route(
      [validCandidate, unhealthyCandidate, tooSmallCandidate],
      context,
    );

    expect(strategy.routeSingleMock).toHaveBeenCalledTimes(1);
    expect(strategy.routeSingleMock).toHaveBeenCalledWith(
      [validCandidate],
      context,
    );
    expect(decision.selectedModelId).toBe('valid-model');
  });

  it('route() 会写入 latencyMs 与 routerType', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_025);

    const decision = await strategy.route(
      [createCandidate('valid-model')],
      context,
    );

    expect(decision.latencyMs).toBe(25);
    expect(decision.routerType).toBe('test-router');
    expect(decision.reasoning).toBe('收到 1 个候选');
  });
});
