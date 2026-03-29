import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { apiClient, toSnakeBody } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import type { PaginatedResponse } from '@/shared/types/api';
import type {
  ConversationMessage,
  ConversationMessageMetadata,
  ConversationStatus,
  FileChange,
  FileTreeNode,
  TerminalEntry,
  SandboxStatus,
  MessageChunkPayload,
  ThinkingPayload,
  ToolResultPayload,
  AgentDonePayload,
  TerminalOutputPayload,
  FileChangePayload,
  StatusChangedPayload,
  SubAgentStream,
  SubAgentEventEnvelope,
  SubAgentRunStatus,
  SubAgentEvent,
  ToolCall,
  ToolCallPermissionRequest,
  ToolCallStatus,
  ToolCallTransition,
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(
  /\/$/,
  '',
);

const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const TERMINAL_ENTRY_LIMIT = 200;
const FILE_CHANGE_LIMIT = 50;

function resolveConversationSocketUrl(): string {
  const origin =
    typeof window === 'undefined'
      ? 'http://localhost'
      : window.location.origin;

  const resolvedUrl = new URL(API_BASE_URL || '/api/v1', origin);
  const pathname = resolvedUrl.pathname.replace(/\/$/, '');

  let basePath = pathname;
  if (basePath.endsWith('/api/v1')) {
    basePath = basePath.slice(0, -'/api/v1'.length);
  } else if (basePath.endsWith('/api')) {
    basePath = basePath.slice(0, -'/api'.length);
  }

  const namespacePath = `${basePath}/agent-conversation`.replace(/\/+/g, '/');
  return new URL(namespacePath, resolvedUrl.origin).toString();
}

interface AgentConversationState {
  conversationId: string | null;
  agentId: string | null;
  agentName: string;

  messages: ConversationMessage[];
  status: ConversationStatus;
  sandboxStatus: SandboxStatus;
  terminalEntries: TerminalEntry[];
  fileTree: FileTreeNode[];
  fileChanges: FileChange[];
  selectedFilePath: string | null;
  subAgentStreams: Record<string, SubAgentStream>;

  connectionError: string | null;
  lastEventId: number;
}

interface AgentConversationActions {
  actions: {
    connect: (params: {
      conversationId: string;
      agentId: string;
      agentName: string;
      authToken?: string;
    }) => void;
    disconnect: () => void;
    sendMessage: (content: string) => void;
    cancelExecution: () => void;
    resolveToolPermission: (
      toolCallId: string,
      action: 'approve' | 'deny',
    ) => Promise<void>;
    selectFile: (path: string | null) => void;
    loadHistory: (conversationId: string) => Promise<void>;
    reset: () => void;
  };
}

function createInitialState(): AgentConversationState {
  return {
    conversationId: null,
    agentId: null,
    agentName: '',
    messages: [],
    status: 'idle',
    sandboxStatus: 'idle',
    terminalEntries: [],
    fileTree: [],
    fileChanges: [],
    selectedFilePath: null,
    subAgentStreams: {},
    connectionError: null,
    lastEventId: 0,
  };
}

let socketInstance: Socket | null = null;

function ensureSubAgentStream(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
): SubAgentStream {
  const existing = streams[envelope.handle];
  if (existing) return existing;

  const stream: SubAgentStream = {
    handle: envelope.handle,
    alias: envelope.alias,
    depth: envelope.depth,
    parentToolCallId: envelope.parentToolCallId,
    status: 'running',
    events: [],
    startedAt: Date.now(),
  };
  streams[envelope.handle] = stream;
  return stream;
}

function pushSubAgentEvent(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
  eventType: SubAgentEvent['type'],
  payload: unknown,
): void {
  const stream = ensureSubAgentStream(streams, envelope);
  stream.events.push({
    id: crypto.randomUUID(),
    type: eventType,
    payload,
    timestamp: Date.now(),
  });

  if (eventType === 'done' && stream.status === 'running') {
    stream.status = 'completed';
    stream.completedAt = Date.now();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return Date.now()
}

function normalizeMessageRole(value: unknown): ConversationMessage['role'] {
  switch (value) {
    case 'user':
    case 'system':
      return value
    default:
      return 'assistant'
  }
}

function normalizeToolCallStatus(value: unknown): ToolCallStatus {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value
    default:
      return 'pending'
  }
}

function normalizeToolCallTransitions(value: unknown): ToolCallTransition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const transitions = value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const to = normalizeOptionalToolCallStatus(item.to)
    const timestamp = readString(item.timestamp)
    const source =
      item.source === 'runtime' ||
      item.source === 'worker' ||
      item.source === 'user'
        ? item.source
        : undefined

    if (!to || !timestamp || !source) {
      return []
    }

    return [
      {
        ...(normalizeOptionalToolCallStatus(item.from)
          ? { from: normalizeOptionalToolCallStatus(item.from) }
          : {}),
        to,
        timestamp,
        source,
      } satisfies ToolCallTransition,
    ]
  })

  return transitions.length > 0 ? transitions : undefined
}

