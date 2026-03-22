import { z } from 'zod';

import {
  BaseRouterStrategy,
  type RouterCategory,
} from './base-router-strategy';

export interface RouterInfo {
  name: string;
  category: RouterCategory;
  requiresEmbedding: boolean;
  configSchema: z.ZodSchema;
}

export class RouterRegistry {
  private readonly strategies = new Map<string, BaseRouterStrategy>();

  register(strategy: BaseRouterStrategy): void {
    if (this.strategies.has(strategy.name)) {
      throw new Error(`Strategy "${strategy.name}" is already registered`);
    }

    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): BaseRouterStrategy {
    const strategy = this.strategies.get(name);

    if (!strategy) {
      throw new Error(
        `Strategy "${name}" not found. Available: ${[...this.strategies.keys()].join(', ')}`,
      );
    }

    return strategy;
  }

  list(): RouterInfo[] {
    return [...this.strategies.values()].map((strategy) => ({
      name: strategy.name,
      category: strategy.category,
      requiresEmbedding: strategy.requiresEmbedding,
      configSchema: strategy.configSchema,
    }));
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }
}
