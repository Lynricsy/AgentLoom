import { Injectable } from '@nestjs/common';

import type {
  AnalysisContext,
  SuggestionAnalyzer,
  SuggestionCandidate,
} from './suggestion-analyzer.interface';

type ModelProfile = {
  modelId: string;
  modelName: string;
  provider: string;
  capacity: number;
  pricePerMillionTokens: number;
};

type DowngradeTarget = {
  modelId: string;
  modelName: string;
  provider: string;
  pricePerMillionTokens: number;
};

const DEFAULT_MODEL_CAPACITY = 128_000;
const MIN_CONFIDENCE = 0.6;

const KNOWN_MODEL_PROFILES: Record<string, ModelProfile> = {
  'gpt-4': {
    modelId: 'gpt-4',
    modelName: 'GPT-4',
    provider: 'openai',
    capacity: 128_000,
    pricePerMillionTokens: 30,
  },
  'gpt-4-turbo': {
    modelId: 'gpt-4-turbo',
    modelName: 'GPT-4 Turbo',
    provider: 'openai',
    capacity: 128_000,
    pricePerMillionTokens: 10,
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    provider: 'openai',
    capacity: 128_000,
    pricePerMillionTokens: 5,
  },
  'claude-3-opus': {
    modelId: 'claude-3-opus',
    modelName: 'Claude 3 Opus',
    provider: 'anthropic',
    capacity: 200_000,
    pricePerMillionTokens: 15,
  },
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    modelName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    capacity: 200_000,
    pricePerMillionTokens: 6,
  },
};

const DOWNGRADE_MAP: Record<string, DowngradeTarget> = {
  'gpt-4': {
    modelId: 'gpt-3.5-turbo',
    modelName: 'GPT-3.5 Turbo',
    provider: 'openai',
    pricePerMillionTokens: 1.5,
  },
  'gpt-4-turbo': {
    modelId: 'gpt-3.5-turbo',
    modelName: 'GPT-3.5 Turbo',
    provider: 'openai',
    pricePerMillionTokens: 1.5,
  },
  'gpt-4o': {
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o Mini',
    provider: 'openai',
    pricePerMillionTokens: 0.75,
  },
  'claude-3-opus': {
    modelId: 'claude-3-5-sonnet',
    modelName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    pricePerMillionTokens: 6,
  },
  'claude-3-5-sonnet': {
    modelId: 'claude-3-haiku',
    modelName: 'Claude 3 Haiku',
    provider: 'anthropic',
    pricePerMillionTokens: 1,
  },
};

@Injectable()
export class ModelDowngradeAnalyzer implements SuggestionAnalyzer {
  readonly type = 'model_downgrade';

  analyze(context: AnalysisContext): SuggestionCandidate | null {
    const totalTokens = context.stepTelemetries
      .map((record) => record.telemetryData.tokenUsage?.totalTokens)
      .filter(
        (value): value is number => typeof value === 'number' && value > 0,
      );

    if (totalTokens.length === 0 || this.hasLlmError(context)) {
      return null;
    }

    const currentModel = this.resolveCurrentModel(context.nodeConfig);
    const downgradeTarget = DOWNGRADE_MAP[currentModel.modelId.toLowerCase()];

    if (!downgradeTarget) {
      return null;
    }

    const p95Tokens = this.calculatePercentile(totalTokens, 0.95);
    const usageRatio = p95Tokens / currentModel.capacity;

    if (usageRatio >= 0.3) {
      return null;
    }

    const confidence = this.calculateConfidence(usageRatio);
    const costSavingPct = Math.round(
      ((currentModel.pricePerMillionTokens -
        downgradeTarget.pricePerMillionTokens) /
        currentModel.pricePerMillionTokens) *
        100,
    );

    return {
      suggestionType: 'model_downgrade',
      confidence,
      currentValue: {
        modelId: currentModel.modelId,
        modelName: currentModel.modelName,
        provider: currentModel.provider,
      },
      suggestedValue: {
        modelId: downgradeTarget.modelId,
        modelName: downgradeTarget.modelName,
        provider: downgradeTarget.provider,
      },
      rationale: `近 28 天内该节点 token 使用量 p95 为 ${p95Tokens}，仅占当前模型上下文容量的 ${(usageRatio * 100).toFixed(1)}%，可安全评估降级模型。`,
      impactEstimate: {
        costSavingPct,
      },
    };
  }

  private hasLlmError(context: AnalysisContext): boolean {
    return context.stepTelemetries.some((record) =>
      (record.telemetryData.errors ?? []).some(
        (error) =>
          error.type === 'llm_error' || /llm/i.test(error.message ?? ''),
      ),
    );
  }

  private resolveCurrentModel(
    nodeConfig: Record<string, unknown>,
  ): ModelProfile {
    const rawModel = this.asRecord(nodeConfig.model);
    const modelId = this.readString(
      rawModel?.modelId,
      rawModel?.id,
      nodeConfig.modelId,
      nodeConfig.modelName,
      nodeConfig.providerModelId,
    );
    const normalizedModelId = modelId.toLowerCase();
    const knownProfile = KNOWN_MODEL_PROFILES[normalizedModelId];
    const capacity = this.readNumber(
      rawModel?.capacity,
      rawModel?.contextWindow,
      rawModel?.maxContextTokens,
      nodeConfig.modelCapacity,
      nodeConfig.contextWindow,
      nodeConfig.maxContextTokens,
    );
    const modelName = this.readOptionalString(
      rawModel?.modelName,
      nodeConfig.modelName,
    );
    const provider = this.readOptionalString(
      rawModel?.provider,
      nodeConfig.provider,
    );

    return {
      modelId,
      modelName: modelName ?? knownProfile?.modelName ?? modelId,
      provider: provider ?? knownProfile?.provider ?? 'unknown',
      capacity: capacity ?? knownProfile?.capacity ?? DEFAULT_MODEL_CAPACITY,
      pricePerMillionTokens:
        this.readNumber(
          rawModel?.pricePerMillionTokens,
          nodeConfig.pricePerMillionTokens,
        ) ??
        knownProfile?.pricePerMillionTokens ??
        10,
    };
  }

  private calculateConfidence(usageRatio: number): number {
    if (usageRatio <= 0.1) {
      return 0.95;
    }

    if (usageRatio <= 0.2) {
      return 0.85;
    }

    return Math.max(MIN_CONFIDENCE, 0.7);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * percentile) - 1);

    return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(...values: unknown[]): string {
    const resolved = values.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return resolved ?? 'unknown-model';
  }

  private readOptionalString(...values: unknown[]): string | null {
    const resolved = values.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return resolved ?? null;
  }

  private readNumber(...values: unknown[]): number | null {
    const resolved = values.find(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0,
    );

    return resolved ?? null;
  }
}
