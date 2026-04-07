import type { AgentRuntimeMode } from "@/features/agent/types/agentRuntimeMode";

export type MessageRole = "user" | "assistant" | "system";
export type ConversationMessageContentType = "text" | "image" | "file";
export type ConversationAttachmentKind = Exclude<
  ConversationMessageContentType,
  "text"
>;

export interface ConversationAttachment {
  kind: ConversationAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64?: string;
  textContent?: string;
  sandboxPath?: string;
}

export type ToolCallStatus =
  | "pending"
  | "awaiting_permission"
  | "denied"
  | "in_progress"
  | "completed"
  | "failed";

export interface ToolCallTransition {
  from?: ToolCallStatus;
  to: ToolCallStatus;
  timestamp: string;
  source: "runtime" | "worker" | "user";
}

export interface ToolCallPermissionRequest {
  description?: string;
  resourcePaths?: string[];
  domain?: string;
  category?: string;
  riskLevel?: "low" | "medium" | "high";
  sourceLabel?: string;
  targetType?: string;
  targetLabel?: string;
  approveEffect?: string;
  denyEffect?: string;
  diffPreview?: Record<string, unknown>;
  rememberable?: boolean;
}

export interface ToolCall {
  id: string;
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  status: ToolCallStatus;
  transitions?: ToolCallTransition[];
  permissionRequest?: ToolCallPermissionRequest;
  startedAt: number;
  updatedAt: number;
}

/** 消息段，保留文本与工具调用的时间交错顺序 */
export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCallId: string }
  | { type: "thinking"; content: string };

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  contentType?: ConversationMessageContentType;
  thinking?: string;
  toolCalls: ToolCall[];
  /** 按时间顺序保留的消息段（瀑布流渲染用） */
  segments: MessageSegment[];
  isStreaming: boolean;
  createdAt: number;
  metadata?: ConversationMessageMetadata;
}

export interface OutgoingConversationMessage {
  content: string;
  contentType?: ConversationMessageContentType;
  metadata?: ConversationMessageMetadata;
}

export type SandboxStatus = "idle" | "running" | "error";

export interface TerminalEntry {
  id: string;
  command?: string;
  output: string;
  timestamp: number;
  sessionId?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface FileChange {
  path: string;
  changeType: "created" | "modified" | "deleted";
  diff?: string;
  content?: string;
}

export type WorkspaceViewSource = "unavailable" | "snapshot_preview" | "live";

export type ConversationStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "executing"
  | "error";

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
  tool: string;
  args?: unknown;
  status: ToolCallStatus;
  transitions?: ToolCallTransition[];
  permissionRequest?: ToolCallPermissionRequest;
  subagent?: SubAgentEventEnvelope;
}

export interface ToolResultPayload extends ToolCallPayload {
  result?: unknown;
  error?: string;
}

export interface AgentDonePayload {
  conversationId: string;
  messageId?: string;
  subagent?: SubAgentEventEnvelope;
}

export interface TerminalOutputPayload {
  conversationId: string;
  output: string;
  command?: string;
  sessionId?: string;
}

export interface FileChangePayload {
  conversationId: string;
  path: string;
  changeType: "created" | "modified" | "deleted";
  diff?: string;
  content?: string;
}

/** Preparation phases during agent conversation sandbox startup. */
export type PreparationPhase =
  | "queued"
  | "preparing"
  | "sandbox_creating"
  | "agent_initializing"
  | "running";

export interface StatusChangedPayload {
  conversationId: string;
  status:
    | "running"
    | "executing"
    | "completed"
    | "cancelled"
    | "failed"
    | "idle"
    | "error"
    | "preparing";
  /** Current preparation phase during agent conversation startup. */
  phase?: PreparationPhase;
  /** When a failure occurs, identifies which phase failed. */
  failedPhase?: PreparationPhase;
  /** Human-readable error summary (used alongside failedPhase). */
  error?: string;
  /** Raw execution status error message from the realtime contract. */
  errorMessage?: string;
  /** True when an existing sandbox session was reused instead of created. */
  sandboxReused?: boolean;
}

/** 子代理句柄，格式 sa_xxx */
export type SubAgentHandle = `sa_${string}`;

/** 子代理运行状态 */
export type SubAgentRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

/** 子代理事件信封（Socket.IO 每条事件附加） */
export interface SubAgentEventEnvelope {
  handle: SubAgentHandle;
  alias: string;
  depth: number;
  parentToolCallId: string;
}

/** 子代理完成通知（注入到主消息列表的系统通知） */
export interface SubAgentCompletionNotice {
  type: "subagent_completion_notice";
  handle: SubAgentHandle;
  alias: string;
  status: SubAgentRunStatus;
  error?: string;
}

/** 子代理事件条目（路由后存储在 SubAgentStream.events 中） */
export interface SubAgentEvent {
  id: string;
  type:
    | "message_chunk"
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "done"
    | "status_changed";
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
  contentType?: ConversationMessageContentType;
  attachment?: ConversationAttachment;
  attachments?: ConversationAttachment[];
  subAgentStreams?: Record<SubAgentHandle, SubAgentStream>;
  type?: string;
  handle?: SubAgentHandle;
  alias?: string;
  status?: SubAgentRunStatus;
  error?: string;
  errorMessage?: string;
  errorCode?: string;
  rawErrorMessage?: string;
  subagentHandle?: SubAgentHandle;
  subagentAlias?: string;
  subagentStatus?: SubAgentRunStatus;
  subagentError?: string;
  emptyTurn?: boolean;
  incomplete?: boolean;
  [key: string]: unknown;
}

export type { AgentRuntimeMode };
