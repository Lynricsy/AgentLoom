import { describe, expect, it } from "vitest";
import { buildPaletteGroups } from "../components/nodeCategories";
import { PORT_DATA_TYPES } from "./typeSchema";
import {
  DYNAMIC_ONLY_NODE_TYPES,
  EXEC_PORT_NODE_TYPES,
  getResolvedNodeTypeConfig,
  getWorkflowAgentInputPorts,
  getAllNodeTypes,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
  NODE_TYPE_REGISTRY,
  NODE_TYPES,
  PORT_DATA_TYPE_META,
  type NodeType,
  type PortDefinition,
} from "./nodeTypeRegistry";
import { clonePortDefinitions } from "./portSchema";

describe("nodeTypeRegistry", () => {
  it("exports all supported node types in a stable order", () => {
    expect(NODE_TYPES).toEqual([
      "llm-model",
      "http-tool",
      "code-tool",
      "mcp-tool",
      "sandbox",
      "manual-trigger",
      "schedule-trigger",
      "webhook-trigger",
      "api-event-trigger",
      "knowledge-base",
      "text",
      "text-output",
      "json-output",
      "condition",
      "loop",
      "iteration",
      "loop-start",
      "iteration-start",
      "loop-state",
      "result",
      "break",
      "continue",
      "reusable-block",
      "smart-routing",
      "plugin",
      "input-preprocessor",
      "memory",
      "agent",
      "skill",
      "workspace",
      "merge",
    ]);
  });

  it("keeps port type metadata aligned with the supported data types", () => {
    expect(Object.keys(PORT_DATA_TYPE_META).sort()).toEqual(
      [...PORT_DATA_TYPES].sort(),
    );
    expect(PORT_DATA_TYPE_META.model).toEqual({
      label: "Model",
      colorToken: "var(--color-type-model)",
      shape: "circle",
    });
    expect(PORT_DATA_TYPE_META.text).toEqual({
      label: "Text",
      colorToken: "var(--color-type-text)",
      shape: "circle",
    });
    expect(PORT_DATA_TYPE_META.json).toEqual({
      label: "JSON",
      colorToken: "var(--color-type-json)",
      shape: "square",
    });
    expect(PORT_DATA_TYPE_META.image).toEqual({
      label: "Image",
      colorToken: "var(--color-type-image)",
      shape: "diamond",
    });
    expect(PORT_DATA_TYPE_META.audio).toEqual({
      label: "Audio",
      colorToken: "var(--color-type-audio)",
      shape: "capsule",
    });
    expect(PORT_DATA_TYPE_META.tool).toEqual({
      label: "Tool",
      colorToken: "var(--color-type-tool)",
      shape: "hexagon",
    });
    expect(PORT_DATA_TYPE_META.sandbox).toEqual({
      label: "Sandbox",
      colorToken: "var(--color-type-sandbox)",
      shape: "triangle",
    });
    expect(PORT_DATA_TYPE_META.knowledge).toEqual({
      label: "Knowledge",
      colorToken: "var(--color-type-knowledge)",
      shape: "book",
    });
  });

  it("returns configs for known node types and throws for unknown types", () => {
    const config = getNodeTypeConfig("agent");

    expect(config.type).toBe("agent");
    expect(config.configSchema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
    expect(() => getNodeTypeConfig("unknown-node" as NodeType)).toThrow(
      "Unknown node type",
    );
  });

  it("returns null for unknown node types in safe lookups", () => {
    expect(getNodeTypeConfigOrNull("agent")?.label).toBe("Agent");
    expect(getNodeTypeConfigOrNull("not-real")).toBeNull();
  });

  it("maps legacy mcp alias lookups to the canonical mcp-tool config", () => {
    expect(getNodeTypeConfig("mcp" as NodeType).type).toBe("mcp-tool");
    expect(getNodeTypeConfigOrNull("mcp")?.type).toBe("mcp-tool");
  });

  it("把已废除的 llm-agent 类型映射到 canonical 的 agent 配置", () => {
    expect(getNodeTypeConfig("llm-agent" as NodeType).type).toBe("agent");
    expect(getNodeTypeConfigOrNull("llm-agent")?.type).toBe("agent");
    expect(getResolvedNodeTypeConfig("llm-agent").isKnownType).toBe(true);
    expect(getResolvedNodeTypeConfig("llm-agent").type).toBe("agent");
  });

  it("returns a fallback presentation config for unknown node types", () => {
    const config = getResolvedNodeTypeConfig("mystery-node", {
      category: "tool",
      inputPorts: [
        {
          id: "input-1",
          label: "输入",
          direction: "input",
          dataType: "json",
          required: false,
          multiple: false,
          maxConnections: 1,
          schema: { kind: "json", shape: "object", title: "输入", properties: {} },
        },
      ],
    });

    expect(config.isKnownType).toBe(false);
    expect(config.label).toBe("未知节点类型");
    expect(config.type).toBe("mystery-node");
    expect(config.category).toBe("tool");
    expect(config.description).toContain("mystery-node");
    expect(config.inputPorts).toHaveLength(1);
  });

  it("defines llm-model as a single model-output node with multi-connect support", () => {
    const llmModelNode = getNodeTypeConfig("llm-model");
    const outputPort = llmModelNode.outputPorts.find(
      (port) => port.id === "model-out",
    );

    expect(llmModelNode.category).toBe("agent");
    expect(llmModelNode.inputPorts.map((port) => port.id)).toEqual(["exec-in"]);
    expect(llmModelNode.outputPorts.map((port) => port.id)).toEqual([
      "exec-out",
      "model-out",
    ]);

    expect(outputPort).toMatchObject({
      id: "model-out",
      label: "模型",
      direction: "output",
      dataType: "model",
      required: false,
      multiple: true,
      maxConnections: 5,
    });
  });

  it("defines knowledge-base as an output-only knowledge source node", () => {
    const knowledgeBaseNode = getNodeTypeConfig("knowledge-base");
    const outputPort = knowledgeBaseNode.outputPorts.find(
      (port) => port.id === "knowledge-out",
    );

    expect(knowledgeBaseNode.inputPorts.map((port) => port.id)).toEqual([
      "exec-in",
    ]);
    expect(knowledgeBaseNode.outputPorts.map((port) => port.id)).toEqual([
      "exec-out",
      "knowledge-out",
    ]);
    expect(outputPort).toMatchObject({
      id: "knowledge-out",
      label: "知识库",
      direction: "output",
      dataType: "knowledge",
      required: false,
      multiple: false,
    });
  });

  it("defines text as a reusable text source node", () => {
    const textNode = getNodeTypeConfig("text");
    const outputPort = textNode.outputPorts.find((port) => port.id === "text-out");

    expect(textNode.category).toBe("output");
    expect(textNode.inputPorts).toEqual([]);
    expect(textNode.outputPorts.map((port) => port.id)).toEqual(["text-out"]);
    expect(outputPort).toMatchObject({
      id: "text-out",
      label: "文本",
      direction: "output",
      dataType: "text",
      multiple: true,
      maxConnections: null,
    });
    expect(textNode.configSchema.properties.text?.title).toBe("文本内容");
  });

  it("http-tool 的 failOnHttpError 默认为 true（非 2xx 判定失败）", () => {
    const httpToolNode = getNodeTypeConfig("http-tool");
    const failOnHttpError =
      httpToolNode.configSchema.properties.failOnHttpError;

    expect(failOnHttpError).toEqual({
      type: "boolean",
      title: "非 2xx 视为失败",
      default: true,
    });
  });

  it("目标 workflow 节点都会暴露 exec-in 与 exec-out", () => {
    for (const type of EXEC_PORT_NODE_TYPES) {
      const config = getNodeTypeConfig(type);

      expect(config.inputPorts.some((port) => port.id === "exec-in")).toBe(
        true,
      );
      expect(config.outputPorts.some((port) => port.id === "exec-out")).toBe(
        true,
      );
    }
  });

  it("defines reusable-block as a control node with dynamic ports and no schema fields", () => {
    const reusableBlockNode = getNodeTypeConfig("reusable-block");

    expect(reusableBlockNode.category).toBe("control");
    expect(reusableBlockNode.icon).toBe("Package");
    expect(reusableBlockNode.inputPorts).toEqual([]);
    expect(reusableBlockNode.outputPorts).toEqual([]);
    expect(reusableBlockNode.configSchema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("defines smart-routing as a palette-visible model selector with canonical ports", () => {
    const smartRoutingNode = getNodeTypeConfig("smart-routing");

    expect(DYNAMIC_ONLY_NODE_TYPES.has("smart-routing")).toBe(false);
    expect(smartRoutingNode.category).toBe("agent");
    expect(smartRoutingNode.inputPorts.map((port) => port.id)).toEqual([
      "exec-in",
      "model-in-0",
      "model-in-1",
    ]);
    expect(smartRoutingNode.outputPorts.map((port) => port.id)).toEqual([
      "exec-out",
      "model-out",
    ]);
    expect(smartRoutingNode.configSchema.properties.strategy?.default).toBe(
      "random",
    );
  });

  it("workflow agent 输入端口会跟随 agent runtimeMode 移除 sandbox 句柄", () => {
    expect(
      getWorkflowAgentInputPorts("sandbox").map((port) => port.id),
    ).toContain("sandbox-in");
    expect(
      getWorkflowAgentInputPorts("sandbox").map((port) => port.id),
    ).toContain("system-prompt-in");
    expect(
      getWorkflowAgentInputPorts("no_sandbox").map((port) => port.id),
    ).not.toContain("sandbox-in");
    expect(
      getWorkflowAgentInputPorts("no_sandbox").map((port) => port.id),
    ).toContain("system-prompt-in");
  });

  it("exposes every registry entry through ordered helpers and palette groups", () => {
    const orderedTypes = getAllNodeTypes().map((config) => config.type);
    const groupedTypes = buildPaletteGroups().flatMap((group) =>
      group.items.map((item) => item.type),
    );
    const paletteVisibleTypes = NODE_TYPES.filter(
      (type) => !DYNAMIC_ONLY_NODE_TYPES.has(type) || type === "merge",
    );

    expect(orderedTypes).toEqual([...NODE_TYPES]);
    expect(groupedTypes).toEqual([
      "llm-model",
      "smart-routing",
      "agent",
      "skill",
      "http-tool",
      "code-tool",
      "mcp-tool",
      "sandbox",
      "input-preprocessor",
      "workspace",
      "manual-trigger",
      "schedule-trigger",
      "webhook-trigger",
      "api-event-trigger",
      "knowledge-base",
      "memory",
      "text",
      "text-output",
      "json-output",
      "condition",
      "loop",
      "iteration",
      "merge",
    ]);
    expect(new Set(groupedTypes)).toEqual(new Set(paletteVisibleTypes));
    expect(Object.keys(NODE_TYPE_REGISTRY).sort()).toEqual(
      [...NODE_TYPES].sort(),
    );
  });

  it("deep clones nested port schemas when duplicating definitions", () => {
    const ports: PortDefinition[] = [
      {
        id: "payload",
        label: "Payload",
        direction: "input",
        dataType: "json",
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: "json",
          shape: "object",
          title: "Payload",
          properties: {
            items: {
              kind: "json",
              shape: "array",
              title: "Items",
              items: {
                kind: "text",
                title: "Item",
              },
            },
          },
          additionalProperties: false,
        },
      },
    ];

    const cloned = clonePortDefinitions(ports);
    const originalPort = ports[0];
    const clonedPort = cloned[0];

    if (!originalPort || !clonedPort) {
      throw new Error("Expected cloned port definitions to contain one port");
    }

    expect(cloned).not.toBe(ports);
    expect(clonedPort).not.toBe(originalPort);
    expect(clonedPort.schema).not.toBe(originalPort.schema);

    const originalSchema = originalPort.schema;
    const clonedSchema = clonedPort.schema;

    if (originalSchema.kind !== "json" || originalSchema.shape !== "object") {
      throw new Error("Expected original schema to be a JSON object schema");
    }

    if (clonedSchema.kind !== "json" || clonedSchema.shape !== "object") {
      throw new Error("Expected cloned schema to be a JSON object schema");
    }

    expect(clonedSchema.properties.items).not.toBe(
      originalSchema.properties.items,
    );

    const clonedItems = clonedSchema.properties.items;
    const originalItems = originalSchema.properties.items;

    if (
      !clonedItems ||
      clonedItems.kind !== "json" ||
      clonedItems.shape !== "array" ||
      !originalItems ||
      originalItems.kind !== "json" ||
      originalItems.shape !== "array"
    ) {
      throw new Error("Expected nested items schema to be a JSON array schema");
    }

    expect(clonedItems.items).not.toBe(originalItems.items);
  });
});
