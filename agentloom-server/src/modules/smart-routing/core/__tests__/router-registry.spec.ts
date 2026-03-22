import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BaseRouterStrategy } from '../base-router-strategy';
import type { RoutingCandidate } from '../routing-candidate';
import type { RoutingContext } from '../routing-context';
import type { RoutingDecision } from '../routing-decision';
import { RouterRegistry } from '../router-registry';

class TestStrategy extends BaseRouterStrategy {
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema: z.ZodSchema;

  constructor(
    readonly name: string,
    configSchema: z.ZodSchema = z.object({
      enabled: z.boolean().default(true),
    }),
  ) {
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

describe('RouterRegistry', () => {
  let registry: RouterRegistry;

  beforeEach(() => {
    registry = new RouterRegistry();
  });

  describe('register', () => {
    it('可以成功注册策略', () => {
      const strategy = new TestStrategy('quality-first');

      expect(() => registry.register(strategy)).not.toThrow();
      expect(registry.get('quality-first')).toBe(strategy);
    });

    it('重复名称注册时抛出错误', () => {
      registry.register(new TestStrategy('quality-first'));

      expect(() => registry.register(new TestStrategy('quality-first'))).toThrow(
        'Strategy "quality-first" is already registered',
      );
    });
  });

  describe('get', () => {
    it('返回对应名称的策略实例', () => {
      const strategy = new TestStrategy('latency-first');
      registry.register(strategy);

      expect(registry.get('latency-first')).toBe(strategy);
    });

    it('未知策略时抛出包含可用策略列表的错误', () => {
      registry.register(new TestStrategy('quality-first'));
      registry.register(new TestStrategy('cost-optimized'));

      expect(() => registry.get('missing-strategy')).toThrow(
        'Strategy "missing-strategy" not found. Available: quality-first, cost-optimized',
      );
    });
  });

  describe('list', () => {
    it('返回全部已注册策略的元信息', () => {
      const firstSchema = z.object({
        threshold: z.number().int().positive(),
      });
      const secondSchema = z.object({
        weights: z.array(z.number()).min(1),
      });

      registry.register(new TestStrategy('token-optimized', firstSchema));
      registry.register(new TestStrategy('historical-best', secondSchema));

      expect(registry.list()).toEqual([
        {
          name: 'token-optimized',
          category: 'simple',
          requiresEmbedding: false,
          configSchema: firstSchema,
        },
        {
          name: 'historical-best',
          category: 'simple',
          requiresEmbedding: false,
          configSchema: secondSchema,
        },
      ]);
    });
  });

  describe('has', () => {
    it('已注册策略返回 true，未注册返回 false', () => {
      registry.register(new TestStrategy('fallback-chain'));

      expect(registry.has('fallback-chain')).toBe(true);
      expect(registry.has('missing-strategy')).toBe(false);
    });
  });
});