function normalizeOptionalToolCallStatus(
  value: unknown,
): ToolCallStatus | undefined {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value
    default:
      return undefined
  }
}

function normalizePermissionRequest(
  value: unknown,
): ToolCallPermissionRequest | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const description = readString(value.description)
  const resourcePaths = Array.isArray(value.resourcePaths)
    ? value.resourcePaths.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : []

  if (!description && resourcePaths.length === 0) {
    return undefined
  }

  return {
    ...(description ? { description } : {}),
    ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
  }
}

function unwrapConversationPayload(raw: unknown) {
  const root = isRecord(raw) ? raw : {}
  const data = isRecord(root.data) ? root.data : {}
  const event = isRecord(root.event) ? root.event : {}
  const subagent = normalizeSubAgentEnvelope(
    root.subagent ?? data.subagent ?? event.subagent,
  )

  return { root, data, event, subagent }
}

function normalizeSubAgentEnvelope(value: unknown): SubAgentEventEnvelope | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const handle = readString(value.handle)
  const alias = readString(value.alias)
  const parentToolCallId = readString(value.parentToolCallId)
  const depth = typeof value.depth === 'number' && Number.isFinite(value.depth)
    ? value.depth
    : undefined

  if (!handle || !alias || !parentToolCallId || depth === undefined) {
    return undefined
  }

  return {
    handle: handle as SubAgentEventEnvelope['handle'],
    alias,
    depth,
    parentToolCallId,
  }
}

function normalizeMessageMetadata(value: unknown): ConversationMessageMetadata | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return value as ConversationMessageMetadata
}

function normalizeConversationHistoryMessage(raw: unknown): ConversationMessage {
  const record = isRecord(raw) ? raw : {}
  const metadata = normalizeMessageMetadata(record.metadata)

  return {
    id: readString(record.id) ?? crypto.randomUUID(),
    role: normalizeMessageRole(record.role),
    content: readString(record.content) ?? '',
    thinking: extractThinkingContent(record.metadata),
    toolCalls: normalizeHistoryToolCalls(record.toolCalls),
    isStreaming: false,
    createdAt: readTimestamp(record.createdAt),
    ...(metadata ? { metadata } : {}),
  }
}

function normalizeHistoryToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const toolCallId = readString(item.id) ?? readString(item.toolCallId)
    if (!toolCallId) {
      return []
    }

    return [
      {
        id: toolCallId,
        tool:
          readString(item.tool) ??
          readString(item.toolName) ??
          readString(item.name) ??
          'unknown_tool',
        ...(item.args !== undefined ? { args: item.args } : {}),
        ...(item.result !== undefined ? { result: item.result } : {}),
        ...(readString(item.error) ? { error: readString(item.error)! } : {}),
        status: normalizeToolCallStatus(item.status),
        ...(normalizeToolCallTransitions(item.transitions)
          ? { transitions: normalizeToolCallTransitions(item.transitions) }
          : {}),
        ...(normalizePermissionRequest(item.permissionRequest)
          ? { permissionRequest: normalizePermissionRequest(item.permissionRequest) }
          : {}),
        startedAt: readTimestamp(item.startedAt),
        updatedAt: readTimestamp(item.updatedAt),
      } satisfies ToolCall,
    ]
  })
}

