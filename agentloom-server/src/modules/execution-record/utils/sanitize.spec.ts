import { describe, expect, it } from 'vitest';

import type { StepTelemetryData } from '../../../database/schema/execution-records.schema';
import {
  BYTE_LIMITS,
  sanitizeSensitiveFields,
  sanitizeTelemetryData,
  truncateField,
} from './sanitize';

const TRUNCATED_SUFFIX = '...[truncated]';

function getPrefixBeforeSuffix(value: string): string {
  return value.slice(0, -TRUNCATED_SUFFIX.length);
}

function expectTruncatedStringWithinLimit(value: unknown, maxBytes: number) {
  expect(typeof value).toBe('string');
  const truncated = value as string;
  expect(truncated.endsWith(TRUNCATED_SUFFIX)).toBe(true);
  expect(
    new TextEncoder().encode(getPrefixBeforeSuffix(truncated)).length,
  ).toBeLessThanOrEqual(maxBytes);
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

  it('should truncate long strings and append the truncation suffix', () => {
    expect(truncateField('abcdefghijklmnopqrstuvwxyz', 10)).toBe(
      'abcdefghij...[truncated]',
    );
  });

  it('should return a truncated string when long objects exceed the byte limit', () => {
    const result = truncateField(
      { payload: 'x'.repeat(200), marker: 'tail' },
      20,
    );

    expect(typeof result).toBe('string');
    expect(result).toContain(TRUNCATED_SUFFIX);
  });

  it('should preserve null, undefined and empty strings', () => {
    expect(truncateField(null, 10)).toBeNull();
    expect(truncateField(undefined, 10)).toBeUndefined();
    expect(truncateField('', 10)).toBe('');
  });

  it('should follow UTF-8 byte slicing behavior for chinese and emoji characters', () => {
    const value = '狐娘🙂执行记录';
    const maxBytes = 7;
    const expectedPrefix = new TextDecoder().decode(
      new TextEncoder().encode(value).slice(0, maxBytes),
    );

    expect(truncateField(value, maxBytes)).toBe(
      `${expectedPrefix}${TRUNCATED_SUFFIX}`,
    );
  });
});

describe('sanitizeSensitiveFields', () => {
  it('should redact all supported sensitive key patterns recursively', () => {
    const sanitized = sanitizeSensitiveFields({
      apiKey: 'api-key-value',
      secretKey: 'secret-value',
      password: 'password-value',
      bearerToken: 'bearer-token-value',
      connectionCredential: 'credential-value',
      authorizationHeader: 'Bearer abc',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      accessKey: 'access-key-value',
      nested: {
        safe: 'keep-me',
        innerToken: 'nested-token',
      },
      list: [
        {
          passwordHint: 'also-redacted-by-key',
          label: 'item-1',
        },
        'plain-value',
      ],
    });

    expect(sanitized).toEqual({
      apiKey: '[REDACTED]',
      secretKey: '[REDACTED]',
      password: '[REDACTED]',
      bearerToken: '[REDACTED]',
      connectionCredential: '[REDACTED]',
      authorizationHeader: '[REDACTED]',
      privateKey: '[REDACTED]',
      accessKey: '[REDACTED]',
      nested: {
        safe: 'keep-me',
        innerToken: '[REDACTED]',
      },
      list: [
        {
          passwordHint: '[REDACTED]',
          label: 'item-1',
        },
        'plain-value',
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
  it('should sanitize sensitive fields and truncate tool, error, repair and io payloads by byte limits', () => {
    const sanitized = sanitizeTelemetryData(
      createTelemetryData({
        toolCalls: [
          {
            toolName: 'search_docs',
            input: {
              apiKey: 'tool-secret',
              content: 'x'.repeat(BYTE_LIMITS.TOOL_CALL_IO * 2),
            },
            output: {
              accessKey: 'tool-access-key',
              content: 'y'.repeat(BYTE_LIMITS.TOOL_CALL_IO * 2),
            },
            durationMs: 100,
            status: 'completed',
          },
        ],
        errors: [
          {
            errorType: 'tool_error',
            errorMessage: 'e'.repeat(BYTE_LIMITS.ERROR_MESSAGE * 2),
            timestamp: '2026-03-16T10:00:00.000Z',
            nodeId: 'node-1',
            stepId: 'step-1',
          },
        ],
        selfRepairs: [
          {
            originalOutput: {
              secret: 'repair-secret',
              content: 'z'.repeat(BYTE_LIMITS.SELF_REPAIR * 2),
            },
            validationError: 'Validation failed',
            repairAttempts: [
              {
                attemptNumber: 1,
                result: {
                  privateKey: 'repair-private-key',
                  content: 'r'.repeat(BYTE_LIMITS.SELF_REPAIR * 2),
                },
                success: false,
              },
            ],
          },
        ],
        ioSnapshots: {
          stepInput: {
            authorizationHeader: 'Bearer io-secret',
            content: 'i'.repeat(BYTE_LIMITS.IO_SNAPSHOTS * 2),
          },
          stepOutput: {
            password: 'io-password',
            content: 'o'.repeat(BYTE_LIMITS.IO_SNAPSHOTS * 2),
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

    expectTruncatedStringWithinLimit(
      sanitized.toolCalls[0]?.input,
      BYTE_LIMITS.TOOL_CALL_IO,
    );
    expectTruncatedStringWithinLimit(
      sanitized.toolCalls[0]?.output,
      BYTE_LIMITS.TOOL_CALL_IO,
    );
    expectTruncatedStringWithinLimit(
      sanitized.errors[0]?.errorMessage,
      BYTE_LIMITS.ERROR_MESSAGE,
    );
    expectTruncatedStringWithinLimit(
      sanitized.selfRepairs[0]?.originalOutput,
      BYTE_LIMITS.SELF_REPAIR,
    );
    expectTruncatedStringWithinLimit(
      sanitized.selfRepairs[0]?.repairAttempts[0]?.result,
      BYTE_LIMITS.SELF_REPAIR,
    );
    expectTruncatedStringWithinLimit(
      sanitized.ioSnapshots.stepInput,
      BYTE_LIMITS.IO_SNAPSHOTS,
    );
    expectTruncatedStringWithinLimit(
      sanitized.ioSnapshots.stepOutput,
      BYTE_LIMITS.IO_SNAPSHOTS,
    );

    expect(String(sanitized.toolCalls[0]?.input)).toContain('[REDACTED]');
    expect(String(sanitized.toolCalls[0]?.output)).toContain('[REDACTED]');
    expect(String(sanitized.selfRepairs[0]?.originalOutput)).toContain('[REDACTED]');
    expect(
      String(sanitized.selfRepairs[0]?.repairAttempts[0]?.result),
    ).toContain('[REDACTED]');
    expect(String(sanitized.ioSnapshots.stepInput)).toContain('[REDACTED]');
    expect(String(sanitized.ioSnapshots.stepOutput)).toContain('[REDACTED]');
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
            status: 'completed',
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
