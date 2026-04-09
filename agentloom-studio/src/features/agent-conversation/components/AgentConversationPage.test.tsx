import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockNavigate,
  mockUseAgent,
  mockUseAuthToken,
  mockNotify,
  mockResolveSubAgentView,
  mockResolveConversationWorkspacePreviewId,
  mockActions,
  mockConversationState,
} = vi.hoisted(() => {
  const actions = {
    connect: vi.fn(),
    loadHistory: vi.fn().mockResolvedValue(undefined),
    loadWorkspaceTree: vi.fn().mockResolvedValue(undefined),
    loadWorkspacePreview: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    cancelExecution: vi.fn(),
    selectFile: vi.fn(),
    pushAgentView: vi.fn(),
    navigateToAgentView: vi.fn(),
    restartToLatestVersion: vi.fn().mockResolvedValue("conv-1"),
  };

  return {
    mockNavigate: vi.fn(),
    mockUseAgent: vi.fn(),
    mockUseAuthToken: vi.fn(),
    mockNotify: vi.fn(),
    mockResolveSubAgentView: vi.fn(),
    mockResolveConversationWorkspacePreviewId: vi.fn(),
    mockActions: actions,
    mockConversationState: {
      messages: [],
      status: "idle",
      actions,
      loadedPublishedVersionId: undefined,
      terminalEntries: [],
      fileTree: [],
      fileChanges: [],
      sandboxStatus: "idle",
      selectedFilePath: null,
      agentName: "Repo Agent",
      agentViewStack: [],
      subAgentStreams: {},
      executionError: null,
      connectionError: null,
      workspaceSource: "unavailable",
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/features/agent/api/agentQueries", () => ({
  useAgent: (agentId: string) => mockUseAgent(agentId),
}));

vi.mock("@/features/auth/hooks/useAuthToken", () => ({
  useAuthToken: () => mockUseAuthToken(),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({
    notify: mockNotify,
  }),
}));

vi.mock("../subAgentView", () => ({
  resolveSubAgentView: (...args: unknown[]) => mockResolveSubAgentView(...args),
}));

vi.mock("../workspacePreview", () => ({
  resolveConversationWorkspacePreviewId: (...args: unknown[]) =>
    mockResolveConversationWorkspacePreviewId(...args),
}));

vi.mock("../stores/agent-conversation.store", () => ({
  useConversationMessages: () => mockConversationState.messages,
  useConversationStatus: () => mockConversationState.status,
  useConversationActions: () => mockConversationState.actions,
  useLoadedPublishedVersionId: () =>
    mockConversationState.loadedPublishedVersionId,
  useTerminalEntries: () => mockConversationState.terminalEntries,
  useFileTree: () => mockConversationState.fileTree,
  useFileChanges: () => mockConversationState.fileChanges,
  useSandboxStatus: () => mockConversationState.sandboxStatus,
  useSelectedFilePath: () => mockConversationState.selectedFilePath,
  useAgentName: () => mockConversationState.agentName,
  useAgentViewStack: () => mockConversationState.agentViewStack,
  useSubAgentStreams: () => mockConversationState.subAgentStreams,
  useExecutionError: () => mockConversationState.executionError,
  useConversationConnectionError: () => mockConversationState.connectionError,
  useWorkspaceSource: () => mockConversationState.workspaceSource,
}));

vi.mock("./MessageList", () => ({
  MessageList: ({ runtimeMode }: { runtimeMode: string }) => (
    <div data-testid="message-list">{runtimeMode}</div>
  ),
}));

vi.mock("./SandboxComputerPanel", () => ({
  SandboxComputerPanel: () => <div data-testid="sandbox-computer-panel" />,
}));

vi.mock("./WorkspaceFileTree", () => ({
  WorkspaceFileTree: () => <div data-testid="workspace-file-tree" />,
}));

vi.mock("./AgentViewBreadcrumb", () => ({
  AgentViewBreadcrumb: () => <div data-testid="agent-view-breadcrumb" />,
}));

import { AgentConversationPage } from "./AgentConversationPage";

describe("AgentConversationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConversationState.messages = [];
    mockConversationState.status = "idle";
    mockConversationState.loadedPublishedVersionId = undefined;
    mockConversationState.terminalEntries = [];
    mockConversationState.fileTree = [];
    mockConversationState.fileChanges = [];
    mockConversationState.sandboxStatus = "idle";
    mockConversationState.selectedFilePath = null;
    mockConversationState.agentName = "Repo Agent";
    mockConversationState.agentViewStack = [];
    mockConversationState.subAgentStreams = {};
    mockConversationState.executionError = null;
    mockConversationState.connectionError = null;
    mockConversationState.workspaceSource = "unavailable";

    mockUseAgent.mockReturnValue({
      data: {
        name: "Repo Agent",
        runtimeMode: "no_sandbox",
        workspaceSnapshotId: null,
        sandboxConfig: null,
      },
    });
    mockUseAuthToken.mockReturnValue(null);
    mockResolveSubAgentView.mockReturnValue(null);
    mockResolveConversationWorkspacePreviewId.mockReturnValue(null);
  });

  it("无沙箱对话不应预留右侧上下文面板", async () => {
    render(<AgentConversationPage agentId="agent-1" conversationId="conv-1" />);

    expect(screen.getByText("无沙箱")).toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toHaveTextContent("no_sandbox");
    expect(
      screen.queryByTestId("agent-conversation-context-pane"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("sandbox-computer-panel"),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockActions.connect).toHaveBeenCalledWith({
        conversationId: "conv-1",
        agentId: "agent-1",
        agentName: "",
        runtimeMode: "no_sandbox",
        authToken: null,
      });
      expect(mockActions.loadHistory).toHaveBeenCalledWith("conv-1");
    });

    expect(mockActions.loadWorkspaceTree).not.toHaveBeenCalled();
  });

  it("有沙箱对话应继续渲染右侧上下文面板", async () => {
    mockUseAgent.mockReturnValue({
      data: {
        name: "Repo Agent",
        runtimeMode: "sandbox",
        workspaceSnapshotId: null,
        sandboxConfig: null,
      },
    });

    render(<AgentConversationPage agentId="agent-1" conversationId="conv-1" />);

    expect(
      screen.getByTestId("agent-conversation-context-pane"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sandbox-computer-panel")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockActions.loadWorkspaceTree).toHaveBeenCalledWith("conv-1");
    });
  });
});
