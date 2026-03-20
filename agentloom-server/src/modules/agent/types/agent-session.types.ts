import type { ContentBlock } from './content-block.types';

export type McpTransportType = 'stdio' | 'sse' | 'streamable_http';

export interface McpServerConfig {
  readonly transportType: McpTransportType;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly url?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ServerSandboxBinding {
  readonly executionId: string;
}

export type TerminalContinuityStatus =
  | 'running'
  | 'exited'
  | 'killed'
  | 'released';

export interface TerminalContinuityEntry {
  readonly terminalId: string;
  readonly execId: string;
  readonly cwd: string;
  readonly outputByteLimit: number;
  readonly status: TerminalContinuityStatus;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
}

export interface TerminalContinuityState {
  readonly terminals: TerminalContinuityEntry[];
}

export type SessionMode = 'workflow' | 'conversation';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface SessionContext {
  history: ContentBlock[];
  readonly cwd?: string;
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
  readonly serverSandbox?: ServerSandboxBinding;
  readonly workflowState?: Readonly<Record<string, unknown>>;
  terminalContinuity?: TerminalContinuityState;
}

export interface AgentSession {
  readonly id: string;
  readonly agentId: string;
  readonly mode: SessionMode;
  readonly context: SessionContext;
  status: SessionStatus;
  readonly tenantId?: string;
  llmModelConfigId?: string;
  readonly systemPrompt?: string;
  readonly autonomyMode?: string;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionParams {
  readonly agentId: string;
  readonly mode: SessionMode;
  readonly cwd?: string;
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
  readonly serverSandbox?: ServerSandboxBinding;
  readonly tenantId?: string;
  readonly llmModelConfigId?: string;
  readonly systemPrompt?: string;
  readonly autonomyMode?: string;
  /** 初始上下文数据（在 workflow 模式下映射为 SessionContext.workflowState） */
  readonly context?: Record<string, unknown>;
}
