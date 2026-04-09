import type {
  SandboxAgentEvent,
  SseEventEnvelope,
  SseEventParams,
  IAgentSession,
  PermissionCallbackRequest,
  PermissionCallbackResponse,
} from "./types.js";

/**
 * 将 pi-coding-agent AgentSessionEvent 转换为 ACP SSE 事件参数。
 * 返回 null 表示该事件不需要推送到客户端。
 */
export function translateEvent(
  event: SandboxAgentEvent,
): SseEventParams | null {
  switch (event.type) {
    case "message_update": {
      const text = readAssistantTextDelta(event);
      if (text) {
        return { type: "text_delta", text };
      }
      return null;
    }
    case "message_end": {
      const providerError = readMessageEndError(event);
      if (providerError) {
        return {
          type: "error",
          message: providerError,
          code: "MODEL_PROVIDER_ERROR",
        };
      }
      return null;
    }
    case "tool_execution_start":
      return {
        type: "tool_call_start",
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: readToolExecutionInput(event),
      };
    case "tool_execution_update":
      return {
        type: "tool_call_update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        content: readToolExecutionUpdateContent(event),
        status: readToolExecutionUpdateStatus(event),
        permissionRequest: readToolExecutionPermissionRequest(
          event.partialResult,
        ),
      };
    case "tool_execution_end":
      const normalizedToolResult = normalizeToolExecutionEndResult(
        event.result,
      );
      return {
        type: "tool_call_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: normalizedToolResult.result,
        isError: event.isError,
        status: normalizedToolResult.status,
        permissionRequest: normalizedToolResult.permissionRequest,
      };
    case "pty_spawned":
      return {
        type: "pty_spawned",
        sessionId: event.sessionId,
        info: event.info,
      };
    case "pty_output":
      return {
        type: "pty_output",
        sessionId: event.sessionId,
        data: event.data,
      };
    case "pty_exit":
      return {
        type: "pty_exit",
        sessionId: event.sessionId,
        exitCode: event.exitCode,
        exitSignal: event.exitSignal,
      };
    case "pty_killed":
      return {
        type: "pty_killed",
        sessionId: event.sessionId,
      };
    case "agent_end":
      return {
        type: "done",
        stopReason:
          typeof event.stopReason === "string" ? event.stopReason : undefined,
      };
    default:
      return null;
  }
}

export function wrapEnvelope(params: SseEventParams): SseEventEnvelope {
  return { jsonrpc: "2.0", method: "event", params };
}

export function formatSseMessage(envelope: SseEventEnvelope): string {
  return `data: ${JSON.stringify(envelope)}\n\n`;
}

const PERMISSION_TIMEOUT_MS = 30_000;
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
export const SSE_HEARTBEAT_MESSAGE = ": ping\n\n";

/**
 * 向 AgentLoom 服务器发起权限回调请求。
 * 30 秒超时默认拒绝，网络错误默认拒绝。
 */
export async function requestPermission(
  callbackUrl: string,
  payload: PermissionCallbackRequest,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) return false;

    const data = (await response.json()) as PermissionCallbackResponse;
    return data.allowed === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamEventOptions {
  session: IAgentSession;
  sessionId: string;
  permissionCallbackUrl?: string;
  write: (chunk: string) => void;
  end: () => void;
}

