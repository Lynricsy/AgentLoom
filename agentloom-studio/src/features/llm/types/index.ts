export const LLM_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
  'private_cloud',
] as const

export type LlmProvider = (typeof LLM_PROVIDER_IDS)[number]

export const LLM_MODEL_TYPES = ['chat', 'embedding'] as const

export type LlmModelType = (typeof LLM_MODEL_TYPES)[number]

export const AUTH_METHODS = ['api_key', 'mtls', 'none'] as const

export type AuthMethod = (typeof AUTH_METHODS)[number]

export type ApiKeyStatus = 'active' | 'revoked' | 'expired'

export interface LlmProviderInfo {
  id: LlmProvider
  name: string
  description: string
  models: string[]
}

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

export interface LlmModelInfo {
  id: string
  name: string
  provider: LlmProvider
  modelType?: LlmModelType
  modelName: string
  parameters: LlmParameters
  apiKeyId: string | null
  embeddingDimensions?: number | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  endpointUrl?: string | null
  authMethod?: string | null
  authConfig?: Record<string, unknown> | null
  timeoutMs?: number | null
}

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

export interface CreateLlmModelInput {
  name: string
  provider: LlmProvider
  modelType: LlmModelType
  modelName: string
  parameters: LlmParameters
  apiKeyId?: string
  embeddingDimensions?: number
  isDefault?: boolean
  endpointUrl?: string
  authMethod?: string
  authConfig?: Record<string, unknown>
  timeoutMs?: number
}

export type UpdateLlmModelInput = Partial<CreateLlmModelInput>

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

export interface PrivateCloudAuthConfig {
  apiKeyId?: string
  certPath?: string
  keyPath?: string
}

export interface TestConnectionInput {
  endpointUrl: string
  authMethod: AuthMethod
  apiKeyId?: string
  timeoutMs?: number
}

export interface TestConnectionResult {
  success: boolean
  latencyMs: number
  serverInfo?: {
    models?: string[]
    status?: string
    version?: string
  }
}

export interface PrivateCloudModelInfo {
  id: string
  name: string
  ownedBy?: string
}

export interface FetchModelsInput {
  endpointUrl: string
  authMethod: AuthMethod
  apiKeyId?: string
}

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

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && LLM_PROVIDER_IDS.includes(value as LlmProvider)
}

export function getProviderInfo(provider: LlmProvider | null | undefined) {
  if (!provider) {
    return null
  }

  return LLM_PROVIDERS.find((item) => item.id === provider) ?? null
}

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
  const provider = isLlmProvider(source.provider) ? source.provider : null
  const modelName = parseString(source.modelName) ?? parseString(source.modelId)

  if (!provider || !modelName) {
    return null
  }

  return {
    llmConfigId: parseNullableString(source.llmConfigId) ?? parseNullableString(source.id),
    name: parseString(source.name) ?? modelName,
    provider,
    modelType: source.modelType === 'embedding' ? 'embedding' : 'chat',
    modelName,
    parameters: normalizeLlmParameters(source.parameters),
    apiKeyId: parseNullableString(source.apiKeyId),
    embeddingDimensions:
      typeof source.embeddingDimensions === 'number' && Number.isFinite(source.embeddingDimensions)
        ? source.embeddingDimensions
        : null,
    isDefault: source.isDefault === true,
    endpointUrl: parseNullableString(source.endpointUrl),
    authMethod: parseNullableString(source.authMethod),
    authConfig: typeof source.authConfig === 'object' && source.authConfig !== null
      ? source.authConfig as Record<string, unknown>
      : null,
    timeoutMs: typeof source.timeoutMs === 'number' && Number.isFinite(source.timeoutMs)
      ? source.timeoutMs
      : null,
  }
}

export function toLlmModelConfig(model: LlmModelInfo): LlmModelConfig {
  return {
    llmConfigId: model.id,
    name: model.name,
    provider: model.provider,
    modelType: model.modelType ?? 'chat',
    modelName: model.modelName,
    parameters: normalizeLlmParameters(model.parameters),
    apiKeyId: model.apiKeyId,
    embeddingDimensions: model.embeddingDimensions ?? null,
    isDefault: model.isDefault,
    endpointUrl: model.endpointUrl ?? null,
    authMethod: model.authMethod ?? null,
    authConfig: model.authConfig ?? null,
    timeoutMs: model.timeoutMs ?? null,
  }
}

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

export function getLlmConfigState(
  config: Record<string, unknown> | null | undefined,
  hasProviderDefaultKey = false,
) {
  const parsed = parseLlmModelConfig(config)

  if (!parsed) {
    return 'unconfigured' as const
  }

  if (parsed.provider === 'private_cloud') {
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
