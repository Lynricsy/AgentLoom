// ============================================================================
// 新 Provider / Model 实体类型 (对应服务端两级结构)
// ============================================================================

/** API 协议类型 */
export type ApiProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'anthropic'
  | 'google'
  | 'cohere'

export const API_PROTOCOL_VALUES: readonly ApiProtocol[] = [
  'openai_chat',
  'openai_responses',
  'anthropic',
  'google',
  'cohere',
]

/** 模型能力 */
export interface ModelCapabilities {
  vision?: boolean
  functionCalling?: boolean
  reasoning?: boolean
  structuredOutput?: boolean
}

/** 分级定价 */
export interface PricingTier {
  aboveTokens: number
  inputPer1MTokens: number
  outputPer1MTokens: number
  cachedReadPer1MTokens?: number
  cachedWritePer1MTokens?: number
}

/** 模型定价 */
export interface ModelPricing {
  inputPer1MTokens: number
  outputPer1MTokens: number
  cachedReadPer1MTokens?: number
  cachedWritePer1MTokens?: number
  tiers?: PricingTier[]
}

/** 服务端 LLM Provider 实体 */
export interface LlmProviderEntity {
  id: string
  orgId: string
  tenantId: string
  slug: string
  name: string
  iconUrl: string | null
  baseUrl: string | null
  defaultBaseUrl: string | null
  isBuiltin: boolean
  isEnabled: boolean
  apiProtocol: ApiProtocol
  apiKeyId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 服务端 LLM Model Config 实体 (JOIN provider) */
export interface LlmModelConfigEntity {
  id: string
  orgId: string
  tenantId: string
  providerId: string
  name: string
  modelId: string
  modelType: 'chat' | 'embedding'
  isEnabled: boolean
  isDefault: boolean
  capabilities: ModelCapabilities
  contextWindow: number | null
  maxOutputTokens: number | null
  pricing: ModelPricing | null
  parameters: Record<string, unknown>
  metadataSource: 'api_discovery' | 'litellm' | 'manual' | null
  embeddingDimensions: number | null
  timeoutMs: number | null
  createdAt: string
  updatedAt: string
  provider: LlmProviderEntity
}

// ============================================================================
// Provider CRUD DTO
// ============================================================================

/** 创建 Provider 请求体 */
export interface CreateLlmProviderInput {
  name: string
  slug?: string
  baseUrl: string
  apiProtocol?: ApiProtocol
  apiKeyId?: string
  iconUrl?: string
  sortOrder?: number
  isEnabled?: boolean
}

/** 更新 Provider 请求体 */
export type UpdateLlmProviderInput = Partial<CreateLlmProviderInput> & {
  baseUrl?: string | null
  apiKeyId?: string | null
}

// ============================================================================
// Model CRUD DTO (新结构)
// ============================================================================

/** 创建模型配置请求体 */
export interface CreateLlmModelInput {
  name: string
  providerId: string
  modelId: string
  modelType?: 'chat' | 'embedding'
  isDefault?: boolean
  isEnabled?: boolean
  capabilities?: ModelCapabilities
  contextWindow?: number | null
  maxOutputTokens?: number | null
  pricing?: ModelPricing | null
  parameters?: Record<string, unknown>
  timeoutMs?: number
  embeddingDimensions?: number
}

/** 更新模型配置请求体 */
export type UpdateLlmModelInput = Partial<CreateLlmModelInput>

// ============================================================================
// 发现 / 连接测试类型
// ============================================================================

/** 发现的模型 */
export interface DiscoveredModel {
  id: string
  name: string
  ownedBy?: string
}

/** 连接测试结果 */
export interface ConnectionTestResult {
  success: boolean
  latencyMs: number
  serverInfo?: {
    version?: string
    status?: string
    models?: string[]
  }
}

/** LiteLLM 模型元数据 */
export interface LiteLLMModelInfo {
  modelId: string
  contextWindow: number | null
  maxOutputTokens: number | null
  pricing: ModelPricing | null
  capabilities: ModelCapabilities
}

// ============================================================================
// 向后兼容的旧类型 (被画布节点、面板等外部消费者使用)
// ============================================================================

/**
 * LlmProvider 现在是任意 provider slug 字符串，不再是固定联合类型。
 * 外部消费者继续使用 `LlmProvider` 类型，但不再限制为枚举值。
 */
export type LlmProvider = string

export const LLM_MODEL_TYPES = ['chat', 'embedding'] as const

export type LlmModelType = (typeof LLM_MODEL_TYPES)[number]

/**
 * 认证方式 (Private Cloud 组件使用)
 * @deprecated 新 Provider 系统不再需要独立的认证方式枚举
 */
export const AUTH_METHODS = ['api_key', 'mtls', 'none'] as const

/** @deprecated */
export type AuthMethod = (typeof AUTH_METHODS)[number]

/**
 * Private Cloud 连接测试输入 (PrivateCloudConfigSection 使用)
 * @deprecated 新系统使用 testProviderConnection(providerId, timeoutMs?)
 */
export interface TestConnectionInput {
  endpointUrl: string
  authMethod: AuthMethod
  apiKeyId?: string
  timeoutMs?: number
}

/**
 * Private Cloud 模型信息 (PrivateCloudConfigSection 使用)
 * @deprecated 新系统使用 DiscoveredModel
 */
export interface PrivateCloudModelInfo {
  id: string
  name: string
  ownedBy?: string
}

/**
 * Private Cloud 获取模型输入 (PrivateCloudConfigSection 使用)
 * @deprecated 新系统使用 discoverProviderModels(providerId)
 */
export interface FetchModelsInput {
  endpointUrl: string
  authMethod: AuthMethod
  apiKeyId?: string
}

export type ApiKeyStatus = 'active' | 'revoked' | 'expired'

/** 兼容旧版的 Provider 静态信息 (id/name/description/models) */
export interface LlmProviderInfo {
  id: string
  name: string
  description: string
  models: string[]
}

/** API Key 信息 */
export interface ApiKeyInfo {
  id: string
  provider: LlmProvider
  label: string
  keyPreview: string
  isDefault: boolean
  status: ApiKeyStatus
  lastUsedAt: string | null
  rotatedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

/** LLM 参数 */
export interface LlmParameters {
  temperature: number
  maxTokens?: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stop: string[]
}

export const DEFAULT_LLM_PARAMETERS: LlmParameters = {
  temperature: 0.7,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: [],
}

/**
 * LlmModelInfo -- 向后兼容别名，现在映射到 LlmModelConfigEntity。
 * 旧代码依赖 `provider`(string) / `modelName`(string) 字段，
 * 这些字段通过 compat adapter 在 hook 层补齐。
 */
export type LlmModelInfo = LlmModelConfigEntity & {
  /** 兼容旧版：provider slug 字符串 */
  provider: string
  /** 兼容旧版：模型标识符 (等同于 modelId) */
  modelName: string
}

/** 画布节点使用的 LLM 模型配置 */
export interface LlmModelConfig extends Record<string, unknown> {
  llmConfigId: string | null
  name: string
  provider: LlmProvider
  modelType: LlmModelType
  modelName: string
  parameters: LlmParameters
  apiKeyId: string | null
  embeddingDimensions?: number | null
  isDefault: boolean
  endpointUrl?: string | null
  authMethod?: string | null
  authConfig?: Record<string, unknown> | null
  timeoutMs?: number | null
}

/** 画布节点数据 patch */
export interface LlmNodeDataPatch {
  config: LlmModelConfig
  llmConfigId: string | null
  parameters: LlmParameters
  label: string
  modelId: string
  name: string
  provider: LlmProvider
  modelType: LlmModelType
  modelName: string
  apiKeyId: string | null
  embeddingDimensions?: number | null
  isDefault: boolean
  endpointUrl?: string | null
  authMethod?: string | null
  authConfig?: Record<string, unknown> | null
  timeoutMs?: number | null
  temperature: number
  maxTokens?: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
}

// ============================================================================
// 静态 fallback 数据 (用于 provider 列表尚未加载时的兼容显示)
// ============================================================================

/**
 * 静态 Provider 列表 -- 仅作为 fallback，实际列表从服务端获取。
 * @deprecated 使用 useLlmProviders() 获取实时数据
 */
export const LLM_PROVIDERS: readonly LlmProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT 系列模型',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 系列模型',
    models: ['claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku'],
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini 系列模型',
    models: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 系列模型',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  {
    id: 'custom',
    name: '自定义',
    description: '自定义兼容 API',
    models: [],
  },
  {
    id: 'private_cloud',
    name: 'Private Cloud',
    description: '连接到私有部署的 OpenAI 兼容推理端点',
    models: [],
  },
] as const

