/**
 * Sandbox 容器事件解码边界：把 SSE/JSON-RPC 帧纯函数式转换为 AgentEvent，
 * 不访问会话状态、网络或数据库；调用方显式提供非确定性的回退值。
 */
import type {
  AgentEvent,
  PtySessionInfo,
  StopReason,
  ToolCallEvent,
  ToolCallStatus,
  ToolPermissionRequest,
} from './types';
import type {
  ToolCallTransitionRecord,
  ToolCallTransitionSource,
} from './types/tool-call-event.types';

export type SandboxEventDecodeContext = {
  fallbackToolCallId: string;
  fallbackTransitionTimestamp: string;
};

export type SandboxEventDecodeResult = {
  events: AgentEvent[];
  error?: SandboxPromptError;
  denyPendingPermissions?: boolean;
};

type ContainerEventEnvelope = {
  type?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

export class SandboxPromptError extends Error {
  constructor(
    readonly rawMessage: string,
    readonly code?: string,
  ) {
    super(rawMessage);
    this.name = 'SandboxPromptError';
  }
}

export function decodeSandboxServerSentEvent(
  frame: string,
  context: SandboxEventDecodeContext,
): SandboxEventDecodeResult {
  const payload = frame
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

  if (!payload || payload === '[DONE]') return { events: [] };

  const parsed = JSON.parse(payload) as unknown;
  if (isAgentEvent(parsed)) return { events: [parsed] };

  if (
    isRecord(parsed) &&
    parsed.jsonrpc === '2.0' &&
    parsed.method === 'event' &&
    isRecord(parsed.params)
  ) {
    return translateContainerEvent(parsed.params, context);
  }

  if (isRecord(parsed) && typeof parsed.type === 'string') {
    return translateContainerEvent(parsed, context);
  }

  return { events: [] };
}

function translateContainerEvent(
  envelope: ContainerEventEnvelope,
  context: SandboxEventDecodeContext,
): SandboxEventDecodeResult {
  const eventType = typeof envelope.type === 'string' ? envelope.type : null;
  const payload = readContainerEventPayload(envelope);
  const data = isRecord(payload) ? payload : null;

  switch (eventType) {
    case 'text_delta': {
      const content = readTextDelta(payload);
      return content
        ? { events: [{ type: 'message_chunk', content }] }
        : { events: [] };
    }
    case 'tool_call_start':
    case 'tool_call_update':
      return {
        events: [
          {
            type: 'tool_call',
            call: buildToolCallEvent(data, 'in_progress', context),
          },
        ],
      };
    case 'tool_call_end':
      return {
        events: [
          {
            type: 'tool_call',
            call: buildToolCallEvent(
              data,
              readBoolean(data?.isError) || data?.error
                ? 'failed'
                : 'completed',
              context,
            ),
          },
        ],
      };
    case 'done':
      return {
        events: [
          { type: 'done', stopReason: normalizeStopReason(data?.stopReason) },
        ],
      };
    case 'error': {
      const message =
        readString(data?.message) ??
        readString(envelope.message) ??
        readString(payload) ??
        'Sandbox agent error';
      const code = readString(envelope.code) ?? readString(data?.code);
      return {
        events: [],
        error: new SandboxPromptError(message, code),
        denyPendingPermissions: true,
      };
    }
    case 'pty_spawned': {
      const sessionId = readString(data?.sessionId);
      return sessionId
        ? {
            events: [
              {
                type: 'pty.spawned',
                sessionId,
                info: (data?.info ?? {}) as PtySessionInfo,
              },
            ],
          }
        : { events: [] };
    }
    case 'pty_output': {
      const sessionId = readString(data?.sessionId);
      const ptyData = readString(data?.data);
      return sessionId && ptyData != null
        ? { events: [{ type: 'pty.output', sessionId, data: ptyData }] }
        : { events: [] };
    }
    case 'pty_exit': {
      const sessionId = readString(data?.sessionId);
      if (!sessionId) return { events: [] };
      const exitCode =
        typeof data?.exitCode === 'number' ? data.exitCode : undefined;
      const exitSignal =
        typeof data?.exitSignal === 'number' ||
        typeof data?.exitSignal === 'string'
          ? data.exitSignal
          : undefined;
      return {
        events: [
          {
            type: 'pty.exit',
            sessionId,
            ...(exitCode !== undefined && { exitCode }),
            ...(exitSignal !== undefined && { exitSignal }),
          },
        ],
      };
    }
    case 'pty_killed': {
      const sessionId = readString(data?.sessionId);
      return sessionId
        ? { events: [{ type: 'pty.killed', sessionId }] }
        : { events: [] };
    }
    default:
      return { events: [] };
  }
}

function readContainerEventPayload(envelope: ContainerEventEnvelope): unknown {
  if ('data' in envelope && envelope.data !== undefined) return envelope.data;
  const entries = Object.entries(envelope).filter(
    ([key]) => key !== 'type' && key !== 'data',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildToolCallEvent(
  data: Record<string, unknown> | null,
  fallbackStatus: ToolCallStatus,
  context: SandboxEventDecodeContext,
): ToolCallEvent {
  const tool =
    readString(data?.toolName) ?? readString(data?.tool) ?? 'unknown_tool';
  const permissionRequest = normalizePermissionRequest(
    data?.permissionRequest,
    tool,
    data,
  );
  const status =
    readToolCallStatus(data?.status, permissionRequest, fallbackStatus) ??
    fallbackStatus;
  const transitions = normalizeTransitions(
    data?.transitions,
    context.fallbackTransitionTimestamp,
  );
  const error = readToolError(data);

  return {
    id:
      readString(data?.toolCallId) ??
      readString(data?.id) ??
      context.fallbackToolCallId,
    tool,
    args: normalizeToolArgs(data),
    status,
    ...(transitions ? { transitions } : {}),
    ...(data && 'result' in data ? { result: data.result } : {}),
    ...(error ? { error } : {}),
    ...(permissionRequest ? { permissionRequest } : {}),
  };
}

function normalizeToolArgs(
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  for (const candidate of [data?.args, data?.input, data?.arguments]) {
    if (isRecord(candidate)) return candidate;
  }
  return {};
}

function normalizeTransitions(
  value: unknown,
  fallbackTimestamp: string,
): ToolCallEvent['transitions'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const transitions: ToolCallTransitionRecord[] = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const to = readToolCallStatus(entry.to);
    if (!to) return [];
    const from = readToolCallStatus(entry.from);
    const source: ToolCallTransitionSource =
      entry.source === 'runtime' ||
      entry.source === 'worker' ||
      entry.source === 'user'
        ? entry.source
        : 'runtime';
    return [
      {
        ...(from ? { from } : {}),
        to,
        timestamp: readString(entry.timestamp) ?? fallbackTimestamp,
        source,
      },
    ];
  });
  return transitions.length > 0 ? transitions : undefined;
}

function normalizePermissionRequest(
  value: unknown,
  toolName: string,
  data: Record<string, unknown> | null,
): ToolPermissionRequest | undefined {
  if (isRecord(value)) {
    return buildPermissionRequest(
      value,
      readString(value.description) ?? `允许工具 ${toolName} 执行`,
    );
  }
  const description = readString(data?.description);
  const resourcePaths = readStringArray(data?.resourcePaths);
  if (!description && resourcePaths.length === 0) return undefined;
  return buildPermissionRequest(
    data ?? {},
    description ?? `允许工具 ${toolName} 执行`,
  );
}

function buildPermissionRequest(
  value: Record<string, unknown>,
  description: string,
): ToolPermissionRequest {
  const resourcePaths = readStringArray(value.resourcePaths);
  const riskLevel = readRiskLevel(value.riskLevel);
  return {
    description,
    ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
    ...(readString(value.domain) ? { domain: readString(value.domain) } : {}),
    ...(readString(value.category)
      ? { category: readString(value.category) }
      : {}),
    ...(riskLevel ? { riskLevel } : {}),
    ...(readString(value.sourceLabel)
      ? { sourceLabel: readString(value.sourceLabel) }
      : {}),
    ...(readString(value.targetType)
      ? { targetType: readString(value.targetType) }
      : {}),
    ...(readString(value.targetLabel)
      ? { targetLabel: readString(value.targetLabel) }
      : {}),
    ...(readString(value.approveEffect)
      ? { approveEffect: readString(value.approveEffect) }
      : {}),
    ...(readString(value.denyEffect)
      ? { denyEffect: readString(value.denyEffect) }
      : {}),
    ...(isRecord(value.diffPreview) ? { diffPreview: value.diffPreview } : {}),
    ...(typeof value.rememberable === 'boolean'
      ? { rememberable: value.rememberable }
      : {}),
  };
}

function readRiskLevel(
  value: unknown,
): ToolPermissionRequest['riskLevel'] | undefined {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : undefined;
}

function normalizeStopReason(value: unknown): StopReason {
  switch (value) {
    case 'cancelled':
    case 'aborted':
      return 'cancelled';
    case 'max_tokens':
    case 'length':
      return 'max_tokens';
    case 'tool_use':
    case 'toolUse':
      return 'tool_use';
    case 'intervention_required':
      return 'intervention_required';
    default:
      return 'end_turn';
  }
}

function readToolCallStatus(
  value: unknown,
  permissionRequest?: ToolPermissionRequest,
  fallback?: ToolCallStatus,
): ToolCallStatus | undefined {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value;
    default:
      return permissionRequest ? 'awaiting_permission' : fallback;
  }
}

function readTextDelta(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!isRecord(value)) return null;
  return (
    readString(value.delta) ??
    readString(value.content) ??
    readString(value.text) ??
    null
  );
}

function readToolError(
  data: Record<string, unknown> | null,
): string | undefined {
  const error = data?.error;
  if (typeof error === 'string' && error.length > 0) return error;
  if (isRecord(error))
    return readString(error.message) ?? JSON.stringify(error);
  return readBoolean(data?.isError)
    ? (readString(data?.message) ?? 'Sandbox tool execution failed')
    : undefined;
}

function isAgentEvent(value: unknown): value is AgentEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'plan':
      return (
        typeof value.title === 'string' && typeof value.content === 'string'
      );
    case 'message_chunk':
      return typeof value.content === 'string';
    case 'tool_call':
      return isRecord(value.call);
    case 'decision':
      return typeof value.suggestedContent === 'string';
    case 'done':
      return typeof value.stopReason === 'string';
    case 'pty.spawned':
    case 'pty.exit':
    case 'pty.killed':
      return typeof value.sessionId === 'string';
    case 'pty.output':
      return (
        typeof value.sessionId === 'string' && typeof value.data === 'string'
      );
    default:
      return false;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.length > 0,
      )
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
