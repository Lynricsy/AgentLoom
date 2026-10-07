import { isRecord } from './type-guards.js';
import type {
  RemoteToolExecutionConfig,
  RemoteToolExecutionRequest,
  RemoteToolExecutionResponse,
} from './types.js';

const REMOTE_TOOL_TIMEOUT_MS = 300_000;
export const REMOTE_TOOL_CALLBACK_TOKEN_HEADER =
  'x-agentloom-sandbox-session-token';

export interface RemoteToolUpdate {
  status: string;
  permissionRequest?: Record<string, unknown>;
}

export interface InvokeRemoteToolParams {
  config: RemoteToolExecutionConfig;
  toolName: string;
  toolCallId: string;
  input: unknown;
  signal?: AbortSignal;
  onUpdate: (update: RemoteToolUpdate) => void;
}

export interface RemoteToolInvocationResult {
  /** 交给模型的文本结果 */
  text: string;
  /**
   * 结构化结果：completed 为回调原始 result；denied 为
   * `{__agentloomToolStatus:'denied', permissionRequest?, payload}`，
   * 与 event-stream 的 normalizeToolExecutionEndResult 约定一致。
   */
  details: unknown;
}

/**
 * 执行一次 AgentLoom 远程工具：先 preflight，server 要求授权时通知
 * awaiting_permission，再以 execute 阶段阻塞等待 server 决议后的结果。
 */
export async function invokeRemoteTool(
  params: InvokeRemoteToolParams,
): Promise<RemoteToolInvocationResult> {
  const { config, toolName, toolCallId, input, signal, onUpdate } = params;
  const preflight = await executeRemoteTool(
    config.callbackUrl,
    config.callbackToken,
    {
      sessionId: config.sessionId,
      toolCallId,
      toolName,
      input,
      phase: 'preflight',
    },
    signal,
  );

  if (preflight.outcome !== 'awaiting_permission') {
    return createRemoteToolResult(preflight);
  }

  onUpdate({
    status: 'awaiting_permission',
    permissionRequest: preflight.permissionRequest,
  });

  const resumed = await executeRemoteTool(
    config.callbackUrl,
    config.callbackToken,
    {
      sessionId: config.sessionId,
      toolCallId,
      toolName,
      input,
      phase: 'execute',
    },
    signal,
  );

  return createRemoteToolResult(resumed);
}

export function formatToolTextResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return 'null';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 远程工具描述里的参数 schema 非对象时，退化为接受任意对象 */
export function normalizeRemoteToolParameters(
  parameters: unknown,
): Record<string, unknown> {
  return isRecord(parameters)
    ? parameters
    : {
        type: 'object',
        additionalProperties: true,
      };
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

function createRemoteToolResult(
  response: RemoteToolExecutionResponse,
): RemoteToolInvocationResult {
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

  return { text: formatToolTextResult(payload), details };
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
