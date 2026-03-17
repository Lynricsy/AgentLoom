import { describe, expect, it } from 'vitest';

import type {
  AnalysisContext,
  ExecutionSummaryRecord,
  StepTelemetryRecord,
} from '../../analyzers/suggestion-analyzer.interface';
import { TimeoutAdjustmentAnalyzer } from '../../analyzers/timeout-adjustment.analyzer';

function createTelemetry(
  executionId: string,
  latencyMs: number,
  overrides: Partial<StepTelemetryRecord['telemetryData']> = {},
): StepTelemetryRecord {
  return {
    executionId,
    stepId: `${executionId}-step`,
    telemetryData: {
      latencyMs,
      errors: [],
      ...overrides,
    },
    createdAt: new Date(`2026-03-${executionId.padStart(2, '0')}T00:00:00.000Z`),
  };
}

function createSummary(executionId: string): ExecutionSummaryRecord {
  return {
    executionId,
    summaryData: { status: 'completed' },
    createdAt: new Date(`2026-03-${executionId.padStart(2, '0')}T00:00:00.000Z`),
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
      timeoutMs: 30_000,
    },
    stepTelemetries: [
      createTelemetry('1', 4_000),
      createTelemetry('2', 5_000),
      createTelemetry('3', 6_000),
      createTelemetry('4', 7_000),
      createTelemetry('5', 8_000),
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

describe('TimeoutAdjustmentAnalyzer', () => {
  const analyzer = new TimeoutAdjustmentAnalyzer();

  it('应在 p95 延迟低于当前超时一半时建议降低超时', () => {
    const result = analyzer.analyze(createContext());

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      suggestionType: 'timeout_adjustment',
      currentValue: { timeoutMs: 30_000 },
    });
    expect((result?.suggestedValue as { timeoutMs: number }).timeoutMs).toBeLessThan(
      30_000,
    );
    expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('应在存在 timeout 错误时优先建议提高超时', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { timeoutMs: 10_000 },
        stepTelemetries: [
          createTelemetry('1', 8_000),
          createTelemetry('2', 9_000),
          createTelemetry('3', 11_000, {
            errors: [{ type: 'timeout', message: 'execution timed out' }],
          }),
          createTelemetry('4', 12_000),
          createTelemetry('5', 13_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect((result?.suggestedValue as { timeoutMs: number }).timeoutMs).toBeGreaterThan(
      10_000,
    );
    expect(result?.rationale).toContain('timeout');
  });

  it('应在延迟接近当前超时且无超时错误时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', 18_000),
          createTelemetry('2', 19_000),
          createTelemetry('3', 20_000),
          createTelemetry('4', 21_000),
          createTelemetry('5', 22_000),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在未配置 timeoutMs 时使用默认值', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {},
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toEqual({ timeoutMs: 30_000 });
  });

  it('应在没有 latency 且没有 timeout 错误时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [],
        executionSummaries: [],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在降低 timeout 后无有效改动空间时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { timeoutMs: 900 },
        stepTelemetries: [
          createTelemetry('1', 100),
          createTelemetry('2', 120),
          createTelemetry('3', 140),
          createTelemetry('4', 160),
          createTelemetry('5', 180),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在 gapRatio 处于中档时给出 0.85 置信度', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { timeoutMs: 20_000 },
        stepTelemetries: [
          createTelemetry('1', 4_000),
          createTelemetry('2', 5_000),
          createTelemetry('3', 6_000),
          createTelemetry('4', 6_000),
          createTelemetry('5', 6_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.confidence).toBe(0.85);
  });

  it('应在 gapRatio 较小时回退到 0.7 置信度', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { timeoutMs: 20_000 },
        stepTelemetries: [
          createTelemetry('1', 8_000),
          createTelemetry('2', 8_500),
          createTelemetry('3', 9_000),
          createTelemetry('4', 9_000),
          createTelemetry('5', 9_000),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.confidence).toBe(0.7);
  });

  it('应在仅存在 timeout 相关错误时使用默认 timeout 并提高建议值', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { timeoutMs: -1 },
        stepTelemetries: [
          createTelemetry('1', 0, {
            errors: [{ type: 'gateway_timeout', message: 'request timeout at upstream' }],
          }),
          createTelemetry('2', 0, {
            errors: [{ type: 'timeout', message: 'execution timed out' }],
          }),
          createTelemetry('3', 0, {
            errors: [{ message: 'timeout while waiting response' }],
          }),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toEqual({ timeoutMs: 30_000 });
    expect(result?.suggestedValue).toEqual({ timeoutMs: 45_000 });
    expect(result?.confidence).toBe(0.85);
  });
});
