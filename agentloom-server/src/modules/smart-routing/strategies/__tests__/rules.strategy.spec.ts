import { describe, it, expect } from 'vitest';

import type { RoutingCandidate } from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import { RulesRouter } from '../rules.strategy';

const makeCandidates = (): RoutingCandidate[] => [
  {
    id: 'gpt-4o',
    modelConfigId: 'config-gpt4o',
    name: 'GPT-4o',
    provider: 'openai',
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.005, output: 0.015 },
      qualityRank: 90,
      avgLatencyMs: 500,
      maxInputTokens: 128_000,
      eloRating: 1300,
    },
    healthStatus: 'healthy',
  },
  {
    id: 'claude-sonnet',
    modelConfigId: 'config-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    routingMeta: {
      contextWindow: 200_000,
      costs: { input: 0.003, output: 0.015 },
      qualityRank: 95,
      avgLatencyMs: 600,
      maxInputTokens: 200_000,
      eloRating: 1350,
    },
    healthStatus: 'healthy',
  },
  {
    id: 'deepseek-chat',
    modelConfigId: 'config-deepseek',
    name: 'DeepSeek Chat',
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

const baseContext: RoutingContext = {
  inputTokenCount: 500,
  tenantId: 'tenant-1',
  taskCategory: 'coding',
};

describe('RulesRouter', () => {
  const router = new RulesRouter();

  it('应该具有正确的元数据', () => {
    expect(router.name).toBe('rules');
    expect(router.category).toBe('simple');
    expect(router.requiresEmbedding).toBe(false);
  });

  it('configSchema 应该验证规则数组', () => {
    const valid = router.configSchema.safeParse({
      rules: [
        {
          condition: {
            field: 'taskCategory',
            operator: 'equals',
            value: 'coding',
          },
          targetModelId: 'gpt-4o',
          priority: 1,
        },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = router.configSchema.safeParse({ rules: 'not-array' });
    expect(invalid.success).toBe(false);
  });

  it('应该按 taskCategory 匹配规则', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      taskCategory: 'coding',
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'taskCategory',
              operator: 'equals',
              value: 'coding',
            },
            targetModelId: 'claude-sonnet',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('claude-sonnet');
    expect(decision.reasoning).toContain('规则');
  });

  it('应该按 inputTokenCount 匹配规则（greater_than）', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      inputTokenCount: 50_000,
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'inputTokenCount',
              operator: 'greater_than',
              value: 10_000,
            },
            targetModelId: 'claude-sonnet',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('claude-sonnet');
  });

  it('应该按 inputTokenCount 匹配规则（less_than）', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      inputTokenCount: 100,
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'inputTokenCount',
              operator: 'less_than',
              value: 1000,
            },
            targetModelId: 'deepseek-chat',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('deepseek-chat');
  });

  it('应该按 priority 排序匹配第一条命中的规则', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      taskCategory: 'coding',
      inputTokenCount: 50_000,
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'inputTokenCount',
              operator: 'greater_than',
              value: 10_000,
            },
            targetModelId: 'claude-sonnet',
            priority: 2,
          },
          {
            condition: {
              field: 'taskCategory',
              operator: 'equals',
              value: 'coding',
            },
            targetModelId: 'gpt-4o',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('gpt-4o');
  });

  it('无匹配规则时应该回退到第一个候选', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      taskCategory: 'translation',
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'taskCategory',
              operator: 'equals',
              value: 'coding',
            },
            targetModelId: 'claude-sonnet',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('gpt-4o');
    expect(decision.reasoning).toContain('回退');
  });

  it('目标模型不在候选中时应该回退', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      taskCategory: 'coding',
      strategyConfig: {
        rules: [
          {
            condition: {
              field: 'taskCategory',
              operator: 'equals',
              value: 'coding',
            },
            targetModelId: 'non-existent-model',
            priority: 1,
          },
        ],
      },
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('gpt-4o');
    expect(decision.reasoning).toContain('回退');
  });

  it('无配置规则时应该回退到第一个候选', async () => {
    const candidates = makeCandidates();
    const context: RoutingContext = {
      ...baseContext,
      strategyConfig: {},
    };

    const decision = await router.routeSingle(candidates, context);
    expect(decision.selectedModelId).toBe('gpt-4o');
  });
});
