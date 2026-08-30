import {
  AgentRuntimeConfigSchema,
  type AgentRuntimeConfig,
} from '@agentloom/contracts';

interface CanvasNodeLike {
  type?: unknown;
  data?: unknown;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeKnowledgeBinding(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized = { ...value };
  if (
    !hasOwn(normalized, 'similarityThreshold') &&
    hasOwn(normalized, 'scoreThreshold')
  ) {
    normalized.similarityThreshold = normalized.scoreThreshold;
  }
  delete normalized.scoreThreshold;
  return normalized;
}

function normalizeRoutingConfig(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized = { ...value };
  if (Array.isArray(normalized.fallbackChain)) {
    const fallbackChain = normalized.fallbackChain.filter(
      (modelId): modelId is string => typeof modelId === 'string',
    );
    if (!hasOwn(normalized, 'candidateModelIds')) {
      normalized.candidateModelIds = fallbackChain;
    }
    if (!hasOwn(normalized, 'fallbackModelId') && fallbackChain.length > 0) {
      normalized.fallbackModelId = fallbackChain.at(-1);
    }
  }
  delete normalized.fallbackChain;
  return normalized;
}

function normalizeSandboxConfig(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized = { ...value };
  if (!hasOwn(normalized, 'cpu') && hasOwn(normalized, 'cpuLimit')) {
    normalized.cpu = normalized.cpuLimit;
  }
  delete normalized.cpuLimit;
  if (!hasOwn(normalized, 'memory') && hasOwn(normalized, 'memoryLimitMb')) {
    normalized.memory = normalized.memoryLimitMb;
  }
  delete normalized.memoryLimitMb;
  return normalized;
}

function normalizeSubAgent(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const overrides = isRecord(value.overrides)
    ? {
        ...value.overrides,
        ...(hasOwn(value.overrides, 'routingConfig')
          ? {
              routingConfig: normalizeRoutingConfig(
                value.overrides.routingConfig,
              ),
            }
          : {}),
      }
    : value.overrides;
  const extensions = isRecord(value.extensions)
    ? {
        ...value.extensions,
        ...(Array.isArray(value.extensions.knowledgeBindings)
          ? {
              knowledgeBindings: value.extensions.knowledgeBindings.map(
                normalizeKnowledgeBinding,
              ),
            }
          : {}),
        ...(Array.isArray(value.extensions.subAgents)
          ? { subAgents: value.extensions.subAgents.map(normalizeSubAgent) }
          : {}),
      }
    : value.extensions;
  return {
    ...value,
    ...(hasOwn(value, 'overrides') ? { overrides } : {}),
    ...(hasOwn(value, 'extensions') ? { extensions } : {}),
  };
}

function normalizeAliasRecord(record: JsonRecord): JsonRecord {
  return {
    ...record,
    ...(Array.isArray(record.knowledgeBindings)
      ? {
          knowledgeBindings: record.knowledgeBindings.map(
            normalizeKnowledgeBinding,
          ),
        }
      : {}),
    ...(hasOwn(record, 'routingConfig')
      ? { routingConfig: normalizeRoutingConfig(record.routingConfig) }
      : {}),
    ...(hasOwn(record, 'sandboxConfig')
      ? { sandboxConfig: normalizeSandboxConfig(record.sandboxConfig) }
      : {}),
    ...(Array.isArray(record.subAgents)
      ? { subAgents: record.subAgents.map(normalizeSubAgent) }
      : {}),
  };
}

/**
 * 归一并校验外部或存量数据中的 Agent runtime 配置。
 * 返回值只包含 contracts 定义的 canonical 字段。
 */
export function normalizeAgentRuntimeConfig(
  input: unknown,
): AgentRuntimeConfig {
  const normalized = isRecord(input) ? normalizeAliasRecord(input) : input;
  return AgentRuntimeConfigSchema.parse(normalized);
}

function normalizeNodeConfig(
  nodeType: unknown,
  config: JsonRecord,
): JsonRecord {
  if (nodeType === 'knowledge-base') {
    const next = { ...config };
    if (
      !hasOwn(next, 'similarityThreshold') &&
      hasOwn(next, 'scoreThreshold')
    ) {
      next.similarityThreshold = next.scoreThreshold;
    }
    delete next.scoreThreshold;
    return next;
  }

  if (nodeType === 'smart-routing') {
    const next = { ...config };
    if (Array.isArray(next.fallbackChain)) {
      const fallbackChain = next.fallbackChain.filter(
        (modelId): modelId is string => typeof modelId === 'string',
      );
      if (!hasOwn(next, 'candidateModelIds')) {
        next.candidateModelIds = fallbackChain;
      }
      if (!hasOwn(next, 'fallbackModelId') && fallbackChain.length > 0) {
        next.fallbackModelId = fallbackChain.at(-1);
      }
    }
    delete next.fallbackChain;
    return next;
  }

  if (nodeType === 'sandbox') {
    const next = { ...config };
    if (!hasOwn(next, 'cpu') && hasOwn(next, 'cpuLimit')) {
      next.cpu = next.cpuLimit;
    }
    if (!hasOwn(next, 'memory') && hasOwn(next, 'memoryLimitMb')) {
      next.memory = next.memoryLimitMb;
    }
    delete next.cpuLimit;
    delete next.memoryLimitMb;
    return next;
  }

  return config;
}

/**
 * 保存和编译画布前清理节点 data/config 中的 runtime 旧别名。
 * 不修改调用方传入的节点对象。
 */
export function normalizeAgentCanvasRuntimeConfigAliases<
  T extends CanvasNodeLike,
>(nodes: readonly T[]): T[] {
  return nodes.map((node) => {
    if (!isRecord(node.data)) {
      return node;
    }

    const data = node.data;
    const nodeType = data.nodeType ?? node.type;
    const normalizedData = normalizeNodeConfig(nodeType, data);
    const normalizedConfig = isRecord(data.config)
      ? normalizeNodeConfig(nodeType, data.config)
      : data.config;

    return {
      ...node,
      data: {
        ...normalizedData,
        ...(normalizedConfig === undefined ? {} : { config: normalizedConfig }),
      },
    } as T;
  });
}
