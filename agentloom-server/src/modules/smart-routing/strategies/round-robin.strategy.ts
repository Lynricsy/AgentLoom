import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision } from '../core/routing-decision';

export class RoundRobinRouter extends BaseRouterStrategy {
  readonly name = 'round_robin';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({});

  private readonly tenantIndex = new Map<string, number>();

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const currentIndex = this.tenantIndex.get(context.tenantId) ?? 0;
    const selectedIndex = currentIndex % candidates.length;
    const selected = candidates[selectedIndex];

    this.tenantIndex.set(context.tenantId, currentIndex + 1);

    return {
      selectedModelId: selected.id,
      scores: candidates.map((c, i) => ({
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: i === selectedIndex ? 100 : Math.max(100 - Math.abs(i - selectedIndex) * 10, 0),
        reasoning: i === selectedIndex
          ? `轮转选中，位置 #${selectedIndex + 1}`
          : `轮转等待，位置 #${i + 1}`,
      })),
      reasoning: `轮转路由：租户 ${context.tenantId} 第 ${currentIndex + 1} 次请求，选择位置 #${selectedIndex + 1} 的 ${selected.name}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
