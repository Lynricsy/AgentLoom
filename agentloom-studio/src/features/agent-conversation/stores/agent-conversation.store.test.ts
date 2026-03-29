import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMock,
  postMock,
  toSnakeBodyMock,
  authGetStateMock,
  ioMock,
  socketHandlers,
  socketEmitMock,
  socketDisconnectMock,
  socketRemoveAllListenersMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  return {
    getMock: vi.fn(),
    postMock: vi.fn(),
    toSnakeBodyMock: vi.fn((value: unknown) => value),
    authGetStateMock: vi.fn(() => ({ tenantId: "tenant-1" })),
    ioMock: vi.fn(),
    socketHandlers: handlers,
    socketEmitMock: vi.fn(
      (
        event: string,
        _payload?: unknown,
        ack?: { status: string } | ((arg: unknown) => void),
      ) => {
        if (event === "conversation:subscribe" && typeof ack === "function") {
          ack({ status: "subscribed" });
        }
      },
    ),
    socketDisconnectMock: vi.fn(),
    socketRemoveAllListenersMock: vi.fn(() => {
      handlers.clear();
    }),
  };
});

vi.mock("@/shared/api/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
  toSnakeBody: (value: unknown) => toSnakeBodyMock(value),
}));

vi.mock("@/features/auth/stores/auth.store", () => ({
  useAuthStore: {
    getState: () => authGetStateMock(),
  },
}));

vi.mock("socket.io-client", () => ({
  io: (url: string, options?: unknown) => ioMock(url, options),
}));

import { useAgentConversationStore } from "./agent-conversation.store";

function createSocket() {
  socketHandlers.clear();

  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      socketHandlers.set(event, handler);
      return socket;
    }),
    emit: socketEmitMock,
    removeAllListeners: socketRemoveAllListenersMock,
    disconnect: socketDisconnectMock,
  };

  ioMock.mockReturnValue(socket);

  return socket;
}

function emitSocketEvent(event: string, payload?: unknown) {
  const handler = socketHandlers.get(event);
  if (!handler) {
    throw new Error(`Socket handler for ${event} is not registered`);
  }

  handler(payload);
}

function createHistoryResponse(messages: unknown[]) {
  return {
    data: messages,
    meta: {
      total: messages.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    },
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  if (!resolve || !reject) {
    throw new Error("Deferred 初始化失败");
  }

  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

describe("agentConversationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSocket();
    useAgentConversationStore.getState().actions.reset();
  });

  it("顶层 done 后会回拉历史消息并展示最终 assistant 正文", async () => {
    const jsonMock = vi.fn().mockResolvedValue(
      createHistoryResponse([
        {
          id: "user-1",
          role: "user",
          content: "请使用已连接的知识库查找唯一校验码",
          metadata: {},
          toolCalls: null,
          createdAt: "2026-03-29T10:00:00.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "KB-ALPHA-20260329-FOX",
          metadata: {},
          toolCalls: [
            {
              id: "tool-1",
              tool: "search_knowledge",
              status: "completed",
              args: {
                query: "唯一校验码",
                knowledgeBaseIds: ["kb-1"],
              },
              result: {
                hits: [{ content: "KB-ALPHA-20260329-FOX" }],
              },
            },
          ],
          createdAt: "2026-03-29T10:00:01.000Z",
        },
      ]),
    );

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA KB Agent",
      authToken: "token-1",
    });

    emitSocketEvent("connect");

    useAgentConversationStore
      .getState()
      .actions.sendMessage("请使用已连接的知识库查找唯一校验码");

    emitSocketEvent("conversation.agent.tool_call", {
      conversationId: "conv-1",
      messageId: "stream-1",
      toolCallId: "tool-1",
      tool: "search_knowledge",
      args: {
        query: "唯一校验码",
        knowledgeBaseIds: ["kb-1"],
      },
      status: "in_progress",
    });

    emitSocketEvent("conversation.agent.tool_result", {
      conversationId: "conv-1",
      messageId: "stream-1",
      toolCallId: "tool-1",
      tool: "search_knowledge",
      status: "completed",
      result: {
        hits: [{ content: "KB-ALPHA-20260329-FOX" }],
      },
    });

    expect(useAgentConversationStore.getState().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "stream-1",
          role: "assistant",
          content: "",
          toolCalls: [
            expect.objectContaining({
              id: "tool-1",
              tool: "search_knowledge",
              status: "completed",
            }),
          ],
        }),
      ]),
    );

    emitSocketEvent("conversation.agent.done", {
      conversationId: "conv-1",
      messageId: "stream-1",
    });

    await vi.waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(
        "agent-conversations/conv-1/messages",
      );
      expect(useAgentConversationStore.getState().messages).toEqual([
        expect.objectContaining({
          id: "user-1",
          role: "user",
          content: "请使用已连接的知识库查找唯一校验码",
        }),
        expect.objectContaining({
          id: "assistant-1",
          role: "assistant",
          content: "KB-ALPHA-20260329-FOX",
          toolCalls: [
            expect.objectContaining({
              id: "tool-1",
              tool: "search_knowledge",
              status: "completed",
            }),
          ],
          isStreaming: false,
        }),
      ]);
    });
  });

  it("loadHistory 的过期响应不会污染已切换或已重置的会话状态", async () => {
    const deferred = createDeferred<ReturnType<typeof createHistoryResponse>>();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      authToken: "token-1",
    });

    const pendingLoad = useAgentConversationStore
      .getState()
      .actions.loadHistory("conv-1");

    useAgentConversationStore.getState().actions.reset();

    deferred.resolve(
      createHistoryResponse([
        {
          id: "assistant-1",
          role: "assistant",
          content: "stale message",
          metadata: {},
          toolCalls: null,
          createdAt: "2026-03-29T10:00:01.000Z",
        },
      ]),
    );

    await pendingLoad;

    expect(useAgentConversationStore.getState().conversationId).toBeNull();
    expect(useAgentConversationStore.getState().messages).toEqual([]);
  });
});
