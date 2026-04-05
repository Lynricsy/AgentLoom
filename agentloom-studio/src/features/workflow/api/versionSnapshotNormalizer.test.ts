import { describe, expect, it } from "vitest";

import type { WorkflowVersionSnapshot } from "../types";
import { normalizeWorkflowVersionSnapshot } from "./versionSnapshotNormalizer";

function createSnapshot(
  overrides: Partial<WorkflowVersionSnapshot> = {},
): WorkflowVersionSnapshot {
  return {
    nodes: [],
    edges: [],
    viewport: null,
    metadata: {
      nodeCount: 0,
      edgeCount: 0,
      createdFromVersion: 1,
    },
    ...overrides,
  };
}

describe("normalizeWorkflowVersionSnapshot", () => {
  it("会修复版本快照里只有端口 id 的 agent 端口，并尊重 no_sandbox runtime", () => {
    const snapshot = createSnapshot({
      nodes: [
        {
          id: "agent-1",
          type: "agent",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            category: "agent",
            nodeType: "agent",
            agentRuntimeMode: "no_sandbox",
            config: {},
            inputPorts: [
              { id: "exec-in" },
              { id: "text-in" },
            ] as unknown as never,
            outputPorts: [
              { id: "exec-out" },
              { id: "agent-out" },
            ] as unknown as never,
          },
        },
      ],
    });

    const normalized = normalizeWorkflowVersionSnapshot(snapshot);
    const agentNode = normalized.nodes[0];

    expect(agentNode?.data.inputPorts.map((port) => port.id)).toEqual([
      "exec-in",
      "text-in",
      "context-in",
      "skills-in",
      "tools-in",
      "sub-agents-in",
      "schema-in",
    ]);
    expect(agentNode?.data.inputPorts[0]?.schema.kind).toBe("exec");
    expect(agentNode?.data.inputPorts[1]?.schema.kind).toBe("text");
    expect(
      agentNode?.data.inputPorts.some((port) => port.id === "sandbox-in"),
    ).toBe(false);
    expect(agentNode?.data.outputPorts[0]?.schema.kind).toBe("exec");
    expect(agentNode?.data.outputPorts[1]?.schema.kind).toBe("text");
  });

  it("会给未知的自定义端口补默认 json schema，避免版本快照读取 kind 崩溃", () => {
    const snapshot = createSnapshot({
      nodes: [
        {
          id: "loop-1",
          type: "control",
          position: { x: 0, y: 0 },
          data: {
            label: "Loop",
            category: "control",
            nodeType: "loop",
            config: {},
            inputPorts: [
              { id: "exec-in" },
              { id: "state-in" },
              { id: "input-0" },
            ] as unknown as never,
            outputPorts: [
              { id: "exec-out" },
              { id: "review_out" },
            ] as unknown as never,
          },
        },
      ],
    });

    const normalized = normalizeWorkflowVersionSnapshot(snapshot);
    const loopNode = normalized.nodes[0];
    const customOutput = loopNode?.data.outputPorts.find(
      (port) => port.id === "review_out",
    );

    expect(customOutput).toBeDefined();
    expect(customOutput?.schema.kind).toBe("json");
    expect(customOutput?.dataType).toBe("json");
  });
});
