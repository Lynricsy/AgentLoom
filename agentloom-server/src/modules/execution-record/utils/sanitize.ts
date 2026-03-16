import type { StepTelemetryData } from '../../../database/schema/execution-records.schema';

const IO_SNAPSHOTS_MAX_BYTES = 10 * 1024; // 10KB
const TOOL_CALL_IO_MAX_BYTES = 5 * 1024; // 5KB
const ERROR_MESSAGE_MAX_BYTES = 2 * 1024; // 2KB
const SELF_REPAIR_MAX_BYTES = 5 * 1024; // 5KB

export const BYTE_LIMITS = {
  IO_SNAPSHOTS: IO_SNAPSHOTS_MAX_BYTES,
  TOOL_CALL_IO: TOOL_CALL_IO_MAX_BYTES,
  ERROR_MESSAGE: ERROR_MESSAGE_MAX_BYTES,
  SELF_REPAIR: SELF_REPAIR_MAX_BYTES,
} as const;

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /authorization/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

/**
 * 按字节限制截断字段值
 * 对字符串直接截断，对对象先 JSON.stringify 再截断
 */
export function truncateField(value: unknown, maxBytes: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  if (bytes.length <= maxBytes) {
    return value;
  }

  // 按字节截断，确保不截断在 UTF-8 多字节字符中间
  const truncated = new TextDecoder().decode(bytes.slice(0, maxBytes));

  // 如果原始值不是字符串，尝试解析回对象
  if (typeof value !== 'string') {
    try {
      return JSON.parse(truncated);
    } catch {
      // 截断导致 JSON 无效，返回截断的字符串
      return truncated + '...[truncated]';
    }
  }

  return truncated + '...[truncated]';
}

/**
 * 递归遍历对象，将敏感字段值替换为 '[REDACTED]'
 */
export function sanitizeSensitiveFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeSensitiveFields(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeSensitiveFields(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 对 StepTelemetryData 应用截断和敏感字段清洗
 */
export function sanitizeTelemetryData(data: StepTelemetryData): StepTelemetryData {
  return {
    toolCalls: data.toolCalls.map((tc) => ({
      ...tc,
      input: truncateField(sanitizeSensitiveFields(tc.input), TOOL_CALL_IO_MAX_BYTES),
      output: truncateField(sanitizeSensitiveFields(tc.output), TOOL_CALL_IO_MAX_BYTES),
    })),
    errors: data.errors.map((err) => ({
      ...err,
      errorMessage: truncateField(err.errorMessage, ERROR_MESSAGE_MAX_BYTES) as string,
    })),
    selfRepairs: data.selfRepairs.map((sr) => ({
      ...sr,
      originalOutput: truncateField(
        sanitizeSensitiveFields(sr.originalOutput),
        SELF_REPAIR_MAX_BYTES,
      ),
      repairAttempts: sr.repairAttempts.map((attempt) => ({
        ...attempt,
        result: truncateField(
          sanitizeSensitiveFields(attempt.result),
          SELF_REPAIR_MAX_BYTES,
        ),
      })),
    })),
    ioSnapshots: {
      stepInput: truncateField(
        sanitizeSensitiveFields(data.ioSnapshots.stepInput),
        IO_SNAPSHOTS_MAX_BYTES,
      ),
      stepOutput: truncateField(
        sanitizeSensitiveFields(data.ioSnapshots.stepOutput),
        IO_SNAPSHOTS_MAX_BYTES,
      ),
    },
    llmInteractions: data.llmInteractions,
  };
}
