import { OutputFormatStrategySchema } from './dto/output-format.dto';
import type { OutputFormatStrategy } from './dto/output-format.dto';

/**
 * 验证 OutputFormatStrategy 中的 outputSchema 是否为合法 JSON Schema。
 * 空 schema 视为合法（表示不约束输出格式）。
 */
export function validateOutputSchema(strategy: OutputFormatStrategy): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 空 schema 表示不约束输出格式，视为合法
  if (!strategy.outputSchema || strategy.outputSchema.trim() === '') {
    return { valid: true, errors: [] };
  }

  try {
    const parsed = JSON.parse(strategy.outputSchema);
    if (typeof parsed !== 'object' || parsed === null) {
      errors.push('outputSchema must be a JSON object');
      return { valid: false, errors };
    }
    // 要求至少包含 type / properties / $ref 之一
    if (!parsed.type && !parsed.properties && !parsed.$ref) {
      errors.push('outputSchema must contain type, properties, or $ref');
    }
  } catch {
    errors.push('outputSchema is not valid JSON');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 将原始输入规范化为 OutputFormatStrategy，缺失字段使用默认值填充。
 */
export function normalizeOutputFormatStrategy(
  raw: unknown,
): OutputFormatStrategy {
  return OutputFormatStrategySchema.parse(raw);
}
