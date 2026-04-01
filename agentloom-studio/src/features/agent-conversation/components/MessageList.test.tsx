import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

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

    render(<MessageList messages={[message]} isExecuting={false} />);

    expect(screen.getByText(/本轮在输出过程中中断：/)).toBeInTheDocument();
    expect(
      screen.getByText(/MODEL_PROVIDER_ERROR: terminated/),
    ).toBeInTheDocument();
  });
});