function extractThinkingContent(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.decision)) {
    return undefined
  }

  const rationale = readString(value.decision.rationale)
  const suggestedContent = readString(value.decision.suggestedContent)
  const parts = [rationale, suggestedContent].filter(Boolean)

  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function normalizeMessageChunkPayload(raw: unknown): MessageChunkPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw)
  const chunk =
    readString(root.chunk) ??
    readString(data.chunk) ??
    readString(event.content) ??
    readString(data.content)

  if (!chunk) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      'assistant-stream',
    chunk,
    ...(subagent ? { subagent } : {}),
  }
}

function normalizeThinkingPayload(raw: unknown): ThinkingPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw)
  const content =
    readString(root.content) ??
    readString(data.content) ??
    readString(event.content) ??
    readString(event.rationale) ??
    readString(event.suggestedContent)

  if (!content) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      'assistant-stream',
    content,
    ...(subagent ? { subagent } : {}),
  }
}

function normalizeToolPayload(raw: unknown): ToolResultPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw)
  const call = isRecord(event.call) ? event.call : {}
  const toolCallId =
    readString(root.toolCallId) ??
    readString(data.toolCallId) ??
    readString(call.id) ??
    readString(root.id)

  if (!toolCallId) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      'assistant-stream',
    toolCallId,
    tool:
      readString(root.tool) ??
      readString(root.toolName) ??
      readString(root.name) ??
      readString(data.tool) ??
      readString(data.toolName) ??
      readString(data.name) ??
      readString(event.toolName) ??
      readString(call.tool) ??
      'unknown_tool',
    ...(root.args !== undefined
      ? { args: root.args }
      : data.args !== undefined
        ? { args: data.args }
        : call.args !== undefined
          ? { args: call.args }
          : {}),
    status: normalizeToolCallStatus(root.status ?? data.status ?? call.status),
    ...(root.result !== undefined
      ? { result: root.result }
      : data.result !== undefined
        ? { result: data.result }
        : call.result !== undefined
          ? { result: call.result }
          : {}),
    ...(readString(root.error) ??
      readString(data.error) ??
      readString(call.error)
      ? {
          error:
            readString(root.error) ??
            readString(data.error) ??
            readString(call.error),
        }
      : {}),
    ...(normalizeToolCallTransitions(
      root.transitions ?? data.transitions ?? call.transitions,
    )
      ? {
          transitions: normalizeToolCallTransitions(
            root.transitions ?? data.transitions ?? call.transitions,
          ),
        }
      : {}),
    ...(normalizePermissionRequest(
      root.permissionRequest ?? data.permissionRequest ?? call.permissionRequest,
    )
      ? {
          permissionRequest: normalizePermissionRequest(
            root.permissionRequest ?? data.permissionRequest ?? call.permissionRequest,
          ),
        }
      : {}),
    ...(subagent ? { subagent } : {}),
  }
}

function normalizeAgentDonePayload(raw: unknown): AgentDonePayload {
  const { root, data, subagent } = unwrapConversationPayload(raw)

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    ...(readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId)
      ? {
          messageId:
            readString(root.messageId) ??
            readString(data.messageId) ??
            readString(root.stepId) ??
            readString(data.stepId),
        }
      : {}),
    ...(subagent ? { subagent } : {}),
  }
}

