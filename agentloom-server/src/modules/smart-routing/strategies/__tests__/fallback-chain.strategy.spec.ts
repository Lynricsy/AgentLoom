import { describe, it, expect } from 'vitest';
import { FallbackChainRouter } from '../fallback-chain.strategy';
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

function makeContext(): RoutingContext {
  return {
    inputTokenCount: 1000,
    tenantId: 'tenant-1',
  };
}

describe('FallbackChainRouter', () => {
  const router = new FallbackChainRouter();

  it('应该有正确的元数据', () => {
    expect(router.name).toBe('fallback_chain');
    expect(router.category).toBe('simple');
    expect(router.requiresEmbedding).toBe(false);
  });

  it('应该按位置顺序分配递减分数', async () => {
    const decision = await router.route(makeCandidates(), makeContext());

    expect(decision.scores).toHaveLength(3);
    expect(decision.scores[0].score).toBe(100);
    expect(decision.scores[1].score).toBe(90);
    expect(decision.scores[2].score).toBe(80);
  });

  it('应该选择第一个候选模型', async () => {
    const decision = await router.route(makeCandidates(), makeContext());
    expect(decision.selectedModelId).toBe('candidate-1');
  });

  it('分数应该按顺序递减且最低为 0', async () => {
    const manyCandidates: RoutingCandidate[] = Array.from(
      { length: 15 },
      (_, i) => ({
        id: `candidate-${i}`,
        modelConfigId: `config-${i}`,
        name: `model-${i}`,
        provider: 'test',
        healthStatus: 'healthy' as const,
        routingMeta: {
          contextWindow: 128000,
          costs: { input: 0.001, output: 0.002 },
          qualityRank: 50,
          avgLatencyMs: 500,
          maxInputTokens: 128000,
          eloRating: 1100,
        },
      }),
    );

    const decision = await router.route(manyCandidates, makeContext());

    expect(decision.scores[0].score).toBe(100);
    expect(decision.scores[9].score).toBe(10);
    expect(decision.scores[10].score).toBe(0);
    expect(decision.scores[14].score).toBe(0);
  });

  it('reasoning 应该包含位置信息', async () => {
    const decision = await router.route(makeCandidates(), makeContext());
    expect(decision.scores[0].reasoning).toContain('#1');
    expect(decision.scores[1].reasoning).toContain('#2');
  });

  it('应该自动设置 routerType', async () => {
    const decision = await router.route(makeCandidates(), makeContext());
    expect(decision.routerType).toBe('fallback_chain');
  });
});
