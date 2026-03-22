import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision } from '../core/routing-decision';

const routingRuleSchema = z.object({
  condition: z.object({
    field: z.enum(['taskCategory', 'inputTokenCount']),
    operator: z.enum(['equals', 'greater_than', 'less_than', 'contains']),
    value: z.union([z.string(), z.number()]),
  }),
  targetModelId: z.string(),
  priority: z.number().int().min(0),
});

export type RoutingRule = z.infer<typeof routingRuleSchema>;

export class RulesRouter extends BaseRouterStrategy {
  readonly name = 'rules';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({ rules: z.array(routingRuleSchema) });

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const rules = this.extractRules(context);
    const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (!this.evaluateCondition(rule, context)) continue;

      const target = candidates.find((c) => c.id === rule.targetModelId);
      if (!target) continue;

      return this.buildDecision(candidates, target.id, `规则匹配：${rule.condition.field} ${rule.condition.operator} ${String(rule.condition.value)} → ${target.name}`);
    }

    const fallback = candidates[0];
    return this.buildDecision(candidates, fallback.id, `规则回退：无匹配规则，使用第一个候选 ${fallback.name}`);
  }

  private extractRules(context: RoutingContext): RoutingRule[] {
    const config = context.strategyConfig;
    if (!config || !Array.isArray(config.rules)) return [];
    return config.rules as RoutingRule[];
  }

  private evaluateCondition(rule: RoutingRule, context: RoutingContext): boolean {
    const { field, operator, value } = rule.condition;

    let actual: string | number | undefined;
    if (field === 'taskCategory') {
      actual = context.taskCategory;
    } else if (field === 'inputTokenCount') {
      actual = context.inputTokenCount;
    }

    if (actual === undefined) return false;

    switch (operator) {
      case 'equals':
        return actual === value;
      case 'greater_than':
        return typeof actual === 'number' && typeof value === 'number' && actual > value;
      case 'less_than':
        return typeof actual === 'number' && typeof value === 'number' && actual < value;
      case 'contains':
        return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
      default:
        return false;
    }
  }

  private buildDecision(
    candidates: RoutingCandidate[],
    selectedId: string,
    reasoning: string,
  ): RoutingDecision {
    return {
      selectedModelId: selectedId,
      scores: candidates.map((c) => ({
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: c.id === selectedId ? 100 : 0,
        reasoning: c.id === selectedId ? '规则命中' : '未命中',
      })),
      reasoning,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
