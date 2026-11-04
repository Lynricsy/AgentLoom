import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from './type-guards.js';
import type {
  RemoteToolExecutionConfig,
  RemoteToolExecutionRequest,
  RemoteToolExecutionResponse,
} from './types.js';

const REMOTE_TOOL_TIMEOUT_MS = 300_000;
export const REMOTE_TOOL_CALLBACK_TOKEN_HEADER =
  'x-agentloom-sandbox-session-token';

/** 远程工具结果里携带图片的保留字段（server 内置工具 generate_image 使用） */
export const REMOTE_TOOL_IMAGES_FIELD = '__agentloomImages';
export const REMOTE_TOOL_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type RemoteToolImageMediaType = (typeof REMOTE_TOOL_IMAGE_MEDIA_TYPES)[number];
const REMOTE_TOOL_IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const REMOTE_TOOL_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** 图片落盘目录（相对会话工作目录） */
const REMOTE_TOOL_IMAGE_DIR = 'generated';

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
  /** 会话工作目录；结果附带的图片写到 <workdir>/generated/ */
  workdir: string;
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
  /** 已落盘的图片（结果含 __agentloomImages 时） */
  images?: Array<{ path: string; mediaType: RemoteToolImageMediaType; data: Uint8Array }>;
}

/**
 * 执行一次 AgentLoom 远程工具：先 preflight，server 要求授权时通知
 * awaiting_permission，再以 execute 阶段阻塞等待 server 决议后的结果。
 */
export async function invokeRemoteTool(
  params: InvokeRemoteToolParams,
): Promise<RemoteToolInvocationResult> {
  const { config, toolName, toolCallId, input, signal, onUpdate, workdir } = params;
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
    return createRemoteToolResult(preflight, workdir);
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

  return createRemoteToolResult(resumed, workdir);
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

async function createRemoteToolResult(
  response: RemoteToolExecutionResponse,
  workdir: string,
): Promise<RemoteToolInvocationResult> {
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

  if (response.outcome === 'completed' && isRecord(payload) && REMOTE_TOOL_IMAGES_FIELD in payload) {
    return extractRemoteToolImages(payload, workdir);
  }

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

/**
 * 把结果里的 `__agentloomImages`（base64）写到 `<workdir>/generated/`，文本与
 * details 换成不含 base64 的 `files` 列表；非法条目跳过并在文本末尾提示。
 */
async function extractRemoteToolImages(
  payload: Record<string, unknown>,
  workdir: string,
): Promise<RemoteToolInvocationResult> {
  const { [REMOTE_TOOL_IMAGES_FIELD]: rawImages, ...rest } = payload;
  const entries = Array.isArray(rawImages) ? rawImages : [];
  const outputDir = path.join(workdir, REMOTE_TOOL_IMAGE_DIR);
  const images: NonNullable<RemoteToolInvocationResult['images']> = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const reason = validateRemoteToolImage(entry);
    if (typeof reason === 'string') {
      skipped.push(reason);
      continue;
    }
    const data = Buffer.from(reason.base64, 'base64');
    if (data.length === 0 || data.length > REMOTE_TOOL_IMAGE_MAX_BYTES) {
      skipped.push(`${reason.fileName}: size ${data.length} bytes out of range`);
      continue;
    }
    await mkdir(outputDir, { recursive: true });
    const filePath = uniqueFilePath(outputDir, reason.fileName);
    await writeFile(filePath, data, { mode: 0o644 });
    images.push({ path: filePath, mediaType: reason.mediaType, data });
  }

  const details = {
    ...rest,
    files: images.map((image) => ({
      path: image.path,
      mediaType: image.mediaType,
      bytes: image.data.length,
    })),
  };
  const notes = skipped.map((reason) => `[image skipped: ${reason}]`);
  const text = [formatToolTextResult(details), ...notes].join('\n');
  return { text, details, ...(images.length > 0 ? { images } : {}) };
}

function validateRemoteToolImage(
  entry: unknown,
): string | { fileName: string; mediaType: RemoteToolImageMediaType; base64: string } {
  if (!isRecord(entry)) return 'entry is not an object';
  const { fileName, mediaType, base64 } = entry;
  if (typeof fileName !== 'string' || !REMOTE_TOOL_IMAGE_FILE_NAME_PATTERN.test(fileName)) {
    return `invalid fileName ${JSON.stringify(fileName)}`;
  }
  if (fileName === '.' || fileName === '..') return `invalid fileName ${JSON.stringify(fileName)}`;
  if (
    typeof mediaType !== 'string' ||
    !(REMOTE_TOOL_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)
  ) {
    return `${fileName}: unsupported mediaType ${JSON.stringify(mediaType)}`;
  }
  if (typeof base64 !== 'string' || base64.length === 0) return `${fileName}: missing base64`;
  return { fileName, mediaType: mediaType as RemoteToolImageMediaType, base64 };
}

/** 同名文件已存在时在扩展名前追加 -<n> */
function uniqueFilePath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let n = 1; existsSync(candidate); n += 1) {
    candidate = path.join(dir, `${stem}-${n}${ext}`);
  }
  return candidate;
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

/**
 * server 的错误响应是 RFC 7807 problem（type/title/status/detail）；旧形状
 * `{message}` / `{error}` 仍兼容。返回文本会原样进入工具结果与 tool_call.error，
 * 因此带上 HTTP 状态与 problem type，便于定位（例如 mcp/stdio-disabled）。
 */
async function readRemoteToolError(response: Response): Promise<string> {
  const prefix = `Remote tool callback failed with status ${response.status}`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return prefix;
  }
  if (!isRecord(body)) return prefix;

  const detail =
    readNonEmptyString(body.detail) ??
    readNonEmptyString(body.message) ??
    readNonEmptyString(body.error) ??
    readNonEmptyString(body.title);
  const type = readNonEmptyString(body.type);
  const head = type ? `${prefix} (${type})` : prefix;
  return detail ? `${head}: ${detail}` : head;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
