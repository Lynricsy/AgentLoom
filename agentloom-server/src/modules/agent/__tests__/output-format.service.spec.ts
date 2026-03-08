import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_OUTPUT_FORMAT_STRATEGY } from '../dto/output-format.dto'
import type { FormatRequest } from '../output-format.service'
import { OutputFormatService } from '../output-format.service'

vi.mock('ai', () => {
  class NOGError extends Error {
    text: string

    constructor(message: string, text: string) {
      super(message)
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

type GenerateTextFn = typeof import('ai')['generateText']
type GenerateTextResponse = Awaited<ReturnType<GenerateTextFn>>
type NoObjectGeneratedErrorConstructor = new (
  message: string,
  text: string,
) => Error & { text: string }

const baseSchema = JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
})

function createMockModel(): LanguageModel {
  return {} as LanguageModel
}

function createGenerateTextResponse(
  value: Partial<GenerateTextResponse>,
): GenerateTextResponse {
  return value as GenerateTextResponse
}

async function createNoObjectGeneratedError(
  message: string,
  text: string,
): Promise<Error & { text: string }> {
  const { NoObjectGeneratedError } = await import('ai')
  const errorCtor =
    NoObjectGeneratedError as unknown as NoObjectGeneratedErrorConstructor
  return new errorCtor(message, text)
}

describe('OutputFormatService', () => {
  let service: OutputFormatService

  const baseRequest: FormatRequest = {
    providerId: 'openai',
    model: createMockModel(),
    prompt: '生成一个用户对象',
    strategy: {
      ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
      outputSchema: baseSchema,
    },
  }

  beforeEach(async () => {
    service = new OutputFormatService()
    vi.resetAllMocks()
  })

  describe('L1 成功路径', () => {
    it('应使用原生结构化输出并返回 L1 结果', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({
          output: { name: 'test' },
          text: '',
        }),
      )

      const result = await service.executeStructuredOutput(baseRequest)

      expect(result.outputFormatLevel).toBe('L1')
      expect(result.degraded).toBe(false)
      expect(result.data).toEqual({ name: 'test' })
      expect(result.attempts).toHaveLength(1)
      expect(result.attempts[0]).toMatchObject({
        level: 'L1',
        success: true,
      })
    })
  })

  describe('L1→L2 降级', () => {
    it('L1 失败后应降级到 L2，并记录失败 rawOutput', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('failed', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"name":"test"}',
          }),
        )

      const result = await service.executeStructuredOutput(baseRequest)

      expect(result.outputFormatLevel).toBe('L2')
      expect(result.degraded).toBe(true)
      expect(result.data).toEqual({ name: 'test' })
      expect(result.attempts).toHaveLength(2)
      expect(result.attempts[0]).toMatchObject({
        level: 'L1',
        success: false,
        rawOutput: '{ broken',
      })
      expect(result.attempts[1]).toMatchObject({
        level: 'L2',
        success: true,
        rawOutput: '{"name":"test"}',
      })
    })
  })

  describe('L2→L3 降级', () => {
    it('L2 校验失败后应降级到 L3', async () => {
      const { generateText } = await import('ai')
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      }

      vi.mocked(generateText)
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"wrong":"shape"}',
          }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            output: { name: 'from-l3' },
            text: '{"name":"from-l3"}',
          }),
        )

      const result = await service.executeStructuredOutput(deepseekRequest)

      expect(result.outputFormatLevel).toBe('L3')
      expect(result.degraded).toBe(true)
      expect(result.data).toEqual({ name: 'from-l3' })
      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L2',
        'L3',
      ])
      expect(result.attempts[0]?.success).toBe(false)
    })
  })

  describe('L3→L4 降级', () => {
    it('L3 校验失败后应降级到 L4，并保留原始文本', async () => {
      const { generateText } = await import('ai')
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      }

      vi.mocked(generateText)
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"wrong":"shape"}',
          }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            output: { wrong: 'shape' },
            text: '{"wrong":"shape"}',
          }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '回答如下：{"name":"from-l4"}',
          }),
        )

      const result = await service.executeStructuredOutput(deepseekRequest)

      expect(result.outputFormatLevel).toBe('L4')
      expect(result.degraded).toBe(true)
      expect(result.data).toEqual({ name: 'from-l4' })
      expect(result.rawText).toBe('回答如下：{"name":"from-l4"}')
      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L2',
        'L3',
        'L4',
      ])
      expect(result.attempts[1]).toMatchObject({
        level: 'L3',
        success: false,
        rawOutput: '{"wrong":"shape"}',
      })
    })
  })

  describe('全部失败路径', () => {
    it('所有层级失败时应返回 null 数据与最后一次 rawText', async () => {
      const { generateText } = await import('ai')
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      }

      vi.mocked(generateText)
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: 'not json',
          }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            output: { wrong: 'shape' },
            text: '{"wrong":"shape"}',
          }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: 'still no structured output',
          }),
        )

      const result = await service.executeStructuredOutput(deepseekRequest)

      expect(result.outputFormatLevel).toBe('L4')
      expect(result.degraded).toBe(true)
      expect(result.data).toBeNull()
      expect(result.rawText).toBe('still no structured output')
      expect(result.attempts).toHaveLength(3)
      expect(result.attempts.every((attempt) => attempt.success === false)).toBe(
        true,
      )
    })
  })

  describe('strict 模式', () => {
    it('strict 模式下不应降级到 L3/L4', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('failed', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"wrong":"shape"}',
          }),
        )

      const strictRequest: FormatRequest = {
        ...baseRequest,
        strategy: { ...baseRequest.strategy, strictness: 'strict' },
      }

      const result = await service.executeStructuredOutput(strictRequest)

      expect(result.attempts.map((attempt) => attempt.level)).toEqual(['L1', 'L2'])
      expect(result.rawText).toBe('{"wrong":"shape"}')
    })
  })

  describe('Provider 不支持原生输出', () => {
    it('deepseek 应从 L2 开始', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({
          text: '{"name":"test"}',
        }),
      )

      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
      }

      const result = await service.executeStructuredOutput(deepseekRequest)

      expect(result.attempts[0]?.level).toBe('L2')
    })
  })

  describe('FormatAttempt 元数据', () => {
    it('每次尝试应记录 level、durationMs、success 与 rawOutput', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('L1 fail', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"name":"ok"}',
          }),
        )

      const result = await service.executeStructuredOutput(baseRequest)

      for (const attempt of result.attempts) {
        expect(attempt).toHaveProperty('level')
        expect(attempt).toHaveProperty('durationMs')
        expect(attempt).toHaveProperty('success')
        expect(typeof attempt.durationMs).toBe('number')
      }
      expect(result.attempts[0]?.rawOutput).toBe('{ broken')
      expect(result.attempts[1]?.rawOutput).toBe('{"name":"ok"}')
    })
  })
})
