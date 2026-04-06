import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseAgent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/features/agent/api/agentQueries", () => ({
  useAgent: (agentId: string) => mockUseAgent(agentId),
}));

vi.mock("../api/conversationMutations", () => ({
  useStartConversation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

import { ToastProvider } from "@/shared/ui/toast";
import { NewConversationDraftPage } from "./NewConversationDraftPage";

describe("NewConversationDraftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgent.mockReturnValue({
      data: {
        runtimeMode: "sandbox",
      },
    });
  });

  function renderPage() {
    return render(
      <ToastProvider>
        <NewConversationDraftPage agentId="agent-1" />
      </ToastProvider>,
    );
  }

  it("挂载时不应自动创建 conversation", () => {
    renderPage();

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("发送首条消息时应调用 startConversation 并跳转到真实会话页", async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: "conv-9" });

    renderPage();

    fireEvent.change(
      screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行"),
      {
        target: { value: "请先读取仓库结构" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        content: "请先读取仓库结构",
      });
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/agents/$agentId/conversations/$conversationId",
        params: { agentId: "agent-1", conversationId: "conv-9" },
        replace: true,
      });
    });
  });

  it("选择附件后应先停留在草稿区，点击发送后再调用 startConversation", async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: "conv-10" });

    renderPage();

    const fileInput = screen.getByTestId("conversation-file-input");
    const attachmentA = new File(["alpha"], "notes-a.txt", {
      type: "text/plain",
    });
    const attachmentB = new File(["beta"], "notes-b.txt", {
      type: "text/plain",
    });

    fireEvent.change(fileInput, {
      target: { files: [attachmentA, attachmentB] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("attachment-draft-list")).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        content: "已上传 2 个附件",
        contentType: "file",
        metadata: {
          contentType: "file",
          attachments: [
            {
              kind: "file",
              fileName: "notes-a.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
              textContent: "alpha",
            },
            {
              kind: "file",
              fileName: "notes-b.txt",
              mimeType: "text/plain",
              sizeBytes: 4,
              textContent: "beta",
            },
          ],
        },
      });
    });
  });
});
