import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMock,
  postMock,
  toSnakeBodyMock,
  authGetStateMock,
  ioMock,
  socketHandlers,
  subscribeAck,
  socketEmitMock,
  socketDisconnectMock,
  socketRemoveAllListenersMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const ack: { current: Record<string, unknown> } = {
    current: { status: "subscribed" },
  };

  return {
    getMock: vi.fn(),
    postMock: vi.fn(),
    toSnakeBodyMock: vi.fn((value: unknown) => value),
    authGetStateMock: vi.fn(() => ({ tenantId: "tenant-1" })),
    ioMock: vi.fn(),
    socketHandlers: handlers,
    subscribeAck: ack,
    socketEmitMock: vi.fn(
      (
        event: string,
        _payload?: unknown,
        callback?: { status: string } | ((arg: unknown) => void),
      ) => {
        if (
          event === "conversation:subscribe" &&
          typeof callback === "function"
        ) {
          callback(ack.current);
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

vi.mock("@/features/auth", () => ({
  useAuthStore: {
    getState: () => authGetStateMock(),
  },
}));

vi.mock("socket.io-client", () => ({
  io: (url: string, options?: unknown) => ioMock(url, options),
}));

import { useAgentConversationStore } from "./agent-conversation.store";

const anyHandlers: Array<(event: string, ...args: unknown[]) => void> = [];

const LIFECYCLE_EVENTS = new Set(["connect", "disconnect", "connect_error"]);

function createSocket() {
  socketHandlers.clear();
  anyHandlers.length = 0;

  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      socketHandlers.set(event, handler);
      return socket;
    }),
    onAny: vi.fn((handler: (event: string, ...args: unknown[]) => void) => {
      anyHandlers.push(handler);
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

  // 真实 socket.io-client 的 onAny 只对服务端事件触发，
  // connect/disconnect 等生命周期事件不走这里。
  if (!LIFECYCLE_EVENTS.has(event)) {
    for (const anyHandler of anyHandlers) {
      anyHandler(event, payload);
    }
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

function createConversationDetailResponse(
  messages: unknown[],
  metadata: Record<string, unknown> = {},
) {
  return {
    data: {
      metadata,
      messages: createHistoryResponse(messages),
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
    subscribeAck.current = { status: "subscribed" };
    createSocket();
    useAgentConversationStore.getState().actions.reset();
  });

  it("sendMessage 应透传附件消息的 contentType 与 metadata", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    useAgentConversationStore.getState().actions.sendMessage({
      content: "请查看 design.png",
      contentType: "image",
      metadata: {
        attachment: {
          kind: "image",
          fileName: "design.png",
          mimeType: "image/png",
          sizeBytes: 32,
          dataBase64: "cG5n",
        },
      },
    });

    expect(socketEmitMock).toHaveBeenCalledWith(
      "conversation:message",
      {
        conversationId: "conv-1",
        content: "请查看 design.png",
        contentType: "image",
        metadata: {
          contentType: "image",
          attachment: {
            kind: "image",
            fileName: "design.png",
            mimeType: "image/png",
            sizeBytes: 32,
            dataBase64: "cG5n",
          },
          attachments: [
            {
              kind: "image",
              fileName: "design.png",
              mimeType: "image/png",
              sizeBytes: 32,
              dataBase64: "cG5n",
            },
          ],
        },
      },
      expect.any(Function),
    );

    expect(useAgentConversationStore.getState().messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "请查看 design.png",
        contentType: "image",
        metadata: {
          contentType: "image",
          attachment: {
            kind: "image",
            fileName: "design.png",
            mimeType: "image/png",
            sizeBytes: 32,
            dataBase64: "cG5n",
          },
          attachments: [
            {
              kind: "image",
              fileName: "design.png",
              mimeType: "image/png",
              sizeBytes: 32,
              dataBase64: "cG5n",
            },
          ],
        },
      }),
    ]);
  });

  it("sendMessage 应透传多附件 metadata 并保留 attachments[]", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-2",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    useAgentConversationStore.getState().actions.sendMessage({
      content: "请同时处理这些附件",
      contentType: "text",
      metadata: {
        contentType: "text",
        attachments: [
          {
            kind: "image",
            fileName: "design.png",
            mimeType: "image/png",
            sizeBytes: 32,
            dataBase64: "cG5n",
          },
          {
            kind: "file",
            fileName: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 24,
            textContent: "ATTACH-QA-20260406",
          },
        ],
      },
    });

    expect(socketEmitMock).toHaveBeenCalledWith(
      "conversation:message",
      {
        conversationId: "conv-2",
        content: "请同时处理这些附件",
        contentType: "text",
        metadata: {
          contentType: "text",
          attachments: [
            {
              kind: "image",
              fileName: "design.png",
              mimeType: "image/png",
              sizeBytes: 32,
              dataBase64: "cG5n",
            },
            {
              kind: "file",
              fileName: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 24,
              textContent: "ATTACH-QA-20260406",
            },
          ],
        },
      },
      expect.any(Function),
    );

    expect(useAgentConversationStore.getState().messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "请同时处理这些附件",
        contentType: "text",
        metadata: {
          contentType: "text",
          attachments: [
            {
              kind: "image",
              fileName: "design.png",
              mimeType: "image/png",
              sizeBytes: 32,
              dataBase64: "cG5n",
            },
            {
              kind: "file",
              fileName: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 24,
              textContent: "ATTACH-QA-20260406",
            },
          ],
        },
      }),
    ]);
  });

  it("顶层 done 后会回拉历史消息并展示最终 assistant 正文", async () => {
    const detailResponse = createConversationDetailResponse([
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
        content: "先整理线索\n\nKB-ALPHA-20260329-FOX",
        metadata: {
          segments: [
            { type: "text", content: "先整理线索" },
            { type: "tool_call", toolCallId: "tool-1" },
            { type: "text", content: "KB-ALPHA-20260329-FOX" },
          ],
        },
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
    ]);
    const workspaceTree = [
      {
        name: "kb-result.txt",
        path: "kb-result.txt",
        type: "file",
      },
    ];
    const jsonMock = vi.fn((url?: unknown) => {
      if (url === "agent-conversations/conv-1/workspace/tree") {
        return {
          json: vi.fn().mockResolvedValue(workspaceTree),
        };
      }

      return {
        json: vi.fn().mockResolvedValue(detailResponse),
      };
    });

    getMock.mockImplementation((url: string) => jsonMock(url));

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA KB Agent",
      runtimeMode: "sandbox",
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
      expect(getMock).toHaveBeenCalledWith("agent-conversations/conv-1");
      expect(getMock).toHaveBeenCalledWith(
        "agent-conversations/conv-1/workspace/tree",
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
          content: "先整理线索\n\nKB-ALPHA-20260329-FOX",
          toolCalls: [
            expect.objectContaining({
              id: "tool-1",
              tool: "search_knowledge",
              status: "completed",
            }),
          ],
          segments: [
            { type: "text", content: "先整理线索" },
            { type: "tool_call", toolCallId: "tool-1" },
            { type: "text", content: "KB-ALPHA-20260329-FOX" },
          ],
          isStreaming: false,
        }),
      ]);
      expect(useAgentConversationStore.getState().fileTree).toEqual([
        expect.objectContaining({
          name: "kb-result.txt",
          path: "kb-result.txt",
          type: "file",
        }),
      ]);
    });
  });

  it("loadHistory 应保留自进化工具结果中的结构化 restartSuggestion", async () => {
    const jsonMock = vi.fn().mockResolvedValue(
      createConversationDetailResponse([
        {
          id: "assistant-1",
          role: "assistant",
          content: "已完成自进化发布",
          metadata: {
            segments: [{ type: "tool_call", toolCallId: "tool-1" }],
          },
          toolCalls: [
            {
              id: "tool-1",
              tool: "apply_change",
              status: "completed",
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      data: {
                        restartSuggestion: {
                          available: true,
                          publishedVersionId: "pub-1",
                          publishedVersionNumber: 7,
                        },
                      },
                    }),
                  },
                ],
              },
            },
          ],
          createdAt: "2026-04-02T10:00:01.000Z",
        },
      ]),
    );

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA SelfEvo Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    await useAgentConversationStore.getState().actions.loadHistory("conv-1");

    expect(useAgentConversationStore.getState().messages).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        toolCalls: [
          expect.objectContaining({
            id: "tool-1",
            result: {
              data: {
                restartSuggestion: {
                  available: true,
                  publishedVersionId: "pub-1",
                  publishedVersionNumber: 7,
                },
              },
            },
          }),
        ],
      }),
    ]);
  });

  it("restartToLatestVersion 应禁用默认超时并返回会话 ID", async () => {
    const jsonMock = vi.fn().mockResolvedValue({
      data: {
        conversationId: "conv-2",
      },
    });

    postMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA SelfEvo Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const nextConversationId =
      await useAgentConversationStore.getState().actions.restartToLatestVersion();

    expect(postMock).toHaveBeenCalledWith(
      "agent-conversations/conv-1/restart-latest-version",
      { timeout: false },
    );
    expect(nextConversationId).toBe("conv-2");
  });

  it("loadHistory 应同步 execution.loadedPublishedVersionId", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(
        createConversationDetailResponse([], {
          execution: {
            runningState: "idle",
            loadedPublishedVersionId: "pub-9",
          },
        }),
      ),
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA SelfEvo Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    await useAgentConversationStore.getState().actions.loadHistory("conv-1");

    expect(useAgentConversationStore.getState().loadedPublishedVersionId).toBe(
      "pub-9",
    );
  });

  it("loadHistory 会从 detail metadata 同步失败态和错误摘要", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(
        createConversationDetailResponse(
          [
            {
              id: "user-1",
              role: "user",
              content: "你好",
              metadata: {},
              toolCalls: null,
              createdAt: "2026-04-04T09:17:38.000Z",
            },
          ],
          {
            execution: {
              runningState: "failed",
              errorMessage: "租户未配置默认 LLM 模型",
            },
          },
        ),
      ),
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA Agent",
      runtimeMode: "no_sandbox",
      authToken: "token-1",
    });

    await useAgentConversationStore.getState().actions.loadHistory("conv-1");

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        sandboxStatus: "error",
        executionError: "租户未配置默认 LLM 模型",
        messages: [
          expect.objectContaining({
            id: "user-1",
            content: "你好",
          }),
        ],
      }),
    );
  });

  it("运行时 failed 状态会读取 errorMessage 并保留 executionError", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA KB Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    emitSocketEvent("conversation.status.changed", {
      conversationId: "conv-1",
      status: "failed",
      errorMessage: "上游模型流中断（MODEL_PROVIDER_ERROR: terminated）",
    });

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        executionError: "上游模型流中断（MODEL_PROVIDER_ERROR: terminated）",
        preparationPhase: null,
        preparationFailedPhase: null,
      }),
    );
  });

  it("done 事件不会在 history 回拉前清掉已存在的失败态", async () => {
    const deferred =
      createDeferred<ReturnType<typeof createConversationDetailResponse>>();

    getMock.mockReturnValue({
      json: vi.fn().mockImplementation(() => deferred.promise),
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "QA Agent",
      runtimeMode: "no_sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    emitSocketEvent("conversation.status.changed", {
      conversationId: "conv-1",
      status: "failed",
      errorMessage: "租户未配置默认 LLM 模型",
    });
    emitSocketEvent("conversation.agent.done", {
      conversationId: "conv-1",
      messageId: "stream-1",
    });

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        sandboxStatus: "error",
        executionError: "租户未配置默认 LLM 模型",
      }),
    );

    deferred.resolve(
      createConversationDetailResponse([], {
        execution: {
          runningState: "failed",
          errorMessage: "租户未配置默认 LLM 模型",
        },
      }),
    );

    await vi.waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("agent-conversations/conv-1");
    });
  });

  it("loadHistory 的过期响应不会污染已切换或已重置的会话状态", async () => {
    const deferred =
      createDeferred<ReturnType<typeof createConversationDetailResponse>>();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const pendingLoad = useAgentConversationStore
      .getState()
      .actions.loadHistory("conv-1");

    useAgentConversationStore.getState().actions.reset();

    deferred.resolve(
      createConversationDetailResponse([
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

  it("loadHistory 在前一次请求未结束时不应重复发起同会话请求", async () => {
    const deferred =
      createDeferred<ReturnType<typeof createConversationDetailResponse>>();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const firstLoad = useAgentConversationStore
      .getState()
      .actions.loadHistory("conv-1");
    const secondLoad = useAgentConversationStore
      .getState()
      .actions.loadHistory("conv-1");

    expect(getMock).toHaveBeenCalledTimes(1);

    deferred.resolve(createConversationDetailResponse([]));

    await Promise.all([firstLoad, secondLoad]);
  });

  it("历史回拉晚到时不会覆盖当前 live tail", async () => {
    const deferred =
      createDeferred<ReturnType<typeof createConversationDetailResponse>>();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockImplementation((url: string) => {
      if (url === "agent-conversations/conv-1/workspace/tree") {
        return {
          json: vi.fn().mockResolvedValue([]),
        };
      }

      return {
        json: jsonMock,
      };
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");

    useAgentConversationStore.getState().actions.sendMessage("第一轮问题");
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-1",
      chunk: "第一轮结论",
    });
    emitSocketEvent("conversation.agent.done", {
      conversationId: "conv-1",
      messageId: "stream-1",
    });

    await vi.waitFor(() => {
      expect(jsonMock).toHaveBeenCalledTimes(1);
    });

    useAgentConversationStore.getState().actions.sendMessage("第二轮补充");
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-2",
      chunk: "第二轮还在分析",
    });

    deferred.resolve(
      createConversationDetailResponse([
        {
          id: "user-1",
          role: "user",
          content: "第一轮问题",
          metadata: {},
          toolCalls: null,
          createdAt: "2026-04-01T05:44:09.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "第一轮结论",
          metadata: {
            segments: [{ type: "text", content: "第一轮结论" }],
          },
          toolCalls: null,
          createdAt: "2026-04-01T05:44:40.000Z",
        },
      ]),
    );

    await vi.waitFor(() => {
      expect(useAgentConversationStore.getState().messages).toEqual([
        expect.objectContaining({
          id: "user-1",
          role: "user",
          content: "第一轮问题",
        }),
        expect.objectContaining({
          id: "assistant-1",
          role: "assistant",
          content: "第一轮结论",
          isStreaming: false,
        }),
        expect.objectContaining({
          role: "user",
          content: "第二轮补充",
        }),
        expect.objectContaining({
          id: "stream-2",
          role: "assistant",
          content: "第二轮还在分析",
          segments: [{ type: "text", content: "第二轮还在分析" }],
          isStreaming: true,
        }),
      ]);
    });
  });

  it("loadWorkspaceTree 会在 completed 冷开时恢复目录树，并清理失效选中文件", async () => {
    const jsonMock = vi.fn().mockResolvedValue([
      {
        name: "workspace",
        path: "workspace",
        type: "directory",
        children: [
          {
            name: "summary.txt",
            path: "workspace/summary.txt",
            type: "file",
          },
        ],
      },
    ]);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    useAgentConversationStore.setState((state) => ({
      ...state,
      selectedFilePath: "workspace/missing.txt",
      fileTree: [
        {
          name: "workspace",
          path: "workspace",
          type: "directory",
          children: [
            {
              name: "missing.txt",
              path: "workspace/missing.txt",
              type: "file",
            },
          ],
        },
      ],
    }));

    await useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    expect(getMock).toHaveBeenCalledWith(
      "agent-conversations/conv-1/workspace/tree",
    );
    expect(useAgentConversationStore.getState().fileTree).toEqual([
      {
        name: "workspace",
        path: "workspace",
        type: "directory",
        children: [
          {
            name: "summary.txt",
            path: "workspace/summary.txt",
            type: "file",
          },
        ],
      },
    ]);
    expect(useAgentConversationStore.getState().selectedFilePath).toBeNull();
  });

  it("持久化 workspace 预载应先展示快照树，再由实时工作区覆盖", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "workspaces/ws-1/tree") {
        return {
          json: vi.fn().mockResolvedValue({
            data: [
              {
                name: "seed.txt",
                path: "seed.txt",
                type: "file",
              },
            ],
          }),
        };
      }

      if (url === "agent-conversations/conv-1/workspace/tree") {
        return {
          json: vi.fn().mockResolvedValue([
            {
              name: "live.txt",
              path: "live.txt",
              type: "file",
            },
          ]),
        };
      }

      return {
        json: vi.fn().mockResolvedValue(createConversationDetailResponse([])),
      };
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Workspace Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    await useAgentConversationStore
      .getState()
      .actions.loadWorkspacePreview("conv-1", "ws-1");

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        workspaceSource: "snapshot_preview",
        fileTree: [
          expect.objectContaining({
            name: "seed.txt",
            path: "seed.txt",
            type: "file",
          }),
        ],
      }),
    );

    await useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        workspaceSource: "live",
        fileTree: [
          expect.objectContaining({
            name: "live.txt",
            path: "live.txt",
            type: "file",
          }),
        ],
      }),
    );
  });

  it("空的实时树不应在新会话里覆盖持久化 workspace 预览", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "workspaces/ws-1/tree") {
        return {
          json: vi.fn().mockResolvedValue({
            data: [
              {
                name: "seed.txt",
                path: "seed.txt",
                type: "file",
              },
            ],
          }),
        };
      }

      if (url === "agent-conversations/conv-1/workspace/tree") {
        return {
          json: vi.fn().mockResolvedValue([]),
        };
      }

      return {
        json: vi.fn().mockResolvedValue(createConversationDetailResponse([])),
      };
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Workspace Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    await useAgentConversationStore
      .getState()
      .actions.loadWorkspacePreview("conv-1", "ws-1");
    await useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        workspaceSource: "snapshot_preview",
        fileTree: [
          expect.objectContaining({
            name: "seed.txt",
            path: "seed.txt",
            type: "file",
          }),
        ],
      }),
    );
  });

  it("迟到的快照预载响应不会回盖已经进入 live 的工作区树", async () => {
    const snapshotDeferred = createDeferred<{
      data: Array<{ name: string; path: string; type: "file" }>;
    }>();

    getMock.mockImplementation((url: string) => {
      if (url === "workspaces/ws-1/tree") {
        return {
          json: vi.fn().mockImplementation(() => snapshotDeferred.promise),
        };
      }

      if (url === "agent-conversations/conv-1/workspace/tree") {
        return {
          json: vi.fn().mockResolvedValue([
            {
              name: "live.txt",
              path: "live.txt",
              type: "file",
            },
          ]),
        };
      }

      return {
        json: vi.fn().mockResolvedValue(createConversationDetailResponse([])),
      };
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Workspace Agent",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const pendingPreview = useAgentConversationStore
      .getState()
      .actions.loadWorkspacePreview("conv-1", "ws-1");

    await useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    snapshotDeferred.resolve({
      data: [
        {
          name: "seed.txt",
          path: "seed.txt",
          type: "file",
        },
      ],
    });

    await pendingPreview;

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        workspaceSource: "live",
        fileTree: [
          expect.objectContaining({
            name: "live.txt",
            path: "live.txt",
            type: "file",
          }),
        ],
      }),
    );
  });

  it("loadWorkspaceTree 的过期响应不会污染已重置的会话状态", async () => {
    const deferred = createDeferred<
      Array<{
        name: string;
        path: string;
        type: "file";
      }>
    >();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const pendingLoad = useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    useAgentConversationStore.getState().actions.reset();

    deferred.resolve([
      {
        name: "summary.txt",
        path: "summary.txt",
        type: "file",
      },
    ]);

    await pendingLoad;

    expect(useAgentConversationStore.getState().conversationId).toBeNull();
    expect(useAgentConversationStore.getState().fileTree).toEqual([]);
  });

  it("loadWorkspaceTree 在前一次请求未结束时不应重复发起同会话请求", async () => {
    const deferred = createDeferred<
      Array<{
        name: string;
        path: string;
        type: "file";
      }>
    >();
    const jsonMock = vi.fn().mockImplementation(() => deferred.promise);

    getMock.mockReturnValue({
      json: jsonMock,
    });

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    const firstLoad = useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");
    const secondLoad = useAgentConversationStore
      .getState()
      .actions.loadWorkspaceTree("conv-1");

    expect(getMock).toHaveBeenCalledTimes(1);

    deferred.resolve([
      {
        name: "summary.txt",
        path: "summary.txt",
        type: "file",
      },
    ]);

    await Promise.all([firstLoad, secondLoad]);
  });

  it("切换 conversation 时会清空上一条会话残留的运行上下文", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    useAgentConversationStore
      .getState()
      .actions.sendMessage("为旧会话写入一条用户消息");

    emitSocketEvent("conversation.sandbox.terminal_output", {
      conversationId: "conv-1",
      output: "old terminal output",
      command: "pwd",
      sessionId: "pty-1",
    });

    emitSocketEvent("conversation.sandbox.file_change", {
      conversationId: "conv-1",
      path: "workspace/old.txt",
      changeType: "created",
      content: "old content",
    });

    const currentState = useAgentConversationStore.getState();
    expect(currentState.conversationId).toBe("conv-1");
    expect(currentState.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "为旧会话写入一条用户消息",
      }),
    ]);
    expect(currentState.terminalEntries).toEqual([
      expect.objectContaining({
        output: "old terminal output",
        command: "pwd",
      }),
    ]);
    expect(currentState.fileChanges).toEqual([
      expect.objectContaining({
        path: "workspace/old.txt",
        changeType: "created",
      }),
    ]);
    expect(currentState.fileTree).toEqual([
      expect.objectContaining({
        name: "workspace",
        path: "/workspace",
        children: [
          expect.objectContaining({
            name: "old.txt",
            path: "/workspace/old.txt",
          }),
        ],
      }),
    ]);

    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-2",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    expect(useAgentConversationStore.getState()).toEqual(
      expect.objectContaining({
        conversationId: "conv-2",
        agentId: "agent-1",
        agentName: "Agent 1",
        status: "connecting",
        messages: [],
        terminalEntries: [],
        fileChanges: [],
        fileTree: [],
        selectedFilePath: null,
        sandboxStatus: "idle",
        subAgentStreams: {},
        agentViewStack: [],
      }),
    );
  });

  // D-12 回归：重连时服务端缓存有缺口，会下发持久 snapshot；
  // 客户端必须据此补回断线期间丢失的正文，且不能丢掉本地仍在流式的尾部消息。
  it("重连收到 conversation.state.snapshot 时补回缺失正文并保留 live 尾部", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");

    // 断线重连后本地只剩一条仍在流式的新消息，断线期间那轮正文完全缺失。
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-live",
      chunk: "重连后的新内容",
    });

    emitSocketEvent("conversation.state.snapshot", {
      conversationId: "conv-1",
      lastEventId: 42,
      reason: "replay-buffer-gap",
      messages: [
        {
          messageId: "msg-lost",
          role: "assistant",
          contentType: "text",
          content: "断线期间产生的完整回答",
          toolCalls: null,
          metadata: {},
          createdAt: "2026-04-01T05:44:09.000Z",
        },
      ],
      timestamp: "2026-04-01T05:44:10.000Z",
    });

    const { messages } = useAgentConversationStore.getState();
    expect(messages.map((message) => message.content)).toEqual([
      "断线期间产生的完整回答",
      "重连后的新内容",
    ]);
    expect(messages[0]?.isStreaming).toBe(false);
    expect(messages[1]?.isStreaming).toBe(true);
  });

  // 首次订阅不带游标（历史走 REST 水合），此后每次重连都必须带上游标——
  // 哪怕它还是 0：客户端可能在首个事件到达前就断了，离线期间执行完成并清缓存。
  it("首次订阅省略游标，重连始终携带游标（含 0）", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    expect(socketEmitMock).toHaveBeenLastCalledWith(
      "conversation:subscribe",
      { conversationId: "conv-1", tenantId: "tenant-1" },
      expect.any(Function),
    );

    emitSocketEvent("disconnect");
    emitSocketEvent("connect");
    expect(socketEmitMock).toHaveBeenLastCalledWith(
      "conversation:subscribe",
      { conversationId: "conv-1", tenantId: "tenant-1", lastEventId: 0 },
      expect.any(Function),
    );
  });

  // 游标生命周期：实时事件取 max 推进；snapshot 是 epoch 重置点必须直接赋值
  // （允许回退），否则旧游标卡住，新一轮从 1 重启的事件永远推不动。
  it("实时事件推进游标，snapshot 重置 epoch 后新事件继续推进", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");

    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-1",
      chunk: "第一轮",
      eventId: 5,
    });
    expect(useAgentConversationStore.getState().lastEventId).toBe(5);

    // 服务端计数器已归零：snapshot 把游标拉回 0。
    emitSocketEvent("conversation.state.snapshot", {
      conversationId: "conv-1",
      lastEventId: 0,
      reason: "replay-buffer-gap",
      messages: [],
      timestamp: "2026-04-01T05:44:10.000Z",
    });
    expect(useAgentConversationStore.getState().lastEventId).toBe(0);

    // 新一轮从 1 开始，必须能正常推进。
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-2",
      chunk: "新一轮",
      eventId: 1,
    });
    expect(useAgentConversationStore.getState().lastEventId).toBe(1);

    emitSocketEvent("disconnect");
    emitSocketEvent("connect");
    expect(socketEmitMock).toHaveBeenLastCalledWith(
      "conversation:subscribe",
      { conversationId: "conv-1", tenantId: "tenant-1", lastEventId: 1 },
      expect.any(Function),
    );
  });

  // snapshot 按 messageId 覆盖本地消息，若丢掉 toolCalls/metadata，
  // 已渲染的工具卡与附件就会被抹掉。
  it("snapshot 覆盖同一条消息时保留工具卡与附件", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");

    emitSocketEvent("conversation.state.snapshot", {
      conversationId: "conv-1",
      lastEventId: 7,
      reason: "replay-buffer-gap",
      messages: [
        {
          messageId: "msg-with-tool",
          role: "assistant",
          contentType: "text",
          content: "已经查完了",
          toolCalls: [
            {
              id: "tool-1",
              tool: "read_file",
              status: "completed",
              args: { path: "README.md" },
              result: "ok",
            },
          ],
          metadata: {},
          createdAt: "2026-04-01T05:44:09.000Z",
        },
        {
          messageId: "msg-with-file",
          role: "user",
          contentType: "file",
          content: "看看这个",
          toolCalls: null,
          metadata: {
            attachments: [
              {
                fileName: "spec.pdf",
                mimeType: "application/pdf",
                url: "https://example.com/spec.pdf",
              },
            ],
          },
          createdAt: "2026-04-01T05:44:11.000Z",
        },
      ],
      timestamp: "2026-04-01T05:44:12.000Z",
    });

    const { messages } = useAgentConversationStore.getState();
    expect(messages[0]?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-1", tool: "read_file" }),
    ]);
    expect(messages[0]?.segments).toContainEqual(
      expect.objectContaining({ type: "tool_call", toolCallId: "tool-1" }),
    );
    expect(messages[1]?.metadata?.attachments).toEqual([
      expect.objectContaining({ fileName: "spec.pdf" }),
    ]);
  });

  // 等价去重只能一对一消费：历史里已有一句「继续」，用户又发了一句同样的
  // 「继续」，这条 optimistic 消息（本地随机 UUID）不能被历史那句匹配掉而消失。
  it("snapshot 不会吞掉与历史同文的新 optimistic 消息", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    useAgentConversationStore.getState().actions.sendMessage("继续");

    emitSocketEvent("conversation.state.snapshot", {
      conversationId: "conv-1",
      lastEventId: 9,
      reason: "replay-buffer-gap",
      messages: [
        {
          messageId: "msg-old-continue",
          role: "user",
          contentType: "text",
          content: "继续",
          toolCalls: null,
          metadata: {},
          createdAt: "2026-04-01T05:40:00.000Z",
        },
      ],
      timestamp: "2026-04-01T05:44:10.000Z",
    });

    const { messages } = useAgentConversationStore.getState();
    expect(messages.filter((message) => message.content === "继续")).toHaveLength(
      2,
    );
  });

  // 增量补发会跳过 unmapped 事件：只按收到的 eventId 推进，游标会卡在最后一个
  // 可映射事件上，之后每次重连都重放同一段。服务端在 ack 里给出真实进度。
  it("重连 ack 携带服务端进度时把游标推到该进度", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    emitSocketEvent("disconnect");

    // 补发只映射到 5，但服务端已经推进到 10。
    subscribeAck.current = { status: "subscribed", lastEventId: 10 };
    emitSocketEvent("connect");
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-replay",
      chunk: "补发内容",
      eventId: 5,
    });

    expect(useAgentConversationStore.getState().lastEventId).toBe(10);

    emitSocketEvent("disconnect");
    emitSocketEvent("connect");
    expect(socketEmitMock).toHaveBeenLastCalledWith(
      "conversation:subscribe",
      { conversationId: "conv-1", tenantId: "tenant-1", lastEventId: 10 },
      expect.any(Function),
    );
  });

  // snapshot 路径的 ack 不带游标：此时不能凭空推进，否则会跳过永远补不回的区间。
  it("ack 不带游标时保持本地游标不变", () => {
    useAgentConversationStore.getState().actions.connect({
      conversationId: "conv-1",
      agentId: "agent-1",
      agentName: "Agent 1",
      runtimeMode: "sandbox",
      authToken: "token-1",
    });

    emitSocketEvent("connect");
    emitSocketEvent("conversation.agent.message_chunk", {
      conversationId: "conv-1",
      messageId: "stream-1",
      chunk: "第一轮",
      eventId: 3,
    });

    emitSocketEvent("disconnect");
    emitSocketEvent("connect");

    expect(useAgentConversationStore.getState().lastEventId).toBe(3);
  });
});
