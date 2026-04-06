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
});