function normalizeTerminalOutputPayload(raw: unknown): TerminalOutputPayload | null {
  const { root, data, event } = unwrapConversationPayload(raw)
  const output =
    readString(root.output) ??
    readString(data.output) ??
    readString(event.data) ??
    (typeof root.data === 'string' ? root.data : undefined)

  if (!output) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    output,
    ...(readString(root.command) ?? readString(data.command)
      ? { command: readString(root.command) ?? readString(data.command) }
      : {}),
    ...(readString(root.sessionId) ??
      readString(data.sessionId) ??
      readString(event.sessionId)
      ? {
          sessionId:
            readString(root.sessionId) ??
            readString(data.sessionId) ??
            readString(event.sessionId),
        }
      : {}),
  }
}

function normalizeFileChangePayload(raw: unknown): FileChangePayload | null {
  const { root, data } = unwrapConversationPayload(raw)
  const path = readString(root.path) ?? readString(data.path)
  if (!path) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    path,
    changeType: normalizeFileChangeType(root.changeType ?? data.changeType),
    ...(readString(root.diff) ?? readString(data.diff)
      ? { diff: readString(root.diff) ?? readString(data.diff) }
      : {}),
    ...(readString(root.content) ?? readString(data.content)
      ? { content: readString(root.content) ?? readString(data.content) }
      : {}),
  }
}

function normalizeFileChangeType(
  value: unknown,
): FileChangePayload['changeType'] {
  switch (value) {
    case 'created':
    case 'modified':
    case 'deleted':
      return value
    default:
      return 'modified'
  }
}

function normalizeStatusChangedPayload(raw: unknown): StatusChangedPayload | null {
  const { root, data } = unwrapConversationPayload(raw)
  const status = readString(root.status) ?? readString(data.status)
  if (!status) {
    return null
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      'unknown-conversation',
    status: status as StatusChangedPayload['status'],
  }
}

function ensureAssistantMessage(
  messages: ConversationMessage[],
  messageId: string,
): ConversationMessage {
  let message = messages.find((item) => item.id === messageId)
  if (message) {
    return message
  }

  message = {
    id: messageId,
    role: 'assistant',
    content: '',
    toolCalls: [],
    isStreaming: true,
    createdAt: Date.now(),
  }
  messages.push(message)
  return message
}

function upsertToolCall(message: ConversationMessage, payload: ToolResultPayload): void {
  const existing = message.toolCalls.find((toolCall) => toolCall.id === payload.toolCallId)
  const now = Date.now()
  const nextTool =
    isConcreteToolName(payload.tool) || !existing ? payload.tool : existing.tool

  if (existing) {
    existing.tool = nextTool
    if (payload.args !== undefined) existing.args = payload.args
    if (payload.result !== undefined) existing.result = payload.result
    if (payload.error !== undefined) existing.error = payload.error
    existing.status = payload.status
    if (payload.transitions) existing.transitions = payload.transitions
    if (payload.permissionRequest) existing.permissionRequest = payload.permissionRequest
    existing.updatedAt = now
    return
  }

  message.toolCalls.push({
    id: payload.toolCallId,
    tool: nextTool,
    ...(payload.args !== undefined ? { args: payload.args } : {}),
    ...(payload.result !== undefined ? { result: payload.result } : {}),
    ...(payload.error !== undefined ? { error: payload.error } : {}),
    status: payload.status,
    ...(payload.transitions ? { transitions: payload.transitions } : {}),
    ...(payload.permissionRequest
      ? { permissionRequest: payload.permissionRequest }
      : {}),
    startedAt: now,
    updatedAt: now,
  })
}

function isConcreteToolName(tool: string): boolean {
  return tool.length > 0 && tool !== 'unknown_tool'
}

function finishStreamingAssistantMessage(
  messages: ConversationMessage[],
  messageId?: string,
): void {
  if (messageId) {
    const message = messages.find((item) => item.id === messageId)
    if (message) {
      message.isStreaming = false
      return
    }
  }

  const latestStreamingAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.isStreaming)

  if (latestStreamingAssistant) {
    latestStreamingAssistant.isStreaming = false
  }
}

