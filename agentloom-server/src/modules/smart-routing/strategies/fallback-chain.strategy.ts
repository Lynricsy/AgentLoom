import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision } from '../core/routing-decision';
import {
  toLegacyCandidate,
  toLegacyContext,
  toRoutingDecision,
} from './legacy-adapter';
import { fallbackChain } from './fallback-chain';

export class FallbackChainRouter extends BaseRouterStrategy {
  readonly name = 'fallback_chain';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({});

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const results = fallbackChain(
      candidates.map(toLegacyCandidate),
      toLegacyContext(context),
    );
    return toRoutingDecision(results, this.name);
  }
}
