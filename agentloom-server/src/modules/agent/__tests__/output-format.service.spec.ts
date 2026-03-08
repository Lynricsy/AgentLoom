import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutputFormatService, type FormatRequest } from '../output-format.service'
import { DEFAULT_OUTPUT_FORMAT_STRATEGY } from '../dto/output-format.dto'

vi.mock('ai', () => {
  class NOGError extends Error {
    text: string
    constructor(msg: string, text: string) {
      super(msg)
      this.text = text
    }
    static isInstance(error: unknown): boolean {
      return error instanceof NOGError
    }
  }

  return {
    generateText: vi.fn(),
    Output: {
      object: vi.fn(() => 'mock-output-object'),
      json: vi.fn(() => 'mock-output-json'),
    },
    NoObjectGeneratedError: NOGError,
  }
})

vi.mock('jsonrepair', () => ({
  jsonrepair: vi.fn((text: string) => text),
}))

vi.mock('../../llm/llm-provider-catalog', () => ({
  supportsNativeStructuredOutput: vi.fn((id: string) => id === 'openai'),
}))

describe('OutputFormatService', () => {
  let service: OutputFormatService

  beforeEach(() => {
    service = new OutputFormatService()
    vi.clearAllMocks()
  })

  const baseRequest: FormatRequest = {
    providerId: 'openai',
    model: {} as any,
    prompt: '生成一个用户对象',
    strategy: {
      ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
      outputSchema: '{"type":"object","properties":{"name":{"type":"string"}}}',
    },
  }

  describe('L1 成功路径', () => {
    it('应使用原生结构化输出并返回 L1 结果', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { name: 'test' },
        text: '',
      } as any)

      const result = await service.executeStructuredOutput(baseRequest)

      expect(result.outputFormatLevel).toBe('L1')
      expect(result.degraded).toBe(false)
      expect(result.attempts).toHaveLength(1)
    })
  })

  describe('L1→L2 降级', () => {
    it('L1 失败后应降级到 L2', async () => {
      const { generateText, NoObjectGeneratedError } = await import('ai')
      vi.mocked(generateText).mockRejectedValueOnce(
        new (NoObjectGeneratedError as any)('failed', '{ broken'),
      )
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"name":"test"}',
      } as any)

      const result = await service.executeStructuredOutput(baseRequest)

      expect(result.outputFormatLevel).toBe('L2')
      expect(result.degraded).toBe(true)
      expect(result.attempts).toHaveLength(2)
      expect(result.attempts[0].level).toBe('L1')
      expect(result.attempts[0].success).toBe(false)
    })
  })

  describe('strict 模式', () => {
    it('strict 模式下不应降级到 L3/L4', async () => {
      const { generateText, NoObjectGeneratedError } = await import('ai')
      vi.mocked(generateText).mockRejectedValue(
        new (NoObjectGeneratedError as any)('failed', 'bad'),
      )

      const strictRequest: FormatRequest = {
        ...baseRequest,
        strategy: { ...baseRequest.strategy, strictness: 'strict' },
      }

      const result = await service.executeStructuredOutput(strictRequest)

      const levels = result.attempts.map((a) => a.level)
      expect(levels).not.toContain('L3')
      expect(levels).not.toContain('L4')
    })
  })

  describe('Provider 不支持原生输出', () => {
    it('deepseek 应从 L2 开始', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"name":"test"}',
      } as any)

      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
      }

      const result = await service.executeStructuredOutput(deepseekRequest)

      expect(result.attempts[0].level).toBe('L2')
    })
  })

  describe('FormatAttempt 元数据', () => {
    it('每次尝试应记录 level、durationMs、success', async () => {
      const { generateText, NoObjectGeneratedError } = await import('ai')
      vi.mocked(generateText)
        .mockRejectedValueOnce(new (NoObjectGeneratedError as any)('L1 fail', ''))
        .mockResolvedValueOnce({ text: '{"name":"ok"}' } as any)

      const result = await service.executeStructuredOutput(baseRequest)

      for (const attempt of result.attempts) {
        expect(attempt).toHaveProperty('level')
        expect(attempt).toHaveProperty('durationMs')
        expect(attempt).toHaveProperty('success')
        expect(typeof attempt.durationMs).toBe('number')
      }
    })
  })
})
