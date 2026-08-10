import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_OUTPUT_FORMAT_STRATEGY } from '../dto/output-format.dto';
import type { FormatRequest } from '../output-format.service';
import { OutputFormatService } from '../output-format.service';

vi.mock('ai', () => {
  class NOGError extends Error {
    text: string;

    constructor(message: string, text: string) {
      super(message);
      this.text = text;
    }

    static isInstance(error: unknown): boolean {
      return error instanceof NOGError;
    }
  }

  return {
    generateText: vi.fn(),
    Output: {
      object: vi.fn(() => 'mock-output-object'),
      json: vi.fn(() => 'mock-output-json'),
    },
    NoObjectGeneratedError: NOGError,
  };
});

vi.mock('jsonrepair', () => ({
  jsonrepair: vi.fn((text: string) => text),
}));

vi.mock('../../llm/llm-provider-catalog', () => ({
  supportsNativeStructuredOutput: vi.fn((id: string) => id === 'openai'),
}));

type GenerateTextFn = (typeof import('ai'))['generateText'];
type GenerateTextResponse = Awaited<ReturnType<GenerateTextFn>>;
type NoObjectGeneratedErrorConstructor = new (
  message: string,
  text: string,
) => Error & { text: string };

const baseSchema = JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
});

function createMockModel(): LanguageModel {
  return {} as LanguageModel;
}

function createGenerateTextResponse(
  value: Partial<GenerateTextResponse>,
): GenerateTextResponse {
  return value as GenerateTextResponse;
}

async function createNoObjectGeneratedError(
  message: string,
  text: string,
): Promise<Error & { text: string }> {
  const { NoObjectGeneratedError } = await import('ai');
  const errorCtor =
    NoObjectGeneratedError as unknown as NoObjectGeneratedErrorConstructor;
  return new errorCtor(message, text);
}

