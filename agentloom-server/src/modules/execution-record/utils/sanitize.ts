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

const TRUNCATED_MARKER = '[TRUNCATED]';
const STRUCTURE_TRUNCATION_KEY = '__truncated__';
const TOKEN_METRIC_KEY_PATTERN =
  /^(promptTokens|completionTokens|totalTokens|inputTokens|outputTokens)$/i;

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

  if (typeof value === 'string') {
    return truncateString(value, maxBytes);
  }

  if (getSerializedBytes(value) <= maxBytes) {
    return value;
  }

  if (Array.isArray(value)) {
    return truncateArray(value, maxBytes);
  }

  if (typeof value === 'object') {
    return truncateObject(value as Record<string, unknown>, maxBytes);
  }

  return value;
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
    if (isSensitiveKey(key, value)) {
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

function isSensitiveKey(key: string, value: unknown): boolean {
  if (TOKEN_METRIC_KEY_PATTERN.test(key)) {
    return false;
  }

  if (typeof value === 'number' && /token/i.test(key)) {
    return false;
  }

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

function truncateString(value: string, maxBytes: number): string {
  if (getStringBytes(value) <= maxBytes) {
    return value;
  }

  if (getStringBytes(TRUNCATED_MARKER) >= maxBytes) {
    return new TextDecoder().decode(
      new TextEncoder().encode(TRUNCATED_MARKER).slice(0, maxBytes),
    );
  }

  const encoder = new TextEncoder();
  const markerBytes = getStringBytes(TRUNCATED_MARKER);
  let truncated = new TextDecoder().decode(
    encoder.encode(value).slice(0, Math.max(0, maxBytes - markerBytes)),
  );

  while (truncated.length > 0 && getStringBytes(`${truncated}${TRUNCATED_MARKER}`) > maxBytes) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}${TRUNCATED_MARKER}`;
}

function truncateArray(value: unknown[], maxBytes: number): unknown[] {
  if (getSerializedBytes(value) <= maxBytes) {
    return value;
  }

  const result: unknown[] = [];

  for (const item of value) {
    const truncatedItem = truncateField(item, maxBytes);
    const nextValue = [...result, truncatedItem];
    if (getSerializedBytes(nextValue) <= maxBytes) {
      result.push(truncatedItem);
      continue;
    }

    const markedValue = [...result, TRUNCATED_MARKER];
    if (getSerializedBytes(markedValue) <= maxBytes) {
      return markedValue;
    }

    return result.length > 0 ? result : [TRUNCATED_MARKER];
  }

  return result;
}

function truncateObject(
  value: Record<string, unknown>,
  maxBytes: number,
): Record<string, unknown> {
  if (getSerializedBytes(value) <= maxBytes) {
    return value;
  }

  const result: Record<string, unknown> = {};
  const prioritizedEntries = Object.entries(value)
    .map(([key, entryValue], index) => ({
      key,
      originalValue: entryValue,
      truncatedValue: truncateField(entryValue, maxBytes),
      index,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getObjectEntryPriority(left.key, left.originalValue, left.truncatedValue) -
        getObjectEntryPriority(right.key, right.originalValue, right.truncatedValue);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const sizeDifference =
        getSerializedBytes(left.truncatedValue) - getSerializedBytes(right.truncatedValue);
      if (sizeDifference !== 0) {
        return sizeDifference;
      }

      return left.index - right.index;
    });

  for (const { key, truncatedValue } of prioritizedEntries) {
    const nextValue = { ...result, [key]: truncatedValue };
    if (getSerializedBytes(nextValue) <= maxBytes) {
      result[key] = truncatedValue;
      continue;
    }

    const keyMarkerValue = { ...result, [key]: TRUNCATED_MARKER };
    if (getSerializedBytes(keyMarkerValue) <= maxBytes) {
      result[key] = TRUNCATED_MARKER;
    }

    const structureMarkerValue = {
      ...result,
      [STRUCTURE_TRUNCATION_KEY]: TRUNCATED_MARKER,
    };
    if (getSerializedBytes(structureMarkerValue) <= maxBytes) {
      return structureMarkerValue;
    }

    return Object.keys(result).length > 0
      ? result
      : { [STRUCTURE_TRUNCATION_KEY]: TRUNCATED_MARKER };
  }

  return result;
}

function getObjectEntryPriority(
  key: string,
  originalValue: unknown,
  truncatedValue: unknown,
): number {
  if (TOKEN_METRIC_KEY_PATTERN.test(key)) {
    return 0;
  }

  if (isSensitiveKey(key, originalValue)) {
    return 1;
  }

  if (isCompactPrimitive(truncatedValue)) {
    return 2;
  }

  if (Array.isArray(truncatedValue) || isPlainObject(truncatedValue)) {
    return 3;
  }

  return 4;
}

function isCompactPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && !value.includes(TRUNCATED_MARKER))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function getSerializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : getStringBytes(serialized);
}
