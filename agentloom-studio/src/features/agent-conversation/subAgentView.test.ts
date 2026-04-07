import { describe, expect, it } from "vitest";

import { buildSubAgentMessages, resolveSubAgentView } from "./subAgentView";
import {
  extractSubAgentAlias,
  extractSubAgentHandle,
} from "@/shared/lib/subAgentToolUtils";
import type { ConversationMessage, SubAgentStream } from "./types";

function makeMessage(
  overrides: Partial<ConversationMessage>,
): ConversationMessage {
  return {
    id: "message-1",
    role: "assistant",
    content: "",
    contentType: "text",
    toolCalls: [],
    segments: [],
    isStreaming: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("subAgentView", () => {
  it("应优先把 live subagent stream 转为消息瀑布", () => {
    const stream: SubAgentStream = {
      handle: "sa_live_1",
      alias: "researcher",
      depth: 1,
      parentToolCallId: "tool-parent",
      status: "completed",
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_001_000,
      events: [
        {
          id: "evt-1",
          type: "message_chunk",
          payload: { chunk: "先整理线索。" },
          timestamp: 1_700_000_000_100,
        },
        {
          id: "evt-2",
          type: "tool_call",
          payload: {
            toolCallId: "tool-1",
            tool: "search_knowledge",
            status: "in_progress",
          },
          timestamp: 1_700_000_000_200,
        },
        {
          id: "evt-3",
          type: "tool_result",
          payload: {
            toolCallId: "tool-1",
            tool: "search_knowledge",
            status: "completed",
            result: { hits: 3 },
          },
          timestamp: 1_700_000_000_300,
        },
        {
          id: "evt-4",
          type: "done",
          payload: {},
          timestamp: 1_700_000_001_000,
        },
      ],
    };

    const messages = buildSubAgentMessages(stream);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "先整理线索。",
        isStreaming: false,
        toolCalls: [
          expect.objectContaining({
            id: "tool-1",
            tool: "search_knowledge",
            status: "completed",
            result: { hits: 3 },
          }),
        ],
        segments: [
          { type: "text", content: "先整理线索。" },
          { type: "tool_call", toolCallId: "tool-1" },
        ],
      }),
    );
  });

  it("无 live stream 时应从 wait 结果与 completion notice 合成历史子视图", () => {
    const messages: ConversationMessage[] = [
      makeMessage({
        id: "assistant-main",
        content: "主 agent 已等待 researcher",
        toolCalls: [
          {
            id: "tool-wait",
            tool: "wait_for_subagents",
            status: "completed",
            result: [
              {
                handle: "sa_hist_1",
                alias: "researcher",
                status: "completed",
                result: {
                  content: "这是子代理的完整最终总结。",
                  stopReason: "end_turn",
                },
              },
            ],
            startedAt: 1_700_000_000_100,
            updatedAt: 1_700_000_000_200,
          },
        ],
      }),
      makeMessage({
        id: "notice-1",
        role: "user",
        content: "[Sub-Agent: Researcher Agent] Completed: 这是截断摘要。",
        createdAt: 1_700_000_000_300,
        metadata: {
          type: "subagent_completion_notice",
          handle: "sa_hist_1",
          alias: "researcher",
          status: "completed",
        },
      }),
    ];

    const view = resolveSubAgentView("sa_hist_1", null, messages);

    expect(view).toEqual(
      expect.objectContaining({
        alias: "researcher",
        source: "history",
      }),
    );
    expect(view?.messages).toHaveLength(2);
    expect(view?.messages[0]?.metadata).toEqual(
      expect.objectContaining({
        type: "subagent_completion_notice",
        handle: "sa_hist_1",
        alias: "researcher",
        status: "completed",
      }),
    );
    expect(view?.messages[1]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "这是子代理的完整最终总结。",
      }),
    );
  });

  it("只有 spawn 历史快照时也应给出可解释的运行中提示", () => {
    const messages: ConversationMessage[] = [
      makeMessage({
        id: "assistant-main",
        toolCalls: [
          {
            id: "tool-spawn",
            tool: "spawn_subagent",
            status: "completed",
            result: {
              handle: "sa_hist_running",
              alias: "writer",
              status: "running",
            },
            startedAt: 1_700_000_000_100,
            updatedAt: 1_700_000_000_200,
          },
        ],
      }),
    ];

    const view = resolveSubAgentView("sa_hist_running", null, messages);

    expect(view?.alias).toBe("writer");
    expect(view?.messages[0]?.metadata).toEqual(
      expect.objectContaining({
        type: "subagent_completion_notice",
        handle: "sa_hist_running",
        alias: "writer",
        status: "running",
      }),
    );
    expect(view?.messages[1]?.content).toContain("实时输出未持久化");
  });

  it("没有 live 和历史数据时应返回 null", () => {
    expect(resolveSubAgentView("sa_missing", null, [])).toBeNull();
  });

  it("应兼容从 JSON 字符串工具参数/结果中提取 handle 与 alias", () => {
    const toolCall = {
      args: JSON.stringify({
        alias: "researcher",
      }),
      result: JSON.stringify({
        handle: "sa_json_1",
        alias: "researcher",
      }),
    };

    expect(extractSubAgentHandle(toolCall)).toBe("sa_json_1");
    expect(extractSubAgentAlias(toolCall)).toBe("researcher");
  });
});
