import { Injectable } from '@nestjs/common';

import type {
  AnalysisContext,
  SuggestionAnalyzer,
  SuggestionCandidate,
} from './suggestion-analyzer.interface';

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_CONFIDENCE = 0.6;

@Injectable()
export class TimeoutAdjustmentAnalyzer implements SuggestionAnalyzer {
  readonly type = 'timeout_adjustment';

  analyze(context: AnalysisContext): SuggestionCandidate | null {
    const currentTimeoutMs = this.resolveTimeout(context.nodeConfig);
    const latencies = context.stepTelemetries
      .map((record) => record.telemetryData.latencyMs)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    const timeoutErrorCount = context.stepTelemetries.reduce((count, record) => {
      const currentErrors = record.telemetryData.errors ?? [];

      return (
        count +
        currentErrors.filter(
          (error) =>
            error.type === 'timeout' ||
            /timeout/i.test(error.type ?? '') ||
            /timed out|timeout/i.test(error.message ?? ''),
        ).length
      );
    }, 0);

    if (latencies.length === 0 && timeoutErrorCount === 0) {
      return null;
    }

    const p95Latency = latencies.length > 0 ? this.calculatePercentile(latencies, 0.95) : currentTimeoutMs;

    if (timeoutErrorCount > 0) {
      const suggestedTimeoutMs = Math.max(
        this.roundTimeout(p95Latency * 1.5),
        currentTimeoutMs + 1_000,
      );

      return {
        suggestionType: 'timeout_adjustment',
        confidence: Math.max(MIN_CONFIDENCE, Math.min(0.95, 0.7 + timeoutErrorCount * 0.05)),
        currentValue: { timeoutMs: currentTimeoutMs },
        suggestedValue: { timeoutMs: suggestedTimeoutMs },
        rationale: `检测到 ${timeoutErrorCount} 次 timeout 相关错误，当前延迟 p95 为 ${p95Latency}ms，建议提高超时阈值。`,
      };
    }

    if (p95Latency >= currentTimeoutMs * 0.5) {
      return null;
    }

    const suggestedTimeoutMs = Math.min(
      currentTimeoutMs - 1_000,
      this.roundTimeout(Math.max(p95Latency * 1.5, 1_000)),
    );

    if (suggestedTimeoutMs <= 0 || suggestedTimeoutMs >= currentTimeoutMs) {
      return null;
    }

    const gapRatio = 1 - p95Latency / currentTimeoutMs;

    return {
      suggestionType: 'timeout_adjustment',
      confidence: this.calculateLowerConfidence(gapRatio),
      currentValue: { timeoutMs: currentTimeoutMs },
      suggestedValue: { timeoutMs: suggestedTimeoutMs },
      rationale: `近 28 天内延迟 p95 为 ${p95Latency}ms，仅占当前超时阈值的 ${((p95Latency / currentTimeoutMs) * 100).toFixed(1)}%，可降低 timeout 以更快暴露异常。`,
    };
  }

  private resolveTimeout(nodeConfig: Record<string, unknown>): number {
    const timeoutMs = nodeConfig.timeoutMs;

    return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
  }

  private calculateLowerConfidence(gapRatio: number): number {
    if (gapRatio >= 0.75) {
      return 0.95;
    }

    if (gapRatio >= 0.65) {
      return 0.85;
    }

    return Math.max(MIN_CONFIDENCE, 0.7);
  }

  private roundTimeout(value: number): number {
    return Math.round(value / 1_000) * 1_000;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * percentile) - 1);

    return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  }
}
