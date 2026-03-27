import { describe, expect, it } from 'vitest';

import type { StepTelemetryData } from '../../../database/schema/execution-records.schema';
import {
  BYTE_LIMITS,
  sanitizeSensitiveFields,
  sanitizeTelemetryData,
  truncateField,
} from './sanitize';

const TRUNCATED_MARKER = '[TRUNCATED]';

function getStringBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function getSerializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : getStringBytes(serialized);
}

function createTelemetryData(
  overrides: Partial<StepTelemetryData> = {},
): StepTelemetryData {
  return {
    toolCalls: [],
    errors: [],
    selfRepairs: [],
    ioSnapshots: {
      stepInput: null,
      stepOutput: null,
    },
    llmInteractions: {
      modelId: 'gpt-4o-mini',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      latencyMs: 4,
    },
    ...overrides,
  };
}

describe('truncateField', () => {
  it('should return the original value when it is within the byte limit', () => {
    const value = { message: 'short payload', count: 1 };

    expect(truncateField(value, 1024)).toEqual(value);
  });

  it('should truncate long strings with the new marker and keep bytes within the limit', () => {
    const result = truncateField('abcdefghijklmnopqrstuvwxyz', 16);

    expect(typeof result).toBe('string');
    expect((result as string).endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(getStringBytes(result as string)).toBeLessThanOrEqual(16);
  });

  it('should preserve object structure when truncating oversized objects', () => {
    const result = truncateField(
      {
        payload: 'x'.repeat(200),
        marker: 'tail',
      },
      80,
    );

    expect(typeof result).toBe('object');
    expect(Array.isArray(result)).toBe(false);
    expect(getSerializedBytes(result)).toBeLessThanOrEqual(80);
    expect(JSON.stringify(result)).toContain(TRUNCATED_MARKER);
  });

  it('should preserve array structure when truncating oversized arrays', () => {
    const result = truncateField(
      ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)],
      50,
    );

    expect(Array.isArray(result)).toBe(true);
    expect(getSerializedBytes(result)).toBeLessThanOrEqual(50);
    expect(JSON.stringify(result)).toContain(TRUNCATED_MARKER);
  });

  it('should preserve null, undefined and empty strings', () => {
    expect(truncateField(null, 10)).toBeNull();
    expect(truncateField(undefined, 10)).toBeUndefined();
    expect(truncateField('', 10)).toBe('');
  });

  it('should handle chinese and emoji characters without breaking the final byte limit', () => {
    const result = truncateField('狐娘🙂执行记录'.repeat(4), 20);

    expect(typeof result).toBe('string');
    expect((result as string).endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(getStringBytes(result as string)).toBeLessThanOrEqual(20);
  });
});

describe('sanitizeSensitiveFields', () => {
  it('should redact sensitive keys recursively while preserving token metrics', () => {
    const sanitized = sanitizeSensitiveFields({
      apiKey: 'api-key-value',
      bearerToken: 'bearer-token-value',
      promptTokens: 12,
      completionTokens: 8,
      nested: {
        accessKey: 'access-key-value',
        totalTokens: 20,
      },
      list: [
        {
          passwordHint: 'also-redacted-by-key',
          inputTokens: 3,
        },
      ],
    });

    expect(sanitized).toEqual({
      apiKey: '[REDACTED]',
      bearerToken: '[REDACTED]',
      promptTokens: 12,
      completionTokens: 8,
      nested: {
        accessKey: '[REDACTED]',
        totalTokens: 20,
      },
      list: [
        {
          passwordHint: '[REDACTED]',
          inputTokens: 3,
        },
      ],
    });
  });

  it('should leave non-object values untouched', () => {
    expect(sanitizeSensitiveFields('plain-text')).toBe('plain-text');
    expect(sanitizeSensitiveFields(42)).toBe(42);
    expect(sanitizeSensitiveFields(null)).toBeNull();
    expect(sanitizeSensitiveFields(undefined)).toBeUndefined();
  });
});

