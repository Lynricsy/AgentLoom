import { describe, it, expect } from 'vitest';
import {
  OutputFormatStrategySchema,
  DEFAULT_OUTPUT_FORMAT_STRATEGY,
  FormatAttemptSchema,
  FormatResultSchema,
} from '../dto/output-format.dto';
import {
  validateOutputSchema,
  normalizeOutputFormatStrategy,
} from '../output-format.validators';

describe('输出格式 DTO', () => {
  describe('OutputFormatStrategySchema', () => {
    it('应使用默认值解析空对象', () => {
      const result = OutputFormatStrategySchema.parse({});
      expect(result).toEqual(DEFAULT_OUTPUT_FORMAT_STRATEGY);
    });

    it('应拒绝非法 strictness 值', () => {
      expect(() =>
        OutputFormatStrategySchema.parse({ strictness: 'invalid' }),
      ).toThrow();
    });

    it('应正确解析完整配置', () => {
      const config = {
        outputSchema: '{"type":"object"}',
        strictness: 'strict',
        allowDegrade: false,
        repairPolicy: 'none',
      };
      const result = OutputFormatStrategySchema.parse(config);
      expect(result).toEqual(config);
    });
  });

  describe('FormatAttemptSchema', () => {
    it('应解析成功尝试', () => {
      const attempt = {
        level: 'L1',
        durationMs: 150,
        success: true,
        rawOutput: '{"key":"value"}',
      };
      expect(FormatAttemptSchema.parse(attempt)).toEqual(attempt);
    });

    it('应解析失败尝试（含错误信息）', () => {
      const attempt = {
        level: 'L2',
        durationMs: 300,
        success: false,
        error: 'JSON 解析失败',
        rawOutput: 'not json',
      };
      expect(FormatAttemptSchema.parse(attempt)).toEqual(attempt);
    });
  });

  describe('FormatResultSchema', () => {
    it('应解析带 rawText 的降级结果', () => {
      const result = {
        outputFormatLevel: 'L4',
        degraded: true,
        data: { name: 'fallback' },
        attempts: [
          {
            level: 'L3',
            durationMs: 120,
            success: false,
            error: 'L3 validation failed',
            rawOutput: '{"wrong":"shape"}',
          },
          {
            level: 'L4',
            durationMs: 80,
            success: true,
            rawOutput: '回答如下：{"name":"fallback"}',
          },
        ],
        rawText: '回答如下：{"name":"fallback"}',
      };

      expect(FormatResultSchema.parse(result)).toEqual(result);
    });
  });
});

describe('输出格式验证器', () => {
  describe('validateOutputSchema', () => {
    it('空 schema 应返回 valid', () => {
      const result = validateOutputSchema({
        ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
      });
      expect(result.valid).toBe(true);
    });

    it('合法 JSON Schema 应返回 valid', () => {
      const result = validateOutputSchema({
        ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
        outputSchema:
          '{"type":"object","properties":{"name":{"type":"string"}}}',
      });
      expect(result.valid).toBe(true);
    });

    it('非法 JSON 应返回 invalid', () => {
      const result = validateOutputSchema({
        ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
        outputSchema: '{not json}',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('outputSchema is not valid JSON');
    });

    it('缺少 type/properties/$ref 应返回 invalid', () => {
      const result = validateOutputSchema({
        ...DEFAULT_OUTPUT_FORMAT_STRATEGY,
        outputSchema: '{"foo":"bar"}',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'outputSchema must contain type, properties, or $ref',
      );
    });
  });

  describe('normalizeOutputFormatStrategy', () => {
    it('应填充缺失字段的默认值', () => {
      const result = normalizeOutputFormatStrategy({});
      expect(result).toEqual(DEFAULT_OUTPUT_FORMAT_STRATEGY);
    });
  });
});