function fileExistsInTree(tree: FileTreeNode[], path: string): boolean {
  for (const node of tree) {
    if (node.path === path) {
      return true
    }
    if (node.children && fileExistsInTree(node.children, path)) {
      return true
    }
  }

  return false
}

export const useAgentConversationStore = create<
  AgentConversationState & AgentConversationActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        actions: {
          connect: ({ conversationId, agentId, agentName, authToken }) => {
            const prev = socketInstance;
            if (prev) {
              prev.removeAllListeners();
              prev.disconnect();
              socketInstance = null;
            }

            set((s) => {
              s.conversationId = conversationId;
              s.agentId = agentId;
              s.agentName = agentName;
              s.status = 'connecting';
              s.connectionError = null;
            });

            const socketUrl = resolveConversationSocketUrl();
            const socket = io(socketUrl, {
              auth: authToken ? { token: authToken } : undefined,
              reconnection: true,
              reconnectionDelay: RECONNECT_DELAY_MS,
              reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
              reconnectionAttempts: Infinity,
            });
            socketInstance = socket;

            socket.on('connect', () => {
              set((s) => {
                s.status = 'connected';
                s.connectionError = null;
              });

              const tenantId = useAuthStore.getState().tenantId ?? '';
              socket.emit(
                'conversation:subscribe',
                { conversationId, tenantId },
                (ack: { status: string; error?: string }) => {
                  if (ack?.status === 'error') {
                    set((s) => {
                      s.connectionError =
                        ack.error ?? 'Subscription failed';
                    });
                  }
                },
              );
            });

            socket.on('disconnect', () => {
              set((s) => {
                s.status = 'idle';
              });
            });

            socket.on('connect_error', (err: Error) => {
              set((s) => {
                s.status = 'error';
                s.connectionError = err.message;
              });
            });

            socket.on(
              'conversation.agent.message_chunk',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeMessageChunkPayload(payload)
                  if (!normalized) {
                    return
                  }

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      'message_chunk',
                      normalized,
                    )
                    return;
                  }

                  const message = ensureAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  )
                  message.content += normalized.chunk
                  message.isStreaming = true
                });
              },
            );

            socket.on(
              'conversation.agent.thinking',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeThinkingPayload(payload)
                  if (!normalized) {
                    return
                  }

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      'thinking',
                      normalized,
                    )
                    return;
                  }

                  const message = ensureAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  )
                  message.thinking = (message.thinking ?? '') + normalized.content
                });
              },
            );

            socket.on(
              'conversation.agent.tool_call',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeToolPayload(payload)
                  if (!normalized) {
                    return
                  }

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      'tool_call',
                      normalized,
                    )
                    return;
                  }

                  const message = ensureAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  )
                  upsertToolCall(message, normalized)
                });
              },
            );

            socket.on(
              'conversation.agent.tool_result',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeToolPayload(payload)
                  if (!normalized) {
                    return
                  }

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      'tool_result',
                      normalized,
                    )
                    return;
                  }

                  const message = ensureAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  )
                  upsertToolCall(message, normalized)
                });
              },
            );

            socket.on(
              'conversation.agent.done',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeAgentDonePayload(payload)

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      'done',
                      normalized,
                    )
                    return;
                  }

                  finishStreamingAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  )
                  s.status = 'connected'
                  s.sandboxStatus = 'idle'
                });
              },
            );

            socket.on(
              'conversation.sandbox.terminal_output',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeTerminalOutputPayload(payload)
                  if (!normalized) {
                    return
                  }

                  s.terminalEntries.push({
                    id: crypto.randomUUID(),
                    command: normalized.command,
                    output: normalized.output,
                    sessionId: normalized.sessionId,
                    timestamp: Date.now(),
                  });
                  if (
                    s.terminalEntries.length > TERMINAL_ENTRY_LIMIT
                  ) {
                    s.terminalEntries = s.terminalEntries.slice(
                      -TERMINAL_ENTRY_LIMIT,
                    );
                  }
                  s.sandboxStatus = 'running';
                });
              },
            );

            socket.on(
              'conversation.sandbox.file_change',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeFileChangePayload(payload)
                  if (!normalized) {
                    return
                  }

                  const existsBeforeChange =
                    fileExistsInTree(s.fileTree, normalized.path) ||
                    s.fileChanges.some((change) => change.path === normalized.path)
                  const changeType =
                    normalized.changeType === 'modified' && !existsBeforeChange
                      ? 'created'
                      : normalized.changeType

                  s.fileChanges.push({
                    path: normalized.path,
                    changeType,
                    diff: normalized.diff,
                    content: normalized.content,
                  });
                  if (s.fileChanges.length > FILE_CHANGE_LIMIT) {
                    s.fileChanges = s.fileChanges.slice(
                      -FILE_CHANGE_LIMIT,
                    );
                  }
                  updateFileTreeFromChange(
                    s.fileTree,
                    normalized.path,
                    changeType,
                  );
                });
              },
            );

            socket.on(
              'conversation.status.changed',
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeStatusChangedPayload(payload)
                  if (!normalized) {
                    return
                  }

                  if (
                    normalized.status === 'running' ||
                    normalized.status === 'executing'
                  ) {
                    s.status = 'executing'
                    s.sandboxStatus = 'running'
                    return
                  }

                  if (
                    normalized.status === 'failed' ||
                    normalized.status === 'error'
                  ) {
                    s.status = 'error'
                    s.sandboxStatus = 'error'
                    return
                  }

                  s.status = 'connected'
                  s.sandboxStatus = 'idle'
                });
              },
            );

            socket.on(
              'conversation.subagent.event',
              (payload: {
                subagent: SubAgentEventEnvelope;
                eventType: SubAgentEvent['type'];
                data: unknown;
              }) => {
                set((s) => {
                  pushSubAgentEvent(
                    s.subAgentStreams,
                    payload.subagent,
                    payload.eventType,
                    payload.data,
                  );
                });
              },
            );

            socket.on(
              'conversation.subagent.status',
              (payload: {
                handle: string;
                status: SubAgentRunStatus;
                error?: string;
              }) => {
                set((s) => {
                  const stream = s.subAgentStreams[payload.handle];
                  if (!stream) return;
                  stream.status = payload.status;
                  if (payload.error) stream.error = payload.error;
                  if (
                    payload.status === 'completed' ||
                    payload.status === 'failed' ||
                    payload.status === 'timeout' ||
                    payload.status === 'cancelled'
                  ) {
                    stream.completedAt ??= Date.now();
                  }
                });
              },
            );
          },

          disconnect: () => {
            if (socketInstance) {
              const { conversationId } = get();
              if (conversationId) {
                socketInstance.emit('conversation:unsubscribe', {
                  conversationId,
                });
              }
              socketInstance.removeAllListeners();
              socketInstance.disconnect();
              socketInstance = null;
            }
            set((s) => {
              s.status = 'idle';
              s.connectionError = null;
            });
          },

          sendMessage: (content) => {
            const { conversationId } = get();
            if (!socketInstance || !conversationId) return;

            const userMessageId = crypto.randomUUID();
            set((s) => {
              s.messages.push({
                id: userMessageId,
                role: 'user',
                content,
                toolCalls: [],
                isStreaming: false,
                createdAt: Date.now(),
              });
              s.status = 'executing';
            });

            socketInstance.emit('conversation:message', {
              conversationId,
              content,
            });
          },

          cancelExecution: () => {
            const { conversationId } = get();
            if (!socketInstance || !conversationId) return;

            socketInstance.emit('conversation:cancel', {
              conversationId,
            });
          },

          resolveToolPermission: async (toolCallId, action) => {
            const { conversationId } = get();
            if (!conversationId) return;

            await apiClient
              .post(
                `agent-conversations/${conversationId}/tool-permissions/${toolCallId}/resolve`,
                { json: toSnakeBody({ action }) },
              )
              .json<void>();

            set((s) => {
              for (const message of s.messages) {
                const toolCall = message.toolCalls.find((item) => item.id === toolCallId)
                if (!toolCall) {
                  continue
                }

                const nextStatus = action === 'approve' ? 'in_progress' : 'denied'
                const now = new Date().toISOString()
                toolCall.transitions = [
                  ...(toolCall.transitions ?? []),
                  {
                    from: toolCall.status,
                    to: nextStatus,
                    timestamp: now,
                    source: 'user',
                  },
                ]
                toolCall.status = nextStatus
                toolCall.updatedAt = Date.now()
              }
            })
          },

          selectFile: (path) => {
            set((s) => {
              s.selectedFilePath = path;
            });
          },

          loadHistory: async (conversationId) => {
            try {
              const response = await apiClient
                .get(`agent-conversations/${conversationId}/messages`)
                .json<PaginatedResponse<unknown>>();

              set((s) => {
                s.messages = response.data.map((message) =>
                  normalizeConversationHistoryMessage(message),
                )
              });
            } catch (error) {
              console.error(
                '[AgentConversation] Failed to load history:',
                error,
              );
            }
          },

          reset: () => {
            get().actions.disconnect();
            set(createInitialState());
          },
        },
      })),
    ),
    { name: 'AgentConversationStore' },
  ),
);

