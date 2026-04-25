import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@/features/workflow";
import type { ExecutionStatus } from "@/features/execution/types";
import type { WorkflowInputSchema } from "@/features/workflow/types";
import { useCanvasStore } from "../stores/canvasStore";
import {
  clonePortDefinitions,
  getNodeTypeConfig,
} from "../types/nodeTypeRegistry";
import { WorkflowCanvasPage } from "./WorkflowCanvasPage";

function createNodeData(nodeType: Parameters<typeof getNodeTypeConfig>[0]) {
  const config = getNodeTypeConfig(nodeType);

  return {
    label: config.label,
    nodeType: config.type,
    category: config.category,
    description: config.description,
    config: {},
    inputPorts: clonePortDefinitions(config.inputPorts),
    outputPorts: clonePortDefinitions(config.outputPorts),
  };
}

let routeWorkflowId = "wf-001";
let workflowResult: {
  data?: WorkflowDefinition;
  isLoading: boolean;
  error: Error | null;
};

const useAutoSaveMock = vi.fn();
const workflowCanvasMock = vi.fn();
const publishSheetMock = vi.fn();
const versionToolbarMock = vi.fn();
const versionHistoryPanelMock = vi.fn();
const useExecutionMonitorMock = vi.fn();
const startExecutionMock = vi.fn();
const submitInterventionMock = vi.fn();
const celebrationEffectMock = vi.fn();
const executionLaunchDialogMock = vi.fn();
const notifyMock = vi.fn();
const { exportWorkflowMutateMock, downloadWorkflowExportMock } = vi.hoisted(
  () => ({
    exportWorkflowMutateMock: vi.fn(),
    downloadWorkflowExportMock: vi.fn(),
  }),
);

let mockAuthToken: string | undefined;
let mockExecutionId: string | null = null;
let mockIsExecutionActive = false;
let mockIsStarting = false;
let mockExecutionStatus: ExecutionStatus | null = null;

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ workflowId: routeWorkflowId }),
}));

vi.mock("@/features/workflow", () => ({
  useWorkflow: () => workflowResult,
}));

vi.mock("../hooks/useAutoSave", () => ({
  useAutoSave: (...args: unknown[]) => useAutoSaveMock(...args),
}));

vi.mock("@/features/execution/hooks/useAuthToken", () => ({
  useAuthToken: () => mockAuthToken,
}));

vi.mock("@/features/execution/hooks/useExecutionMonitor", () => ({
  useExecutionMonitor: (...args: unknown[]) => useExecutionMonitorMock(...args),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: notifyMock }),
}));

