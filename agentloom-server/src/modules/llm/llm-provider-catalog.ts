import type { LlmProvider } from './dto/create-llm-model-config.dto';

export interface LlmProviderInfo {
  id: LlmProvider;
  name: string;
  models: string[];
  defaultModel: string;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
}

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
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    supportsStreaming: true,
    supportsStructuredOutput: false,
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
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
