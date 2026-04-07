import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentCanvasStore } from "./agent-canvas.store";

const { getMock, putMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(() => ({ json: vi.fn().mockResolvedValue({}) })),
}));

vi.mock("@/shared/api/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    post: postMock,
  },
}));

function createDetailResponse(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: "agent-1",
    tenantId: "tenant-1",
    name: "Loaded Agent",
    slug: "loaded-agent",
    description: null,
    systemPrompt: null,
    nodes: [],
    edges: [],
    viewport: null,
    sandboxConfig: {},
    workspaceSnapshotId: null,
    inputSchema: null,
    memoryInstanceIds: [],
    sandboxLifecycle: "session",
    version: 1,
    runtimeMode: "sandbox",
    status: "draft",
    publishedVersionId: null,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-03-28T00:00:00.000Z",
    updatedAt: "2026-03-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("agentCanvasStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentCanvasStore.getState().actions.reset();
  });

  it("sends the canvas payload shape expected by the backend and reads the nested version response", async () => {
    const canvasViewport = { x: 12, y: 24, zoom: 0.85 };
    const globalSandboxConfig = {
      enabled: true,
      cpuLimit: 2,
      memoryLimitMb: 1024,
      timeoutSeconds: 300,
    };
    const inputSchema = {
      type: "object" as const,
      properties: {
        topic: { type: "string" },
      },
      required: ["topic"],
    };

    useAgentCanvasStore.setState({
      agentId: "agent-1",
      nodes: [
        {
          id: "agent-main",
          type: "agent",
          position: { x: 0, y: 0 },
          data: {
            label: "Main Agent",
            nodeType: "agent-main" as unknown as "agent",
            category: "agent",
            config: {},
            inputPorts: [],
            outputPorts: [],
          },
        },
      ],
      edges: [],
      viewport: canvasViewport,
      globalSandboxConfig,
      inputSchema,
      memoryInstanceIds: ["019d2a7c-c19c-7a9c-8233-db2b87a23de2"],
      sandboxLifecycle: "persistent",
      isDirty: true,
      version: 3,
    });

    putMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { version: 4 } }),
    });

    await useAgentCanvasStore.getState().actions.saveCanvas();

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith("agent-definitions/agent-1/canvas", {
      json: {
        canvasNodes: expect.any(Array),
        canvasEdges: [],
        canvasViewport,
        globalSandboxConfig,
        inputSchema,
        memoryInstanceIds: ["019d2a7c-c19c-7a9c-8233-db2b87a23de2"],
        sandboxLifecycle: "persistent",
        workspaceSnapshotId: null,
      },
    });

    const requestBody = putMock.mock.calls[0]?.[1]?.json as Record<
      string,
      unknown
    >;
    expect(requestBody.nodes).toBeUndefined();
    expect(requestBody.edges).toBeUndefined();
    expect(requestBody.viewport).toBeUndefined();

    const state = useAgentCanvasStore.getState();
    expect(state.version).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.lastSavedAt).not.toBeNull();
  });

  it("hydrates input schema, memory bindings, and sandbox lifecycle from the detail response", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          nodes: [
            {
              id: "agent-main",
              type: "agent",
              position: { x: 0, y: 0 },
              data: {
                label: "Agent Main",
                nodeType: "agent-main" as unknown as string,
                category: "agent",
                description: "old snapshot",
                config: {},
                inputPorts: [
                  {
                    id: "memory-in",
                    label: "记忆",
                    direction: "input",
                    dataType: "knowledge",
                    required: false,
                    multiple: true,
                    maxConnections: null,
                    schema: { kind: "knowledge", title: "记忆" },
                  },
                ],
                outputPorts: [],
              },
            },
          ],
          edges: [],
          viewport: null,
          sandboxConfig: { lifecycleMode: "persistent" },
          workspaceSnapshotId: null,
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string", description: "Prompt" },
            },
            required: ["question"],
          },
          memoryInstanceIds: ["019d2a7c-c19c-7a9c-8233-db2b87a23de3"],
          sandboxLifecycle: "persistent",
          version: 7,
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-1");

    const state = useAgentCanvasStore.getState();
    expect(state.agentId).toBe("agent-1");
    expect(state.agentName).toBe("Loaded Agent");
    expect(state.inputSchema).toEqual({
      type: "object",
      properties: {
        question: { type: "string", description: "Prompt" },
      },
      required: ["question"],
    });
    expect(state.memoryInstanceIds).toEqual([
      "019d2a7c-c19c-7a9c-8233-db2b87a23de3",
    ]);
    expect(state.sandboxLifecycle).toBe("persistent");
    expect(state.globalSandboxConfig.lifecycleMode).toBe("persistent");
    expect(
      state.nodes[0]?.data.inputPorts.find((port) => port.id === "memory-in")
        ?.dataType,
    ).toBe("memory");
  });

  it("normalizes legacy mcp node aliases from the detail response", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          nodes: [
            {
              id: "agent-main",
              type: "agent",
              position: { x: 0, y: 0 },
              data: {
                label: "Agent Main",
                nodeType: "agent-main",
                category: "agent",
                description: "主节点",
                config: {},
                inputPorts: [],
                outputPorts: [],
              },
            },
            {
              id: "mcp-1",
              type: "tool",
              position: { x: 120, y: 0 },
              data: {
                label: "WebSearch",
                nodeType: "mcp",
                category: "tool",
                description: "legacy mcp",
                config: {},
                inputPorts: [],
                outputPorts: [
                  {
                    id: "tools-out",
                    label: "工具",
                    direction: "output",
                    dataType: "tool",
                  },
                ],
              },
            },
          ],
          edges: [
            {
              id: "edge-mcp",
              source: "mcp-1",
              target: "agent-main",
              sourceHandle: "tools-out",
              targetHandle: "tools-in",
            },
          ],
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-1");

    const state = useAgentCanvasStore.getState();
    const mcpNode = state.nodes.find((node) => node.id === "mcp-1");
    const mcpEdge = state.edges.find((edge) => edge.id === "edge-mcp");

    expect(mcpNode?.data.nodeType).toBe("mcp-tool");
    expect(mcpNode?.data.outputPorts.map((port) => port.id)).toEqual([
      "tool-out",
    ]);
    expect(mcpEdge?.sourceHandle).toBe("tool-out");
  });

  it("rehydrates malformed stored smart-routing ports from registry defaults", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-2",
          name: "Broken Router Agent",
          slug: "broken-router-agent",
          nodes: [
            {
              id: "router-1",
              type: "agent",
              position: { x: 0, y: 0 },
              data: {
                label: "Legacy Router",
                nodeType: "smart-routing",
                category: "agent",
                description: "端口只剩 id",
                config: {
                  strategy: "FALLBACK_CHAIN",
                },
                inputPorts: [{ id: "model-in-0" }, { id: "model-in-1" }],
                outputPorts: [{ id: "model-out" }],
              },
            },
          ],
          edges: [],
          viewport: null,
          sandboxConfig: {},
          workspaceSnapshotId: null,
          inputSchema: null,
          memoryInstanceIds: [],
          sandboxLifecycle: "session",
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-2");

    const node = useAgentCanvasStore
      .getState()
      .nodes.find((item) => item.id === "router-1");

    expect(node?.data.inputPorts).toMatchObject([
      {
        id: "model-in-0",
        direction: "input",
        dataType: "model",
        schema: { kind: "model" },
      },
      {
        id: "model-in-1",
        direction: "input",
        dataType: "model",
        schema: { kind: "model" },
      },
    ]);
    expect(node?.data.outputPorts).toMatchObject([
      {
        id: "model-out",
        direction: "output",
        dataType: "model",
        schema: { kind: "model" },
      },
    ]);
  });

  it("hydrates legacy self-evolution text nodes by backfilling config.text from root data", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-text",
          nodes: [
            {
              id: "text-1",
              type: "output",
              position: { x: 80, y: 120 },
              data: {
                label: "QA Self Text",
                nodeType: "text",
                category: "output",
                description: "self-evolution created node",
                text: "SELF_TEXT_OK_20260408",
                inputPorts: [],
                outputPorts: [{ id: "text-out" }],
              },
            },
          ],
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-text");

    const node = useAgentCanvasStore
      .getState()
      .nodes.find((item) => item.id === "text-1");

    expect(node?.data.config).toEqual({
      text: "SELF_TEXT_OK_20260408",
    });
    expect(node?.data.outputPorts).toMatchObject([
      {
        id: "text-out",
        direction: "output",
        dataType: "text",
        schema: { kind: "text" },
      },
    ]);
  });

  it("hydrates self-evolution agent snapshots even when stored nodes omit port arrays", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-self-evo",
          nodes: [
            {
              id: "router-1",
              type: "agent",
              position: { x: 0, y: 0 },
              data: {
                label: "Smart Routing QA",
                nodeType: "smart-routing",
                category: "agent",
                strategy: "FALLBACK_CHAIN",
                config: { strategy: "FALLBACK_CHAIN" },
              },
            },
            {
              id: "http-1",
              type: "tool",
              position: { x: 200, y: 0 },
              data: {
                label: "HTTP QA Tool",
                nodeType: "http-tool",
                category: "tool",
                name: "http_fetch_qa",
                method: "GET",
                url: "https://httpbin.org/get?qa=agent-self-evo",
                config: {
                  name: "http_fetch_qa",
                  method: "GET",
                  url: "https://httpbin.org/get?qa=agent-self-evo",
                },
              },
            },
          ],
        }),
      }),
    });

    await expect(
      useAgentCanvasStore.getState().actions.loadAgent("agent-self-evo"),
    ).resolves.toBeUndefined();

    const state = useAgentCanvasStore.getState();
    const routingNode = state.nodes.find((item) => item.id === "router-1");
    const httpNode = state.nodes.find((item) => item.id === "http-1");

    expect(routingNode?.data.inputPorts).toMatchObject([
      {
        id: "model-in-0",
        direction: "input",
        dataType: "model",
      },
      {
        id: "model-in-1",
        direction: "input",
        dataType: "model",
      },
    ]);
    expect(routingNode?.data.outputPorts).toMatchObject([
      {
        id: "model-out",
        direction: "output",
        dataType: "model",
      },
    ]);
    expect(httpNode?.data.inputPorts).toMatchObject([
      {
        id: "exec-in",
        direction: "input",
        dataType: "exec",
      },
      {
        id: "request-in",
        direction: "input",
        dataType: "json",
      },
    ]);
    expect(httpNode?.data.outputPorts).toMatchObject([
      {
        id: "exec-out",
        direction: "output",
        dataType: "exec",
      },
      {
        id: "response-out",
        direction: "output",
        dataType: "json",
      },
    ]);
  });

  it("does not append a second agent-main when the stored snapshot already has one", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-3",
          nodes: [
            {
              id: "agent-main-existing",
              type: "agent",
              position: { x: 240, y: 180 },
              data: {
                label: "Agent Main",
                nodeType: "agent-main",
                category: "agent",
                description: "already present",
                config: {},
                inputPorts: [],
                outputPorts: [],
              },
            },
          ],
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-3");

    const agentMainNodes = useAgentCanvasStore
      .getState()
      .nodes.filter(
        (node) => (node.data.nodeType as unknown as string) === "agent-main",
      );

    expect(agentMainNodes).toHaveLength(1);
    expect(agentMainNodes[0]?.id).toBe("agent-main-existing");
  });

  it("deduplicates malformed duplicate agent-main nodes and keeps the connected one", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-4",
          nodes: [
            {
              id: "model-1",
              type: "agent",
              position: { x: 0, y: 0 },
              data: {
                label: "LLM 模型",
                nodeType: "llm-model",
                category: "agent",
                description: "model node",
                config: {},
                inputPorts: [],
                outputPorts: [],
              },
            },
            {
              id: "agent-main-connected",
              type: "agent",
              position: { x: 240, y: 180 },
              data: {
                label: "Agent Main",
                nodeType: "agent-main",
                category: "agent",
                description: "connected main",
                config: { nativeToolPolicy: "allowlist" },
                inputPorts: [],
                outputPorts: [],
              },
            },
            {
              id: "agent-main-orphan",
              type: "agent",
              position: { x: 560, y: 180 },
              data: {
                label: "Agent Main Duplicate",
                nodeType: "agent-main",
                category: "agent",
                description: "orphan duplicate",
                config: {},
                inputPorts: [],
                outputPorts: [],
              },
            },
          ],
          edges: [
            {
              id: "edge-model-main",
              source: "model-1",
              target: "agent-main-connected",
              sourceHandle: "model-out",
              targetHandle: "model-in",
            },
          ],
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-4");

    const state = useAgentCanvasStore.getState();
    const agentMainNodes = state.nodes.filter(
      (node) => (node.data.nodeType as unknown as string) === "agent-main",
    );

    expect(agentMainNodes).toHaveLength(1);
    expect(agentMainNodes[0]?.id).toBe("agent-main-connected");
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]?.target).toBe("agent-main-connected");
  });

  it("removes sandbox-in from hydrated agent-main nodes in no_sandbox mode", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: createDetailResponse({
          id: "agent-5",
          runtimeMode: "no_sandbox",
          nodes: [
            {
              id: "agent-main-existing",
              type: "agent",
              position: { x: 240, y: 180 },
              data: {
                label: "Agent Main",
                nodeType: "agent-main",
                category: "agent",
                description: "legacy no-sandbox snapshot",
                config: {},
                inputPorts: [
                  {
                    id: "sandbox-in",
                    label: "沙箱",
                    direction: "input",
                    dataType: "sandbox",
                    required: false,
                    multiple: false,
                    maxConnections: 1,
                    schema: { kind: "sandbox", title: "沙箱" },
                  },
                ],
                outputPorts: [],
              },
            },
          ],
        }),
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent("agent-5");

    const agentMainNode = useAgentCanvasStore
      .getState()
      .nodes.find(
        (node) => (node.data.nodeType as unknown as string) === "agent-main",
      );

    expect(
      agentMainNode?.data.inputPorts.some((port) => port.id === "sandbox-in"),
    ).toBe(false);
  });
});
