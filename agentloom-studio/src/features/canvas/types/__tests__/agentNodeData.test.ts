import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUTONOMY_CONFIG,
  DEFAULT_OUTPUT_FORMAT_STRATEGY,
} from "../../autonomy.types";
import { createDefaultAgentNodeData } from "../../types";
import type { AgentNodeData, AgentModelConfig } from "../../types";
import { getNodeTypeConfig } from "../nodeTypeRegistry";
import type { PortDefinition } from "../nodeTypeRegistry";

function findPort(ports: PortDefinition[], id: string): PortDefinition {
  const port = ports.find((p) => p.id === id);
  if (!port) throw new Error(`port '${id}' not found`);
  return port;
}

describe("createDefaultAgentNodeData", () => {
  it("返回所有 Agent 专属字段的默认值", () => {
    const defaults = createDefaultAgentNodeData();

    expect(defaults.modelConfig).toEqual<AgentModelConfig>({
      connectedModelNodeId: null,
    });

    expect(defaults.autonomyConfig).toEqual(DEFAULT_AUTONOMY_CONFIG);
    expect(defaults.outputFormatStrategy).toEqual(
      DEFAULT_OUTPUT_FORMAT_STRATEGY,
    );

    expect(defaults.toolBindings).toEqual([]);
    expect(defaults.knowledgeBindings).toEqual([]);
  });

  it("返回的对象与 AgentNodeData 部分字段类型兼容", () => {
    const defaults = createDefaultAgentNodeData();

    const partial: Pick<
      AgentNodeData,
      | "modelConfig"
      | "autonomyConfig"
      | "outputFormatStrategy"
      | "toolBindings"
      | "knowledgeBindings"
    > = defaults;

    expect(partial).toBeDefined();
  });

  it("autonomyConfig 与 outputFormatStrategy 均遵循强类型契约", () => {
    const defaults = createDefaultAgentNodeData();

    const extended: AgentNodeData["autonomyConfig"] = {
      ...defaults.autonomyConfig,
      mode: "RULE_BASED",
      allowedInferenceFields: ["model"],
    };
    expect(extended).toMatchObject({
      mode: "RULE_BASED",
      allowedInferenceFields: ["model"],
    });

    const format: AgentNodeData["outputFormatStrategy"] = {
      ...defaults.outputFormatStrategy,
      outputSchema: '{"type":"object"}',
      strictness: "strict",
      allowDegrade: false,
      repairPolicy: "manual",
    };
    expect(format).toEqual({
      outputSchema: '{"type":"object"}',
      strictness: "strict",
      allowDegrade: false,
      repairPolicy: "manual",
    });
  });

  it("每次调用返回全新实例（无共享引用）", () => {
    const a = createDefaultAgentNodeData();
    const b = createDefaultAgentNodeData();

    expect(a).not.toBe(b);
    expect(a.modelConfig).not.toBe(b.modelConfig);
    expect(a.toolBindings).not.toBe(b.toolBindings);
    expect(a.knowledgeBindings).not.toBe(b.knowledgeBindings);
    expect(a.autonomyConfig).not.toBe(b.autonomyConfig);
    expect(a.outputFormatStrategy).not.toBe(b.outputFormatStrategy);
  });
});

describe("agent 端口定义", () => {
  const agentType = getNodeTypeConfig("agent");

  it("包含 9 个输入端口和 3 个输出端口", () => {
    expect(agentType.inputPorts).toHaveLength(9);
    expect(agentType.outputPorts).toHaveLength(3);
  });

  describe("输入端口", () => {
    it("exec-in 端口: exec 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "exec-in");
      expect(port.dataType).toBe("exec");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(false);
    });

    it("text-in 端口: text 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "text-in");
      expect(port.dataType).toBe("text");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(true);
    });

    it("system-prompt-in 端口: text 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "system-prompt-in");
      expect(port.dataType).toBe("text");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(false);
    });

    it("sandbox-in 端口: sandbox 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "sandbox-in");
      expect(port.dataType).toBe("sandbox");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(false);
    });

    it("context-in 端口: json 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "context-in");
      expect(port.dataType).toBe("json");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(false);
    });

    it("skills-in 端口: skill 类型, 多连接", () => {
      const port = findPort(agentType.inputPorts, "skills-in");
      expect(port.dataType).toBe("skill");
      expect(port.multiple).toBe(true);
      expect(port.maxConnections).toBeNull();
      expect(port.required).toBe(false);
    });

    it("tools-in 端口: tool 类型, 多连接", () => {
      const port = findPort(agentType.inputPorts, "tools-in");
      expect(port.dataType).toBe("tool");
      expect(port.multiple).toBe(true);
      expect(port.maxConnections).toBeNull();
      expect(port.required).toBe(false);
    });

    it("sub-agents-in 端口: agent 类型, 多连接", () => {
      const port = findPort(agentType.inputPorts, "sub-agents-in");
      expect(port.dataType).toBe("agent");
      expect(port.multiple).toBe(true);
      expect(port.maxConnections).toBeNull();
      expect(port.required).toBe(false);
    });

    it("schema-in 端口: json 类型, 单连接", () => {
      const port = findPort(agentType.inputPorts, "schema-in");
      expect(port.dataType).toBe("json");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
      expect(port.required).toBe(false);
    });
  });

  describe("输出端口", () => {
    it("exec-out 端口: exec 类型, 单连接", () => {
      const port = findPort(agentType.outputPorts, "exec-out");
      expect(port.dataType).toBe("exec");
      expect(port.multiple).toBe(false);
      expect(port.maxConnections).toBe(1);
    });

    it("agent-out 端口: text 类型, 多连接", () => {
      const port = findPort(agentType.outputPorts, "agent-out");
      expect(port.dataType).toBe("text");
      expect(port.multiple).toBe(true);
      expect(port.maxConnections).toBeNull();
    });

    it("structured-out 端口: json 类型, 多连接", () => {
      const port = findPort(agentType.outputPorts, "structured-out");
      expect(port.dataType).toBe("json");
      expect(port.multiple).toBe(true);
      expect(port.maxConnections).toBeNull();
    });
  });

  describe("端口 schema 定义", () => {
    it("所有端口均定义了 schema", () => {
      const allPorts = [...agentType.inputPorts, ...agentType.outputPorts];
      for (const port of allPorts) {
        expect(port.schema, `port '${port.id}' 缺少 schema`).toBeDefined();
      }
    });

    it("json 类型端口使用 object schema", () => {
      const jsonPorts = [
        ...agentType.inputPorts,
        ...agentType.outputPorts,
      ].filter((p) => p.dataType === "json");
      for (const port of jsonPorts) {
        expect(port.schema?.kind, `port '${port.id}'`).toBe("json");
        if (port.schema?.kind === "json") {
          expect(port.schema.shape).toBe("object");
        }
      }
    });

    it("非 json 类型端口使用标量 schema", () => {
      const scalarPorts = [
        ...agentType.inputPorts,
        ...agentType.outputPorts,
      ].filter((p) => p.dataType !== "json");
      for (const port of scalarPorts) {
        expect(port.schema?.kind, `port '${port.id}'`).not.toBe("json");
      }
    });
  });
});
