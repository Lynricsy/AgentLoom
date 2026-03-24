import type {
  SandboxAgentEvent,
  SseEventEnvelope,
  SseEventParams,
  IAgentSession,
  PermissionCallbackRequest,
  PermissionCallbackResponse,
} from './types.js';

/**
 * 将 pi-coding-agent AgentSessionEvent 转换为 ACP SSE 事件参数。
 * 返回 null 表示该事件不需要推送到客户端。
 */
export function translateEvent(event: SandboxAgentEvent): SseEventParams | null {
  switch (event.type) {
    case 'message_update': {
      const content = event.assistantMessageEvent?.content;
      if (content?.type === 'text' && content.text) {
        return { type: 'text_delta', text: content.text };
      }
      return null;
    }
    case 'tool_execution_start':
      return {
        type: 'tool_call_start',
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: event.input,
      };
    case 'tool_execution_update':
      return {
        type: 'tool_call_update',
        toolCallId: event.toolCallId,
        content: event.content,
      };
    case 'tool_execution_end':
      return {
        type: 'tool_call_end',
        toolCallId: event.toolCallId,
        result: event.result,
      };
    case 'pty_spawned':
      return {
        type: 'pty_spawned',
        sessionId: event.sessionId,
        info: event.info,
      };
    case 'pty_output':
      return {
        type: 'pty_output',
        sessionId: event.sessionId,
        data: event.data,
      };
    case 'pty_exit':
      return {
        type: 'pty_exit',
        sessionId: event.sessionId,
        exitCode: event.exitCode,
        exitSignal: event.exitSignal,
      };
    case 'pty_killed':
      return {
        type: 'pty_killed',
        sessionId: event.sessionId,
      };
    case 'agent_end':
      return { type: 'done' };
    default:
      return null;
  }
}

export function wrapEnvelope(params: SseEventParams): SseEventEnvelope {
  return { jsonrpc: '2.0', method: 'event', params };
}

export function formatSseMessage(envelope: SseEventEnvelope): string {
  return `data: ${JSON.stringify(envelope)}\n\n`;
}

const PERMISSION_TIMEOUT_MS = 30_000;

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const close = () => {
    if (closed) return;
    closed = true;
    end();
  };

  const sendEvent = (params: SseEventParams) => {
    if (closed) return;
    write(formatSseMessage(wrapEnvelope(params)));
  };

  const sendError = (message: string, code?: string) => {
    sendEvent({ type: 'error', message, code });
    sendEvent({ type: 'done' });
    close();
  };

  const unsubscribe = session.subscribe(async (event: SandboxAgentEvent) => {
    if (closed) return;

    if (event.type === 'tool_execution_start' && permissionCallbackUrl) {
      try {
        const allowed = await requestPermission(permissionCallbackUrl, {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: event.input,
          sessionId,
        });
        if (!allowed) {
          sendError(`Tool '${event.toolName}' permission denied`, 'PERMISSION_DENIED');
          return;
        }
      } catch {
        sendError(`Permission callback failed for tool '${event.toolName}'`, 'PERMISSION_ERROR');
        return;
      }
    }

    const params = translateEvent(event);
    if (!params) return;

    sendEvent(params);

    if (params.type === 'done' || params.type === 'error') {
      close();
    }
  });

  return () => {
    unsubscribe();
    close();
  };
}
