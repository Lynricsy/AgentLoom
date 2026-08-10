import type { SmartRoutingRuntimeContext } from './execution.constants';
import type { RoutingDecision as RouterDecision } from '../smart-routing/core/routing-decision';
import { isRecord, readFirstString, resolveJsonPath } from './node-value.util';

export function resolveSmartRoutingStrategyValue(
  nodeData: Record<string, unknown>,
): string {
  if (
    typeof nodeData.strategyName === 'string' &&
    nodeData.strategyName.length > 0
  ) {
    return nodeData.strategyName;
  }

  if (typeof nodeData.strategy === 'string' && nodeData.strategy.length > 0) {
    return nodeData.strategy;
  }

  return 'FALLBACK_CHAIN';
}

export function resolveSmartRoutingStrategyConfig(
  nodeData: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (isRecord(nodeData.strategyConfig)) {
    return nodeData.strategyConfig;
  }

  if (isRecord(nodeData.strategy_config)) {
    return nodeData.strategy_config;
  }

  return undefined;
}

export function normalizeSmartRoutingStrategyName(strategy: string): string {
  const normalized = strategy.trim();
  const strategyAliases: Record<string, string> = {
    TOKEN_OPTIMIZED: 'token_optimized',
    COST_OPTIMIZED: 'cost_optimized',
    QUALITY_FIRST: 'quality_first',
    LATENCY_FIRST: 'latency_first',
    HISTORICAL_BEST: 'historical_best',
    FALLBACK_CHAIN: 'fallback_chain',
    'memory-bank': 'memory_bank',
    'wasm-plugin': 'wasm_plugin',
  };

  return strategyAliases[normalized] ?? normalized.toLowerCase();
}

export function isFallbackChainStrategy(strategy?: string): boolean {
  return Boolean(
    strategy &&
    normalizeSmartRoutingStrategyName(strategy) === 'fallback_chain',
  );
}

export function extractSmartRoutingQueryText(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
): string | undefined {
  return (
    findFirstStringByKeys(nodeData, [
      'queryText',
      'query',
      'promptText',
      'prompt',
      'content',
      'text',
    ]) ??
    findFirstStringByKeys(input, [
      'queryText',
      'query',
      'promptText',
      'prompt',
      'content',
      'text',
      'task',
    ])
  );
}

export function extractSmartRoutingTaskCategory(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
): string | undefined {
  return (
    findFirstStringByKeys(nodeData, ['taskCategory', 'category', 'intent']) ??
    findFirstStringByKeys(input, ['taskCategory', 'category', 'intent'])
  );
}

export function findFirstStringByKeys(
  value: unknown,
  keys: string[],
  seen: Set<object> = new Set<object>(),
): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return undefined;
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);
  }

  if (isRecord(value)) {
    for (const key of keys) {
      const directValue = value[key];
      if (typeof directValue === 'string' && directValue.length > 0) {
        return directValue;
      }
    }

    for (const nestedValue of Object.values(value)) {
      const nestedMatch = findFirstStringByKeys(nestedValue, keys, seen);
      if (nestedMatch) {
        return nestedMatch;
      }
    }

    return undefined;
  }

  for (const item of value) {
    const nestedMatch = findFirstStringByKeys(item, keys, seen);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return undefined;
}

export function extractSmartRoutingContext(
  input: Record<string, unknown>,
): SmartRoutingRuntimeContext | undefined {
  return findSmartRoutingContext(input, new Set<object>());
}

export function findSmartRoutingContext(
  value: unknown,
  seen: Set<object>,
): SmartRoutingRuntimeContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (isSmartRoutingRuntimeContext(value)) {
    return value;
  }

  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findSmartRoutingContext(child, seen);
    if (found) {
      return found;
    }
  }

  return undefined;
}

export function isSmartRoutingRuntimeContext(
  value: unknown,
): value is SmartRoutingRuntimeContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.routingStepId === 'string' &&
    typeof value.routingNodeId === 'string' &&
    typeof value.strategy === 'string' &&
    typeof value.selectedModelId === 'string' &&
    typeof value.currentModelIndex === 'number' &&
    Array.isArray(value.candidateModelIds) &&
    value.candidateModelIds.every((id) => typeof id === 'string')
  );
}

export function extractModelConfigIds(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractModelConfigIds(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.candidateModelIds)) {
    return value.candidateModelIds.filter(
      (modelId): modelId is string =>
        typeof modelId === 'string' && modelId.length > 0,
    );
  }

  const directId =
    typeof value.selectedModelId === 'string'
      ? value.selectedModelId
      : typeof value.llmModelConfigId === 'string'
        ? value.llmModelConfigId
        : typeof value.modelConfigId === 'string'
          ? value.modelConfigId
          : undefined;

  if (directId) {
    return [directId];
  }

  return Object.values(value).flatMap((item) => extractModelConfigIds(item));
}

export function extractStructuredModelConfigIds(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.candidateModelIds)) {
    return value.candidateModelIds.filter(
      (modelId): modelId is string =>
        typeof modelId === 'string' && modelId.length > 0,
    );
  }

  const directId = readFirstString(
    value.selectedModelId,
    value.llmModelConfigId,
    value.modelConfigId,
  );

  if (directId) {
    return [directId];
  }

  return Object.values(value).flatMap((item) =>
    extractStructuredModelConfigIds(item),
  );
}

export function estimateTokenCount(value: unknown): number {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value ?? {});

  return Math.max(0, Math.ceil(serialized.length / 4));
}

export function collectModelConfigIds(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const appendIds = (value: unknown): void => {
    for (const modelId of extractModelConfigIds(value)) {
      if (!seen.has(modelId)) {
        seen.add(modelId);
        ids.push(modelId);
      }
    }
  };

  const fallbackPriority = Array.isArray(nodeData.fallbackPriority)
    ? nodeData.fallbackPriority.filter(
        (path): path is string => typeof path === 'string' && path.length > 0,
      )
    : [];

  for (const path of fallbackPriority) {
    appendIds(resolveJsonPath(input, path));
  }

  for (const value of Object.values(input)) {
    appendIds(value);
  }

  if (Array.isArray(nodeData.modelConfigIds)) {
    for (const id of nodeData.modelConfigIds) {
      appendIds(id);
    }
  }

  return ids;
}

export function extractMcpServerConfigIds(
  input: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (
      value.type === 'mcp-tool' &&
      typeof value.mcpServerConfigId === 'string'
    ) {
      ids.add(value.mcpServerConfigId);
    }

    for (const nestedValue of Object.values(value)) {
      visit(nestedValue);
    }
  };

  visit(input);

  return [...ids];
}

export function mapRoutingDecisionScores(decision: RouterDecision): Array<{
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  reasoning: string;
}> {
  return decision.scores.map((score) => ({
    modelId: score.modelId,
    modelName: score.modelName,
    provider: score.provider,
    score: score.score,
    reasoning: score.reasoning,
  }));
}