// ============================================================================
// 辅助函数
// ============================================================================

function parseNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function parseNullableString(value: unknown) {
  const parsed = parseString(value)
  if (!parsed) {
    return null
  }

  return parsed
}

/**
 * 判断值是否为有效的 LlmProvider。
 * 新版本中 LlmProvider 为 string，任何非空字符串都视为有效。
 */
export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && value.length > 0
}

/**
 * 获取 Provider 信息。
 * 优先从传入的 providers 列表中查找，fallback 到静态 LLM_PROVIDERS。
 *
 * @param provider - provider slug
 * @param providers - 可选，从服务端获取的 provider 列表
 */
export function getProviderInfo(
  provider: LlmProvider | null | undefined,
  providers?: readonly LlmProviderEntity[],
): LlmProviderInfo | null {
  if (!provider) {
    return null
  }

  // 尝试从动态 provider 列表查找
  if (providers) {
    const entity = providers.find((p) => p.slug === provider)
    if (entity) {
      return {
        id: entity.slug,
        name: entity.name,
        description: '',
        models: [],
      }
    }
  }

  // fallback 到静态列表
  return LLM_PROVIDERS.find((item) => item.id === provider) ?? null
}

/** 标准化 LLM 参数，缺失字段用默认值填充 */
export function normalizeLlmParameters(value: unknown): LlmParameters {
  const record = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}

  const maxTokensValue = record.maxTokens

  return {
    temperature: parseNumber(record.temperature, DEFAULT_LLM_PARAMETERS.temperature),
    maxTokens:
      typeof maxTokensValue === 'number' && Number.isFinite(maxTokensValue)
        ? maxTokensValue
        : undefined,
    topP: parseNumber(record.topP, DEFAULT_LLM_PARAMETERS.topP),
    frequencyPenalty: parseNumber(
      record.frequencyPenalty,
      DEFAULT_LLM_PARAMETERS.frequencyPenalty,
    ),
    presencePenalty: parseNumber(
      record.presencePenalty,
      DEFAULT_LLM_PARAMETERS.presencePenalty,
    ),
    stop: Array.isArray(record.stop)
      ? record.stop.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
  }
}