describe('OutputFormatService', () => {
  let service: OutputFormatService;

  const baseRequest: FormatRequest = {
    providerId: 'openai',
    model: createMockModel(),
    prompt: '生成一个用户对象',
    strategy: {
      ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
      outputSchema: baseSchema,
    },
  };

  beforeEach(async () => {
    service = new OutputFormatService();
    vi.resetAllMocks();
  });

  describe('L1 成功路径', () => {
    it('应使用原生结构化输出并返回 L1 结果', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({
          output: { name: 'test' },
          text: '',
        }),
      );

      const result = await service.executeStructuredOutput(baseRequest);

      expect(result.outputFormatLevel).toBe('L1');
      expect(result.degraded).toBe(false);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toMatchObject({
        level: 'L1',
        success: true,
      });
    });
  });

  describe('L1→L2 降级', () => {
    it('L1 失败后应降级到 L2，并记录失败 rawOutput', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('failed', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"name":"test"}',
          }),
        );

      const result = await service.executeStructuredOutput(baseRequest);

      expect(result.outputFormatLevel).toBe('L2');
      expect(result.degraded).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toMatchObject({
        level: 'L1',
        success: false,
        rawOutput: '{ broken',
      });
      expect(result.attempts[1]).toMatchObject({
        level: 'L2',
        success: true,
        rawOutput: '{"name":"test"}',
      });
    });
  });

  describe('L2→L3 降级', () => {
    it('L2 校验失败后应降级到 L3', async () => {
      const { generateText } = await import('ai');
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      };

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
        );

      const result = await service.executeStructuredOutput(deepseekRequest);

      expect(result.outputFormatLevel).toBe('L3');
      expect(result.degraded).toBe(true);
      expect(result.data).toEqual({ name: 'from-l3' });
      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L2',
        'L3',
      ]);
      expect(result.attempts[0]?.success).toBe(false);
    });
  });

  describe('L3→L4 降级', () => {
    it('L3 校验失败后应降级到 L4，并保留原始文本', async () => {
      const { generateText } = await import('ai');
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      };

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
        );

      const result = await service.executeStructuredOutput(deepseekRequest);

      expect(result.outputFormatLevel).toBe('L4');
      expect(result.degraded).toBe(true);
      expect(result.data).toEqual({ name: 'from-l4' });
      expect(result.rawText).toBe('回答如下：{"name":"from-l4"}');
      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L2',
        'L3',
        'L4',
      ]);
      expect(result.attempts[1]).toMatchObject({
        level: 'L3',
        success: false,
        rawOutput: '{"wrong":"shape"}',
      });
    });
  });

  describe('全部失败路径', () => {
    it('所有层级失败时应返回 null 数据与最后一次 rawText', async () => {
      const { generateText } = await import('ai');
      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
      };

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
        );

      const result = await service.executeStructuredOutput(deepseekRequest);

      expect(result.outputFormatLevel).toBe('L4');
      expect(result.degraded).toBe(true);
      expect(result.data).toBeNull();
      expect(result.rawText).toBe('still no structured output');
      expect(result.attempts).toHaveLength(3);
      expect(
        result.attempts.every((attempt) => attempt.success === false),
      ).toBe(true);
    });
  });

  describe('strict 模式', () => {
    it('strict 模式下不应降级到 L3/L4', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('failed', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"wrong":"shape"}',
          }),
        );

      const strictRequest: FormatRequest = {
        ...baseRequest,
        strategy: { ...baseRequest.strategy, strictness: 'strict' },
      };

      const result = await service.executeStructuredOutput(strictRequest);

      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L1',
        'L2',
      ]);
      expect(result.rawText).toBe('{"wrong":"shape"}');
    });
  });

  describe('Provider 不支持原生输出', () => {
    it('deepseek 应从 L2 开始', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({
          text: '{"name":"test"}',
        }),
      );

      const deepseekRequest: FormatRequest = {
        ...baseRequest,
        providerId: 'deepseek',
      };

      const result = await service.executeStructuredOutput(deepseekRequest);

      expect(result.attempts[0]?.level).toBe('L2');
    });
  });

  describe('FormatAttempt 元数据', () => {
    it('每次尝试应记录 level、durationMs、success 与 rawOutput', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText)
        .mockRejectedValueOnce(
          await createNoObjectGeneratedError('L1 fail', '{ broken'),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '{"name":"ok"}',
          }),
        );

      const result = await service.executeStructuredOutput(baseRequest);

      for (const attempt of result.attempts) {
        expect(attempt).toHaveProperty('level');
        expect(attempt).toHaveProperty('durationMs');
        expect(attempt).toHaveProperty('success');
        expect(typeof attempt.durationMs).toBe('number');
      }
      expect(result.attempts[0]?.rawOutput).toBe('{ broken');
      expect(result.attempts[1]?.rawOutput).toBe('{"name":"ok"}');
    });
  });
  describe('structured fallback boundaries', () => {
    it('uses only the start level when degradation is disabled', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockRejectedValueOnce(new Error('provider down'));

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        strategy: { ...baseRequest.strategy, allowDegrade: false },
      });

      expect(result).toMatchObject({
        outputFormatLevel: 'L1',
        degraded: true,
        data: null,
        rawText: undefined,
      });
      expect(result.attempts).toEqual([
        expect.objectContaining({
          level: 'L1',
          success: false,
          error: 'L1 failed: provider down',
        }),
      ]);
    });

    it('starts at L2 for blank schema and accepts any valid JSON', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({ text: '[1,true,null]' }),
      );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        strategy: { ...baseRequest.strategy, outputSchema: '   ' },
      });

      expect(result).toMatchObject({
        outputFormatLevel: 'L2',
        degraded: false,
        data: [1, true, null],
      });
      expect(vi.mocked(generateText).mock.calls[0]?.[0].prompt).toContain(
        'You MUST respond with valid JSON matching this schema:',
      );
    });

    it.each(['none', 'manual'] as const)(
      '%s repair policy parses directly and records invalid JSON',
      async (repairPolicy) => {
        const { generateText } = await import('ai');
        vi.mocked(generateText).mockResolvedValueOnce(
          createGenerateTextResponse({ text: '{invalid}' }),
        );

        const result = await service.executeStructuredOutput({
          ...baseRequest,
          providerId: 'deepseek',
          strategy: {
            ...baseRequest.strategy,
            strictness: 'strict',
            allowDegrade: false,
            repairPolicy,
          },
        });

        expect(result.attempts[0]).toMatchObject({
          level: 'L2',
          success: false,
          rawOutput: '{invalid}',
        });
      },
    );
    it.each([
      [
        'fenced',
        'prefix\n```json\n{"name":"fenced"}\n```\nsuffix',
        { name: 'fenced' },
      ],
      ['object', 'answer: {"name":"object"} thanks', { name: 'object' }],
      ['array', 'answer: [1,2,3] thanks', [1, 2, 3]],
    ] as const)(
      'L4 extracts %s JSON from surrounding prose',
      async (kind, text, data) => {
        const { generateText } = await import('ai');
        vi.mocked(generateText)
          .mockRejectedValueOnce(new Error('L2 unavailable'))
          .mockRejectedValueOnce(new Error('L3 unavailable'))
          .mockResolvedValueOnce(createGenerateTextResponse({ text }));

        const result = await service.executeStructuredOutput({
          ...baseRequest,
          providerId: 'deepseek',
          strategy: {
            ...baseRequest.strategy,
            strictness: 'lenient',
            outputSchema:
              kind === 'array'
                ? JSON.stringify({
                    type: 'array',
                    items: { type: 'number' },
                  })
                : baseSchema,
          },
        });

        expect(result).toMatchObject({
          outputFormatLevel: 'L4',
          data,
          rawText: text,
        });
        expect(result.attempts).toEqual([
          expect.objectContaining({
            level: 'L2',
            success: false,
            error: 'L2 failed: L2 unavailable',
          }),
          expect.objectContaining({
            level: 'L3',
            success: false,
            error: 'L3 failed: L3 unavailable',
          }),
          expect.objectContaining({
            level: 'L4',
            success: true,
            rawOutput: text,
          }),
        ]);
      },
    );

    it('auto repair uses jsonrepair after direct parsing fails', async () => {
      const { generateText } = await import('ai');
      const { jsonrepair } = await import('jsonrepair');
      vi.mocked(jsonrepair).mockReturnValueOnce('{"name":"repaired"}');
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({ text: "{name:'repaired'}" }),
      );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        providerId: 'deepseek',
      });

      expect(result).toMatchObject({
        outputFormatLevel: 'L2',
        data: { name: 'repaired' },
      });
      expect(jsonrepair).toHaveBeenCalledWith("{name:'repaired'}");
    });

    it('rejects empty L2 output before attempting JSON repair', async () => {
      const { generateText } = await import('ai');
      const { jsonrepair } = await import('jsonrepair');
      vi.mocked(generateText).mockResolvedValueOnce(
        createGenerateTextResponse({ text: '   ' }),
      );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        providerId: 'deepseek',
        strategy: {
          ...baseRequest.strategy,
          strictness: 'strict',
          allowDegrade: false,
        },
      });

      expect(result.attempts[0]).toMatchObject({
        level: 'L2',
        success: false,
        error: 'L2 failed: Empty JSON output',
        rawOutput: '   ',
      });
      expect(jsonrepair).not.toHaveBeenCalled();
    });

    it('L3 repairs a string output and derives raw output when text is blank', async () => {
      const { generateText } = await import('ai');
      const { jsonrepair } = await import('jsonrepair');
      vi.mocked(jsonrepair).mockReturnValueOnce('{"name":"l3"}');
      vi.mocked(generateText)
        .mockResolvedValueOnce(
          createGenerateTextResponse({ text: '{"wrong":true}' }),
        )
        .mockResolvedValueOnce(
          createGenerateTextResponse({
            text: '',
            output: "{name:'l3'}",
          }),
        );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        providerId: 'deepseek',
      });

      expect(result).toMatchObject({
        outputFormatLevel: 'L3',
        data: { name: 'l3' },
      });
      expect(result.attempts[1]?.rawOutput).toBe('"{name:\'l3\'}"');
    });

    it('keeps L4 raw text when extracted JSON fails validation', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('L2 unavailable'))
        .mockRejectedValueOnce(new Error('L3 unavailable'))
        .mockResolvedValueOnce(
          createGenerateTextResponse({ text: 'answer {"wrong":true}' }),
        );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        strategy: { ...baseRequest.strategy, strictness: 'lenient' },
        providerId: 'deepseek',
      });

      expect(result.attempts[2]).toMatchObject({
        level: 'L4',
        success: false,
        rawOutput: 'answer {"wrong":true}',
      });
      expect(result.rawText).toBe('answer {"wrong":true}');
    });
    it('omits raw output when native structured-output errors expose non-text payloads', async () => {
      const { generateText } = await import('ai');
      const error = await createNoObjectGeneratedError('native failed', 'text');
      Object.defineProperty(error, 'text', { value: 42 });
      vi.mocked(generateText).mockRejectedValueOnce(error);

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        strategy: { ...baseRequest.strategy, allowDegrade: false },
      });

      expect(result.attempts[0]).toMatchObject({
        level: 'L1',
        success: false,
        error: 'L1 native structured output failed: native failed',
      });
      expect(result.attempts[0]?.rawOutput).toBeUndefined();
    });

    it('falls back to L4 as the maximum for an unknown strictness value', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('L2 unavailable'))
        .mockRejectedValueOnce(new Error('L3 unavailable'))
        .mockResolvedValueOnce(
          createGenerateTextResponse({ text: '{"name":"fallback"}' }),
        );

      const result = await service.executeStructuredOutput({
        ...baseRequest,
        providerId: 'deepseek',
        strategy: {
          ...baseRequest.strategy,
          strictness: 'future-value' as never,
        },
      });

      expect(result).toMatchObject({
        outputFormatLevel: 'L4',
        data: { name: 'fallback' },
      });
      expect(result.attempts.map((attempt) => attempt.level)).toEqual([
        'L2',
        'L3',
        'L4',
      ]);
    });
  });

  describe('JSON Schema conversion contracts', () => {
    it.each([
      [{ type: 'string' }, 'text', true],
      [{ type: 'string' }, 1, false],
      [{ type: 'number' }, 1.5, true],
      [{ type: 'integer' }, 1.5, false],
      [{ type: 'boolean' }, false, true],
      [{ type: 'null' }, null, true],
      [{ type: 'array', items: { type: 'string' } }, ['a'], true],
      [{ type: 'array' }, [1, 'a'], true],
    ] as const)('validates primitive schema %#', (schema, value, success) => {
      expect(
        service.parseJsonSchemaToZod(JSON.stringify(schema)).safeParse(value)
          .success,
      ).toBe(success);
    });

    it('supports required, optional, strict, and typed additional properties', () => {
      const strict = service.parseJsonSchemaToZod(
        JSON.stringify({
          type: 'object',
          properties: {
            required: { type: 'string' },
            optional: { type: 'number' },
          },
          required: ['required'],
          additionalProperties: false,
        }),
      );
      expect(strict.safeParse({ required: 'yes' }).success).toBe(true);
      expect(strict.safeParse({ required: 'yes', extra: true }).success).toBe(
        false,
      );
      expect(strict.safeParse({}).success).toBe(false);

      const catchall = service.parseJsonSchemaToZod(
        JSON.stringify({
          properties: {},
          additionalProperties: { type: 'integer' },
        }),
      );
      expect(catchall.safeParse({ count: 2 }).success).toBe(true);
      expect(catchall.safeParse({ count: 2.5 }).success).toBe(false);
    });

    it('supports enums, anyOf, oneOf, and multi-type unions', () => {
      const enumSchema = service.parseJsonSchemaToZod(
        JSON.stringify({ enum: ['draft', 'published', null] }),
      );
      expect(enumSchema.safeParse('draft').success).toBe(true);
      expect(enumSchema.safeParse(null).success).toBe(true);
      expect(enumSchema.safeParse('other').success).toBe(false);

      const anyOf = service.parseJsonSchemaToZod(
        JSON.stringify({ anyOf: [{ type: 'string' }, { type: 'number' }] }),
      );
      expect(anyOf.safeParse('value').success).toBe(true);
      expect(anyOf.safeParse(3).success).toBe(true);
      expect(anyOf.safeParse(false).success).toBe(false);

      const oneOf = service.parseJsonSchemaToZod(
        JSON.stringify({ oneOf: [{ type: 'boolean' }] }),
      );
      expect(oneOf.safeParse(true).success).toBe(true);

      const multi = service.parseJsonSchemaToZod(
        JSON.stringify({ type: ['string', 'number', 'null'] }),
      );
      expect(multi.safeParse('x').success).toBe(true);
      expect(multi.safeParse(4).success).toBe(true);
      expect(multi.safeParse(null).success).toBe(true);
    });

    it('infers object and array types and applies explicit nullability', () => {
      const inferredObject = service.parseJsonSchemaToZod(
        JSON.stringify({ properties: { value: { type: 'string' } } }),
      );
      expect(inferredObject.safeParse({ value: 'ok' }).success).toBe(true);

      const inferredArray = service.parseJsonSchemaToZod(
        JSON.stringify({ items: { type: 'boolean' } }),
      );
      expect(inferredArray.safeParse([true, false]).success).toBe(true);

      const nullable = service.parseJsonSchemaToZod(
        JSON.stringify({ type: 'string', nullable: true }),
      );
      expect(nullable.safeParse(null).success).toBe(true);

      const emptyTypeWithProperties = service.parseJsonSchemaToZod(
        JSON.stringify({ type: [], properties: { id: { type: 'string' } } }),
      );
      expect(emptyTypeWithProperties.safeParse({ id: 'a' }).success).toBe(true);

      const booleanAdditionalProperties = service.parseJsonSchemaToZod(
        JSON.stringify({ additionalProperties: true }),
      );
      expect(
        booleanAdditionalProperties.safeParse({ arbitrary: 'value' }).success,
      ).toBe(true);
    });

    it('uses a loose object for blank and unconstrained schemas', () => {
      expect(
        service.parseJsonSchemaToZod('   ').safeParse({ any: 1 }).success,
      ).toBe(true);
      const unconstrained = service.parseJsonSchemaToZod('{}');
      expect(unconstrained.safeParse({ any: 1 }).success).toBe(true);
      expect(unconstrained.safeParse('not-an-object').success).toBe(false);
    });
  });
});
