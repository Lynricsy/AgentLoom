import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { apiClient, toSnakeBody } from "@/shared/api/client";
import { useAuthStore } from "@/features/auth";
import { fetchWorkspaceFileTree } from "@/features/workspace";
import type { PaginatedResponse } from "@/shared/types/api";
import type {
  ConversationMessage,
  ConversationStatus,
  FileChange,
  FileTreeNode,
  TerminalEntry,
  SandboxStatus,
  SubAgentStream,
  SubAgentEventEnvelope,
  SubAgentRunStatus,
  SubAgentEvent,
  PreparationPhase,
  AgentRuntimeMode,
  OutgoingConversationMessage,
  WorkspaceViewSource,
} from "../types";
import {
  buildOptimisticUserMessage,
  ensureAssistantMessage,
  finishStreamingAssistantMessage,
  mergeHistoryWithLiveTail,
  normalizeAgentDonePayload,
  normalizeConversationExecutionSnapshot,
  normalizeConversationHistoryMessage,
  normalizeFileChangePayload,
  normalizeMessageChunkPayload,
  normalizeOutgoingConversationMessage,
  normalizeStatusChangedPayload,
  normalizeTerminalOutputPayload,
  normalizeThinkingPayload,
  normalizeToolPayload,
  pushSubAgentEvent,
  upsertToolCall,
} from "../lib/conversation-normalizers";
import {
  fileExistsInTree,
  normalizeFileTree,
  shouldTreatWorkspaceTreeAsLive,
  updateFileTreeFromChange,
} from "../lib/file-tree";
import { resolveConversationSocketUrl } from "../lib/conversation-socket";

const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const TERMINAL_ENTRY_LIMIT = 200;
const FILE_CHANGE_LIMIT = 50;
const inFlightHistoryLoads = new Map<string, Promise<void>>();
const inFlightWorkspaceTreeLoads = new Map<string, Promise<void>>();

function trackConversationRequest(
  requests: Map<string, Promise<void>>,
  conversationId: string,
  factory: () => Promise<void>,
): Promise<void> {
  const pending = requests.get(conversationId);
  if (pending) {
    return pending;
  }

  const next = factory().finally(() => {
    if (requests.get(conversationId) === next) {
      requests.delete(conversationId);
    }
  });
  requests.set(conversationId, next);
  return next;
}

function clearTrackedConversationRequests() {
  inFlightHistoryLoads.clear();
  inFlightWorkspaceTreeLoads.clear();
}

interface AgentConversationState {
  conversationId: string | null;
  agentId: string | null;
  agentName: string;
  runtimeMode: AgentRuntimeMode;

  messages: ConversationMessage[];
  status: ConversationStatus;
  sandboxStatus: SandboxStatus;
  terminalEntries: TerminalEntry[];
  fileTree: FileTreeNode[];
  workspaceSource: WorkspaceViewSource;
  workspaceTreeLoading: boolean;
  fileChanges: FileChange[];
  selectedFilePath: string | null;
  subAgentStreams: Record<string, SubAgentStream>;
  agentViewStack: string[];
  hasHistoricalMessages: boolean;
  loadedPublishedVersionId: string | null;

  /** Current preparation phase during sandbox startup (null when not preparing). */
  preparationPhase: PreparationPhase | null;
  /** Timestamp when preparation started (for elapsed time display). */
  preparationStartTime: number | null;
  /** Whether an existing sandbox session was reused. */
  sandboxReused: boolean;
  /** Error message if preparation failed. */
  preparationError: string | null;
  /** Which phase failed during preparation. */
  preparationFailedPhase: PreparationPhase | null;

  executionError: string | null;
  connectionError: string | null;
  lastEventId: number;

  /** Incremented when a title update event is received. Sidebar watches this to refetch. */
  titleUpdateCounter: number;
}

