import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentVersion } from "../types";

import { AgentPublishDialog } from "./AgentPublishDialog";

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

let versionsData:
  | {
      data: AgentVersion[];
      meta: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }
  | undefined;

vi.mock("../api/agentMutations", () => ({
  usePublishAgent: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("../api/agentQueries", () => ({
  useAgentVersions: () => ({
    data: versionsData,
    isLoading: false,
  }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: notifyMock }),
}));

function makeVersion(overrides: Partial<AgentVersion> = {}): AgentVersion {
  return {
    id: "ver-001",
    agentDefinitionId: "agent-001",
    tenantId: "tenant-001",
    versionNumber: 1,
    label: "初始版本",
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    },
    publishedAt: null,
    archivedAt: null,
    createdBy: "user-001",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  open: true,
  agentId: "agent-001",
  onOpenChange: vi.fn(),
};

describe("AgentPublishDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionsData = {
      data: [
        makeVersion({ id: "ver-001", versionNumber: 2, label: "稳定版" }),
        makeVersion({ id: "ver-002", versionNumber: 1, label: "初始版" }),
      ],
      meta: {
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      },
    };
  });

  it("打开时渲染发布表单", () => {
    render(<AgentPublishDialog {...defaultProps} />);

    expect(screen.getByTestId("publish-label-input")).toBeInTheDocument();
    expect(
      screen.getByTestId("publish-release-notes-input"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("source-current")).toBeInTheDocument();
    expect(screen.getByTestId("source-existing")).toBeInTheDocument();
  });

  it("默认选择当前编辑稿", () => {
    render(<AgentPublishDialog {...defaultProps} />);

    expect(screen.getByTestId("source-current")).toBeChecked();
    expect(screen.queryByTestId("version-select")).not.toBeInTheDocument();
  });

  it("带 initialVersionId 时预选已有版本", () => {
    render(<AgentPublishDialog {...defaultProps} initialVersionId="ver-001" />);

    expect(screen.getByTestId("source-existing")).toBeChecked();
    expect(screen.getByTestId("version-select")).toHaveValue("ver-001");
  });

  it("发布当前编辑稿时带上标签与发布说明", async () => {
    mutateAsyncMock.mockResolvedValueOnce({});
    const onBeforePublishCurrentVersion = vi.fn().mockResolvedValue(true);

    render(
      <AgentPublishDialog
        {...defaultProps}
        onBeforePublishCurrentVersion={onBeforePublishCurrentVersion}
      />,
    );

    fireEvent.change(screen.getByTestId("publish-label-input"), {
      target: { value: "正式发布" },
    });
    fireEvent.change(screen.getByTestId("publish-release-notes-input"), {
      target: { value: "补齐 Agent 顶部工具栏" },
    });
    fireEvent.click(screen.getByTestId("confirm-publish"));

    await waitFor(() => {
      expect(onBeforePublishCurrentVersion).toHaveBeenCalled();
    });
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      label: "正式发布",
      releaseNotes: "补齐 Agent 顶部工具栏",
      versionId: undefined,
    });
  });

  it("选择已有版本时提交 versionId", async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<AgentPublishDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId("source-existing"));
    fireEvent.change(screen.getByTestId("version-select"), {
      target: { value: "ver-001" },
    });
    fireEvent.click(screen.getByTestId("confirm-publish"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        label: undefined,
        releaseNotes: undefined,
        versionId: "ver-001",
      });
    });
  });

  it("未选择历史版本时显示校验错误", () => {
    render(<AgentPublishDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId("source-existing"));
    fireEvent.click(screen.getByTestId("confirm-publish"));

    expect(screen.getByTestId("publish-validation-error")).toBeInTheDocument();
    expect(screen.getByText("请选择一条可发布记录")).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
