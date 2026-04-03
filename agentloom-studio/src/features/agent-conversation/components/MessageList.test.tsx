import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentConversationStore } from "../stores/agent-conversation.store";
import type { ConversationMessage } from "../types";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  beforeEach(() => {
    useAgentConversationStore.getState().actions.reset();
  });

  it("应为 incomplete assistant turn 渲染持久化失败原因", () => {
    const message: ConversationMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "先整理仓库结构，再回看记忆模块。",
      toolCalls: [],
      segments: [{ type: "text", content: "先整理仓库结构，再回看记忆模块。" }],
      isStreaming: false,
      createdAt: Date.now(),
      metadata: {
        incomplete: true,
        errorMessage: "上游模型流中断（MODEL_PROVIDER_ERROR: terminated）",
      },
    };

    render(
      <MessageList
        messages={[message]}
        isExecuting={false}
        runtimeMode="sandbox"
        onRestartConversation={async () => {}}
      />,
    );

    expect(screen.getByText(/本轮在输出过程中中断：/)).toBeInTheDocument();
    expect(
      screen.getByText(/MODEL_PROVIDER_ERROR: terminated/),
    ).toBeInTheDocument();
  });

  it("tool result 为 MCP 文本信封时也应展示重启卡片并触发回调", async () => {
    const user = userEvent.setup();
    const onRestartConversation = vi.fn().mockResolvedValue(undefined);
    const message: ConversationMessage = {
      id: "assistant-2",
      role: "assistant",
      content: "已完成自进化发布",
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
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      segments: [
        { type: "text", content: "已完成自进化发布" },
        { type: "tool_call", toolCallId: "tool-1" },
      ],
      isStreaming: false,
      createdAt: Date.now(),
      metadata: {},
    };

    render(
      <MessageList
        messages={[message]}
        isExecuting={false}
        runtimeMode="sandbox"
        onRestartConversation={onRestartConversation}
      />,
    );

    expect(
      screen.getByText((content) =>
        content.includes("Agent 已升级到最新已发布版本") &&
        content.includes("v7"),
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重启到新版本" }));

    expect(onRestartConversation).toHaveBeenCalledTimes(1);
  });
});