export function streamSessionEvents(options: StreamEventOptions): () => void {
  const { session, sessionId, permissionCallbackUrl, write, end } = options;
  let closed = false;
  const heartbeatTimer = setInterval(() => {
    if (closed) return;
    write(SSE_HEARTBEAT_MESSAGE);
  }, SSE_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    end();
  };

  const sendEvent = (params: SseEventParams) => {
    if (closed) return;
    write(formatSseMessage(wrapEnvelope(params)));
  };

  const sendError = (message: string, code?: string) => {
    sendEvent({ type: "error", message, code });
    sendEvent({ type: "done" });
    close();
  };

  const unsubscribe = session.subscribe(async (event: SandboxAgentEvent) => {
    if (closed) return;

    if (event.type === "tool_execution_start" && permissionCallbackUrl) {
      try {
        const allowed = await requestPermission(permissionCallbackUrl, {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: readToolExecutionInput(event),
          sessionId,
        });
        if (!allowed) {
          sendError(
            `Tool '${event.toolName}' permission denied`,
            "PERMISSION_DENIED",
          );
          return;
        }
      } catch {
        sendError(
          `Permission callback failed for tool '${event.toolName}'`,
          "PERMISSION_ERROR",
        );
        return;
      }
    }

    const params = translateEvent(event);
    if (!params) return;

    sendEvent(params);

    if (params.type === "done" || params.type === "error") {
      close();
    }
  });

  return () => {
    unsubscribe();
    close();
  };
}

function readAssistantTextDelta(
  event: Extract<SandboxAgentEvent, { type: "message_update" }>,
): string | null {
  const assistantEvent = event.assistantMessageEvent;
  if (!assistantEvent) {
    return null;
  }

  if (
    assistantEvent.type === "text_delta" &&
    typeof assistantEvent.delta === "string" &&
    assistantEvent.delta.length > 0
  ) {
    return assistantEvent.delta;
  }

  if (
    assistantEvent.type === "content" &&
    assistantEvent.content?.type === "text" &&
    assistantEvent.content.text
  ) {
    return assistantEvent.content.text;
  }

  return null;
}

function readToolExecutionInput(
  event: Extract<SandboxAgentEvent, { type: "tool_execution_start" }>,
): unknown {
  if ("args" in event && event.args !== undefined) {
    return event.args;
  }

  return event.input;
}

function readToolExecutionUpdateContent(
  event: Extract<SandboxAgentEvent, { type: "tool_execution_update" }>,
): string | undefined {
  if (typeof event.content === "string" && event.content.length > 0) {
    return event.content;
  }

  if (
    typeof event.partialResult === "string" &&
    event.partialResult.length > 0
  ) {
    return event.partialResult;
  }

  if (isRecord(event.partialResult)) {
    const text = readToolResultText(event.partialResult.content);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function readToolExecutionUpdateStatus(
  event: Extract<SandboxAgentEvent, { type: "tool_execution_update" }>,
): string | undefined {
  if (
    isRecord(event.partialResult) &&
    typeof event.partialResult.status === "string"
  ) {
    return event.partialResult.status;
  }

  return undefined;
}

function readToolExecutionPermissionRequest(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.permissionRequest)) {
    return undefined;
  }

  return value.permissionRequest;
}

function normalizeToolExecutionEndResult(value: unknown): {
  result: unknown;
  status?: string;
  permissionRequest?: Record<string, unknown>;
} {
  if (!isRecord(value)) {
    return { result: value };
  }

  const status =
    typeof value.__agentloomToolStatus === "string"
      ? value.__agentloomToolStatus
      : undefined;
  const permissionRequest = isRecord(value.permissionRequest)
    ? value.permissionRequest
    : undefined;
  const result = "payload" in value ? value.payload : value;

  return {
    result,
    ...(status ? { status } : {}),
    ...(permissionRequest ? { permissionRequest } : {}),
  };
}

function readToolResultText(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value.flatMap((item) => {
    if (
      isRecord(item) &&
      item.type === "text" &&
      typeof item.text === "string" &&
      item.text.length > 0
    ) {
      return [item.text];
    }
    return [];
  });

  return parts.length > 0 ? parts.join("\n") : undefined;
}

function readMessageEndError(
  event: Extract<SandboxAgentEvent, { type: "message_end" }>,
): string | null {
  const message = event.message;
  if (!message || message.role !== "assistant") {
    return null;
  }

  if (message.stopReason !== "error") {
    return null;
  }

  if (
    typeof message.errorMessage === "string" &&
    message.errorMessage.length > 0
  ) {
    return message.errorMessage;
  }

  return "Assistant message ended with provider error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
