import { describe, expect, it } from 'vitest';

import type {
  AnalysisContext,
  ExecutionSummaryRecord,
  StepTelemetryRecord,
} from '../../analyzers/suggestion-analyzer.interface';
import { ToolPruningAnalyzer } from '../../analyzers/tool-pruning.analyzer';

function createTelemetry(
  executionId: string,
  toolsUsed: string[],
  day: number,
): StepTelemetryRecord {
  return {
    executionId,
    stepId: `${executionId}-step`,
    telemetryData: {
      toolCalls: toolsUsed.map((toolName) => ({ toolName, success: true })),
    },
    createdAt: new Date(
      `2026-03-${day.toString().padStart(2, '0')}T00:00:00.000Z`,
    ),
  };
}

function createSummary(
  executionId: string,
  day: number,
): ExecutionSummaryRecord {
  return {
    executionId,
    summaryData: { status: 'completed' },
    createdAt: new Date(
      `2026-03-${day.toString().padStart(2, '0')}T00:00:00.000Z`,
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
      tools: ['search', 'calculator', 'browser'],
    },
    stepTelemetries: [
      createTelemetry('1', ['search'], 1),
      createTelemetry('2', ['search'], 2),
      createTelemetry('3', ['search'], 3),
      createTelemetry('4', ['search'], 4),
      createTelemetry('5', ['search'], 5),
    ],
    executionSummaries: [
      createSummary('1', 1),
      createSummary('2', 2),
      createSummary('3', 3),
      createSummary('4', 4),
      createSummary('5', 5),
    ],
    analysisPeriod: {
      start: new Date('2026-02-01T00:00:00.000Z'),
      end: new Date('2026-03-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('ToolPruningAnalyzer', () => {
  const analyzer = new ToolPruningAnalyzer();

  it('应在工具连续多个最近执行中均未使用时建议裁剪', () => {
    const result = analyzer.analyze(createContext());

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      suggestionType: 'tool_pruning',
      currentValue: { tools: ['search', 'calculator', 'browser'] },
      suggestedValue: {
        tools: ['search'],
        removedTools: ['calculator', 'browser'],
      },
    });
    expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('应在仅配置一个工具时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: { tools: ['search'] },
      }),
    );

    expect(result).toBeNull();
  });

  it('应在连续未使用次数不足 5 次时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', ['search'], 1),
          createTelemetry('2', ['search'], 2),
          createTelemetry('3', ['search'], 3),
          createTelemetry('4', ['search'], 4),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应在连续未使用次数达到 10 次时提高置信度', () => {
    const stepTelemetries = Array.from({ length: 10 }, (_, index) =>
      createTelemetry(`${index + 1}`, ['search'], index + 1),
    );
    const executionSummaries = Array.from({ length: 10 }, (_, index) =>
      createSummary(`${index + 1}`, index + 1),
    );

    const result = analyzer.analyze(
      createContext({
        stepTelemetries,
        executionSummaries,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('应在最近执行中工具已被使用时返回 null', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', ['search', 'calculator', 'browser'], 1),
          createTelemetry('2', ['search'], 2),
          createTelemetry('3', ['search'], 3),
          createTelemetry('4', ['search'], 4),
          createTelemetry('5', ['search'], 5),
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it('应支持对象形式的工具配置并在 20 次连续未使用时给出最高置信度', () => {
    const stepTelemetries = Array.from({ length: 20 }, (_, index) =>
      createTelemetry(`${index + 1}`, ['search'], index + 1),
    );
    const executionSummaries = Array.from({ length: 20 }, (_, index) =>
      createSummary(`${index + 1}`, index + 1),
    );

    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          tools: [
            { toolName: 'search' },
            { name: 'calculator' },
            { name: 'browser' },
          ],
        },
        stepTelemetries,
        executionSummaries,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toEqual({
      tools: ['search', 'calculator', 'browser'],
    });
    expect(result?.confidence).toBe(0.95);
  });

  it('应在同一 execution 的较新 telemetry 使用工具时停止裁剪建议', () => {
    const result = analyzer.analyze(
      createContext({
        stepTelemetries: [
          createTelemetry('1', ['search'], 1),
          createTelemetry('1', ['search', 'browser'], 6),
          createTelemetry('2', ['search'], 2),
          createTelemetry('3', ['search'], 3),
          createTelemetry('4', ['search'], 4),
          createTelemetry('5', ['search'], 5),
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.suggestedValue).toEqual({
      tools: ['search', 'browser'],
      removedTools: ['calculator'],
    });
  });

  it('应在所有工具都连续未使用时返回 null 以避免删空工具列表', () => {
    const result = analyzer.analyze(
      createContext({
        nodeConfig: {
          tools: ['search', 'calculator'],
        },
        stepTelemetries: [
          createTelemetry('1', [], 1),
          createTelemetry('2', [], 2),
          createTelemetry('3', [], 3),
          createTelemetry('4', [], 4),
          createTelemetry('5', [], 5),
        ],
      }),
    );

    expect(result).toBeNull();
  });
});
