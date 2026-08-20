import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowAgentViewer } from "./WorkflowAgentViewer";
import type { ExecutionDetail } from "../types";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLiveExecutionDetailMock: vi.fn(),
  useNodeExecutionStateMock: vi.fn(),
  buildWorkflowAgentViewerStateMock: vi.fn(),
  getExecutionStepWorkspaceTreeMock: vi.fn(),
  getExecutionStepWorkspaceFileMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigateMock,
}));

vi.mock("../hooks/useLiveExecutionDetail", () => ({
  useLiveExecutionDetail: (...args: unknown[]) =>
    mocks.useLiveExecutionDetailMock(...args),
}));

vi.mock("../stores/executionStore", () => ({
  useNodeExecutionState: (...args: unknown[]) =>
    mocks.useNodeExecutionStateMock(...args),
}));

vi.mock("../lib/workflowAgentViewer", () => ({
  buildWorkflowAgentViewerState: (...args: unknown[]) =>
    mocks.buildWorkflowAgentViewerStateMock(...args),
}));

vi.mock("../api/executionApi", () => ({
  getExecutionStepWorkspaceTree: (...args: unknown[]) =>
    mocks.getExecutionStepWorkspaceTreeMock(...args),
  getExecutionStepWorkspaceFile: (...args: unknown[]) =>
    mocks.getExecutionStepWorkspaceFileMock(...args),
}));

vi.mock("./ExecutionAgentMessageList", () => ({
  ExecutionAgentMessageList: () => (
    <div data-testid="mock-execution-agent-message-list" />
  ),
}));

vi.mock("@/features/agent-conversation", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/agent-conversation")
  >("@/features/agent-conversation");

  return {
    ...actual,
    SandboxComputerPanel: () => (
      <div data-testid="mock-sandbox-computer-panel" />
    ),
    WorkspaceFileTree: ({
      tree,
      selectedPath,
      onSelectFile,
    }: {
      tree: Array<{
        name: string;
        path: string;
        type: "file" | "directory";
        children?: Array<unknown>;
      }>;
      selectedPath: string | null;
      onSelectFile: (path: string) => void;
    }) => (
      <div data-testid="mock-workspace-file-tree">
        {tree.map((node) => (
          <button
            key={node.path}
            type="button"
            data-selected={node.path === selectedPath}
            onClick={() => {
              if (node.type === "file") {
                onSelectFile(node.path);
              }
            }}
          >
            {node.path}
          </button>
        ))}
      </div>
    ),
  };
});

function createExecutionDetail(): ExecutionDetail {
  return {
    id: "exec-001",
    tenantId: "tenant-1",
    workflowDefinitionId: "wf-001",
    workflowId: "workflow-001",
    workflowVersionId: "ver-001",
    status: "running",
    triggerType: "manual",
    inputParams: {},
    definitionSnapshot: {
      nodes: [],
      edges: [],
    },
    startedAt: "2026-03-31T00:00:00.000Z",
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    errorMessage: null,
    totalSteps: 1,
    completedSteps: 0,
    createdBy: "user-001",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:10.000Z",
    steps: [
      {
        id: "step-001",
        executionId: "exec-001",
        nodeId: "node-agent-1",
        nodeName: "Workflow Agent",
        nodeType: "agent",
        status: "running",
        input: null,
        output: null,
        errorMessage: null,
        startedAt: "2026-03-31T00:00:01.000Z",
        completedAt: null,
        retryCount: 0,
      },
    ],
    workflowVersion: {
      id: "ver-001",
      graph: {
        nodes: [],
        edges: [],
      },
    },
  };
}

