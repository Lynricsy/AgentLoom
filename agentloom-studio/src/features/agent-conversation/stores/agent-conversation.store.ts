import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { apiClient } from '@/shared/api/client';
import type {
  ConversationMessage,
  ConversationStatus,
  FileChange,
  FileTreeNode,
  TerminalEntry,
  SandboxStatus,
  MessageChunkPayload,
  ThinkingPayload,
  ToolCallPayload,
  ToolResultPayload,
  AgentDonePayload,
  TerminalOutputPayload,
  FileChangePayload,
  StatusChangedPayload,
  SubAgentStream,
  SubAgentEventEnvelope,
  SubAgentRunStatus,
  SubAgentEvent,
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

              const tenantId = '';
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
              (payload: MessageChunkPayload) => {
                set((s) => {
                  if (payload.subagent) {
                    pushSubAgentEvent(s.subAgentStreams, payload.subagent, 'message_chunk', payload);
                    return;
                  }
                  const msg = s.messages.find(
                    (m) => m.id === payload.messageId,
                  );
                  if (msg) {
                    msg.content += payload.chunk;
                  } else {
                    s.messages.push({
                      id: payload.messageId,
                      role: 'agent',
                      content: payload.chunk,
                      toolCalls: [],
                      isStreaming: true,
                      createdAt: Date.now(),
                    });
                  }
                });
              },
            );

            socket.on(
              'conversation.agent.thinking',
              (payload: ThinkingPayload) => {
                set((s) => {
                  if (payload.subagent) {
                    pushSubAgentEvent(s.subAgentStreams, payload.subagent, 'thinking', payload);
                    return;
                  }
                  const msg = s.messages.find(
                    (m) => m.id === payload.messageId,
                  );
                  if (msg) {
                    msg.thinking =
                      (msg.thinking ?? '') + payload.content;
                  }
                });
              },
            );

            socket.on(
              'conversation.agent.tool_call',
              (payload: ToolCallPayload) => {
                set((s) => {
                  if (payload.subagent) {
                    pushSubAgentEvent(s.subAgentStreams, payload.subagent, 'tool_call', payload);
                    return;
                  }
                  const msg = s.messages.find(
                    (m) => m.id === payload.messageId,
                  );
                  if (msg) {
                    msg.toolCalls.push({
                      id: payload.toolCallId,
                      name: payload.name,
                      args: payload.args,
                      status: 'running',
                      startedAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                  }
                });
              },
            );

            socket.on(
              'conversation.agent.tool_result',
              (payload: ToolResultPayload) => {
                set((s) => {
                  if (payload.subagent) {
                    pushSubAgentEvent(s.subAgentStreams, payload.subagent, 'tool_result', payload);
                    return;
                  }
                  const msg = s.messages.find(
                    (m) => m.id === payload.messageId,
                  );
                  if (msg) {
                    const tc = msg.toolCalls.find(
                      (t) => t.id === payload.toolCallId,
                    );
                    if (tc) {
                      tc.result = payload.result;
                      tc.status = payload.status;
                      tc.updatedAt = Date.now();
                    }
                  }
                });
              },
            );

            socket.on(
              'conversation.agent.done',
              (payload: AgentDonePayload) => {
                set((s) => {
                  if (payload.subagent) {
                    pushSubAgentEvent(s.subAgentStreams, payload.subagent, 'done', payload);
                    return;
                  }
                  const msg = s.messages.find(
                    (m) => m.id === payload.messageId,
                  );
                  if (msg) {
                    msg.isStreaming = false;
                  }
                  s.status = 'connected';
                  s.sandboxStatus = 'idle';
                });
              },
            );

            socket.on(
              'conversation.sandbox.terminal_output',
              (payload: TerminalOutputPayload) => {
                set((s) => {
                  s.terminalEntries.push({
                    id: crypto.randomUUID(),
                    command: payload.command,
                    output: payload.output,
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
              (payload: FileChangePayload) => {
                set((s) => {
                  s.fileChanges.push({
                    path: payload.path,
                    changeType: payload.changeType,
                    diff: payload.diff,
                    content: payload.content,
                  });
                  if (s.fileChanges.length > FILE_CHANGE_LIMIT) {
                    s.fileChanges = s.fileChanges.slice(
                      -FILE_CHANGE_LIMIT,
                    );
                  }
                  updateFileTreeFromChange(
                    s.fileTree,
                    payload.path,
                    payload.changeType,
                  );
                });
              },
            );

            socket.on(
              'conversation.status.changed',
              (payload: StatusChangedPayload) => {
                set((s) => {
                  if (payload.status === 'executing') {
                    s.status = 'executing';
                    s.sandboxStatus = 'running';
                  } else if (payload.status === 'error') {
                    s.status = 'error';
                    s.sandboxStatus = 'error';
                  } else {
                    s.status = 'connected';
                    s.sandboxStatus = 'idle';
                  }
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

          selectFile: (path) => {
            set((s) => {
              s.selectedFilePath = path;
            });
          },

          loadHistory: async (conversationId) => {
            try {
              const data = await apiClient
                .get(`agent-conversations/${conversationId}/messages`)
                .json<ConversationMessage[]>();

              set((s) => {
                s.messages = data.map((m) => ({
                  ...m,
                  toolCalls: m.toolCalls ?? [],
                  isStreaming: false,
                }));
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
