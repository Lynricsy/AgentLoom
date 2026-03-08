import { describe, it, expect } from 'vitest'
import {
  LLM_PROVIDER_CATALOG,
  supportsNativeStructuredOutput,
} from '../llm-provider-catalog'

describe('LLM Provider Catalog — 结构化输出能力', () => {
  it('openai 应支持原生结构化输出', () => {
    expect(supportsNativeStructuredOutput('openai')).toBe(true)
  })

  it('anthropic 应支持原生结构化输出', () => {
    expect(supportsNativeStructuredOutput('anthropic')).toBe(true)
  })

  it('google 应支持原生结构化输出', () => {
    expect(supportsNativeStructuredOutput('google')).toBe(true)
  })

  it('deepseek 应不支持原生结构化输出', () => {
    expect(supportsNativeStructuredOutput('deepseek')).toBe(false)
  })

  it('未知 provider 应返回 false', () => {
    expect(supportsNativeStructuredOutput('unknown-provider')).toBe(false)
  })

  it('所有 provider 应包含 supportsStructuredOutput 字段', () => {
    for (const provider of LLM_PROVIDER_CATALOG) {
      expect(provider).toHaveProperty('supportsStructuredOutput')
      expect(typeof provider.supportsStructuredOutput).toBe('boolean')
    }
  })
})