describe('sanitizeTelemetryData', () => {
  it('should sanitize sensitive fields, preserve token counts and keep structured truncation', () => {
    const sanitized = sanitizeTelemetryData(
      createTelemetryData({
        toolCalls: [
          {
            toolName: 'search_docs',
            input: {
              content: 'x'.repeat(BYTE_LIMITS.TOOL_CALL_IO * 2),
              apiKey: 'tool-secret',
              promptTokens: 123,
            },
            output: {
              content: 'y'.repeat(BYTE_LIMITS.TOOL_CALL_IO * 2),
              accessKey: 'tool-access-key',
              totalTokens: 456,
            },
            durationMs: 100,
            status: 'success',
          },
        ],
        errors: [
          {
            errorType: 'tool_error',
            errorMessage: 'e'.repeat(BYTE_LIMITS.ERROR_MESSAGE * 2),
            timestamp: '2026-03-16T10:00:00.000Z',
            nodeId: 'node-1',
            stepId: '550e8400-e29b-41d4-a716-446655440010',
          },
        ],
        selfRepairs: [
          {
            originalOutput: {
              content: 'z'.repeat(BYTE_LIMITS.SELF_REPAIR * 2),
              secret: 'repair-secret',
              promptTokens: 10,
            },
            validationError: 'Validation failed',
            repairAttempts: [
              {
                attemptNumber: 1,
                result: {
                  content: 'r'.repeat(BYTE_LIMITS.SELF_REPAIR * 2),
                  privateKey: 'repair-private-key',
                  completionTokens: 7,
                },
                success: false,
              },
            ],
          },
        ],
        ioSnapshots: {
          stepInput: {
            content: 'i'.repeat(BYTE_LIMITS.IO_SNAPSHOTS * 2),
            authorizationHeader: 'Bearer io-secret',
            inputTokens: 99,
          },
          stepOutput: {
            content: 'o'.repeat(BYTE_LIMITS.IO_SNAPSHOTS * 2),
            password: 'io-password',
            totalTokens: 200,
          },
        },
        llmInteractions: {
          modelId: 'gpt-4.1',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          latencyMs: 2500,
        },
      }),
    );

    expect(
      getSerializedBytes(sanitized.toolCalls[0]?.input),
    ).toBeLessThanOrEqual(BYTE_LIMITS.TOOL_CALL_IO);
    expect(
      getSerializedBytes(sanitized.toolCalls[0]?.output),
    ).toBeLessThanOrEqual(BYTE_LIMITS.TOOL_CALL_IO);
    expect(
      getStringBytes(sanitized.errors[0]?.errorMessage ?? ''),
    ).toBeLessThanOrEqual(BYTE_LIMITS.ERROR_MESSAGE);
    expect(
      getSerializedBytes(sanitized.selfRepairs[0]?.originalOutput),
    ).toBeLessThanOrEqual(BYTE_LIMITS.SELF_REPAIR);
    expect(
      getSerializedBytes(sanitized.selfRepairs[0]?.repairAttempts[0]?.result),
    ).toBeLessThanOrEqual(BYTE_LIMITS.SELF_REPAIR);
    expect(
      getSerializedBytes(sanitized.ioSnapshots.stepInput),
    ).toBeLessThanOrEqual(BYTE_LIMITS.IO_SNAPSHOTS);
    expect(
      getSerializedBytes(sanitized.ioSnapshots.stepOutput),
    ).toBeLessThanOrEqual(BYTE_LIMITS.IO_SNAPSHOTS);

    expect(sanitized.toolCalls[0]?.input).toMatchObject({
      apiKey: '[REDACTED]',
      promptTokens: 123,
    });
    expect(sanitized.toolCalls[0]?.output).toMatchObject({
      accessKey: '[REDACTED]',
      totalTokens: 456,
    });
    expect(JSON.stringify(sanitized.toolCalls[0]?.input)).toContain(
      TRUNCATED_MARKER,
    );
    expect(JSON.stringify(sanitized.toolCalls[0]?.output)).toContain(
      TRUNCATED_MARKER,
    );
    expect(sanitized.errors[0]?.errorMessage.endsWith(TRUNCATED_MARKER)).toBe(
      true,
    );
    expect(sanitized.selfRepairs[0]?.originalOutput).toMatchObject({
      secret: '[REDACTED]',
      promptTokens: 10,
    });
    expect(sanitized.selfRepairs[0]?.repairAttempts[0]?.result).toMatchObject({
      privateKey: '[REDACTED]',
      completionTokens: 7,
    });
    expect(sanitized.ioSnapshots.stepInput).toMatchObject({
      authorizationHeader: '[REDACTED]',
      inputTokens: 99,
    });
    expect(sanitized.ioSnapshots.stepOutput).toMatchObject({
      password: '[REDACTED]',
      totalTokens: 200,
    });
    expect(JSON.stringify(sanitized.ioSnapshots.stepOutput)).toContain(
      TRUNCATED_MARKER,
    );
    expect(sanitized.llmInteractions).toEqual({
      modelId: 'gpt-4.1',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 2500,
    });
  });

  it('should handle null and undefined nested telemetry values gracefully', () => {
    const sanitized = sanitizeTelemetryData(
      createTelemetryData({
        toolCalls: [
          {
            toolName: 'noop',
            input: null,
            output: undefined,
            durationMs: 0,
            status: 'success',
          },
        ],
        selfRepairs: [
          {
            originalOutput: null,
            validationError: 'none',
            repairAttempts: [
              {
                attemptNumber: 1,
                result: undefined,
                success: false,
              },
            ],
          },
        ],
        ioSnapshots: {
          stepInput: null,
          stepOutput: undefined,
        },
      }),
    );

    expect(sanitized.toolCalls[0]).toMatchObject({
      input: null,
      output: undefined,
    });
    expect(sanitized.selfRepairs[0]).toMatchObject({
      originalOutput: null,
    });
    expect(sanitized.selfRepairs[0]?.repairAttempts[0]).toMatchObject({
      result: undefined,
    });
    expect(sanitized.ioSnapshots).toEqual({
      stepInput: null,
      stepOutput: undefined,
    });
  });
});