interface AgentConversationActions {
  actions: {
    connect: (params: {
      conversationId: string;
      agentId: string;
      agentName: string;
      runtimeMode: AgentRuntimeMode;
      authToken?: string;
    }) => void;
    disconnect: () => void;
    sendMessage: (message: string | OutgoingConversationMessage) => void;
    cancelExecution: () => void;
    resolveToolPermission: (
      toolCallId: string,
      action: "approve" | "deny",
      rememberScope?: "none" | "conversation_category",
    ) => Promise<void>;
    restartToLatestVersion: () => Promise<string | null>;
    selectFile: (path: string | null) => void;
    loadHistory: (conversationId: string) => Promise<void>;
    loadWorkspacePreview: (
      conversationId: string,
      workspaceId: string,
    ) => Promise<void>;
    loadWorkspaceTree: (conversationId: string) => Promise<void>;
    pushAgentView: (handle: string) => void;
    popAgentView: () => void;
    navigateToAgentView: (index: number) => void;
    reset: () => void;
  };
}

interface ConversationDetailResponse {
  data?: {
    metadata?: Record<string, unknown>;
    messages?: PaginatedResponse<unknown>;
  };
}

function createInitialState(): AgentConversationState {
  return {
    conversationId: null,
    agentId: null,
    agentName: "",
    runtimeMode: "sandbox",
    messages: [],
    status: "idle",
    sandboxStatus: "idle",
    terminalEntries: [],
    fileTree: [],
    workspaceSource: "unavailable",
    workspaceTreeLoading: false,
    fileChanges: [],
    selectedFilePath: null,
    subAgentStreams: {},
    agentViewStack: [],
    hasHistoricalMessages: false,
    loadedPublishedVersionId: null,
    preparationPhase: null,
    preparationStartTime: null,
    sandboxReused: false,
    preparationError: null,
    preparationFailedPhase: null,
    executionError: null,
    connectionError: null,
    lastEventId: 0,
    titleUpdateCounter: 0,
  };
}

let socketInstance: Socket | null = null;