/**
 * 解析 LlmModelConfig -- 同时兼容旧格式和新格式。
 *
 * 新格式: { providerId, modelId, provider: { slug, name, ... } }
 * 旧格式: { provider: string, modelName: string }
 */
export function parseLlmModelConfig(value: unknown): LlmModelConfig | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const nestedConfig =
    typeof record.config === 'object' && record.config !== null
      ? record.config as Record<string, unknown>
      : null
  const source = nestedConfig ? { ...nestedConfig, ...record } : record

  // 新格式: provider 是嵌套对象 { slug, name, ... }
  let provider: string | null = null
  if (typeof source.provider === 'object' && source.provider !== null) {
    const providerObj = source.provider as Record<string, unknown>
    provider = parseString(providerObj.slug)
  } else if (isLlmProvider(source.provider)) {
    provider = source.provider
  }

  // modelName (旧) 或 modelId (新) 都可作为模型标识
  const modelName = parseString(source.modelName) ?? parseString(source.modelId)

  if (!provider || !modelName) {
    return null
  }

  // 从嵌套 provider 对象或 source 获取 endpointUrl
  const providerObj = typeof source.provider === 'object' && source.provider !== null
    ? source.provider as Record<string, unknown>
    : null
  const endpointUrl = parseNullableString(source.endpointUrl)
    ?? (providerObj ? parseNullableString(providerObj.baseUrl) : null)

  return {
    llmConfigId: parseNullableString(source.llmConfigId) ?? parseNullableString(source.id),
    name: parseString(source.name) ?? modelName,
    provider,
    modelType: source.modelType === 'embedding' ? 'embedding' : 'chat',
    modelName,
    parameters: normalizeLlmParameters(source.parameters),
    apiKeyId: parseNullableString(source.apiKeyId)
      ?? (providerObj ? parseNullableString(providerObj.apiKeyId) : null),
    embeddingDimensions:
      typeof source.embeddingDimensions === 'number' && Number.isFinite(source.embeddingDimensions)
        ? source.embeddingDimensions
        : null,
    isDefault: source.isDefault === true,
    endpointUrl,
    authMethod: parseNullableString(source.authMethod),
    authConfig: typeof source.authConfig === 'object' && source.authConfig !== null
      ? source.authConfig as Record<string, unknown>
      : null,
    timeoutMs: typeof source.timeoutMs === 'number' && Number.isFinite(source.timeoutMs)
      ? source.timeoutMs
      : null,
  }
}

