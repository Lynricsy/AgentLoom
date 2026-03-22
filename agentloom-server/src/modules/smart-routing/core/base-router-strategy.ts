import { z } from 'zod';

import type { RoutingCandidate } from './routing-candidate';
import type { RoutingContext } from './routing-context';
import type { RoutingDecision } from './routing-decision';

export type RouterCategory = 'simple' | 'ml' | 'rag' | 'plugin';

export abstract class BaseRouterStrategy {
  abstract readonly name: string;
  abstract readonly category: RouterCategory;
  abstract readonly requiresEmbedding: boolean;
  abstract readonly configSchema: z.ZodSchema;

  abstract routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision>;

  async routeBatch(
    candidates: RoutingCandidate[],
    contexts: RoutingContext[],
  ): Promise<RoutingDecision[]> {
    return Promise.all(contexts.map((context) => this.route(candidates, context)));
  }

  async route(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const startTime = Date.now();
    const healthyCandidates = candidates.filter(
      (candidate) => candidate.healthStatus !== 'open',
    );
    const validCandidates = healthyCandidates.filter(
      (candidate) => candidate.routingMeta.contextWindow >= context.inputTokenCount,
    );

    if (validCandidates.length === 0) {
      throw new Error(
        `No valid candidates after filtering: ${candidates.length} total, ${healthyCandidates.length} healthy, 0 within token limit`,
      );
    }

    const decision = await this.routeSingle(validCandidates, context);

    return {
      ...decision,
      latencyMs: Date.now() - startTime,
      routerType: this.name,
    };
  }
}
