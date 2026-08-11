import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { TemplateWizardDialog } from "./TemplateWizardDialog";
import type { TemplateDetail } from "../types";

// Mock @xyflow/react (static preview)
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => (
    <div
      data-testid="reactflow-preview"
      data-fit-view={props.fitView}
      data-nodes-draggable={props.nodesDraggable}
      data-nodes-connectable={props.nodesConnectable}
      data-elements-selectable={props.elementsSelectable}
      data-pan-on-drag={props.panOnDrag}
      data-zoom-on-scroll={props.zoomOnScroll}
      data-node-types={
        Array.isArray(props.nodes)
          ? props.nodes
              .map((node) => (node as { type?: string }).type ?? "")
              .join(",")
          : ""
      }
      data-edge-types={
        Array.isArray(props.edges)
          ? props.edges
              .map((edge) => (edge as { type?: string }).type ?? "")
              .join(",")
          : ""
      }
    >
      {(props.children as React.ReactNode) ?? null}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Background: () => <div data-testid="reactflow-background" />,
  BackgroundVariant: { Dots: "dots" },
}));


const mutateAsyncMock = vi.fn();
const navigateMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/features/workflow", () => ({
  useCreateWorkflow: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: toastMock }),
}));

function makeTemplateDetail(
  overrides?: Partial<TemplateDetail>,
): TemplateDetail {
  return {
    id: "tpl-1",
    slug: "test-template",
    name: "竞品分析",
    description: "分析竞争对手产品",
    category: "analysis",
    tags: ["test"],
    thumbnailUrl: null,
    metadata: {
      complexity: "intermediate",
      nodeCount: 3,
    },
    displayOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    definition: {
      nodes: [
        {
          id: "n1",
          type: "workflow-node",
          position: { x: 0, y: 0 },
          data: { nodeType: "agent", label: "Start" },
        },
        {
          id: "n2",
          type: "workflow-node",
          position: { x: 200, y: 0 },
          data: { nodeType: "code-tool", label: "Process" },
        },
        {
          id: "n3",
          type: "workflow-node",
          position: { x: 400, y: 0 },
          data: { nodeType: "text-output", label: "End" },
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    ...overrides,
  };
}

describe("TemplateWizardDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("关闭时不渲染内容", () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("打开时渲染标题和表单", () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("从模板创建工作流")).toBeInTheDocument();
    expect(screen.getByLabelText("工作流名称")).toBeInTheDocument();
    expect(screen.getByText("创建工作流")).toBeInTheDocument();
  });

  it("名称字段预填模板名称的副本", () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText("工作流名称");
    expect(nameInput).toHaveValue("竞品分析的副本");
  });

  it("显示模板预览信息（节点数、连线数、复杂度）", () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("3 个节点")).toBeInTheDocument();
    expect(screen.getByText("2 条连线")).toBeInTheDocument();
    expect(screen.getByText("中级")).toBeInTheDocument();
  });

  it("渲染只读 ReactFlow 预览", () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const preview = screen.getByTestId("reactflow-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("data-fit-view", "true");
    expect(preview).toHaveAttribute("data-nodes-draggable", "false");
    expect(preview).toHaveAttribute("data-nodes-connectable", "false");
    expect(preview).toHaveAttribute("data-elements-selectable", "false");
    expect(preview).toHaveAttribute("data-pan-on-drag", "true");
    expect(preview).toHaveAttribute("data-zoom-on-scroll", "true");
    expect(preview).toHaveAttribute("data-node-types", "agent,tool,output");
    expect(preview).toHaveAttribute("data-edge-types", "smart,smart");
  });

  it("提交表单创建工作流并导航", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "wf-new", name: "竞品分析的副本" });
    const onOpenChange = vi.fn();

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByText("创建工作流"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        name: "竞品分析的副本",
        description: "分析竞争对手产品",
        templateSlug: "test-template",
      });
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/workflows/$workflowId",
        params: { workflowId: "wf-new" },
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "工作流已创建" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("创建失败时显示错误 toast", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("Server error"));

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("创建工作流"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "创建失败",
          variant: "error",
        }),
      );
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("点击取消关闭对话框", () => {
    const onOpenChange = vi.fn();

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByText("取消"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("空名称时校验失败不提交", async () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText("工作流名称");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("创建工作流"));

    await waitFor(() => {
      expect(screen.getByText("请输入工作流名称")).toBeInTheDocument();
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
