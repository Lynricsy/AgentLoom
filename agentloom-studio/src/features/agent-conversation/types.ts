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
}

export interface ThinkingPayload {
  conversationId: string;
  messageId: string;
  content: string;
}

export interface ToolCallPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  name: string;
  args?: string;
}

export interface ToolResultPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  result: string;
  status: 'completed' | 'failed';
}

export interface AgentDonePayload {
  conversationId: string;
  messageId: string;
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
