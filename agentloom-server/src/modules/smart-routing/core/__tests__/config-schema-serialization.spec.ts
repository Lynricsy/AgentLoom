import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BaseRouterStrategy } from '../base-router-strategy';
import { RouterRegistry } from '../router-registry';
import type { RoutingCandidate } from '../routing-candidate';
import type { RoutingContext } from '../routing-context';
import type { RoutingDecision } from '../routing-decision';

class TestStrategy extends BaseRouterStrategy {
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema: z.ZodSchema;

  constructor(readonly name: string, configSchema: z.ZodSchema) {
    super();
    this.configSchema = configSchema;
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    _context: RoutingContext,
  ): Promise<RoutingDecision> {
    return {
      selectedModelId: candidates[0]?.id ?? null,
      scores: [],
      reasoning: `策略 ${this.name} 完成评估`,
      routerType: '',
      latencyMs: 0,
    };
  }
}

describe('config schema serialization', () => {
  let registry: RouterRegistry;

  beforeEach(() => {
    registry = new RouterRegistry();
    registry.register(
      new TestStrategy(
        'quality-first',
        z.object({
          minQualityRank: z.number().int().min(0).max(100),
          taskCategory: z.enum(['coding', 'reasoning', 'general']).optional(),
        }),
      ),
    );
    registry.register(
      new TestStrategy(
        'historical-best',
        z.object({
          weights: z.object({
            successRate: z.number().min(0).max(1),
            latency: z.number().min(0),
          }),
          allowedProviders: z.array(z.string()).min(1),
        }),
      ),
    );
  });

  it('每个策略的 configSchema 都可以序列化为 JSON Schema', () => {
    for (const strategy of registry.list()) {
      expect(() => z.toJSONSchema(strategy.configSchema)).not.toThrow();

      const serialized = z.toJSONSchema(strategy.configSchema);

      expect(JSON.parse(JSON.stringify(serialized))).toBeTruthy();
    }
  });

  it('序列化结果包含有效的 JSON Schema 结构', () => {
    const serializedSchemas = registry.list().map((strategy) => ({
      name: strategy.name,
      schema: z.toJSONSchema(strategy.configSchema),
    }));

    expect(serializedSchemas).toEqual([
      expect.objectContaining({
        name: 'quality-first',
        schema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            minQualityRank: expect.objectContaining({ type: 'integer' }),
            taskCategory: expect.objectContaining({
              type: 'string',
              enum: ['coding', 'reasoning', 'general'],
            }),
          }),
        }),
      }),
      expect.objectContaining({
        name: 'historical-best',
        schema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            weights: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                successRate: expect.objectContaining({ type: 'number' }),
                latency: expect.objectContaining({ type: 'number' }),
              }),
            }),
            allowedProviders: expect.objectContaining({
              type: 'array',
              items: expect.objectContaining({ type: 'string' }),
            }),
          }),
        }),
      }),
    ]);
  });
});