function updateFileTreeFromChange(
  tree: FileTreeNode[],
  filePath: string,
  changeType: 'created' | 'modified' | 'deleted',
): void {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length === 0) return;

  if (changeType === 'deleted') {
    const parentParts = parts.slice(0, -1);
    const fileName = parts[parts.length - 1];
    let current = tree;
    for (const part of parentParts) {
      const dir = current.find(
        (n) => n.name === part && n.type === 'directory',
      );
      if (!dir?.children) return;
      current = dir.children;
    }
    const idx = current.findIndex((n) => n.name === fileName);
    if (idx >= 0) current.splice(idx, 1);
    return;
  }

  let current = tree;
  let currentPath = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const partName = parts[i] as string;
    currentPath += '/' + partName;
    let dir = current.find(
      (n) => n.name === partName && n.type === 'directory',
    );
    if (!dir) {
      dir = {
        name: partName,
        path: currentPath,
        type: 'directory',
        children: [],
      };
      current.push(dir);
    }
    if (!dir.children) dir.children = [];
    current = dir.children;
  }

  const fileName = parts[parts.length - 1] as string;
  const fullPath = currentPath + '/' + fileName;
  const exists = current.find((n) => n.name === fileName);
  if (!exists) {
    current.push({ name: fileName, path: fullPath, type: 'file' });
  }
}

export const useConversationMessages = () =>
  useAgentConversationStore((s) => s.messages);

export const useConversationStatus = () =>
  useAgentConversationStore((s) => s.status);

export const useConversationActions = () =>
  useAgentConversationStore((s) => s.actions);

export const useConversationId = () =>
  useAgentConversationStore((s) => s.conversationId);

export const useTerminalEntries = () =>
  useAgentConversationStore((s) => s.terminalEntries);

export const useFileTree = () =>
  useAgentConversationStore((s) => s.fileTree);

export const useFileChanges = () =>
  useAgentConversationStore((s) => s.fileChanges);

export const useSandboxStatus = () =>
  useAgentConversationStore((s) => s.sandboxStatus);

export const useSelectedFilePath = () =>
  useAgentConversationStore((s) => s.selectedFilePath);

export const useAgentName = () =>
  useAgentConversationStore((s) => s.agentName);

export const useSubAgentStreams = () =>
  useAgentConversationStore((s) => s.subAgentStreams);
