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
    execute: async (toolCallId, params, signal, onUpdate) => {
      const preflight = await executeRemoteTool(
        config.callbackUrl,
        config.callbackToken,
        {
          sessionId: config.sessionId,
          toolCallId,
          toolName: descriptor.name,
          input: params,
          phase: 'preflight',
        },
        signal,
      );

      if (preflight.outcome === 'awaiting_permission') {
        await emitToolUpdate(onUpdate, {
          status: 'awaiting_permission',
          permissionRequest: preflight.permissionRequest,
        });

        const resumed = await executeRemoteTool(
          config.callbackUrl,
          config.callbackToken,
          {
            sessionId: config.sessionId,
            toolCallId,
            toolName: descriptor.name,
            input: params,
            phase: 'execute',
          },
          signal,
        );

        return createRemoteToolResult(resumed);
      }

      return createRemoteToolResult(preflight);
    },
  }));
}

async function executeRemoteTool(
  callbackUrl: string,
  callbackToken: string,
  payload: RemoteToolExecutionRequest,
  signal?: AbortSignal,
): Promise<RemoteToolExecutionResponse> {
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

  return (await response.json()) as RemoteToolExecutionResponse;
}

async function emitToolUpdate(
  onUpdate: unknown,
  value: unknown,
): Promise<void> {
  if (typeof onUpdate !== 'function') {
    return;
  }

  await (onUpdate as (value: unknown) => void | Promise<void>)(value);
}

function createRemoteToolResult(
  response: RemoteToolExecutionResponse,
) {
  const payload =
    response.outcome === 'denied'
      ? normalizeDeniedPayload(response)
      : response.outcome === 'awaiting_permission'
        ? {
            success: false,
            data: null,
            error: 'Remote tool is still awaiting permission',
          }
        : response.result;

  const details =
    response.outcome === 'denied'
      ? {
          __agentloomToolStatus: 'denied',
          ...(response.permissionRequest
            ? { permissionRequest: response.permissionRequest }
            : {}),
          payload,
        }
      : payload;

  return createTextToolResult(formatToolTextResult(payload), details);
}

function normalizeDeniedPayload(
  response: Extract<RemoteToolExecutionResponse, { outcome: 'denied' }>,
): unknown {
  if (response.result !== undefined) {
    return response.result;
  }

  return {
    success: false,
    data: {
      denied: true,
    },
    error: 'Permission denied',
  };
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