/**
 * 将 LlmModelInfo (= LlmModelConfigEntity + compat) 转换为画布用的 LlmModelConfig。
 */
export function toLlmModelConfig(model: LlmModelInfo): LlmModelConfig {
  // 提取 provider 信息 -- model.provider 是 compat 的 slug 字符串
  // 但底层 entity 有嵌套的 provider 对象，需要从中取 baseUrl / apiKeyId
  const entity = model as LlmModelConfigEntity & { provider: unknown }
  const providerObj = typeof entity.provider === 'object' && entity.provider !== null
    ? entity.provider as LlmProviderEntity
    : null
  const providerSlug = providerObj ? providerObj.slug : (typeof model.provider === 'string' ? model.provider : '')

  return {
    llmConfigId: model.id,
    name: model.name,
    provider: providerSlug,
    modelType: model.modelType ?? 'chat',
    modelName: model.modelName ?? model.modelId,
    parameters: normalizeLlmParameters(model.parameters),
    apiKeyId: providerObj?.apiKeyId ?? null,
    embeddingDimensions: model.embeddingDimensions ?? null,
    isDefault: model.isDefault,
    endpointUrl: providerObj?.baseUrl ?? null,
    authMethod: null,
    authConfig: null,
    timeoutMs: model.timeoutMs ?? null,
  }
}

/** 构建画布节点 LLM data patch */
export function buildLlmNodePatch(model: LlmModelInfo): LlmNodeDataPatch {
  const config = toLlmModelConfig(model)

  return {
    config,
    llmConfigId: config.llmConfigId,
    parameters: config.parameters,
    label: config.modelName,
    modelId: config.modelName,
    name: config.name,
    provider: config.provider,
    modelType: config.modelType,
    modelName: config.modelName,
    apiKeyId: config.apiKeyId,
    embeddingDimensions: config.embeddingDimensions,
    isDefault: config.isDefault,
    endpointUrl: config.endpointUrl,
    authMethod: config.authMethod,
    authConfig: config.authConfig,
    timeoutMs: config.timeoutMs,
    temperature: config.parameters.temperature,
    maxTokens: config.parameters.maxTokens,
    topP: config.parameters.topP,
    frequencyPenalty: config.parameters.frequencyPenalty,
    presencePenalty: config.parameters.presencePenalty,
  }
}

/**
 * 获取 LLM 配置状态 -- 画布节点用于决定显示样式。
 */
export function getLlmConfigState(
  config: Record<string, unknown> | null | undefined,
  hasProviderDefaultKey = false,
) {
  const parsed = parseLlmModelConfig(config)

  if (!parsed) {
    return 'unconfigured' as const
  }

  // private_cloud 或具有自定义 endpointUrl 的 provider 需要额外检查
  if (parsed.endpointUrl || parsed.provider === 'private_cloud') {
    if (!parsed.endpointUrl || !parsed.modelName) {
      return 'warning' as const
    }

    if (parsed.authMethod === 'api_key' && !parsed.apiKeyId && !hasProviderDefaultKey) {
      return 'warning' as const
    }

    return 'configured' as const
  }

  if (!parsed.apiKeyId && !hasProviderDefaultKey) {
    return 'warning' as const
  }

  return 'configured' as const
}

// ============================================================================
// 将 LlmModelConfigEntity 转换为带兼容字段的 LlmModelInfo
// ============================================================================

/**
 * 将服务端返回的 LlmModelConfigEntity 适配为 LlmModelInfo (带 provider/modelName 兼容字段)。
 */
export function adaptModelEntityToInfo(entity: LlmModelConfigEntity): LlmModelInfo {
  return {
    ...entity,
    provider: entity.provider?.slug ?? '',
    modelName: entity.modelId,
  } as LlmModelInfo
}