describe("WorkflowAgentViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useLiveExecutionDetailMock.mockReturnValue({
      data: createExecutionDetail(),
      isLoading: false,
      error: null,
      monitor: {
        connectionStatus: "connected",
      },
    });
    mocks.useNodeExecutionStateMock.mockReturnValue(null);
    mocks.buildWorkflowAgentViewerStateMock.mockReturnValue({
      messages: [],
      terminalEntries: [],
      fileChanges: [],
      sandboxStatus: "idle",
    });
  });

  it("选择文件后加载并显示 step workspace 文件内容", async () => {
    mocks.getExecutionStepWorkspaceTreeMock.mockResolvedValue([
      {
        name: "src/main.ts",
        path: "src/main.ts",
        type: "file",
      },
    ]);
    mocks.getExecutionStepWorkspaceFileMock.mockResolvedValue({
      path: "src/main.ts",
      content: 'console.log("hello workflow")',
      size: 28,
      encoding: "utf-8",
    });

    render(<WorkflowAgentViewer executionId="exec-001" stepId="step-001" />);

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceTreeMock).toHaveBeenCalledWith(
        "exec-001",
        "step-001",
      );
    });

    const desktopTree = screen.getAllByTestId("mock-workspace-file-tree")[0]!;
    fireEvent.click(
      within(desktopTree).getByRole("button", { name: "src/main.ts" }),
    );

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceFileMock).toHaveBeenCalledWith(
        "exec-001",
        "step-001",
        "src/main.ts",
      );
    });

    await waitFor(() => {
      expect(
        screen.getAllByTestId("workflow-agent-file-preview")[0],
      ).toHaveTextContent('console.log("hello workflow")');
    });
  });

  it("手动刷新 workspace 时会重新读取当前选中文件", async () => {
    mocks.getExecutionStepWorkspaceTreeMock.mockResolvedValue([
      {
        name: "src/main.ts",
        path: "src/main.ts",
        type: "file",
      },
    ]);
    mocks.getExecutionStepWorkspaceFileMock
      .mockResolvedValueOnce({
        path: "src/main.ts",
        content: 'console.log("v1")',
        size: 17,
        encoding: "utf-8",
      })
      .mockResolvedValueOnce({
        path: "src/main.ts",
        content: 'console.log("v2")',
        size: 17,
        encoding: "utf-8",
      });

    render(<WorkflowAgentViewer executionId="exec-001" stepId="step-001" />);

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceTreeMock).toHaveBeenCalledTimes(1);
    });

    const desktopTree = screen.getAllByTestId("mock-workspace-file-tree")[0]!;
    fireEvent.click(
      within(desktopTree).getByRole("button", { name: "src/main.ts" }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByTestId("workflow-agent-file-preview")[0],
      ).toHaveTextContent('console.log("v1")');
    });

    fireEvent.click(screen.getAllByRole("button", { name: "刷新" })[0]!);

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceTreeMock).toHaveBeenCalledTimes(2);
      expect(mocks.getExecutionStepWorkspaceFileMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(
        screen.getAllByTestId("workflow-agent-file-preview")[0],
      ).toHaveTextContent('console.log("v2")');
    });
  });

  it("execution 实时重渲染但 stepId 不变时不会重复拉取 workspace tree", async () => {
    mocks.getExecutionStepWorkspaceTreeMock.mockResolvedValue([
      {
        name: "src/main.ts",
        path: "src/main.ts",
        type: "file",
      },
    ]);

    const { rerender } = render(
      <WorkflowAgentViewer executionId="exec-001" stepId="step-001" />,
    );

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceTreeMock).toHaveBeenCalledTimes(1);
    });

    mocks.useLiveExecutionDetailMock.mockReturnValue({
      data: {
        ...createExecutionDetail(),
        updatedAt: "2026-03-31T00:00:20.000Z",
        steps: createExecutionDetail().steps.map((step) => ({
          ...step,
          retryCount: 1,
        })),
      },
      isLoading: false,
      error: null,
      monitor: {
        connectionStatus: "connected",
      },
    });

    rerender(<WorkflowAgentViewer executionId="exec-001" stepId="step-001" />);

    await waitFor(() => {
      expect(mocks.getExecutionStepWorkspaceTreeMock).toHaveBeenCalledTimes(1);
    });
  });
});
