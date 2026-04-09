import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseAgent = vi.fn();
const mockFetchWorkspaceFileTree = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/features/agent/api/agentQueries", () => ({
  useAgent: (agentId: string) => mockUseAgent(agentId),
}));

vi.mock("@/features/workspace/api/workspaceApi", () => ({
  fetchWorkspaceFileTree: (workspaceId: string) =>
    mockFetchWorkspaceFileTree(workspaceId),
}));

vi.mock("../api/conversationMutations", () => ({
  useStartConversation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("../api/conversationQueries", () => ({
  useConversationSandboxStats: () => ({
    data: null,
  }),
  useConversationSandboxProcesses: () => ({
    data: null,
    isLoading: false,
  }),
}));

import { ToastProvider } from "@/shared/ui/toast";
import { NewConversationDraftPage } from "./NewConversationDraftPage";

describe("NewConversationDraftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWorkspaceFileTree.mockResolvedValue([
      {
        name: "README.md",
        path: "/README.md",
        type: "file",
      },
    ]);
    mockUseAgent.mockReturnValue({
      data: {
        name: "Repo Agent",
        runtimeMode: "sandbox",
        workspaceSnapshotId: "workspace-1",
        sandboxConfig: null,
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

  it("挂载时不应自动创建 conversation", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockFetchWorkspaceFileTree).toHaveBeenCalledWith("workspace-1");
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("草稿态应保留右侧工作区预览，并且不显示延迟创建说明文案", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockFetchWorkspaceFileTree).toHaveBeenCalledWith("workspace-1");
    });

    expect(
      screen.getByTestId("workspace-snapshot-preview-hint"),
    ).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(
      screen.queryByText("首条消息发送后再创建对话"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/这里是草稿态。输入文字或上传附件后/),
    ).not.toBeInTheDocument();
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

  it("无沙箱草稿态不应预留右侧上下文面板", () => {
    mockUseAgent.mockReturnValue({
      data: {
        name: "Repo Agent",
        runtimeMode: "no_sandbox",
        workspaceSnapshotId: null,
        sandboxConfig: null,
      },
    });

    renderPage();

    expect(screen.getByText("无沙箱")).toBeInTheDocument();
    expect(
      screen.queryByTestId("draft-conversation-context-pane"),
    ).not.toBeInTheDocument();
    expect(mockFetchWorkspaceFileTree).not.toHaveBeenCalled();
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
