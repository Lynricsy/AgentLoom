import { describe, it, expect } from 'vitest';

import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import { RoundRobinRouter } from '../round-robin.strategy';

const makeCandidates = (): RoutingCandidate[] => [
  {
    id: 'model-a',
    modelConfigId: 'config-a',
    name: 'Model A',
    provider: 'openai',
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.01, output: 0.03 },
      qualityRank: 90,
      avgLatencyMs: 300,
      maxInputTokens: 128_000,
      eloRating: 1300,
    },
    healthStatus: 'healthy',
  },
  {
    id: 'model-b',
    modelConfigId: 'config-b',
    name: 'Model B',
    provider: 'anthropic',
    routingMeta: {
      contextWindow: 200_000,
      costs: { input: 0.015, output: 0.06 },
      qualityRank: 95,
      avgLatencyMs: 400,
      maxInputTokens: 200_000,
      eloRating: 1350,
    },
    healthStatus: 'healthy',
  },
  {
    id: 'model-c',
    modelConfigId: 'config-c',
    name: 'Model C',
    provider: 'deepseek',
    routingMeta: {
      contextWindow: 64_000,
      costs: { input: 0.001, output: 0.002 },
      qualityRank: 70,
      avgLatencyMs: 200,
      maxInputTokens: 64_000,
      eloRating: 1100,
    },
    healthStatus: 'healthy',
  },
];

const makeContext = (tenantId: string): RoutingContext => ({
  inputTokenCount: 100,
  tenantId,
});

describe('RoundRobinRouter', () => {
  it('应该具有正确的元数据', () => {
    const router = new RoundRobinRouter();
    expect(router.name).toBe('round_robin');
    expect(router.category).toBe('simple');
    expect(router.requiresEmbedding).toBe(false);
  });

  it('应该严格按 A→B→C→A→B→C 顺序轮转', async () => {
    const router = new RoundRobinRouter();
    const candidates = makeCandidates();
    const context = makeContext('tenant-1');

    const sequence: string[] = [];
    for (let i = 0; i < 6; i++) {
      const decision = await router.routeSingle(candidates, context);
      sequence.push(decision.selectedModelId!);
    }

    expect(sequence).toEqual([
      'model-a',
      'model-b',
      'model-c',
      'model-a',
      'model-b',
      'model-c',
    ]);
  });

  it('不同租户应该有独立的轮转索引', async () => {
    const router = new RoundRobinRouter();
    const candidates = makeCandidates();

    const d1 = await router.routeSingle(candidates, makeContext('tenant-x'));
    expect(d1.selectedModelId).toBe('model-a');

    const d2 = await router.routeSingle(candidates, makeContext('tenant-y'));
    expect(d2.selectedModelId).toBe('model-a');

    const d3 = await router.routeSingle(candidates, makeContext('tenant-x'));
    expect(d3.selectedModelId).toBe('model-b');

    const d4 = await router.routeSingle(candidates, makeContext('tenant-y'));
    expect(d4.selectedModelId).toBe('model-b');
  });

  it('选中的模型应该有最高分数', async () => {
    const router = new RoundRobinRouter();
    const candidates = makeCandidates();
    const decision = await router.routeSingle(candidates, makeContext('tenant-score'));

    const selectedScore = decision.scores.find(
      (s) => s.modelId === decision.selectedModelId,
    );
    const otherScores = decision.scores.filter(
      (s) => s.modelId !== decision.selectedModelId,
    );

    expect(selectedScore!.score).toBe(100);
    for (const s of otherScores) {
      expect(s.score).toBeLessThan(100);
    }
  });

  it('reasoning 应该包含轮转信息', async () => {
    const router = new RoundRobinRouter();
    const candidates = makeCandidates();
    const decision = await router.routeSingle(candidates, makeContext('tenant-r'));

    expect(decision.reasoning).toContain('轮转');
  });

  it('scores 数量应该等于候选数', async () => {
    const router = new RoundRobinRouter();
    const candidates = makeCandidates();
    const decision = await router.routeSingle(candidates, makeContext('tenant-s'));

    expect(decision.scores).toHaveLength(candidates.length);
  });
});