vi.mock("@/features/execution/hooks/useStartExecution", () => ({
  useStartExecution: () => ({
    startExecution: startExecutionMock,
    isStarting: mockIsStarting,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock("@/features/execution/stores/executionStore", () => ({
  useExecutionId: () => mockExecutionId,
  useIsExecutionActive: () => mockIsExecutionActive,
  useExecutionStatus: () => mockExecutionStatus,
  useNodeExecutionState: () => null,
  useNodeIntervention: () => null,
  useExecutionActions: () => ({
    submitIntervention: submitInterventionMock,
  }),
}));

vi.mock("@/features/execution/components/CelebrationEffect", () => ({
  CelebrationEffect: (props: {
    workflowId: string;
    executionId: string | null | undefined;
    executionStatus: ExecutionStatus | null;
  }) => {
    celebrationEffectMock(props);
    return <div data-testid="celebration-effect" />;
  },
}));

vi.mock("@/features/marketplace", () => ({
  MarketplacePublishDialog: () => null,
}));

vi.mock("@/features/share/components/ShareManagementDialog", () => ({
  ShareManagementDialog: () => null,
}));

vi.mock("@/features/workflow/components/WorkflowImportDialog", () => ({
  WorkflowImportDialog: () => null,
}));

vi.mock("@/features/workflow/api/workflowMutations", () => ({
  useExportWorkflow: () => ({
    mutate: exportWorkflowMutateMock,
    isPending: false,
  }),
  useUpdateWorkflow: () => ({ mutateAsync: vi.fn() }),
  useCreateWorkflow: () => ({ mutateAsync: vi.fn() }),
  useValidateImport: () => ({ mutateAsync: vi.fn() }),
  useImportWorkflow: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/workflow/lib/workflowExportImport", () => ({
  downloadWorkflowExport: downloadWorkflowExportMock,
  parseImportFile: vi.fn(),
}));

vi.mock(
  "@/features/workflow-input-schema/components/ExecutionLaunchDialog",
  () => ({
    ExecutionLaunchDialog: (props: {
      open: boolean;
      workflowId: string;
      workflowName: string;
      workflowStatus: WorkflowDefinition["status"];
      draftInputSchema: WorkflowInputSchema | null;
    }) => {
      executionLaunchDialogMock(props);
      return props.open ? <div data-testid="execution-launch-dialog" /> : null;
    },
  }),
);

vi.mock("@/features/optimization-suggestion", () => ({
  OptimizationSuggestionsPanel: () => (
    <div data-testid="optimization-suggestions-panel" />
  ),
}));

vi.mock("./NodePalette", () => ({
  NodePalette: () => <div>Node Palette</div>,
}));

vi.mock("./WorkflowCanvas", () => ({
  WorkflowCanvas: (props: { workflowStatus: WorkflowDefinition["status"] }) => {
    workflowCanvasMock(props);
    return (
      <div data-testid="workflow-canvas" data-status={props.workflowStatus}>
        Workflow Canvas
      </div>
    );
  },
}));

vi.mock("./status/WorkflowStatusBar", () => ({
  WorkflowStatusBar: () => <div data-testid="workflow-status-bar" />,
}));

vi.mock("./panels/FieldMappingPanel", () => ({
  FieldMappingPanel: (props: {
    open: boolean;
    edgeId: string;
    onClose: () => void;
  }) => (
    <div data-testid="field-mapping-panel" data-edge-id={props.edgeId}>
      <button
        type="button"
        data-testid="mapping-panel-close"
        onClick={props.onClose}
      >
        Close
      </button>
    </div>
  ),
}));

vi.mock("./panels/NodeConfigPanel", () => ({
  NodeConfigPanel: () => <div data-testid="node-config-panel" />,
}));

vi.mock("./toolbar/VersionToolbar", () => ({
  VersionToolbar: (props: {
    onOpenVersionHistory: () => void;
    onOpenPublish: (versionId?: string) => void;
    workflowStatus: WorkflowDefinition["status"];
    onRun?: () => void;
    isRunning?: boolean;
    onExport?: () => void;
  }) => {
    versionToolbarMock(props);
    return (
      <>
        <button
          type="button"
          data-testid="btn-export-workflow"
          onClick={props.onExport}
        >
          Export workflow
        </button>
        <button
          type="button"
          data-testid="version-toolbar-open-history"
          onClick={props.onOpenVersionHistory}
        >
          Open history
        </button>
        <button
          type="button"
          data-testid="version-toolbar-open-publish"
          onClick={() => props.onOpenPublish("ver-002")}
        >
          Open publish
        </button>
        {props.onRun && (
          <button
            type="button"
            data-testid="btn-run-workflow"
            disabled={props.isRunning}
            onClick={props.onRun}
          >
            {props.isRunning ? "执行中" : "运行"}
          </button>
        )}
      </>
    );
  },
}));

vi.mock("@/features/workflow/components/VersionHistoryPanel", () => ({
  VersionHistoryPanel: (props: {
    open: boolean;
    onPublish?: (versionId: string) => void;
    onClose: () => void;
    workflowStatus: WorkflowDefinition["status"];
  }) => {
    versionHistoryPanelMock(props);
    return (
      <div
        data-testid="version-history-panel-proxy"
        data-open={String(props.open)}
        data-status={props.workflowStatus}
      >
        <button
          type="button"
          data-testid="version-history-open-publish"
          onClick={() => props.onPublish?.("ver-003")}
        >
          History publish
        </button>
        <button
          type="button"
          data-testid="version-history-close"
          onClick={props.onClose}
        >
          Close history
        </button>
      </div>
    );
  },
}));

vi.mock("@/features/workflow/components/PublishSheet", () => ({
  PublishSheet: (props: {
    open: boolean;
    initialVersionId?: string | null;
    onOpenChange: (open: boolean) => void;
  }) => {
    publishSheetMock(props);
    return props.open ? (
      <div
        data-testid="publish-sheet"
        data-version-id={props.initialVersionId ?? ""}
      >
        <button
          type="button"
          data-testid="publish-sheet-close"
          onClick={() => props.onOpenChange(false)}
        >
          Close publish
        </button>
      </div>
    ) : null;
  },
}));

const workflowOne: WorkflowDefinition = {
  id: "wf-001",
  tenantId: "tenant-1",
  name: "Workflow One",
  slug: "workflow-one",
  description: null,
  icon: null,
  nodes: [
    {
      id: "node-1",
      type: "agent",
      position: { x: 100, y: 120 },
      data: createNodeData("agent"),
    },
  ],
  edges: [],
  viewport: { x: 10, y: 20, zoom: 1.25 },
  inputSchema: null,
  version: 1,
  status: "draft",
  publishedVersionId: null,
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: "2026-03-07T00:00:00.000Z",
  updatedAt: "2026-03-07T00:00:00.000Z",
};

const workflowTwo: WorkflowDefinition = {
  ...workflowOne,
  id: "wf-002",
  name: "Workflow Two",
  slug: "workflow-two",
  nodes: [
    {
      id: "node-2",
      type: "tool",
      position: { x: 300, y: 260 },
      data: createNodeData("http-tool"),
    },
  ],
  viewport: { x: 30, y: 40, zoom: 1.5 },
};

describe("WorkflowCanvasPage", () => {
  beforeEach(() => {
    routeWorkflowId = "wf-001";
    workflowResult = {
      data: workflowOne,
      isLoading: false,
      error: null,
    };
    mockAuthToken = undefined;
    mockExecutionId = null;
    mockIsExecutionActive = false;
    mockIsStarting = false;
    mockExecutionStatus = null;
    notifyMock.mockReset();
    vi.clearAllMocks();
    exportWorkflowMutateMock.mockReset();
    downloadWorkflowExportMock.mockReset();
    window.sessionStorage.clear();
    useCanvasStore.getState().actions.reset();
  });

  it("相同工作流且服务端版本未变化时不应重新覆盖本地画布状态", () => {
    const { rerender } = render(<WorkflowCanvasPage />);

    act(() => {
      useCanvasStore.getState().actions.selectNode("node-1");
    });

    workflowResult = {
      data: { ...workflowOne, name: "Workflow One (refetched)" },
      isLoading: false,
      error: null,
    };

    rerender(<WorkflowCanvasPage />);

    expect(useCanvasStore.getState().workflowId).toBe("wf-001");
    expect(useCanvasStore.getState().selectedNodeId).toBe("node-1");
    expect(useCanvasStore.getState().nodes[0]?.id).toBe("node-1");
  });

  it("相同工作流但服务端版本变化时应重放回滚后的快照", () => {
    const { rerender } = render(<WorkflowCanvasPage />);

    act(() => {
      useCanvasStore.getState().actions.selectNode("node-1");
    });

    workflowResult = {
      data: {
        ...workflowOne,
        version: 2,
        nodes: [
          {
            id: "node-rollback",
            type: "tool",
            position: { x: 420, y: 180 },
            data: createNodeData("http-tool"),
          },
        ],
        viewport: { x: 80, y: 120, zoom: 1.75 },
      },
      isLoading: false,
      error: null,
    };

    rerender(<WorkflowCanvasPage />);

    expect(useCanvasStore.getState().workflowId).toBe("wf-001");
    expect(useCanvasStore.getState().version).toBe(2);
    expect(useCanvasStore.getState().nodes[0]?.id).toBe("node-rollback");
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 80,
      y: 120,
      zoom: 1.75,
    });
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
  });

  it("相同工作流版本变化且本地再次变脏时不应覆盖本地状态，并提示用户", () => {
    const { rerender } = render(<WorkflowCanvasPage />);

    act(() => {
      useCanvasStore.getState().actions.updateNodeData("node-1", {
        config: { prompt: "local draft" },
      });
    });

    workflowResult = {
      data: {
        ...workflowOne,
        version: 2,
        nodes: [
          {
            id: "node-rollback",
            type: "tool",
            position: { x: 420, y: 180 },
            data: createNodeData("http-tool"),
          },
        ],
      },
      isLoading: false,
      error: null,
    };

    rerender(<WorkflowCanvasPage />);

    expect(useCanvasStore.getState().workflowId).toBe("wf-001");
    expect(useCanvasStore.getState().version).toBe(1);
    expect(useCanvasStore.getState().nodes[0]?.id).toBe("node-1");
    expect(useCanvasStore.getState().isDirty).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "已保留本地未保存修改",
        variant: "warning",
      }),
    );
  });

  it("切换到新的 workflowId 时应应用新的服务端快照", () => {
    const { rerender } = render(<WorkflowCanvasPage />);

    routeWorkflowId = "wf-002";
    workflowResult = {
      data: workflowTwo,
      isLoading: false,
      error: null,
    };

    rerender(<WorkflowCanvasPage />);

    expect(useCanvasStore.getState().workflowId).toBe("wf-002");
    expect(useCanvasStore.getState().nodes[0]?.id).toBe("node-2");
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 30,
      y: 40,
      zoom: 1.5,
    });
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
  });

  it("把 workflow 状态透传给自动保存、画布和版本面板", () => {
    render(<WorkflowCanvasPage />);

    expect(useAutoSaveMock).toHaveBeenCalledWith("wf-001", "draft");
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-status",
      "draft",
    );
    expect(versionHistoryPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({ workflowStatus: "draft" }),
    );
  });

  it("toolbar 与历史面板共用页面级 PublishSheet", () => {
    render(<WorkflowCanvasPage />);

    fireEvent.click(screen.getByTestId("version-toolbar-open-publish"));
    expect(screen.getByTestId("publish-sheet")).toHaveAttribute(
      "data-version-id",
      "ver-002",
    );

    fireEvent.click(screen.getByTestId("version-history-open-publish"));
    expect(screen.getByTestId("publish-sheet")).toHaveAttribute(
      "data-version-id",
      "ver-003",
    );
  });

  it("发布面板关闭后应恢复之前已打开的历史面板", () => {
    render(<WorkflowCanvasPage />);

    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("version-toolbar-open-history"));
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-open",
      "true",
    );

    fireEvent.click(screen.getByTestId("version-history-open-publish"));
    expect(screen.getByTestId("publish-sheet")).toBeInTheDocument();

    workflowResult = {
      data: {
        ...workflowOne,
        status: "published",
        publishedVersionId: "ver-003",
      },
      isLoading: false,
      error: null,
    };

    fireEvent.click(screen.getByTestId("publish-sheet-close"));

    expect(screen.queryByTestId("publish-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-status",
      "published",
    );
  });

  it("页面 remount 后仍应恢复发布前已打开的历史面板", () => {
    const { unmount } = render(<WorkflowCanvasPage />);

    fireEvent.click(screen.getByTestId("version-toolbar-open-history"));
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-open",
      "true",
    );

    fireEvent.click(screen.getByTestId("version-history-open-publish"));
    expect(screen.getByTestId("publish-sheet")).toBeInTheDocument();

    unmount();

    workflowResult = {
      data: {
        ...workflowOne,
        status: "published",
        publishedVersionId: "ver-003",
      },
      isLoading: false,
      error: null,
    };

    render(<WorkflowCanvasPage />);

    expect(screen.queryByTestId("publish-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("version-history-panel-proxy")).toHaveAttribute(
      "data-status",
      "published",
    );
  });

  it("将 toolbar 与执行记录入口放入统一顶部浮层布局，避免窄视口遮挡", () => {
    render(<WorkflowCanvasPage />);

    expect(screen.getByTestId("workflow-top-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-toolbar-shell")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-side-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-execution-history")).toBeInTheDocument();
  });

  it("导出工作流时应使用持久化 slug", () => {
    const exportData = {
      schemaVersion: "agentloom-workflow-v1",
      exportedAt: "2026-03-16T00:00:00.000Z",
      workflow: {
        name: "Renamed Workflow",
        description: null,
        definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      },
    };

    exportWorkflowMutateMock.mockImplementation((_workflowId, options) => {
      options?.onSuccess?.(exportData);
    });

    render(<WorkflowCanvasPage />);

    fireEvent.click(screen.getByTestId("btn-export-workflow"));

    expect(exportWorkflowMutateMock).toHaveBeenCalledWith(
      "wf-001",
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
    expect(downloadWorkflowExportMock).toHaveBeenCalledWith(
      exportData,
      "workflow-one",
    );
  });

  it("归档工作流隐藏节点面板和字段映射面板，但仍传递只读状态", () => {
    workflowResult = {
      data: {
        ...workflowOne,
        status: "archived",
        edges: [{ id: "e-1", source: "node-1", target: "node-1" }],
      },
      isLoading: false,
      error: null,
    };

    render(<WorkflowCanvasPage />);

    act(() => {
      useCanvasStore.getState().actions.openFieldMapping("e-1");
    });

    expect(screen.queryByText("Node Palette")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-mapping-panel")).not.toBeInTheDocument();
    expect(useAutoSaveMock).toHaveBeenCalledWith("wf-001", "archived");
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-status",
      "archived",
    );
  });

  it("mappingPanelEdgeId 为 null 时不应渲染 FieldMappingPanel", () => {
    render(<WorkflowCanvasPage />);

    expect(screen.queryByTestId("field-mapping-panel")).not.toBeInTheDocument();
  });

  it("关闭映射面板后不再渲染 FieldMappingPanel", () => {
    workflowResult = {
      data: {
        ...workflowOne,
        edges: [{ id: "e-1", source: "node-1", target: "node-1" }],
      },
      isLoading: false,
      error: null,
    };

    render(<WorkflowCanvasPage />);

    act(() => {
      useCanvasStore.getState().actions.openFieldMapping("e-1");
    });

    expect(screen.getByTestId("field-mapping-panel")).toBeInTheDocument();

    act(() => {
      useCanvasStore.getState().actions.closeFieldMapping();
    });

    expect(screen.queryByTestId("field-mapping-panel")).not.toBeInTheDocument();
  });

  it("将 authToken 和 executionId 传给 useExecutionMonitor", () => {
    mockAuthToken = "jwt-test-token";
    mockExecutionId = "exec-active";
    mockExecutionStatus = "running";

    render(<WorkflowCanvasPage />);

    expect(useExecutionMonitorMock).toHaveBeenCalledWith({
      executionId: "exec-active",
      tenantId: "tenant-1",
      authToken: "jwt-test-token",
    });
  });

  it("向庆祝效果传递当前 workflow 与执行状态", () => {
    mockExecutionId = "exec-active";
    mockExecutionStatus = "running";

    render(<WorkflowCanvasPage />);

    expect(screen.getByTestId("celebration-effect")).toBeInTheDocument();
    expect(celebrationEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-001",
        executionId: "exec-active",
        executionStatus: "running",
      }),
    );
  });

  it("无 authToken 时仍调用 useExecutionMonitor", () => {
    render(<WorkflowCanvasPage />);

    expect(useExecutionMonitorMock).toHaveBeenCalledWith({
      executionId: undefined,
      tenantId: "tenant-1",
      authToken: undefined,
    });
  });

  it("toolbar 接收 onRun 和 isRunning 属性", () => {
    workflowResult = {
      ...workflowResult,
      data: {
        ...workflowOne,
        status: "published",
        publishedVersionId: "ver-001",
      },
    };

    render(<WorkflowCanvasPage />);

    expect(versionToolbarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onRun: expect.any(Function),
        isRunning: false,
      }),
    );
  });

  it("草稿工作流不向 toolbar 透传 onRun", () => {
    render(<WorkflowCanvasPage />);

    expect(versionToolbarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onRun: undefined,
        isRunning: false,
      }),
    );
    expect(screen.queryByTestId("btn-run-workflow")).not.toBeInTheDocument();
  });

  it("isStarting 为 true 时 toolbar 显示执行中", () => {
    mockIsStarting = true;

    render(<WorkflowCanvasPage />);

    expect(versionToolbarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isRunning: true,
      }),
    );
  });

  it("已发布工作流点击运行按钮时打开 launch dialog", () => {
    workflowResult = {
      ...workflowResult,
      data: {
        ...workflowOne,
        status: "published",
        publishedVersionId: "ver-001",
      },
    };

    render(<WorkflowCanvasPage />);

    expect(
      screen.queryByTestId("execution-launch-dialog"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-run-workflow"));

    expect(startExecutionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("execution-launch-dialog")).toBeInTheDocument();
    expect(executionLaunchDialogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        workflowId: "wf-001",
        workflowName: "Workflow One",
        workflowStatus: "published",
        draftInputSchema: null,
      }),
    );
  });
});
