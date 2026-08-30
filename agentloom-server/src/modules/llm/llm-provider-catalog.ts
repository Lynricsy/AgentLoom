/** 已知的提供商 slug 标识 */
export type LlmProviderSlug =
  'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom' | 'private_cloud';

export interface LlmModelRoutingMeta {
  /** 上下文窗口大小 (tokens) */
  contextWindow: number;
  /** 每 1k 输入 token 成本 (USD) */
  costPer1kInputTokens: number;
  /** 每 1k 输出 token 成本 (USD) */
  costPer1kOutputTokens: number;
  /** 质量排名 (0-100，越高越好) */
  qualityRank: number;
  /** 平均延迟 (ms) */
  avgLatencyMs: number;
}

export interface LlmProviderInfo {
  id: LlmProviderSlug;
  name: string;
  models: string[];
  defaultModel: string;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  /** 路由策略使用的模型元数据，key 为模型名称 */
  routingMeta?: Record<string, LlmModelRoutingMeta>;
}

export const PRIVATE_CLOUD_ROUTING_DEFAULTS: LlmModelRoutingMeta = {
  contextWindow: 8192,
  costPer1kInputTokens: 0,
  costPer1kOutputTokens: 0,
  qualityRank: 50,
  avgLatencyMs: Infinity,
};

export const LLM_PROVIDER_CATALOG: LlmProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-mini',
      'o3-mini',
    ],
    defaultModel: 'gpt-4o',
    supportsStreaming: true,
    supportsStructuredOutput: true,
    routingMeta: {
      'gpt-4o': {
        contextWindow: 128000,
        costPer1kInputTokens: 0.0025,
        costPer1kOutputTokens: 0.01,
        qualityRank: 90,
        avgLatencyMs: 800,
      },
      'gpt-4o-mini': {
        contextWindow: 128000,
        costPer1kInputTokens: 0.00015,
        costPer1kOutputTokens: 0.0006,
        qualityRank: 75,
        avgLatencyMs: 500,
      },
      'gpt-4-turbo': {
        contextWindow: 128000,
        costPer1kInputTokens: 0.01,
        costPer1kOutputTokens: 0.03,
        qualityRank: 88,
        avgLatencyMs: 1200,
      },
      'gpt-4': {
        contextWindow: 8192,
        costPer1kInputTokens: 0.03,
        costPer1kOutputTokens: 0.06,
        qualityRank: 85,
        avgLatencyMs: 1500,
      },
      'gpt-3.5-turbo': {
        contextWindow: 16385,
        costPer1kInputTokens: 0.0005,
        costPer1kOutputTokens: 0.0015,
        qualityRank: 60,
        avgLatencyMs: 400,
      },
      o1: {
        contextWindow: 200000,
        costPer1kInputTokens: 0.015,
        costPer1kOutputTokens: 0.06,
        qualityRank: 95,
        avgLatencyMs: 3000,
      },
      'o1-mini': {
        contextWindow: 128000,
        costPer1kInputTokens: 0.003,
        costPer1kOutputTokens: 0.012,
        qualityRank: 82,
        avgLatencyMs: 1500,
      },
      'o3-mini': {
        contextWindow: 200000,
        costPer1kInputTokens: 0.0011,
        costPer1kOutputTokens: 0.0044,
        qualityRank: 85,
        avgLatencyMs: 1000,
      },
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    defaultModel: 'claude-sonnet-4-20250514',
    supportsStreaming: true,
    supportsStructuredOutput: true,
    routingMeta: {
      'claude-sonnet-4-20250514': {
        contextWindow: 200000,
        costPer1kInputTokens: 0.003,
        costPer1kOutputTokens: 0.015,
        qualityRank: 92,
        avgLatencyMs: 900,
      },
      'claude-3-5-sonnet-20241022': {
        contextWindow: 200000,
        costPer1kInputTokens: 0.003,
        costPer1kOutputTokens: 0.015,
        qualityRank: 90,
        avgLatencyMs: 1000,
      },
      'claude-3-5-haiku-20241022': {
        contextWindow: 200000,
        costPer1kInputTokens: 0.0008,
        costPer1kOutputTokens: 0.004,
        qualityRank: 72,
        avgLatencyMs: 400,
      },
      'claude-3-opus-20240229': {
        contextWindow: 200000,
        costPer1kInputTokens: 0.015,
        costPer1kOutputTokens: 0.075,
        qualityRank: 93,
        avgLatencyMs: 2000,
      },
    },
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    defaultModel: 'gemini-2.0-flash',
    supportsStreaming: true,
    supportsStructuredOutput: true,
    routingMeta: {
      'gemini-2.0-flash': {
        contextWindow: 1048576,
        costPer1kInputTokens: 0.0001,
        costPer1kOutputTokens: 0.0004,
        qualityRank: 80,
        avgLatencyMs: 600,
      },
      'gemini-2.0-flash-lite': {
        contextWindow: 1048576,
        costPer1kInputTokens: 0.000075,
        costPer1kOutputTokens: 0.0003,
        qualityRank: 70,
        avgLatencyMs: 350,
      },
      'gemini-1.5-pro': {
        contextWindow: 2097152,
        costPer1kInputTokens: 0.00125,
        costPer1kOutputTokens: 0.005,
        qualityRank: 88,
        avgLatencyMs: 1200,
      },
      'gemini-1.5-flash': {
        contextWindow: 1048576,
        costPer1kInputTokens: 0.000075,
        costPer1kOutputTokens: 0.0003,
        qualityRank: 75,
        avgLatencyMs: 500,
      },
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    supportsStreaming: true,
    supportsStructuredOutput: false,
    routingMeta: {
      'deepseek-chat': {
        contextWindow: 64000,
        costPer1kInputTokens: 0.00014,
        costPer1kOutputTokens: 0.00028,
        qualityRank: 78,
        avgLatencyMs: 700,
      },
      'deepseek-reasoner': {
        contextWindow: 64000,
        costPer1kInputTokens: 0.00055,
        costPer1kOutputTokens: 0.00219,
        qualityRank: 85,
        avgLatencyMs: 2000,
      },
    },
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    models: [],
    defaultModel: '',
    supportsStreaming: true,
    supportsStructuredOutput: false,
  },
  {
    id: 'private_cloud',
    name: 'Private Cloud',
    models: [],
    defaultModel: '',
    supportsStreaming: true,
    supportsStructuredOutput: false,
  },
];

export function supportsNativeStructuredOutput(providerId: string): boolean {
  const provider = LLM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  return provider?.supportsStructuredOutput ?? false;
}

export function getModelRoutingMeta(
  providerId: string,
  modelName: string,
): LlmModelRoutingMeta {
  const provider = LLM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (
    providerId === 'private_cloud' ||
    providerId === 'custom' ||
    !provider?.routingMeta
  ) {
    return { ...PRIVATE_CLOUD_ROUTING_DEFAULTS };
  }
  return (
    provider.routingMeta[modelName] ?? { ...PRIVATE_CLOUD_ROUTING_DEFAULTS }
  );
}
