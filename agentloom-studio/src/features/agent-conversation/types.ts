export type MessageRole = 'user' | 'agent';

export type ToolCallStatus = 'running' | 'completed' | 'failed';

export interface ToolCall {
  id: string;
  name: string;
  args?: string;
  result?: string;
  status: ToolCallStatus;
  startedAt: number;
  updatedAt: number;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
  createdAt: number;
  metadata?: ConversationMessageMetadata;
}

export type SandboxStatus = 'idle' | 'running' | 'error';

export interface TerminalEntry {
  id: string;
  command?: string;
  output: string;
  timestamp: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff?: string;
  content?: string;
}

export type ConversationStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'executing'
  | 'error';

export interface MessageChunkPayload {
  conversationId: string;
  messageId: string;
  chunk: string;
  subagent?: SubAgentEventEnvelope;
}

export interface ThinkingPayload {
  conversationId: string;
  messageId: string;
  content: string;
  subagent?: SubAgentEventEnvelope;
}

export interface ToolCallPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  name: string;
  args?: string;
  subagent?: SubAgentEventEnvelope;
}

export interface ToolResultPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  result: string;
  status: 'completed' | 'failed';
  subagent?: SubAgentEventEnvelope;
}

export interface AgentDonePayload {
  conversationId: string;
  messageId: string;
  subagent?: SubAgentEventEnvelope;
}

export interface TerminalOutputPayload {
  conversationId: string;
  output: string;
  command?: string;
}

export interface FileChangePayload {
  conversationId: string;
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff?: string;
  content?: string;
}

export interface StatusChangedPayload {
  conversationId: string;
  status: 'executing' | 'idle' | 'error';
}

/** 子代理句柄，格式 sa_xxx */
export type SubAgentHandle = `sa_${string}`;

/** 子代理运行状态 */
export type SubAgentRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

/** 子代理事件信封（Socket.IO 每条事件附加） */
export interface SubAgentEventEnvelope {
  handle: SubAgentHandle;
  alias: string;
  depth: number;
  parentToolCallId: string;
}

/** 子代理完成通知（注入到主消息列表的系统通知） */
export interface SubAgentCompletionNotice {
  type: 'subagent_completion_notice';
  handle: SubAgentHandle;
  alias: string;
  status: SubAgentRunStatus;
  error?: string;
}

/** 子代理事件条目（路由后存储在 SubAgentStream.events 中） */
export interface SubAgentEvent {
  id: string;
  type:
    | 'message_chunk'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'done'
    | 'status_changed';
  payload: unknown;
  timestamp: number;
  /** 嵌套子代理信封（递归嵌套时存在） */
  subagent?: SubAgentEventEnvelope;
}

/** 单个子代理的实时流状态 */
export interface SubAgentStream {
  handle: SubAgentHandle;
  alias: string;
  depth: number;
  parentToolCallId: string;
  status: SubAgentRunStatus;
  events: SubAgentEvent[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

/** 带可选元数据的消息扩展（用于 subagent_completion_notice 等系统消息） */
export interface ConversationMessageMetadata {
  type?: string;
  handle?: SubAgentHandle;
  alias?: string;
  status?: SubAgentRunStatus;
  error?: string;
  subagentHandle?: SubAgentHandle;
  subagentAlias?: string;
  subagentStatus?: SubAgentRunStatus;
  subagentError?: string;
  [key: string]: unknown;
}
