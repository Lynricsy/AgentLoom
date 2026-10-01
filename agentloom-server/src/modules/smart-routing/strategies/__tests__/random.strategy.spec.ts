import { afterEach, describe, it, expect, vi } from 'vitest';

import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import { RandomRouter } from '../random.strategy';

const makeCandidates = (count: number): RoutingCandidate[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `model-${i}`,
    modelConfigId: `config-${i}`,
    name: `Model ${i}`,
    provider: `provider-${i}`,
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.01, output: 0.03 },
      qualityRank: 80,
      avgLatencyMs: 500,
      maxInputTokens: 128_000,
      eloRating: 1200,
    },
    healthStatus: 'healthy' as const,
  }));

const baseContext: RoutingContext = {
  inputTokenCount: 100,
  tenantId: 'tenant-1',
};

describe('RandomRouter', () => {
  const router = new RandomRouter();

  it('应该具有正确的元数据', () => {
    expect(router.name).toBe('random');
    expect(router.category).toBe('simple');
    expect(router.requiresEmbedding).toBe(false);
  });

  it('应该配置空 schema', () => {
    const parsed = router.configSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('应该从候选中选择一个模型', async () => {
    const candidates = makeCandidates(3);
    const decision = await router.routeSingle(candidates, baseContext);

    expect(decision.selectedModelId).toBeDefined();
    expect(candidates.some((c) => c.id === decision.selectedModelId)).toBe(
      true,
    );
    expect(decision.scores).toHaveLength(3);
    expect(decision.reasoning).toContain('随机');
  });

  it('应该为所有候选分配均匀分布的分数', async () => {
    const candidates = makeCandidates(3);
    const decision = await router.routeSingle(candidates, baseContext);

    // 所有候选应该有相同的分数（均匀分布）
    const uniqueScores = new Set(decision.scores.map((s) => s.score));
    expect(uniqueScores.size).toBe(1);

    // 选中的模型分数应该是均匀的
    for (const score of decision.scores) {
      expect(score.score).toBeGreaterThan(0);
      expect(score.score).toBeLessThanOrEqual(100);
    }
  });

  describe('Math.random 到候选的映射', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('[0, 1) 上等距的随机数把每个候选选中相同次数（3 个候选）', async () => {
      const candidates = makeCandidates(3);
      const samples = 99;
      let call = 0;
      // 等距取样 (i + 0.5) / samples 覆盖整个 [0, 1)，替代真随机：真随机下 100 次里
      // 某个候选少于 20 次的概率约 0.4%，断言会偶发失败
      vi.spyOn(Math, 'random').mockImplementation(
        () => (call++ + 0.5) / samples,
      );
      const counts: Record<string, number> = {};

      for (let i = 0; i < samples; i++) {
        const decision = await router.routeSingle(candidates, baseContext);
        const selected = decision.selectedModelId!;
        counts[selected] = (counts[selected] ?? 0) + 1;
      }

      expect(counts).toEqual({ 'model-0': 33, 'model-1': 33, 'model-2': 33 });
    });

    it('随机数取到区间两端时仍落在首尾候选上', async () => {
      const candidates = makeCandidates(3);
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1 - Number.EPSILON);

      const first = await router.routeSingle(candidates, baseContext);
      const last = await router.routeSingle(candidates, baseContext);

      expect(first.selectedModelId).toBe('model-0');
      expect(last.selectedModelId).toBe('model-2');
    });
  });

  it('单个候选时应该始终选择该候选', async () => {
    const candidates = makeCandidates(1);
    const decision = await router.routeSingle(candidates, baseContext);

    expect(decision.selectedModelId).toBe('model-0');
    expect(decision.scores).toHaveLength(1);
  });

  it('scores 中每项应该包含完整信息', async () => {
    const candidates = makeCandidates(2);
    const decision = await router.routeSingle(candidates, baseContext);

    for (const score of decision.scores) {
      expect(score.modelId).toBeDefined();
      expect(score.modelName).toBeDefined();
      expect(score.provider).toBeDefined();
      expect(typeof score.score).toBe('number');
      expect(score.reasoning).toBeDefined();
    }
  });
});
