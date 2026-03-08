export type LlmProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom'

export interface LlmProviderInfo {
  id: LlmProvider
  name: string
  description: string
  models: string[]
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

export interface LlmModelConfig {
  [key: string]: unknown
  provider: LlmProvider
  modelId: string
  modelName: string
  parameters: LlmParameters
}

export interface LlmModelInfo {
  id: string
  provider: LlmProvider
  modelId: string
  name: string
  description?: string
  parameters: LlmParameters
  createdAt: string
  updatedAt: string
}

export const LLM_PROVIDERS: readonly LlmProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', description: 'GPT 系列模型', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude 系列模型', models: ['claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
  { id: 'google', name: 'Google', description: 'Gemini 系列模型', models: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek 系列模型', models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'] },
  { id: 'custom', name: '自定义', description: '自定义兼容 API', models: [] },
] as const
