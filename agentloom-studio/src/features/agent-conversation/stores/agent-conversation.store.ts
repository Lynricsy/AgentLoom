import type {
  ConversationDetailResponseSwaggerDto,
} from "@agentloom/api-client";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { apiClient, toSnakeBody } from "@/shared/api/client";
import { useAuthStore } from "@/features/auth";
import { fetchWorkspaceFileTree } from "@/features/workspace";
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
  isReplayableEnvelope,
  mergeHistoryWithLiveTail,
  mergeSnapshotWithLiveMessages,
  normalizeAgentDonePayload,
  normalizeConversationExecutionSnapshot,
  normalizeConversationHistoryMessage,
  normalizeConversationSnapshotMessages,
  normalizeFileChangePayload,
  normalizeMessageChunkPayload,
  normalizeOutgoingConversationMessage,
  normalizeStatusChangedPayload,
  normalizeTerminalOutputPayload,
  normalizeThinkingPayload,
  normalizeToolPayload,
  pushSubAgentEvent,
  readEventCursor,
  readLastEventIdField,
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
/** replay 幂等去重窗口：只需覆盖一次重连补发的跨度，不必记住整场会话。 */
const SEEN_EVENT_LIMIT = 2_000;
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

            // 首次订阅由 REST 水合历史，不能带游标——否则服务端会把整个环形缓冲
            // 重放一遍，和历史消息撞车。之后的每一次 Socket.IO 自动重连都必须带上
            // 游标（含 0）：客户端可能在首个事件到达前就断了，离线期间执行完成并
            // 清缓存，省略游标就永远拿不到 snapshot。
            let hasSubscribed = false;

            // 重连补发的定序 + 幂等去重 + 游标推进，**只对可 replay 的执行信封生效**。
            //
            // 为什么需要：`conversation:subscribe` 会先 await client.join(room) 再读
            // 缓冲区。join 之后到达的 live 事件（ID 更高）会抢在 replay 前送达，随后
            // 服务端把 6..10 补一遍。只去重不定序，正文会变成「最后一段一二三四」。
            // 因此重连窗口内先攒着，ack 到达后按 eventId 稳定排序再逐条交给 handler
            // （同 ID 的 STATUS→DONE 按到达顺序保持原序）。
            //
            // 去重键必须带事件名——同一 eventId 会同时用于 STATUS_CHANGED 与 AGENT_DONE。
            //
            // 为什么限定可 replay 信封：gateway 的 buildEventPayload 只是**读取**当前
            // counter 而不递增，synthetic 事件（file_change 按 changedFiles 循环连发、
            // subagent、title）会共用同一个 eventId，攒起来重排只会打乱它们、去重更是
            // 只剩第一条。判据取顶层 executionId：live 与 replay 都有，synthetic 没有。
            interface PendingReplayEvent {
              readonly event: string;
              readonly eventId: number;
              readonly payload: unknown;
              readonly handler: (payload: unknown) => void;
            }

            const seenEvents = new Set<string>();
            const forgetSeenEvents = () => seenEvents.clear();

            // 与 store 的 lastEventId 分开：ack 会把游标推到「服务端进度」，
            // 那不是我们**实际收到**的最大 eventId，拿它判回退会把补发误判成新 epoch。
            let highestReceivedEventId = 0;

            // 非 null ＝重连补发窗口开着（subscribe 已发出、ack 未回）。
            let pendingReplay: PendingReplayEvent[] | null = null;

            const rememberEvent = (key: string) => {
              // 有界：只用于跨 replay 窗口去重，不需要记住整场会话。
              if (seenEvents.size >= SEEN_EVENT_LIMIT) {
                const oldest = seenEvents.values().next().value;
                if (oldest !== undefined) {
                  seenEvents.delete(oldest);
                }
              }
              seenEvents.add(key);
            };

            const deliverEvent = (entry: PendingReplayEvent) => {
              const { event, eventId, payload, handler } = entry;

              // epoch 判定必须在查重之前：新一轮从 1 重新计数时键会与上一轮撞车，
              // 先查重就把新事件当成重复丢了。窗口内的事件走的是 flush 路径，
              // 已按 eventId 升序，不会在这里触发误判。
              if (eventId < highestReceivedEventId) {
                forgetSeenEvents();
                highestReceivedEventId = eventId;
                set((s) => {
                  s.lastEventId = eventId;
                });
              } else if (eventId > highestReceivedEventId) {
                highestReceivedEventId = eventId;
              }

              const key = `${event}:${eventId}`;
              if (seenEvents.has(key)) {
                return;
              }
              rememberEvent(key);

              set((s) => {
                if (eventId > s.lastEventId) {
                  s.lastEventId = eventId;
                }
              });

              handler(payload);
            };

            const flushPendingReplay = () => {
              const queued = pendingReplay;
              pendingReplay = null;
              if (!queued) {
                return;
              }

              queued
                .map((entry, index) => ({ entry, index }))
                .sort(
                  (a, b) =>
                    a.entry.eventId - b.entry.eventId || a.index - b.index,
                )
                .forEach(({ entry }) => deliverEvent(entry));
            };

            const onEvent = (
              event: string,
              handler: (payload: never) => void,
            ) => {
              socket.on(event, (payload: unknown) => {
                const typedHandler = handler as (value: unknown) => void;
                const eventId = isReplayableEnvelope(payload)
                  ? readEventCursor(payload)
                  : null;

                if (eventId === null) {
                  typedHandler(payload);
                  return;
                }

                const entry: PendingReplayEvent = {
                  event,
                  eventId,
                  payload,
                  handler: typedHandler,
                };

                if (pendingReplay) {
                  pendingReplay.push(entry);
                  return;
                }

                deliverEvent(entry);
              });
            };

            socket.on("connect", () => {
              set((s) => {
                s.status = "connected";
                s.connectionError = null;
              });

              const tenantId = useAuthStore.getState().tenantId ?? "";
              const isReconnect = hasSubscribed;
              hasSubscribed = true;
              // 重连才开窗：首连没有补发，事件直接下发。
              pendingReplay = isReconnect ? [] : null;
              socket.emit(
                "conversation:subscribe",
                {
                  conversationId,
                  tenantId,
                  ...(isReconnect ? { lastEventId: get().lastEventId } : {}),
                },
                (ack: {
                  status: string;
                  error?: string;
                  lastEventId?: number;
                }) => {
                  // 补发结束：按 eventId 升序放行攒下的事件。
                  flushPendingReplay();

                  if (ack?.status === "error") {
                    set((s) => {
                      s.connectionError = ack.error ?? "Subscription failed";
                    });
                    return;
                  }

                  // 增量补发会跳过 unmapped 事件，只按收到的 eventId 推进会把游标
                  // 卡在最后一个可映射事件上，之后每次重连都重放同一段。
                  // 服务端在 ack 里给出补发完成时的真实进度（snapshot 路径不给）。
                  const cursor = readLastEventIdField(ack);
                  if (cursor === null) {
                    return;
                  }

                  set((s) => {
                    if (cursor > s.lastEventId) {
                      s.lastEventId = cursor;
                    }
                  });
                },
              );
            });

            socket.on("disconnect", () => {
              // ack 可能永远不来：丢弃待放行队列并关窗，
              // 否则下一轮真正的 epoch 回退会被当成补发放过去。
              pendingReplay = null;
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

            // 重连时服务端缓存有缺口，会用持久 snapshot 兜底（见 D-12）。
            onEvent("conversation.state.snapshot", (payload: unknown) => {
              // 新 epoch 的 eventId 会从头重排，旧键留着会把新事件误判成重复。
              forgetSeenEvents();

              set((s) => {
                const canonical =
                  normalizeConversationSnapshotMessages(payload);
                if (!canonical) {
                  return;
                }

                s.messages = mergeSnapshotWithLiveMessages(
                  s.messages,
                  canonical,
                );

                // snapshot 是新 epoch 的起点：服务端计数器可能已归零或从 1 重启，
                // 这里必须**直接赋值**（允许回退），否则旧游标会一直卡住，
                // 之后每次重连都被判成 epoch 回退，新一轮事件也无法正常推进。
                const epoch = readLastEventIdField(payload);
                if (epoch !== null) {
                  s.lastEventId = epoch;
                }
              });
            });

            onEvent(
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

            onEvent("conversation.agent.thinking", (payload: unknown) => {
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

            onEvent("conversation.agent.tool_call", (payload: unknown) => {
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

            onEvent("conversation.agent.tool_result", (payload: unknown) => {
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

            onEvent("conversation.agent.done", (payload: unknown) => {
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

            onEvent(
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

            onEvent(
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

            onEvent("conversation.status.changed", (payload: unknown) => {
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

            onEvent(
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

            onEvent(
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

            onEvent(
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
                    .json<ConversationDetailResponseSwaggerDto>();

                  const normalizedMessages = response.data.messages.data.map(
                    (message) => normalizeConversationHistoryMessage(message),
                  );
                  const executionSnapshot = normalizeConversationExecutionSnapshot(
                    response.data.metadata,
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
