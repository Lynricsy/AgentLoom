import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision } from '../core/routing-decision';

export class RandomRouter extends BaseRouterStrategy {
  readonly name = 'random';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({});

  async routeSingle(
    candidates: RoutingCandidate[],
    _context: RoutingContext,
  ): Promise<RoutingDecision> {
    const selectedIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[selectedIndex];
    const uniformScore = Math.round(100 / candidates.length);

    return {
      selectedModelId: selected.id,
      scores: candidates.map((c) => ({
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: uniformScore,
        reasoning: `随机选择，均匀概率 ${(100 / candidates.length).toFixed(1)}%`,
      })),
      reasoning: `随机路由：从 ${candidates.length} 个候选中随机选择 ${selected.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
