import { describe, expect, it } from 'vitest';

import type {
  AnalysisContext,
  ExecutionSummaryRecord,
  StepTelemetryRecord,
} from '../../analyzers/suggestion-analyzer.interface';
import { AutonomyUpgradeAnalyzer } from '../../analyzers/autonomy-upgrade.analyzer';

function createTelemetry(
  executionId: string,
  options: {
    hasError?: boolean;
    hasSelfRepair?: boolean;
    day: number;
  },
): StepTelemetryRecord {
  return {
    executionId,
    stepId: `${executionId}-step`,
    telemetryData: {
      errors: options.hasError
        ? [{ type: 'tool_error', message: 'tool failed' }]
        : [],
      selfRepairs: options.hasSelfRepair ? [{ success: true }] : [],
    },
    createdAt: new Date(`2026-03-${options.day.toString().padStart(2, '0')}T00:00:00.000Z`),
  };
}

function createSummary(executionId: string, day: number): ExecutionSummaryRecord {
  return {
    executionId,
    summaryData: { status: 'completed' },
    createdAt: new Date(`2026-03-${day.toString().padStart(2, '0')}T00:00:00.000Z`),
  };
}

function createContext(
  executionCount: number,
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  const stepTelemetries = Array.from({ length: executionCount }, (_, index) =>
    createTelemetry(`${index + 1}`, {
      day: (index % 28) + 1,
    }),
  );
  const executionSummaries = Array.from({ length: executionCount }, (_, index) =>
    createSummary(`${index + 1}`, (index % 28) + 1),
  );

  return {
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowDefinitionId: '22222222-2222-4222-8222-222222222222',
    nodeId: 'agent-node-1',
    autonomyCap: 'LLM_SUGGEST',
    nodeConfig: {
      autonomyMode: 'MANUAL_CONFIRM',
    },
    stepTelemetries,
    executionSummaries,
    analysisPeriod: {
      start: new Date('2026-02-01T00:00:00.000Z'),
      end: new Date('2026-03-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('AutonomyUpgradeAnalyzer', () => {
  const analyzer = new AutonomyUpgradeAnalyzer();

  it('应在稳定执行足够多时建议升级自主性模式', () => {
    const result = analyzer.analyze(createContext(30));

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      suggestionType: 'autonomy_upgrade',
      currentValue: { autonomyMode: 'MANUAL_CONFIRM' },
      suggestedValue: { autonomyMode: 'RULE_BASED' },
    });
    expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('应根据当前模式给出下一档升级建议', () => {
    const result = analyzer.analyze(
      createContext(60, {
        nodeConfig: { autonomyMode: 'RULE_BASED' },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.suggestedValue).toEqual({ autonomyMode: 'LLM_SUGGEST' });
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('应在已经处于最高模式时返回 null', () => {
    const result = analyzer.analyze(
      createContext(60, {
        nodeConfig: { autonomyMode: 'LLM_SUGGEST' },
      }),
    );

    expect(result).toBeNull();
  });

  it('应在存在 self repair 时返回 null', () => {
    const stepTelemetries = Array.from({ length: 30 }, (_, index) =>
      createTelemetry(`${index + 1}`, {
        day: (index % 28) + 1,
        hasSelfRepair: index === 10,
      }),
    );

    const result = analyzer.analyze(
      createContext(30, {
        stepTelemetries,
      }),
    );

    expect(result).toBeNull();
  });

  it('应在错误率达到 5% 时返回 null', () => {
    const stepTelemetries = Array.from({ length: 40 }, (_, index) =>
      createTelemetry(`${index + 1}`, {
        day: (index % 28) + 1,
        hasError: index < 2,
      }),
    );

    const result = analyzer.analyze(
      createContext(40, {
        stepTelemetries,
      }),
    );

    expect(result).toBeNull();
  });

  it('应在执行数量不足 30 次时返回 null', () => {
    const result = analyzer.analyze(createContext(29));

    expect(result).toBeNull();
  });

  it('应从 autonomyConfig.mode 回退解析当前模式', () => {
    const result = analyzer.analyze(
      createContext(35, {
        nodeConfig: {
          autonomyConfig: {
            mode: 'RULE_BASED',
          },
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toEqual({ autonomyMode: 'RULE_BASED' });
    expect(result?.suggestedValue).toEqual({ autonomyMode: 'LLM_SUGGEST' });
  });

  it('应在模式非法时回退到默认 MANUAL_CONFIRM', () => {
    const result = analyzer.analyze(
      createContext(35, {
        nodeConfig: {
          autonomyMode: 'INVALID_MODE',
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.currentValue).toEqual({ autonomyMode: 'MANUAL_CONFIRM' });
    expect(result?.suggestedValue).toEqual({ autonomyMode: 'RULE_BASED' });
  });

  it('应在下一档升级超出组织上限时返回 null', () => {
    const result = analyzer.analyze(
      createContext(35, {
        autonomyCap: 'MANUAL_CONFIRM',
      }),
    );

    expect(result).toBeNull();
  });

  it('应将 legacy FULL_AUTO 归一化为最高档并停止继续升级', () => {
    const result = analyzer.analyze(
      createContext(40, {
        autonomyCap: 'RULE_BASED',
        nodeConfig: {
          autonomyMode: 'FULL_AUTO',
        },
      }),
    );

    expect(result).toBeNull();
  });
});
