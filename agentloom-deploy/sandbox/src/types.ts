/** pi-coding-agent AgentSessionEvent 简化子集，仅含 sandbox SSE 需转发的事件 */
export type SandboxAgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'message_start' }
  | {
      type: 'message_update';
      assistantMessageEvent?: {
        type: 'content';
        content: { type: 'text'; text: string };
      };
    }
  | { type: 'message_end' }
  | {
      type: 'tool_execution_start';
      toolName: string;
      toolCallId: string;
      input: unknown;
    }
  | {
      type: 'tool_execution_update';
      toolCallId: string;
      content?: string;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      result?: unknown;
    }
  | { type: 'pty_spawned'; sessionId: string; info: import('./pty/types.js').PTYSessionInfo }
  | { type: 'pty_output'; sessionId: string; data: string }
  | {
      type: 'pty_exit';
      sessionId: string;
      exitCode?: number;
      exitSignal?: number | string;
    }
  | { type: 'pty_killed'; sessionId: string };

export type AgentEventListener = (event: SandboxAgentEvent) => void;

/** 与 pi-coding-agent AgentSession 的最小兼容接口（便于 mock） */
export interface IAgentSession {
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: AgentEventListener): () => void;
  dispose(): void;
}

/** MCP Server 连接配置（单个服务器） */
export interface McpServerConfig {
  transportType: 'stdio' | 'sse' | 'streamable_http';
  /** stdio transport: 启动命令 */
  command?: string;
  /** stdio transport: 命令参数 */
  args?: string[];
  /** stdio transport: 环境变量 */
  env?: Record<string, string>;
  /** sse/streamable_http transport: 服务器 URL */
  url?: string;
  /** sse/streamable_http transport: 请求头 */
  headers?: Record<string, string>;
}

/** MCP 服务器配置映射：server name → config */
export type McpServersConfig = Record<string, McpServerConfig>;

export interface CreateSessionRequest {
  cwd?: string;
  mcpServers?: McpServersConfig;
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface PromptRequest {
  sessionId: string;
  text: string;
  /** AgentLoom 服务器权限回调 URL（工具执行前 POST 请求，30s 超时默认拒绝） */
  permissionCallbackUrl?: string;
}

export interface AbortRequest {
  sessionId: string;
}

export interface AbortResponse {
  success: boolean;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
}

/** ACP JSON-RPC 2.0 SSE 事件信封 */
export interface SseEventEnvelope {
  jsonrpc: '2.0';
  method: 'event';
  params: SseEventParams;
}

export type SseEventParams =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string; input: unknown }
  | { type: 'tool_call_update'; toolCallId: string; content?: string }
  | { type: 'tool_call_end'; toolCallId: string; result?: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pty_spawned'; sessionId: string; info: import('./pty/types.js').PTYSessionInfo }
  | { type: 'pty_output'; sessionId: string; data: string }
  | {
      type: 'pty_exit';
      sessionId: string;
      exitCode?: number;
      exitSignal?: number | string;
    }
  | { type: 'pty_killed'; sessionId: string };

/** 容器 → AgentLoom 服务器的权限请求（POST 到 permissionCallbackUrl） */
export interface PermissionCallbackRequest {
  toolName: string;
  toolCallId: string;
  input: unknown;
  sessionId: string;
}

export interface PermissionCallbackResponse {
  allowed: boolean;
}

export interface SessionEntry {
  id: string;
  session: IAgentSession;
  createdAt: Date;
  lastActiveAt: Date;
  isStreaming: boolean;
  permissionCallbackUrl?: string;
}