export const useAgentConversationStore = create<
  AgentConversationState & AgentConversationActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        actions: {
          connect: ({
            conversationId,
            agentId,
            agentName,
            runtimeMode,
            authToken,
          }) => {
            const prev = socketInstance;
            if (prev) {
              prev.removeAllListeners();
              prev.disconnect();
              socketInstance = null;
            }

            set((s) => {
              const titleUpdateCounter = s.titleUpdateCounter;
              Object.assign(s, createInitialState());
              s.titleUpdateCounter = titleUpdateCounter;
              s.conversationId = conversationId;
              s.agentId = agentId;
              s.agentName = agentName;
              s.runtimeMode = runtimeMode;
              s.status = "connecting";
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

            socket.on("connect", () => {
              set((s) => {
                s.status = "connected";
                s.connectionError = null;
              });

              const tenantId = useAuthStore.getState().tenantId ?? "";
              socket.emit(
                "conversation:subscribe",
                { conversationId, tenantId },
                (ack: { status: string; error?: string }) => {
                  if (ack?.status === "error") {
                    set((s) => {
                      s.connectionError = ack.error ?? "Subscription failed";
                    });
                  }
                },
              );
            });

            socket.on("disconnect", () => {
              set((s) => {
                s.status = "idle";
              });
            });

            socket.on("connect_error", (err: Error) => {
              set((s) => {
                s.status = "error";
                s.connectionError = err.message;
              });
            });

            socket.on(
              "conversation.agent.message_chunk",
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeMessageChunkPayload(payload);
                  if (!normalized) {
                    return;
                  }

                  if (normalized.subagent) {
                    pushSubAgentEvent(
                      s.subAgentStreams,
                      normalized.subagent,
                      "message_chunk",
                      normalized,
                    );
                    return;
                  }

                  // First message chunk from primary agent clears preparation state
                  if (s.preparationPhase !== null) {
                    s.preparationPhase = null;
                  }

                  const message = ensureAssistantMessage(
                    s.messages,
                    normalized.messageId,
                  );
                  message.content += normalized.chunk;
                  message.isStreaming = true;

                  // 维护 segments 瀑布流顺序
                  const lastSeg = message.segments[message.segments.length - 1];
                  if (lastSeg && lastSeg.type === "text") {
                    lastSeg.content += normalized.chunk;
                  } else {
                    message.segments.push({
                      type: "text",
                      content: normalized.chunk,
                    });
                  }
                });
              },
            );

            socket.on("conversation.agent.thinking", (payload: unknown) => {
              set((s) => {
                const normalized = normalizeThinkingPayload(payload);
                if (!normalized) {
                  return;
                }

                if (normalized.subagent) {
                  pushSubAgentEvent(
                    s.subAgentStreams,
                    normalized.subagent,
                    "thinking",
                    normalized,
                  );
                  return;
                }

                const message = ensureAssistantMessage(
                  s.messages,
                  normalized.messageId,
                );
                message.thinking =
                  (message.thinking ?? "") + normalized.content;

                // 维护 segments 瀑布流顺序
                const lastSeg = message.segments[message.segments.length - 1];
                if (lastSeg && lastSeg.type === "thinking") {
                  lastSeg.content += normalized.content;
                } else {
                  message.segments.push({
                    type: "thinking",
                    content: normalized.content,
                  });
                }
              });
            });

            socket.on("conversation.agent.tool_call", (payload: unknown) => {
              set((s) => {
                const normalized = normalizeToolPayload(payload);
                if (!normalized) {
                  return;
                }

                if (normalized.subagent) {
                  pushSubAgentEvent(
                    s.subAgentStreams,
                    normalized.subagent,
                    "tool_call",
                    normalized,
                  );
                  return;
                }

                const message = ensureAssistantMessage(
                  s.messages,
                  normalized.messageId,
                );
                upsertToolCall(message, normalized);

                // 仅首次出现时追加 segment
                if (
                  !message.segments.some(
                    (seg) =>
                      seg.type === "tool_call" &&
                      seg.toolCallId === normalized.toolCallId,
                  )
                ) {
                  message.segments.push({
                    type: "tool_call",
                    toolCallId: normalized.toolCallId,
                  });
                }
              });
            });

            socket.on("conversation.agent.tool_result", (payload: unknown) => {
              set((s) => {
                const normalized = normalizeToolPayload(payload);
                if (!normalized) {
                  return;
                }

                if (normalized.subagent) {
                  pushSubAgentEvent(
                    s.subAgentStreams,
                    normalized.subagent,
                    "tool_result",
                    normalized,
                  );
                  return;
                }

                const message = ensureAssistantMessage(
                  s.messages,
                  normalized.messageId,
                );
                upsertToolCall(message, normalized);

                // 仅首次出现时追加 segment
                if (
                  !message.segments.some(
                    (seg) =>
                      seg.type === "tool_call" &&
                      seg.toolCallId === normalized.toolCallId,
                  )
                ) {
                  message.segments.push({
                    type: "tool_call",
                    toolCallId: normalized.toolCallId,
                  });
                }
              });
            });

            socket.on("conversation.agent.done", (payload: unknown) => {
              const normalized = normalizeAgentDonePayload(payload);

              set((s) => {
                if (normalized.subagent) {
                  pushSubAgentEvent(
                    s.subAgentStreams,
                    normalized.subagent,
                    "done",
                    normalized,
                  );
                  return;
                }

                finishStreamingAssistantMessage(
                  s.messages,
                  normalized.messageId,
                );

                if (s.status === "error") {
                  return;
                }

                s.status = "connected";
                s.sandboxStatus = "idle";
                // Clear all preparation state on conversation done
                s.preparationPhase = null;
                s.preparationStartTime = null;
                s.sandboxReused = false;
                s.preparationError = null;
                s.preparationFailedPhase = null;
                s.executionError = null;
              });

              void get().actions.loadHistory(normalized.conversationId);
              if (get().runtimeMode === "sandbox") {
                void get().actions.loadWorkspaceTree(normalized.conversationId);
              }
            });

            socket.on(
              "conversation.sandbox.terminal_output",
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeTerminalOutputPayload(payload);
                  if (!normalized) {
                    return;
                  }

                  s.terminalEntries.push({
                    id: crypto.randomUUID(),
                    command: normalized.command,
                    output: normalized.output,
                    sessionId: normalized.sessionId,
                    timestamp: Date.now(),
                  });
                  if (s.terminalEntries.length > TERMINAL_ENTRY_LIMIT) {
                    s.terminalEntries =
                      s.terminalEntries.slice(-TERMINAL_ENTRY_LIMIT);
                  }
                  s.sandboxStatus = "running";
                });
              },
            );

            socket.on(
              "conversation.sandbox.file_change",
              (payload: unknown) => {
                set((s) => {
                  const normalized = normalizeFileChangePayload(payload);
                  if (!normalized) {
                    return;
                  }

                  const existsBeforeChange =
                    fileExistsInTree(s.fileTree, normalized.path) ||
                    s.fileChanges.some(
                      (change) => change.path === normalized.path,
                    );
                  const changeType =
                    normalized.changeType === "modified" && !existsBeforeChange
                      ? "created"
                      : normalized.changeType;

                  s.fileChanges.push({
                    path: normalized.path,
                    changeType,
                    diff: normalized.diff,
                    content: normalized.content,
                  });
                  if (s.fileChanges.length > FILE_CHANGE_LIMIT) {
                    s.fileChanges = s.fileChanges.slice(-FILE_CHANGE_LIMIT);
                  }
                  updateFileTreeFromChange(
                    s.fileTree,
                    normalized.path,
                    changeType,
                  );
                  s.workspaceSource = "live";
                });
              },
            );

            socket.on("conversation.status.changed", (payload: unknown) => {
              set((s) => {
                const normalized = normalizeStatusChangedPayload(payload);
                if (!normalized) {
                  return;
                }

                // Handle preparation phases
                if (normalized.status === "preparing" && normalized.phase) {
                  s.status = "executing";
                  s.preparationPhase = normalized.phase;
                  if (s.preparationStartTime === null) {
                    s.preparationStartTime = Date.now();
                  }
                  if (normalized.sandboxReused != null) {
                    s.sandboxReused = normalized.sandboxReused;
                  }
                  s.executionError = null;
                  return;
                }

                if (
                  normalized.status === "running" ||
                  normalized.status === "executing"
                ) {
                  s.status = "executing";
                  s.sandboxStatus = "running";
                  // Mark preparation as reaching 'running' phase
                  if (s.preparationPhase && s.preparationPhase !== "running") {
                    s.preparationPhase = "running";
                  }
                  if (normalized.phase === "running") {
                    s.preparationPhase = "running";
                  }
                  if (normalized.sandboxReused != null) {
                    s.sandboxReused = normalized.sandboxReused;
                  }
                  s.executionError = null;
                  return;
                }

                if (
                  normalized.status === "failed" ||
                  normalized.status === "error"
                ) {
                  s.status = "error";
                  s.sandboxStatus = "error";
                  s.executionError =
                    normalized.error ?? normalized.errorMessage ?? null;
                  // Track which phase failed
                  if (normalized.failedPhase) {
                    s.preparationFailedPhase = normalized.failedPhase;
                    s.preparationError =
                      normalized.error ?? normalized.errorMessage ?? null;
                  } else {
                    s.preparationPhase = null;
                    s.preparationStartTime = null;
                    s.sandboxReused = false;
                    s.preparationError = null;
                    s.preparationFailedPhase = null;
                  }
                  return;
                }

                s.status = "connected";
                s.sandboxStatus = "idle";
                // Clear preparation state for terminal statuses (completed/cancelled)
                s.preparationPhase = null;
                s.preparationStartTime = null;
                s.sandboxReused = false;
                s.preparationError = null;
                s.preparationFailedPhase = null;
                s.executionError = null;
              });
            });

            socket.on(
              "conversation.subagent.event",
              (payload: {
                subagent: SubAgentEventEnvelope;
                eventType: SubAgentEvent["type"];
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
              "conversation.subagent.status",
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
                    payload.status === "completed" ||
                    payload.status === "failed" ||
                    payload.status === "timeout" ||
                    payload.status === "cancelled"
                  ) {
                    stream.completedAt ??= Date.now();
                  }
                });
              },
            );

            socket.on(
              "conversation.title.updated",
              (_payload: { title: string }) => {
                set((s) => {
                  s.titleUpdateCounter += 1;
                });
              },
            );
          },

          disconnect: () => {
            if (socketInstance) {
              const { conversationId } = get();
              if (conversationId) {
                socketInstance.emit("conversation:unsubscribe", {
                  conversationId,
                });
              }
              socketInstance.removeAllListeners();
              socketInstance.disconnect();
              socketInstance = null;
            }
            set((s) => {
              s.status = "idle";
              s.connectionError = null;
              s.executionError = null;
            });
          },

          sendMessage: (message) => {
            const { conversationId } = get();
            if (!socketInstance || !conversationId) return;

            const outgoing = normalizeOutgoingConversationMessage(message);
            const userMessageId = crypto.randomUUID();
            set((s) => {
              s.messages.push(
                buildOptimisticUserMessage(userMessageId, outgoing),
              );
              s.status = "executing";
              // Reset preparation state for new message cycle
              s.preparationPhase = null;
              s.preparationStartTime = null;
              s.sandboxReused = false;
              s.preparationError = null;
              s.preparationFailedPhase = null;
              s.executionError = null;
            });

            socketInstance.emit(
              "conversation:message",
              {
                conversationId,
                content: outgoing.content,
                ...(outgoing.contentType
                  ? { contentType: outgoing.contentType }
                  : {}),
                ...(outgoing.metadata ? { metadata: outgoing.metadata } : {}),
              },
              (ack?: { status?: string; error?: string }) => {
                if (ack?.status !== "error") {
                  return;
                }

                set((s) => {
                  s.messages = s.messages.filter(
                    (item) => item.id !== userMessageId,
                  );
                  s.status = "connected";
                  s.executionError = ack.error ?? "发送消息失败";
                });
              },
            );
          },

          cancelExecution: () => {
            const { conversationId } = get();
            if (!socketInstance || !conversationId) return;

            socketInstance.emit("conversation:cancel", {
              conversationId,
            });
          },

          resolveToolPermission: async (toolCallId, action, rememberScope) => {
            const { conversationId } = get();
            if (!conversationId) return;

            await apiClient
              .post(
                `agent-conversations/${conversationId}/tool-permissions/${toolCallId}/resolve`,
                {
                  json: toSnakeBody({
                    action,
                    ...(rememberScope ? { rememberScope } : {}),
                  }),
                },
              )
              .json<void>();

            set((s) => {
              for (const message of s.messages) {
                const toolCall = message.toolCalls.find(
                  (item) => item.id === toolCallId,
                );
                if (!toolCall) {
                  continue;
                }

                const nextStatus =
                  action === "approve" ? "in_progress" : "denied";
                const now = new Date().toISOString();
                toolCall.transitions = [
                  ...(toolCall.transitions ?? []),
                  {
                    from: toolCall.status,
                    to: nextStatus,
                    timestamp: now,
                    source: "user",
                  },
                ];
                toolCall.status = nextStatus;
                toolCall.updatedAt = Date.now();
              }
            });
          },

          restartToLatestVersion: async () => {
            const { conversationId } = get();
            if (!conversationId) {
              return null;
            }

            const response = await apiClient
              .post(`agent-conversations/${conversationId}/restart-latest-version`, {
                timeout: false,
              })
              .json<{ data?: { conversationId?: string } }>();

            const nextConversationId = response.data?.conversationId;
            return typeof nextConversationId === "string"
              ? nextConversationId
              : null;
          },

          selectFile: (path) => {
            set((s) => {
              s.selectedFilePath = path;
            });
          },

          pushAgentView: (handle) => {
            set((s) => {
              s.agentViewStack.push(handle);
            });
          },

          popAgentView: () => {
            set((s) => {
              s.agentViewStack.pop();
            });
          },

          navigateToAgentView: (index) => {
            set((s) => {
              s.agentViewStack = s.agentViewStack.slice(0, index);
            });
          },

          loadHistory: async (conversationId) => {
            return trackConversationRequest(
              inFlightHistoryLoads,
              conversationId,
              async () => {
                try {
                  const response = await apiClient
                    .get(`agent-conversations/${conversationId}`)
                    .json<ConversationDetailResponse>();

                  const messageResponse = response.data?.messages;
                  const normalizedMessages = (messageResponse?.data ?? []).map(
                    (message) => normalizeConversationHistoryMessage(message),
                  );
                  const executionSnapshot = normalizeConversationExecutionSnapshot(
                    response.data?.metadata,
                  );

                  set((s) => {
                    if (s.conversationId !== conversationId) {
                      return;
                    }

                    s.hasHistoricalMessages = normalizedMessages.length > 0;
                    s.loadedPublishedVersionId =
                      executionSnapshot.loadedPublishedVersionId ?? null;
                    s.messages = mergeHistoryWithLiveTail(
                      s.messages,
                      normalizedMessages,
                    );

                    if (executionSnapshot.runningState === "running") {
                      s.status = "executing";
                      s.executionError = null;
                      return;
                    }

                    if (executionSnapshot.runningState === "failed") {
                      s.status = "error";
                      s.sandboxStatus = "error";
                      s.executionError =
                        executionSnapshot.errorMessage ??
                        "当前对话执行失败，请检查 Agent 配置后重试。";
                      if (executionSnapshot.failedPhase) {
                        s.preparationFailedPhase = executionSnapshot.failedPhase;
                        s.preparationError = s.executionError;
                      } else {
                        s.preparationPhase = null;
                        s.preparationStartTime = null;
                        s.sandboxReused = false;
                        s.preparationError = null;
                        s.preparationFailedPhase = null;
                      }
                      return;
                    }

                    if (
                      executionSnapshot.runningState === "idle" ||
                      executionSnapshot.runningState === "cancelled"
                    ) {
                      if (s.status === "executing" || s.status === "error") {
                        s.status = "connected";
                        s.sandboxStatus = "idle";
                        s.preparationPhase = null;
                        s.preparationStartTime = null;
                        s.sandboxReused = false;
                        s.preparationError = null;
                        s.preparationFailedPhase = null;
                        s.executionError = null;
                      }
                    }
                  });
                } catch (error) {
                  console.error(
                    "[AgentConversation] Failed to load history:",
                    error,
                  );
                }
              },
            );
          },

          loadWorkspacePreview: async (conversationId, workspaceId) => {
            if (get().runtimeMode === "no_sandbox") {
              return;
            }

            set((s) => {
              s.workspaceTreeLoading = true;
            });

            try {
              const response = await fetchWorkspaceFileTree(workspaceId);
              const normalizedTree = normalizeFileTree(response);

              set((s) => {
                s.workspaceTreeLoading = false;

                if (
                  s.conversationId !== conversationId ||
                  s.runtimeMode === "no_sandbox" ||
                  s.workspaceSource === "live"
                ) {
                  return;
                }

                s.fileTree = normalizedTree;
                s.workspaceSource = "snapshot_preview";
                if (
                  s.selectedFilePath &&
                  !fileExistsInTree(normalizedTree, s.selectedFilePath)
                ) {
                  s.selectedFilePath = null;
                }
              });
            } catch (error) {
              set((s) => {
                s.workspaceTreeLoading = false;
              });
              console.error(
                "[AgentConversation] Failed to preload workspace snapshot tree:",
                error,
              );
            }
          },

          loadWorkspaceTree: async (conversationId) => {
            if (get().runtimeMode === "no_sandbox") {
              set((s) => {
                if (s.conversationId !== conversationId) {
                  return;
                }

                s.fileTree = [];
                s.workspaceSource = "unavailable";
                s.workspaceTreeLoading = false;
                s.selectedFilePath = null;
              });
              return;
            }

            set((s) => {
              s.workspaceTreeLoading = true;
            });

            return trackConversationRequest(
              inFlightWorkspaceTreeLoads,
              conversationId,
              async () => {
                try {
                  const response = await apiClient
                    .get(`agent-conversations/${conversationId}/workspace/tree`)
                    .json<unknown>();
                  const normalizedTree = normalizeFileTree(response);

                  set((s) => {
                    s.workspaceTreeLoading = false;

                    if (s.conversationId !== conversationId) {
                      return;
                    }

                    if (!shouldTreatWorkspaceTreeAsLive(s, normalizedTree)) {
                      if (s.workspaceSource === "unavailable") {
                        s.fileTree = normalizedTree;
                        if (
                          s.selectedFilePath &&
                          !fileExistsInTree(normalizedTree, s.selectedFilePath)
                        ) {
                          s.selectedFilePath = null;
                        }
                      }
                      return;
                    }

                    s.fileTree = normalizedTree;
                    s.workspaceSource = "live";
                    if (
                      s.selectedFilePath &&
                      !fileExistsInTree(normalizedTree, s.selectedFilePath)
                    ) {
                      s.selectedFilePath = null;
                    }
                  });
                } catch (error) {
                  set((s) => {
                    s.workspaceTreeLoading = false;
                  });
                  console.error(
                    "[AgentConversation] Failed to load workspace tree:",
                    error,
                  );
                }
              },
            );
          },

          reset: () => {
            get().actions.disconnect();
            clearTrackedConversationRequests();
            set(createInitialState());
          },
        },
      })),
    ),
    { name: "AgentConversationStore" },
  ),
);

