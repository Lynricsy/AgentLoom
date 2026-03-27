import { Injectable } from '@nestjs/common';

import {
  isAutonomyModeAllowed,
  normalizeAutonomyMode,
} from '../../agent/autonomy-mode-compat';
import type {
  AnalysisContext,
  SuggestionAnalyzer,
  SuggestionCandidate,
} from './suggestion-analyzer.interface';

const UPGRADE_PATH = ['MANUAL_CONFIRM', 'RULE_BASED', 'LLM_SUGGEST'] as const;

@Injectable()
export class AutonomyUpgradeAnalyzer implements SuggestionAnalyzer {
  readonly type = 'autonomy_upgrade';

  analyze(context: AnalysisContext): SuggestionCandidate | null {
    const currentMode = this.resolveCurrentMode(context.nodeConfig);
    const currentIndex = UPGRADE_PATH.indexOf(currentMode);

    if (currentIndex === -1 || currentIndex === UPGRADE_PATH.length - 1) {
      return null;
    }

    const executionIds = new Set([
      ...context.executionSummaries.map((summary) => summary.executionId),
      ...context.stepTelemetries.map((record) => record.executionId),
    ]);
    const executionCount = executionIds.size;

    if (executionCount < 30) {
      return null;
    }

    const executionsWithErrors = new Set<string>();
    const executionsWithSelfRepair = new Set<string>();

    for (const telemetry of context.stepTelemetries) {
      if ((telemetry.telemetryData.errors ?? []).length > 0) {
        executionsWithErrors.add(telemetry.executionId);
      }

      if ((telemetry.telemetryData.selfRepairs ?? []).length > 0) {
        executionsWithSelfRepair.add(telemetry.executionId);
      }
    }

    const errorRate = executionsWithErrors.size / executionCount;
    const selfRepairRate = executionsWithSelfRepair.size / executionCount;

    if (selfRepairRate > 0 || errorRate >= 0.05) {
      return null;
    }

    const nextMode = UPGRADE_PATH[currentIndex + 1];

    if (!isAutonomyModeAllowed(nextMode, context.autonomyCap)) {
      return null;
    }

    return {
      suggestionType: 'autonomy_upgrade',
      confidence: executionCount >= 50 ? 0.9 : 0.7,
      currentValue: { autonomyMode: currentMode },
      suggestedValue: { autonomyMode: nextMode },
      rationale: `该节点近 28 天共执行 ${executionCount} 次，self-repair 率为 0%，错误率为 ${(errorRate * 100).toFixed(1)}%，满足升级自主性模式的稳定性条件。`,
      impactEstimate: {
        latencyImpactPct: -10,
      },
    };
  }

  private resolveCurrentMode(
    nodeConfig: Record<string, unknown>,
  ): (typeof UPGRADE_PATH)[number] {
    const candidates = [
      nodeConfig.autonomyMode,
      this.readNestedMode(nodeConfig.autonomyConfig),
      this.readNestedMode(nodeConfig.settings),
      this.readNestedMode(nodeConfig.config),
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') {
        continue;
      }

      const normalized = normalizeAutonomyMode(candidate).canonicalMode;

      if (UPGRADE_PATH.includes(normalized)) {
        return normalized;
      }
    }

    return 'MANUAL_CONFIRM';
  }

  private readNestedMode(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    return (
      (value as Record<string, unknown>).mode ??
      (value as Record<string, unknown>).autonomyMode
    );
  }
}
