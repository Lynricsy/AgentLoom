import { describe, expect, it } from 'vitest';

import type {
  RoutingDecisionEvidenceRow,
  RoutingNodeEvidence,
} from '../../analyzers/optimization-analyzer.types';
import { routingFallbackModelAnalyzer } from '../../analyzers/routing-fallback-model.analyzer';

function decisions(
  spec: Array<[selected: string | null, fallback: string | null, count: number]>,
): RoutingDecisionEvidenceRow[] {
  let seq = 0;
  return spec.flatMap(([selectedModelId, fallbackReason, count]) =>
    Array.from({ length: count }, () => ({
      id: `d${++seq}`,
      selectedModelId,
      fallbackReason,
    })),
  );
}

function makeEvidence(
  overrides: Partial<RoutingNodeEvidence>,
): RoutingNodeEvidence {
  return {
    workflowDefinitionId: 'wf-1',
    nodeId: 'route-1',
    baseVersionId: 'v-1',
    nodeData: {},
    strategy: 'llm_as_router',
    strategyConfig: { routerModelId: 'router' },
    strategyConfigPath: 'strategyConfig',
    decisions: [],
    modelNames: new Map([['model-b', 'GPT 小模型']]),
    window: {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-29T00:00:00Z'),
    },
    ...overrides,
  };
}

describe('routingFallbackModelAnalyzer', () => {
  it('回退率达阈值时建议非回退决策中最常选中的模型', () => {
    const candidate = routingFallbackModelAnalyzer(
      makeEvidence({
        decisions: decisions([
          ['model-b', null, 5],
          ['model-a', null, 2],
          ['model-a', 'llm_timeout', 3],
        ]),
      }),
    );
    expect(candidate).toMatchObject({
      proposalType: 'routing_fallback_model',
      configPath: 'strategyConfig.fallbackModelId',
      currentValue: null,
      proposedValue: 'model-b',
      evidence: { sampleCount: 10, matchedCount: 3, modelName: 'GPT 小模型' },
    });
    expect(candidate?.rationale).toBe(
      '最近 28 天 10 次路由决策中 3 次回退（30%），建议把回退模型设为历史最常选中的「GPT 小模型」',
    );
  });

  it('众数并列时取 id 字典序最小者', () => {
    const candidate = routingFallbackModelAnalyzer(
      makeEvidence({
        decisions: decisions([
          ['model-z', null, 4],
          ['model-c', null, 4],
          [null, 'router_error', 2],
        ]),
      }),
    );
    expect(candidate?.proposedValue).toBe('model-c');
    expect(candidate?.evidence.modelName).toBe('model-c');
  });

  it('已配置回退模型、非 llm_as_router、样本不足或回退率不足时不提案', () => {
    const enough = decisions([
      ['model-b', null, 7],
      ['model-b', 'llm_timeout', 3],
    ]);
    expect(
      routingFallbackModelAnalyzer(
        makeEvidence({
          decisions: enough,
          strategyConfig: { routerModelId: 'router', fallbackModelId: 'model-x' },
        }),
      ),
    ).toBeNull();
    expect(
      routingFallbackModelAnalyzer(
        makeEvidence({ decisions: enough, strategy: 'cost_optimized' }),
      ),
    ).toBeNull();
    expect(
      routingFallbackModelAnalyzer(
        makeEvidence({ decisions: decisions([['model-b', 'llm_timeout', 9]]) }),
      ),
    ).toBeNull();
    expect(
      routingFallbackModelAnalyzer(
        makeEvidence({
          decisions: decisions([
            ['model-b', null, 9],
            ['model-b', 'llm_timeout', 1],
          ]),
        }),
      ),
    ).toBeNull();
  });

  it('全部为回退决策时没有可建议的模型', () => {
    expect(
      routingFallbackModelAnalyzer(
        makeEvidence({ decisions: decisions([['model-b', 'llm_timeout', 10]]) }),
      ),
    ).toBeNull();
  });

  it('strategyConfig 位于 data.config 下时补丁路径随之改变', () => {
    const candidate = routingFallbackModelAnalyzer(
      makeEvidence({
        strategyConfigPath: 'config.strategyConfig',
        decisions: decisions([
          ['model-b', null, 7],
          ['model-b', 'llm_timeout', 3],
        ]),
      }),
    );
    expect(candidate?.configPath).toBe('config.strategyConfig.fallbackModelId');
  });
});
