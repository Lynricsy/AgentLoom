import { describe, expect, it } from "vitest";
import { buildWorkflowAgentViewerState } from "./workflowAgentViewer";
import type { ExecutionStep } from "../types";
import type { NodeExecutionState } from "../stores/executionStore";

function createStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: "step-agent-1",
    executionId: "exec-1",
    nodeId: "node-agent-1",
    nodeName: "研究 Agent",
    nodeType: "agent",
    status: "running",
    input: null,
    output: { content: "先查结果如下" },
    errorMessage: null,
    startedAt: "2026-03-31T00:00:00.000Z",
    completedAt: null,
    retryCount: 0,
    checkpointData: {
      partialContent: "先查",
      segments: [
        { type: "text", content: "先查" },
        { type: "tool_call", toolCallId: "tool-1" },
      ],
      toolCalls: [
        {
          id: "tool-1",
          tool: "search_web",
          status: "completed",
          result: { hits: ["alpha"] },
        },
      ],
    },
    ...overrides,
  };
}

function createNodeState(
  overrides: Partial<NodeExecutionState> = {},
): NodeExecutionState {
  return {
    stepId: "step-agent-1",
    nodeId: "node-agent-1",
    status: "running",
    output: "先查结果如下",
    errorDetail: null,
    isStreaming: true,
    toolCalls: {
      "tool-1": {
        id: "tool-1",
        tool: "search_web",
        status: "completed",
        result: { hits: ["alpha"] },
      },
      "tool-2": {
        id: "tool-2",
        tool: "read_file",
        status: "awaiting_permission",
        args: { path: "notes.md" },
        permissionRequest: {
          description: "读取工作区文件",
          resourcePaths: ["notes.md"],
        },
      },
    },
    agentEvents: [
      {
        type: "decision",
        suggestedContent: "整理重点",
        rationale: "先判断资料可信度",
      },
      {
        type: "pty.output",
        sessionId: "pty-1",
        data: "$ ls\nnotes.md\n",
      },
      {
        type: "file_change",
        path: "notes.md",
        changeType: "modified",
        content: "alpha",
      },
    ],
    subAgentStreams: {},
    ...overrides,
  };
}

describe("buildWorkflowAgentViewerState", () => {
  it("保留 checkpoint 瀑布流顺序并追加实时文本、思考与工具状态", () => {
    const state = buildWorkflowAgentViewerState(
      createStep(),
      createNodeState(),
    );

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!).toMatchObject({
      content: "先查结果如下",
      isStreaming: true,
      segments: [
        { type: "text", content: "先查" },
        { type: "tool_call", toolCallId: "tool-1" },
        { type: "text", content: "结果如下" },
        { type: "thinking", content: "先判断资料可信度" },
        { type: "tool_call", toolCallId: "tool-2" },
      ],
    });
    expect(state.messages[0]!.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tool-1",
          status: "completed",
        }),
        expect.objectContaining({
          id: "tool-2",
          status: "awaiting_permission",
        }),
      ]),
    );
    expect(state.activeToolCall).toMatchObject({
      id: "tool-2",
      tool: "read_file",
      permissionDescription: "读取工作区文件",
      permissionResourcePaths: ["notes.md"],
    });
    expect(state.sandboxStatus).toBe("running");
  });

  it("提取终端输出、文件变更并在失败时标记 sandbox error", () => {
    const state = buildWorkflowAgentViewerState(
      createStep({
        status: "failed",
        output: null,
        checkpointData: null,
      }),
      createNodeState({
        status: "failed",
        output: "",
        isStreaming: false,
        toolCalls: {},
        agentEvents: [
          {
            type: "pty.output",
            sessionId: "pty-2",
            data: "Traceback...",
          },
          {
            type: "file_change",
            path: "tmp/error.log",
            changeType: "created",
          },
        ],
      }),
    );

    expect(state.terminalEntries).toEqual([
      expect.objectContaining({
        sessionId: "pty-2",
        output: "Traceback...",
      }),
    ]);
    expect(state.fileChanges).toEqual([
      {
        path: "tmp/error.log",
        changeType: "created",
      },
    ]);
    expect(state.sandboxStatus).toBe("error");
  });
});