export const useConversationMessages = () =>
  useAgentConversationStore((s) => s.messages);

export const useConversationStatus = () =>
  useAgentConversationStore((s) => s.status);

export const useConversationActions = () =>
  useAgentConversationStore((s) => s.actions);

export const useConversationId = () =>
  useAgentConversationStore((s) => s.conversationId);

export const useLoadedPublishedVersionId = () =>
  useAgentConversationStore((s) => s.loadedPublishedVersionId);

export const useTerminalEntries = () =>
  useAgentConversationStore((s) => s.terminalEntries);

export const useFileTree = () => useAgentConversationStore((s) => s.fileTree);

export const useWorkspaceTreeLoading = () =>
  useAgentConversationStore((s) => s.workspaceTreeLoading);

export const useWorkspaceSource = () =>
  useAgentConversationStore((s) => s.workspaceSource);

export const useFileChanges = () =>
  useAgentConversationStore((s) => s.fileChanges);

export const useSandboxStatus = () =>
  useAgentConversationStore((s) => s.sandboxStatus);

export const useSelectedFilePath = () =>
  useAgentConversationStore((s) => s.selectedFilePath);

export const useAgentName = () => useAgentConversationStore((s) => s.agentName);

export const useSubAgentStreams = () =>
  useAgentConversationStore((s) => s.subAgentStreams);

export const useAgentViewStack = () =>
  useAgentConversationStore((s) => s.agentViewStack);

export const usePreparationPhase = () =>
  useAgentConversationStore((s) => s.preparationPhase);

export const usePreparationStartTime = () =>
  useAgentConversationStore((s) => s.preparationStartTime);

export const useSandboxReused = () =>
  useAgentConversationStore((s) => s.sandboxReused);

export const usePreparationError = () =>
  useAgentConversationStore((s) => s.preparationError);

export const usePreparationFailedPhase = () =>
  useAgentConversationStore((s) => s.preparationFailedPhase);

export const useExecutionError = () =>
  useAgentConversationStore((s) => s.executionError);

export const useConversationConnectionError = () =>
  useAgentConversationStore((s) => s.connectionError);

export const useTitleUpdateCounter = () =>
  useAgentConversationStore((s) => s.titleUpdateCounter);
