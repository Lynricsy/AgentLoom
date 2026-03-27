import { describe, expect, it } from 'vitest';

import type {
  AnalysisContext,
  ExecutionSummaryRecord,
  StepTelemetryRecord,
} from '../../analyzers/suggestion-analyzer.interface';
import { ModelDowngradeAnalyzer } from '../../analyzers/model-downgrade.analyzer';

function createTelemetry(
  executionId: string,
  totalTokens: number,
  overrides: Partial<StepTelemetryRecord['telemetryData']> = {},
): StepTelemetryRecord {
  return {
    executionId,
    stepId: `${executionId}-step`,
    telemetryData: {
      tokenUsage: { totalTokens },
      errors: [],
      ...overrides,
    },
    createdAt: new Date(
      `2026-03-${executionId.padStart(2, '0')}T00:00:00.000Z`,
    ),
  };
}

function createSummary(executionId: string): ExecutionSummaryRecord {
  return {
    executionId,
    summaryData: {
      status: 'completed',
      totalDurationMs: 10_000,
    },
    createdAt: new Date(
      `2026-03-${executionId.padStart(2, '0')}T00:00:00.000Z`,
    ),
  };
}

function createContext(
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowDefinitionId: '22222222-2222-4222-8222-222222222222',
    nodeId: 'agent-node-1',
    nodeConfig: {
      model: {
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        provider: 'openai',
      },
    },
    stepTelemetries: [
      createTelemetry('1', 8_000),
      createTelemetry('2', 9_000),
      createTelemetry('3', 10_000),
      createTelemetry('4', 11_000),
      createTelemetry('5', 12_000),
    ],
    executionSummaries: [
      createSummary('1'),
      createSummary('2'),
      createSummary('3'),
      createSummary('4'),
      createSummary('5'),
    ],
    analysisPeriod: {
      start: new Date('2026-02-01T00:00:00.000Z'),
      end: new Date('2026-03-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('ModelDowngradeAnalyzer', () => {
  const analyzer = new ModelDowngradeAnalyzer();

  it('应在 token p95 明显低于模型容量时建议降级模型', () => {
    const result = analyzer.analyze(createContext());

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      suggestionType: 'model_downgrade',
      currentValue: {
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        provider: 'openai',
      },
      suggestedValue: {
        modelId: 'gpt-3.5-turbo',
      },
    });
    expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result?.impactEstimate?.costSavingPct).toBeGreaterThan(0);
    expect(result?.rationale).toContain('p95');
  });

  it('应在 p95 已达到容量 30% 以上时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', 40_000),
          createTelemetry('2', 41_000),
          createTelemetry('3', 42_000),
          createTelemetry('4', 43_000),
          createTelemetry('5', 44_000),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在存在 llm_error 时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', 8_000),
          createTelemetry('2', 9_000, {
            errors: [{ type: 'llm_error', message: 'provider failure' }],
          }),
          createTelemetry('3', 10_000),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在无法确定更小模型映射时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          model: {
            modelId: 'custom-model',
            modelName: 'Custom Model',
            provider: 'custom',
          },
        },
      }),
    );

    expect(result).toBeNull();
  });

  it('应保证建议置信度不低于最小阈值', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', 28_000),
          createTelemetry('2', 29_000),
          createTelemetry('3', 30_000),
          createTelemetry('4', 31_000),
          createTelemetry('5', 32_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('应在中等低负载时给出中档置信度并支持 gpt-4o 降级映射', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          model: {
            modelId: 'gpt-4o',
            modelName: 'GPT-4o',
            provider: 'openai',
          },
        },
        stepTelemetries: [
          createTelemetry('1', 16_000),
          createTelemetry('2', 17_000),
          createTelemetry('3', 18_000),
          createTelemetry('4', 19_000),
          createTelemetry('5', 20_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.suggestedValue).toMatchObject({
      modelId: 'gpt-4o-mini',
      provider: 'openai',
    });
    expect(result?.confidence).toBe(0.85);
  });

  it('应支持 anthropic 模型的降级映射', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          model: {
            modelId: 'claude-3-opus',
            modelName: 'Claude 3 Opus',
            provider: 'anthropic',
          },
        },
        stepTelemetries: [
          createTelemetry('1', 10_000),
          createTelemetry('2', 11_000),
          createTelemetry('3', 12_000),
          createTelemetry('4', 13_000),
          createTelemetry('5', 14_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.suggestedValue).toMatchObject({
      modelId: 'claude-3-5-sonnet',
      provider: 'anthropic',
    });
    expect(result?.impactEstimate?.costSavingPct).toBeGreaterThan(0);
  });

  it('应支持从扁平 nodeConfig 字段解析模型信息并给出 0.7 置信度', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          modelId: 'gpt-4',
          provider: 'openai',
          contextWindow: 80_000,
          pricePerMillionTokens: 18,
        },
        stepTelemetries: [
          createTelemetry('1', 14_000),
          createTelemetry('2', 15_000),
          createTelemetry('3', 16_000),
          createTelemetry('4', 17_000),
          createTelemetry('5', 18_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toMatchObject({
      modelId: 'gpt-4',
      modelName: 'GPT-4',
      provider: 'openai',
    });
    expect(result?.confidence).toBe(0.7);
  });

  it('应在错误消息包含 llm 关键字时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', 8_000),
          createTelemetry('2', 9_000, {
            errors: [{ message: 'LLM overloaded by provider' }],
          }),
          createTelemetry('3', 10_000),
        ],
      }),
    );

    expect(result).toBeNull();
  });
});
