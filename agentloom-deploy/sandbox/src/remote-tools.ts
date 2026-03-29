import type { PiToolDefinition } from './agentloom-extension.js';
import type {
  RemoteToolDescriptor,
  RemoteToolExecutionConfig,
  RemoteToolExecutionRequest,
  RemoteToolExecutionResponse,
} from './types.js';
import {
  createTextToolResult,
  formatToolTextResult,
} from './agentloom-extension.js';

const REMOTE_TOOL_TIMEOUT_MS = 300_000;
export const REMOTE_TOOL_CALLBACK_TOKEN_HEADER =
  'x-agentloom-sandbox-session-token';

export function createRemoteToolDefinitions(
  config?: RemoteToolExecutionConfig,
): PiToolDefinition[] {
  if (!config || config.tools.length === 0) {
    return [];
  }

  return config.tools.map((descriptor) => ({
    name: descriptor.name,
    label: descriptor.label,
    description: descriptor.description,
    ...(descriptor.promptSnippet
      ? { promptSnippet: descriptor.promptSnippet }
      : {}),
    parameters: normalizeParameters(descriptor.parameters),
    execute: async (toolCallId, params, signal) => {
      const result = await executeRemoteTool(
        config.callbackUrl,
        config.callbackToken,
        {
          sessionId: config.sessionId,
          toolCallId,
          toolName: descriptor.name,
          input: params,
        },
        signal,
      );

      return createTextToolResult(formatToolTextResult(result), result);
    },
  }));
}

async function executeRemoteTool(
  callbackUrl: string,
  callbackToken: string,
  payload: RemoteToolExecutionRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(REMOTE_TOOL_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [REMOTE_TOOL_CALLBACK_TOKEN_HEADER]: callbackToken,
    },
    body: JSON.stringify(payload),
    signal: combinedSignal,
  });

  if (!response.ok) {
    throw new Error(await readRemoteToolError(response));
  }

  const data = (await response.json()) as RemoteToolExecutionResponse;
  return data.result;
}

async function readRemoteToolError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    if (typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  } catch {}

  return `Remote tool callback failed with status ${response.status}`;
}

function normalizeParameters(
  parameters: RemoteToolDescriptor['parameters'],
): Record<string, unknown> {
  return isRecord(parameters)
    ? parameters
    : {
        type: 'object',
        additionalProperties: true,
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
